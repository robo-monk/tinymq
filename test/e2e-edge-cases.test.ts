import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";

describe("TinyQ Input Validation and Edge Cases", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("edge-case-queue", redis)
      .useWorkerFile("./edge-case-worker.ts", import.meta)
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

  it("should handle invalid inputs gracefully", async () => {
    // Enqueue jobs with invalid inputs
    const invalidInputs = [null, undefined, "string", {}, [], NaN];

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    for (const input of invalidInputs) {
      await q.enqueueJob([input as any]);
    }

    // Wait for jobs to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        if (completedJobs.length >= invalidInputs.length) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Verify that all jobs have failed gracefully
    expect(completedJobs.length).toBe(invalidInputs.length);
    for (const job of completedJobs) {
      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.errors).toBeDefined();
    }
  });
});
