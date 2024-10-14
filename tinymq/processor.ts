import { TinyMQ, type WorkerJob } from "./index";
import { EventEmitter } from "node:events";
import assert from "node:assert";
import { type SpawnOptions, Subprocess } from "bun";
import { TinyDispatcher } from "../merged-output";

export type MasterToWorkerEvent = { type: "job:start"; job: WorkerJob<any> };

export type WorkerToMasterEvent<T extends WorkerJob<any>> =
  | { type: "hello" }
  | { type: "job:processed"; job: T };

export interface ThreadPool<T extends WorkerJob<any> = any> {
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

export class MQProcessor {
  static {}

  static pools: ThreadPool[] = [];
  static queues: Array<{
    queue: TinyMQ<any>;
    options: Partial<{ concurrency: number }>;
  }> = [];

  static addQueue<T extends (...params: any) => any>(
    queue: TinyMQ<T>,
    options: Partial<{ concurrency: number }> = {},
  ) {
    MQProcessor.queues.push({ queue, options });
    return MQProcessor;
  }

  static async kill() {
    const promises = MQProcessor.pools.flatMap((pool) =>
      pool.threads.map((thread) => thread.kill()),
    );
    await Promise.all(promises);
  }

  static start() {
    console.log("[Tiny Processor] Processing incoming jobs!");

    const signalsToKillOn: NodeJS.Signals[] = [
      "SIGINT",
      "SIGTERM",
      "SIGKILL",
      "SIGHUP",
    ];

    signalsToKillOn.forEach((signal) => {
      process.once(signal, async () => {
        console.log(`Recieved ${signal}. Gracefully killing workers...`);
        console.time("Killed workers");
        await MQProcessor.kill();
        console.timeEnd("Killed workers");
        process.exit();
      });
    });

    for (const { queue, options } of MQProcessor.queues) {
      const { jobName, dispatcher, workerUrl } = TinyMQ._getSettings(queue);
      assert(workerUrl, "Worker URL must be defined");

      const threadPool: ThreadPool<WorkerJob<any>> = {
        events: new EventEmitter(),
        threads: [],
      };

      threadPool.threads = Array(options.concurrency || 1)
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

      threadPool.events.on("thread:free", () =>
        MQProcessor.nextJob(threadPool, dispatcher),
      );

      dispatcher.events.on("job:push", () =>
        MQProcessor.nextJob(threadPool, dispatcher),
      );

      threadPool.events.on("job:complete", (job) => {
        dispatcher.publish("job:complete", job);
      });

      if (MQProcessor.loggerCallback) {
        dispatcher.events.on("job:push", MQProcessor.loggerCallback);
        dispatcher.events.on("job:complete", MQProcessor.loggerCallback);
      }

      MQProcessor.pools.push(threadPool);
    }

    return MQProcessor;
  }

  static async nextJob(pool: ThreadPool, dispatcher: TinyDispatcher<any>) {
    const thread = findAvailableThread(pool);
    if (!thread) return;
    thread.lock();
    try {
      const nextJob = await dispatcher.lpop();
      if (nextJob) thread.startJob(nextJob);
    } catch (e) {
      console.error("ERROR faced during nextJob", e);
    } finally {
      thread.unlock();
    }
  }

  static loggerCallback?: (job: WorkerJob<any>) => any;
  static registerLogger(cb: (job: WorkerJob<any>) => any) {
    assert(!this.loggerCallback, "Logger callback is already registered");
    this.loggerCallback = cb;
    return MQProcessor;
  }
}
