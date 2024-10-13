import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";

describe("TinyQ Job Ordering and Priorities", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("priority-queue", redis)
      .useWorkerFile("./test-worker.ts", import.meta)
      .setConcurrency(1); // Single worker to enforce order

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

  it("should process jobs in correct order", async () => {
    // Enqueue jobs with varying priorities
    const jobInputs = [1, 2, 3, 4, 5];

    // Enqueue normal priority jobs
    for (const input of jobInputs) {
      await q.enqueueJob([input]);
    }

    // Enqueue a high-priority job to the front of the queue
    const highPriorityJob: WorkerJob<(x: number) => number> = {
      id: "high-priority",
      status: JobStatus.PENDING,
      input: [999],
      metadata: {},
      executionTime: -1,
    };
    await q.dispatcher.lpush(highPriorityJob);

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    // Wait for all jobs to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        if (completedJobs.length >= jobInputs.length + 1) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Verify job processing order
    expect(completedJobs.length).toBe(jobInputs.length + 1);
    expect(completedJobs[0].input[0]).toBe(999); // High-priority job processed first

    // Verify remaining jobs are processed in order
    for (let i = 0; i < jobInputs.length; i++) {
      expect(completedJobs[i + 1].input[0]).toBe(jobInputs[i]);
    }
  });
});
