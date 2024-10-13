import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";

describe("TinyQ Asynchronous Job Processing", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => Promise<number>>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("async-queue", redis)
      .useWorkerFile("./async-worker.ts", import.meta)
      .setConcurrency(2);

    // Start processing
    pools = processTinyQs(q);
  });

  afterAll(async () => {
    // Clean up
    await redis.quit();

    // Terminate worker processes
    const promises = pools.flatMap((pool) =>
      pool.threads.map((thread) => thread.kill()),
    );
    await Promise.all(promises);
  });

  it("should process asynchronous jobs correctly", async () => {
    // Enqueue jobs
    const jobCount = 20;

    for (let i = 0; i < jobCount; i++) {
      await q.enqueueJob([i]);
    }

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => Promise<number>>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    // Wait for jobs to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        if (completedJobs.length >= jobCount) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Verify that all jobs are completed
    expect(completedJobs.length).toBe(jobCount);
    for (const job of completedJobs) {
      expect(job.status).toBe(JobStatus.COMPLETED);
      expect(job.output).toBe(job.input[0] * 2);
    }
  });
});
