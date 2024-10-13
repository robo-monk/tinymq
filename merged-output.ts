

// File: processor.ts

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


// File: index.ts

import { randomUUID } from "node:crypto";
import { RedisTinyDispatcher, TinyDispatcher } from "./dispatcher";
import Redis from "ioredis";

export enum JobStatus {
  PENDING,
  RUNNING,
  COMPLETED,
  FAILED,
}

export interface WorkerJob<JobSignature extends (...params: any) => any> {
  id: string;
  status: JobStatus;
  input: Parameters<JobSignature>;
  output?: Awaited<ReturnType<JobSignature>>;
  errors?: string[];
  metadata: Record<string, string>;
  executionTime: number;
}

export class TinyQ<
  JobSignature extends (...params: any) => any = (...params: unknown[]) => any,
> {
  public dispatcher: TinyDispatcher<WorkerJob<JobSignature>>;

  constructor(
    private jobName: string,
    redis: Redis,
  ) {
    this.dispatcher = new RedisTinyDispatcher<WorkerJob<JobSignature>>(
      redis,
      jobName,
    );
  }

  protected workerUrl?: URL;
  useWorkerFile<TaskSignature extends (...params: any) => any>(
    filename: string,
    importMeta: ImportMeta,
  ): TinyQ<TaskSignature> {
    this.workerUrl = new URL(filename, importMeta.url);
    return this as unknown as TinyQ<TaskSignature>;
  }

  protected concurrency: number = 1;
  setConcurrency(workerCount: number) {
    this.concurrency = workerCount;
    return this;
  }

  async enqueueJob(params: Parameters<JobSignature>) {
    const job: WorkerJob<JobSignature> = {
      id: randomUUID(),
      status: JobStatus.PENDING,
      input: params,
      metadata: {},
      executionTime: -1,
    };

    try {
      await this.dispatcher.rpush(job);
    } catch (e) {
      console.error("eerror foudn here", e);
    }
  }

  static _getSettings(q: TinyQ) {
    return {
      jobName: q.jobName,
      concurrency: q.concurrency,
      dispatcher: q.dispatcher,
      workerUrl: q.workerUrl,
    };
  }
}


// File: worker.ts

import assert from "node:assert";
import { JobStatus, type WorkerJob } from "./index";
import type { MasterToWorkerEvent, WorkerToMasterEvent } from "./processor.js";

interface WorkerContext {
  entrypoint: (...params: any) => any;
  onDestroy?: (...params: any) => any;
  isProcessing: boolean;
}

const __worker: WorkerContext = {
  entrypoint: () => {
    throw new Error(
      `${self.name} does not provide a valid entrypoint. Use 'registerEntrypoint' to register your worker's entrypoint`,
    );
  },
  onDestroy: () => {
    console.log(`Terminating ${self.name} worker. Skipping all active jobs.`);
  },
  isProcessing: false,
};

export const onDestroy = (cb: typeof __worker.onDestroy) =>
  (__worker.onDestroy = cb);

function sendMessage(message: WorkerToMasterEvent<any>) {
  process.send!(message);
}

const processJob = async (job: WorkerJob<any>) => {
  try {
    const start = performance.now();
    try {
      job.output = await __worker.entrypoint(...job.input); // Run the entrypoint function
      job.status = JobStatus.COMPLETED;
    } catch (e: any) {
      console.error(`Job ${job.id} errored`, e);
      job.errors = [e];
      job.status = JobStatus.FAILED;
    }
    job.executionTime = performance.now() - start;
  } catch (e) {
    console.error("Task processing failed: ", e);
  } finally {
    __worker.isProcessing = false; // Task completed, set flag to false
    sendMessage({ type: "job:processed", job }); // Send the result back
  }
};

// const handleMessage = async (event: MessageEvent) => {
const handleMessage = async (message: MasterToWorkerEvent) => {
  // console.log("got message", message);
  try {
    switch (message.type) {
      case "job:start":
        assert(!__worker.isProcessing, `worker is currently working on job`);
        __worker.isProcessing = true;
        const job = message.job;
        processJob(job);
        break;
    }
  } catch (e) {
    console.error("ERROR", e);
  }
};

const consoleProxy = new Proxy(console, {
  get(target: Console, property: keyof Console) {
    if (typeof target[property] === "function") {
      return (...args: any) => {
        const prefix = `[${Bun.env.workerName}]`; // The prefix you want to add
        // @ts-ignore
        target[property].apply(target, [`${prefix}`, ...args]);
      };
    }
    return target[property]; // If it's not a function, return it as-is
  },
});
globalThis.console = consoleProxy;

export function registerEntrypoint(callback: (...p: any) => any) {
  __worker.entrypoint = callback;
  return callback;
}

sendMessage({ type: "hello" });
process.on("message", handleMessage);

let isCleaningUp = false;
const cleanup = async () => {
  if (isCleaningUp) return;
  isCleaningUp = true;

  const maxWaitTime = parseInt(process.env.maxWaitTime || "60000"); // Maximum wait time in milliseconds (e.g., 30 seconds)
  const startTime = Date.now();

  console.log("I received a command to terminate");
  if (__worker.isProcessing) {
    console.log("I'm still processing a job");

    await new Promise<void>((resolve) => {
      const check = () => {
        const elapsedTime = Date.now() - startTime;
        if (!__worker.isProcessing) {
          resolve();
        } else if (elapsedTime >= maxWaitTime) {
          console.warn(
            `I've been processing for more than ${
              maxWaitTime / 1000
            } seconds. I'm forcefully terminating myself. Bye :(`,
          );
          resolve();
        } else {
          console.log("I'm still working. Checking again in 1 second.");
          setTimeout(check, 1000);
        }
      };

      check();
    });
  }

  console.log("Calling onDestroy");
  await __worker?.onDestroy?.call(this);
  console.log("Cleaned up");
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("SIGHUP", cleanup);

console.log("Ready to work");


// File: dispatcher.ts

import { Redis } from "ioredis";
import { EventEmitter } from "events";
import { pack, unpack } from "msgpackr";
import { WorkerJob } from "./index";

interface TinyDispatcherEvents<T> {
  "job:push": [T];
  "job:complete": [T];
  "job:start": [T];
}

export interface TinyDispatcher<T> {
  rpush(item: T): Promise<void>;
  lpush(item: T): Promise<void>;
  lpop(): Promise<T | undefined>;
  getPendingJobCount(): Promise<number>;
  events: EventEmitter<TinyDispatcherEvents<T>>;
  publish(event: string, arg: any): Promise<void>;
}

export class RedisTinyDispatcher<T extends WorkerJob<any>>
  implements TinyDispatcher<T>
{
  private redis: Redis;
  private subscriber: Redis;
  public events = new EventEmitter<TinyDispatcherEvents<T>>();

  constructor(
    redis: Redis,
    private queueKey: string,
  ) {
    this.redis = redis;
    this.subscriber = redis.duplicate();

    // Subscribe to Redis channels for job events
    this.subscriber.subscribe(
      `${queueKey}:job:push`,
      `${queueKey}:job:complete`,
      `${queueKey}:job:start`,
    ).catch((error) => {
      console.error("Error subscribing to Redis channels:", error);
    });

    this.subscriber.on("messageBuffer", (channel, buffer) => {
      try {
        const item = unpack(buffer) as T;
        const event = channel.toString().slice(`${queueKey}:`.length) as keyof TinyDispatcherEvents<T>;
        this.events.emit(event, item);
      } catch (error) {
        console.error("Error processing Redis message:", error);
      }
    });
  }

  async publish(event: string, arg: any) {
    try {
      const serializedItem = pack(arg);
      await this.redis.publish(`${this.queueKey}:${event}`, serializedItem);
    } catch (error) {
      console.error("Error publishing event:", error);
    }
  }

  async rpush(item: T): Promise<void> {
    try {
      const serializedItem = pack(item);
      await this.redis.rpush(this.queueKey, serializedItem);
      await this.redis.publish(`${this.queueKey}:job:push`, serializedItem);
    } catch (error) {
      console.error("Error pushing item to queue:", error);
    }
  }

  async lpush(item: T): Promise<void> {
    try {
      const serializedItem = pack(item);
      await this.redis.lpush(this.queueKey, serializedItem);
    } catch (error) {
      console.error("Error pushing item to front of queue:", error);
    }
  }

  async lpop(): Promise<T | undefined> {
    try {
      const buffer = await this.redis.lpopBuffer(this.queueKey);
      if (!buffer) return undefined;
      return unpack(buffer);
    } catch (error) {
      console.error("Error popping item from queue:", error);
      return undefined;
    }
  }

  async getPendingJobCount(): Promise<number> {
    try {
      return await this.redis.llen(this.queueKey);
    } catch (error) {
      console.error("Error getting pending job count:", error);
      return 0;
    }
  }
}
