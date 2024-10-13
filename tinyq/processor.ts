import { TinyQ, type WorkerJob } from "./index";
import { EventEmitter } from "node:events";
import assert from "node:assert";
import { type SpawnOptions, Subprocess } from "bun";

export type MasterToWorkerEvent = { type: "job:start"; job: WorkerJob<any> };

export type WorkerToMasterEvent<T extends WorkerJob<any>> =
  | { type: "hello" }
  | { type: "job:processed"; job: T };

export interface ThreadPool<T extends WorkerJob<any>> {
  events: EventEmitter<{
    "thread:free": [JobThread<T>];
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
      // stdout: "inherit",
    });
    // this.subprocess.killed
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
    }
  }

  sendMessage(message: MasterToWorkerEvent) {
    this.subprocess.send(message);
  }

  isAvailable() {
    return (
      !this.locked && this.isOpen && !this.isBusy && !this.subprocess.killed
    );
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

export const processTinyQs = <K extends (...params: any) => any>(
  ...qs: TinyQ<any>[]
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

    const processNextJob = async () => {
      const thread = findAvailableThread(threadPool);
      if (!thread) return;
      thread.lock(); // preserve atomicity

      const nextJob = await dispatcher.lpop();
      if (!nextJob) return thread.unlock();

      thread.unlock();
      thread.startJob(nextJob);
    };

    threadPool.events.on("thread:free", () => processNextJob());
    dispatcher.events.on("job:push", () => processNextJob());

    threadPool.events.on("job:complete", (job) => {
      dispatcher.publish("job:complete", job);
    });

    return threadPool;
  });

  process.on("SIGINT", async () => {
    console.log("Received SIGINT");
    console.log("Terminating workers");
    const promises = pools.flatMap((pool) =>
      pool.threads.map((thread) => thread.kill()),
    );
    console.log("Waiting for all workers to close.");
    await Promise.all(promises);
    console.log("Exiting...");
    process.exit();
  });

  return pools;
};
