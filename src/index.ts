import { randomUUID } from "node:crypto";
import { RedisTinyDispatcher, TinyDispatcher } from "./dispatcher";
import Redis from "ioredis";

export enum JobStatus {
  PENDING,
  RUNNING,
  SUCCESS,
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

export class TinyMQ<
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
  ): TinyMQ<TaskSignature> {
    this.workerUrl = new URL(filename, importMeta.url);
    return this as unknown as TinyMQ<TaskSignature>;
  }

  async add(params: Parameters<JobSignature>) {
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

  static _getSettings(q: TinyMQ) {
    return {
      jobName: q.jobName,
      dispatcher: q.dispatcher,
      workerUrl: q.workerUrl,
    };
  }
}
