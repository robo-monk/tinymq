import { TinyQ, type WorkerJob } from "./tinyq";
import { EventEmitter } from "node:events";
import assert from "node:assert";
import { type SpawnOptions, Subprocess } from "bun";

export type MasterToWorkerEvent =
  | { type: "job:start"; job: WorkerJob<any> }
  | { type: "close" };

export type WorkerToMasterEvent<T extends WorkerJob<any>> =
  | { type: "hello" }
  | { type: "job:processed"; job: T }
  | { type: "closed" };

export interface ThreadPool<T extends WorkerJob<any>> {
  events: EventEmitter<{
    "thread:free": [JobThread<T>];
    "thread:kill": [JobThread<T>];
    "pool:kill": [];
    "job:complete": [job: T];
  }>;
  threads: JobThread<T>[];
}

class JobThread<T extends WorkerJob<any>> {
  isBusy: boolean = false;
  isOpen: boolean = false;

  private subprocess: Subprocess;

  constructor(
    cmd: string[],
    spawnOptions: SpawnOptions.OptionsObject,
    private poolEvents: ThreadPool<T>["events"],
  ) {
    this.subprocess = Bun.spawn(cmd, {
      ...spawnOptions,
      ipc: this.handleWorkerMessage.bind(this),
      // ipc
      stdout: "inherit",
    });
  }

  async handleWorkerMessage(message: WorkerToMasterEvent<T>) {
    switch (message.type) {
      case "hello": {
        this.isOpen = true;
        assert(!this.isBusy, "thread cannot be busy before opening");
        this.poolEvents.emit("thread:free", this);
        break;
      }
      case "job:processed": {
        this.isBusy = false;
        this.poolEvents.emit("thread:free", this);
        this.poolEvents.emit("job:complete", message.job);
        break;
      }
      case "closed": {
        this.isOpen = false;
        console.log("worker is done");
        this.subprocess.kill();
        console.log("killing and awaiting exit");
        await this.subprocess.exited;
        console.log("exited");
        this.poolEvents.emit("thread:kill", this);
        break;
      }
    }
  }

  sendMessage(message: MasterToWorkerEvent) {
    this.subprocess.send(message);
  }

  private locked = false;
  get isLocked() {
    return this.locked;
  }
  lock() {
    assert(!this.locked, "thread is already locked");
    this.locked = true;
  }

  unlock() {
    assert(this.locked, "thread is not locked");
    this.locked = false;
  }

  startJob(job: T) {
    assert(!this.isBusy, "Thread is already busy");

    this.isBusy = true;
    this.sendMessage({
      type: "job:start",
      job,
    });
  }

  async kill() {
    this.isOpen = false;
    this.subprocess.kill();
    return await this.subprocess.exited;
  }
}

export function findAvailableThread(pool: ThreadPool<any>) {
  return pool.threads.find((t) => !t.isBusy && t.isOpen && !t.isLocked);
}

export const processTinyQs = <K extends (...p: any) => any>(
  ...qs: TinyQ<K>[]
) => {
  const pools = qs.map((q) => {
    const { jobName, concurrency, dispatcher, workerUrl } =
      TinyQ._getSettings(q);

    assert(workerUrl, "worker url must be defined!");

    const threadPool: ThreadPool<WorkerJob<K>> = {
      events: new EventEmitter(),
      threads: [],
    };

    threadPool.threads = Array(concurrency)
      .fill(0)
      .map((_, index) => {
        return new JobThread(
          ["bun", workerUrl.pathname],
          {
            env: { ...process.env, workerName: `worker:${jobName}:${index}` },
          },
          threadPool.events,
        );
      });

    threadPool.events.on("thread:kill", (thread) => {
      if (threadPool.threads.every((th) => !th.isOpen)) {
        threadPool.events.emit("pool:kill");
      }
    });

    const processNextJob = async () => {
      const thread = findAvailableThread(threadPool);
      if (!thread) return;
      thread.lock(); // preserve atomicity

      const nextJob = await dispatcher.popJob();
      thread.unlock();
      if (!nextJob) {
        return;
      }

      thread.startJob(nextJob);
    };

    threadPool.events.on("thread:free", () => processNextJob());
    dispatcher.events.on("job:push", () => processNextJob());

    threadPool.events.on("job:complete", (job) => {
      dispatcher.events.emit("job:complete", job);
    });

    return threadPool;
  });

  process.on("SIGINT", async () => {
    console.log("Received SIGINT");
    console.log("Terminating workers");
    const promises = pools.flatMap((pool) => {
      // return new Promise<void>((resolve) => {
      const kills = pool.threads.map((thread) => {
        return thread.kill();
      });
      return kills;
      // });
    });
    console.log("Waiting for all workers to close.");
    await Promise.all(promises);
    console.log("Exiting...");
    process.exit();
  });

  return pools;
};
