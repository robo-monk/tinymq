import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";

describe("TinyQ Concurrency and Stress Testing", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("stress-queue", redis)
      .useWorkerFile("./test-worker.ts", import.meta)
      .setConcurrency(10); // High concurrency

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
    "should handle high load correctly",
    async () => {
      // Enqueue a large number of jobs
      const jobCount = 10_000;
      const startTime = Date.now();

      // Set up listener for job completion
      let completedJobCount = 0;
      q.dispatcher.events.on("job:complete", () => {
        // console.log("completed job count", completedJobCount);
        completedJobCount++;
      });

      for (let i = 0; i < jobCount; i++) {
        await q.enqueueJob([i]);
      }

      // Wait for all jobs to complete
      await new Promise<void>((resolve) => {
        const check = () => {
          if (completedJobCount >= jobCount) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Output performance metrics
      console.log(`Processed ${jobCount} jobs in ${totalTime} ms`);
      console.log(`Throughput: ${(jobCount / totalTime) * 1000} jobs/sec`);
    },
    { timeout: 10_000 },
  );
});
