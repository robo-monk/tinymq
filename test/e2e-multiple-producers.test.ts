// File: e2e-multiple-producers.test.ts

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";

describe("TinyQ Multiple Producers", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("multi-producer-queue", redis)
      .useWorkerFile("./test-worker.ts", import.meta)
      .setConcurrency(5);

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

  it("should handle multiple producers enqueueing jobs concurrently", async () => {
    const producerCount = 5;
    const jobsPerProducer = 100;

    // Set up listener for job completion
    let completedJobCount = 0;
    q.dispatcher.events.on("job:complete", () => {
      completedJobCount++;
    });

    // Start multiple producers
    const producerPromises = [];
    for (let p = 0; p < producerCount; p++) {
      producerPromises.push(
        (async () => {
          for (let i = 0; i < jobsPerProducer; i++) {
            await q.enqueueJob([p * jobsPerProducer + i]);
          }
        })(),
      );
    }

    // Wait for all producers to finish enqueueing
    await Promise.all(producerPromises);

    const totalJobs = producerCount * jobsPerProducer;

    // Wait for all jobs to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        if (completedJobCount >= totalJobs) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Verify that all jobs have been processed
    expect(completedJobCount).toBe(totalJobs);
  });
});
