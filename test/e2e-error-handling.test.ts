import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";
import { Fuzz } from "./fuzzer";

describe("TinyQ Error Handling", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("error-queue", redis)
      .useWorkerFile("./error-worker.ts", import.meta)
      .setConcurrency(Fuzz.number(1, 30));

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

  it("should handle job errors correctly", async () => {
    // Enqueue jobs, some of which will cause errors
    const jobCount = Fuzz.number(10, 400);
    const errorInputs = [3, 7]; // Inputs that will cause errors
    const startTime = Date.now();

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });


    console.time("enqueue");
    for (let i = 0; i < jobCount; i++) {
      await q.enqueueJob([i]);
    }
    console.timeEnd("enqueue");

    // Wait for jobs to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        console.log(
          `completedJobs.length: ${completedJobs.length}`,
          `jobCount: ${jobCount}`,
        );
        if (completedJobs.length >= jobCount) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Verify job statuses
    expect(completedJobs.length).toBe(jobCount);
    for (const job of completedJobs) {
      if (errorInputs.includes(job.input[0])) {
        expect(job.status).toBe(JobStatus.FAILED);
        expect(job.errors).toBeDefined();
        expect(job.output).toBeUndefined();
      } else {
        expect(job.status).toBe(JobStatus.COMPLETED);
        expect(job.output).toBe(job.input[0] * 2);
      }
    }
  });
});
