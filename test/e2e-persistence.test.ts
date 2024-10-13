// File: e2e-persistence.test.ts

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";
import { Fuzz } from "./fuzzer";

describe("TinyQ Job Persistence", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("persistence-queue", redis)
      .useWorkerFile("./test-worker.ts", import.meta)
      .setConcurrency(Fuzz.number(1, 5));

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

  it("should persist jobs and process them after restart", async () => {
    // Enqueue jobs
    const jobCount = Fuzz.number(5, 20);

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    // Enqueue jobs
    for (let i = 0; i < jobCount; i++) {
      await q.enqueueJob([i]);
    }

    // Kill worker threads
    const killPromises = pools.flatMap((pool) =>
      pool.threads.map((thread) => thread.kill()),
    );
    await Promise.all(killPromises);

    // Ensure jobs are still in Redis
    const pendingJobCount = await q.dispatcher.getPendingJobCount();
    expect(pendingJobCount).toBeGreaterThan(0);
    expect(pendingJobCount).toBe(jobCount - completedJobs.length);

    // Restart worker threads
    pools = processTinyQs(q);

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
