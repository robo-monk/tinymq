import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";

describe("TinyQ Persistence and Recovery", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("recovery-queue", redis)
      .useWorkerFile("./recovery-worker.ts", import.meta)
      .setConcurrency(15);

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

  it(
    "should recover from worker failure",
    async () => {
      // Enqueue jobs
      const jobCount = 1_000;

      // Set up listener for job completion
      const completedJobs: WorkerJob<(x: number) => number>[] = [];
      q.dispatcher.events.on("job:complete", (job) => {
        completedJobs.push(job);
      });

      for (let i = 0; i < jobCount; i++) {
        q.enqueueJob([i]);
      }

      // Simulate worker failure by killing one of the threads
      const [threadToKill] = pools[0].threads;
      await threadToKill.kill();

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

      // Verify that all jobs are completed despite the worker failure
      completedJobs.map((job) => {
        console.log(job);
      });
      expect(completedJobs.length).toBe(jobCount);
      for (const job of completedJobs) {
        expect(job.status).toBe(JobStatus.COMPLETED);
        expect(job.output).toBe(job.input[0] * 2);
      }
    },
    {
      timeout: 10_000,
    },
  );
});
