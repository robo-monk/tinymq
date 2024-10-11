import { resolve } from "node:path";
import EventEmitter from "node:events";

import { randomUUID } from "node:crypto";
import assert from "node:assert";

import {
  findAvailableThread,
  newThreadPool,
  Thread,
  ThreadPool,
  WorkerToMasterEvent,
} from "./thread-pool";

export enum JobStatus {
  PENDING,
  RUNNING,
  COMPLETED,
  FAILED,
}

export interface WorkerJob<Tasks extends TaskRegistry = {}> {
  id: string;
  taskName: keyof Tasks;
  status: JobStatus;
  input: any;
  output?: any;
  errors?: string[];
  metadata: Record<string, string>;
  executionTime: number;
}

type TaskRegistry = {
  [taskName: string]: (...params: any[]) => any;
};

interface TinyQEvents {
  "job:new": [job: WorkerJob];
  "job:started": [job: WorkerJob];
  "job:completed": [job: WorkerJob];
  "job:failed": [job: WorkerJob];
}

interface Queue {
  events: EventEmitter<{
    push: [job: WorkerJob<any>];
  }>;
  length: () => Promise<number>;
  push: (job: WorkerJob<any>) => void | Promise<void>;
  pop: () => (WorkerJob<any> | undefined) | Promise<WorkerJob<any> | undefined>;
}

class ArrayQueue implements Queue {
  events = new EventEmitter<{ push: [job: WorkerJob] }>();
  data: WorkerJob[] = [];
  async length() {
    return this.data.length;
  }
  push(job: WorkerJob) {
    this.data.unshift(job);
    this.events.emit("push", job);
  }

  pop() {
    const el = this.data.pop();
    return el;
  }
}

interface TaskExecutionContext {
  pool: ThreadPool;
  queue: Queue;
}

export class TinyQ<
  Tasks extends { [name: string]: any } = {},
> extends EventEmitter<TinyQEvents> {
  taskWorkerRegistry = new Map<keyof Tasks, TaskExecutionContext>();

  registerWorkerTask<
    TaskSignature extends (...params: any) => any,
    TaskName extends string,
  >(
    taskName: TaskName,
    {
      filename,
    }: {
      entrypoint: TaskSignature;
      filename: string;
    },
    options: Partial<{
      workerCount: number;
      queue: Queue;
    }> = {},
  ): TinyQ<Tasks & { [K in TaskName]: TaskSignature }> {
    console.debug(`constructing worker for ${taskName}: ${filename}`);

    const pool = newThreadPool(
      filename,
      options.workerCount || 1,
      this.handleWorkerMessage.bind(this),
    );

    const queue = options.queue || new ArrayQueue();

    pool.events.on("thread:free", (thread) =>
      this.processNextJob({
        pool,
        queue,
      }),
    );

    queue.events.on("push", (job) => {
      this.processNextJob({ pool, queue });
    });

    this.taskWorkerRegistry.set(taskName, { pool, queue });
    return this;
  }

  handleWorkerMessage(thread: Thread, event: WorkerToMasterEvent) {
    switch (event.type) {
      case "job": {
        const job: WorkerJob = event.job;
        thread.isBusy = false;
        this.emit("job:completed", job);
      }
    }
  }

  async processNextJob(
    { pool, queue }: TaskExecutionContext,
    thread = findAvailableThread(pool),
  ) {
    if (!thread) return;

    thread.isBusy = true;
    const job = await queue.pop();
    if (!job) {
      thread.isBusy = false;
      return;
    }

    thread.sendMessage({ type: "job", job });
  }

  async enqueueJob<TaskName extends keyof Tasks>(
    name: TaskName,
    ...params: Parameters<Tasks[TaskName]>
  ) {
    const options = this.taskWorkerRegistry.get(name);
    assert(options, "task not found");
    const pool = options.pool;
    const queue = options.queue;

    const job: WorkerJob<Tasks> = {
      id: randomUUID(),
      taskName: name,
      status: JobStatus.PENDING,
      input: params,
      metadata: {},
      executionTime: 0,
    };

    await queue.push(job);
  }
}

export function taskFromFile<TaskSignature extends (...params: any[]) => any>(
  filename: string,
  url: string,
) {
  // filename = resolve(dirname, filename);
  // console.log("filename is", filename);
  filename = new URL(filename, url).pathname;
  // filename = new URL(filename, import.meta.url).pathname;
  return {
    filename,
    entrypoint: null as unknown as TaskSignature,
  };
}
