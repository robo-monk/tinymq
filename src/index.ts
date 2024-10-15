import { randomUUID } from "node:crypto";
import {
  RedisTinyDispatcher,
  TinyDispatcher,
  TinyDispatcherEvents,
} from "./dispatcher";
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

  add(...params: Parameters<JobSignature>) {
    const newJob: WorkerJob<JobSignature> = {
      id: randomUUID(),
      status: JobStatus.PENDING,
      input: params,
      metadata: {},
      executionTime: -1,
    };

    let promise: Promise<void>;
    try {
      promise = this.dispatcher.rpush(newJob);
    } catch (e) {
      console.error("eerror foudn here", e);
    }

    const ret = {
      job: newJob,
      get result() {
        return new Promise<typeof newJob.output>((resolve) => {
          ret.once("complete", (job) => {
            Object.assign(newJob, job);
            resolve(job.output);
          });
        });
      },
      once: (
        event: "complete" | "started",
        callback: (job: WorkerJob<JobSignature>) => any,
      ) => {
        const eventKey = `job:${event}` as keyof TinyDispatcherEvents<
          WorkerJob<JobSignature>
        >;

        const fn = (job: WorkerJob<JobSignature>) => {
          if (job.id == newJob.id) {
            this.dispatcher.events.off(eventKey, fn);
            callback(job);
          }
        };

        this.dispatcher.events.on(eventKey, fn);
        return ret;
      },
    };

    return ret;
  }

  static _getSettings(q: TinyMQ) {
    return {
      jobName: q.jobName,
      dispatcher: q.dispatcher,
      workerUrl: q.workerUrl,
    };
  }
}
