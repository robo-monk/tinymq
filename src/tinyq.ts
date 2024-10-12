import { randomUUID } from "node:crypto";
import { RedisTinyDispatcher, TinyDispatcher } from "./tinyq-dispatcher";
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
  output?: ReturnType<JobSignature>;
  errors?: string[];
  metadata: Record<string, string>;
  executionTime: number;
}

export class TinyQ<
  JobSignature extends (...params: any) => any = (...params: unknown[]) => any,
> {
  private dispatcher: TinyDispatcher<WorkerJob<JobSignature>>;

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

  async enqueueJob(...params: Parameters<JobSignature>) {
    const job: WorkerJob<JobSignature> = {
      id: randomUUID(),
      status: JobStatus.PENDING,
      input: params,
      metadata: {},
      executionTime: 0,
    };
    await this.dispatcher
      .pushJob(job)
      .catch((e) => console.error("error pushing job!", e));
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
