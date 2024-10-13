import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";

describe("TinyQ Job Cancellation", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("cancel-queue", redis)
      .useWorkerFile("./test-worker.ts", import.meta)
      .setConcurrency(1); // Single worker for controlled processing

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

  it("should cancel jobs correctly", async () => {
    // Enqueue jobs
    const jobCount = 5;
    for (let i = 0; i < jobCount; i++) {
      await q.enqueueJob([i]);
    }

    // Cancel jobs before they are processed
    const canceledJob = await q.dispatcher.lpop(); // Remove the next job from the queue

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    // Wait for remaining jobs to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        if (completedJobs.length >= jobCount - 1) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Verify that the canceled job was not processed
    expect(completedJobs.length).toBe(jobCount - 1);
    for (const job of completedJobs) {
      expect(job.input[0]).not.toBe(canceledJob?.input[0]);
      expect(job.status).toBe(JobStatus.COMPLETED);
    }
  });
});
