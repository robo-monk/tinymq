import EventEmitter from "node:events";
import { randomUUID } from "node:crypto";

export enum JobStatus {
  PENDING,
  RUNNING,
  COMPLETED,
  FAILED,
}

export interface WorkerJob<JobSignature extends (...params: any) => any> {
  id: string;
  jobName: string;
  status: JobStatus;
  input: Parameters<JobSignature>;
  output?: ReturnType<JobSignature>;
  errors?: string[];
  metadata: Record<string, string>;
  executionTime: number;
}

export interface TinyDispatcherEvents<T> {
  "job:push": [job: T];
  "job:pop": [job: T];

  "job:complete": [job: T];
  "job:start": [job: T];
}

export interface TinyDispatcher<T> {
  pushJob(item: T): Promise<void>;
  popJob(): Promise<T | undefined>;
  getPendingJobCount(): Promise<number>;
  events: EventEmitter<TinyDispatcherEvents<T>>;
  // onNewJob(): Promise<void>;
  // subscribe(channel: string, handler: (message: string) => void): Promise<void>;
}

export class InMemoryTinyDispatcher<T> implements TinyDispatcher<T> {
  private queue: T[] = [];
  events = new EventEmitter<TinyDispatcherEvents<T>>();

  async pushJob(item: T): Promise<void> {
    this.queue.push(item);
    this.events.emit("job:push", item);
  }

  async popJob(): Promise<T | undefined> {
    const item = this.queue.shift();
    if (item) this.events.emit("job:pop", item);
    return item;
  }

  async getPendingJobCount(): Promise<number> {
    return this.queue.length;
  }
}

export class TinyQ<
  JobSignature extends (...params: any) => any = (...params: unknown[]) => any,
> {
  constructor(private jobName: string) {}

  protected dispatcher: TinyDispatcher<WorkerJob<JobSignature>> =
    new InMemoryTinyDispatcher<WorkerJob<JobSignature>>();

  useDispatcher(dispatcher: TinyDispatcher<WorkerJob<JobSignature>>) {
    this.dispatcher = dispatcher;
    return this;
  }

  protected workerUrl?: string;
  useWorkerFile<TaskSignature extends (...params: any) => any>(
    filename: string,
    importMeta: ImportMeta,
  ): TinyQ<TaskSignature> {
    this.workerUrl = new URL(filename, importMeta.url).href;
    return this as unknown as TinyQ<TaskSignature>;
  }

  protected concurrency: number = 1;
  setConcurrency(workerCount: number) {
    this.concurrency = workerCount;
    return this;
  }

  async enqueueJob(...params: Parameters<JobSignature>) {
    const job: WorkerJob<JobSignature> = {
      jobName: this.jobName,
      id: randomUUID(),
      status: JobStatus.PENDING,
      input: params,
      metadata: {},
      executionTime: 0,
    };
    await this.dispatcher.pushJob(job);
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
