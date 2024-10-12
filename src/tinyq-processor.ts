import { TinyQ, type WorkerJob } from "./tinyq";
import { EventEmitter } from "node:events";
import assert from "node:assert";

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

  constructor(
    public _worker: Worker,
    private poolEvents: ThreadPool<T>["events"],
  ) {
    this._worker.onmessage = (event) => {
      assert(event.type, "message");
      this.handleWorkerMessage(event.data);
    };
  }

  handleWorkerMessage(message: WorkerToMasterEvent<T>) {
    // console.log("message thread", message);
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
        this._worker.terminate();
        this.isOpen = false;
        this.poolEvents.emit("thread:kill", this);
        break;
      }
    }
  }

  sendMessage(message: MasterToWorkerEvent) {
    this._worker.postMessage(message);
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
        const worker = new Worker(workerUrl, {
          type: "module",
          name: `worker:${jobName}:${index}`,
        });
        return new JobThread(worker, threadPool.events);
      });

    // threadPool.events.on("thread:kill", (thread) => {
    //   if (threadPool.threads.every((th) => !th.isOpen)) {
    //     threadPool.events.emit("pool:kill");
    //   }
    // });

    let totalNextJobsCount = 0;
    const processNextJob = async () => {
      totalNextJobsCount += 1;
      // console.log({ totalNextJobsCount });
      // const hasPendingJobs = (await dispatcher.getPendingJobCount()) > 0;
      // if (!hasPendingJobs) return;

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

  return pools;
};
