// File: e2e-no-duplicates.test.ts

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";

describe("TinyQ No Duplicate Job Processing", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("no-duplicates-queue", redis)
      .useWorkerFile("./test-worker.ts", import.meta)
      .setConcurrency(10);

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

  it("should not process any job more than once", async () => {
    const jobCount = 1000;

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    // Enqueue jobs
    for (let i = 0; i < jobCount; i++) {
      await q.enqueueJob([i]);
    }

    // Wait for all jobs to complete
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

    // Check for duplicates
    const processedJobIds = completedJobs.map((job) => job.id);
    const uniqueJobIds = new Set(processedJobIds);
    expect(uniqueJobIds.size).toBe(jobCount);

    // Alternatively, check that each input was processed only once
    const processedInputs = completedJobs.map((job) => job.input[0]);
    const uniqueInputs = new Set(processedInputs);
    expect(uniqueInputs.size).toBe(jobCount);
  });
});
