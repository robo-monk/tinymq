import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyMQ, WorkerJob, JobStatus } from "../../src";
import { MQProcessor } from "../../src/processor";

describe("TinyQ Error Handling", () => {
  let redis: Redis;
  let q: TinyMQ<(x: number) => number>;
  // let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis();

    // Create a TinyQ instance
    q = new TinyMQ("error-queue", redis).useWorkerFile(
      "./error-worker.ts",
      import.meta,
    );

    MQProcessor.addQueue(q).start();
  });

  afterAll(async () => {
    // Clean up
    await redis.quit();
    MQProcessor.kill();
  });

  it("should handle job errors correctly", async () => {
    const jobCount = 400;
    const errorInputs = [3, 7]; // Inputs that will cause errors
    const startTime = Date.now();

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    console.time("enqueue");
    for (let i = 0; i < jobCount; i++) {
      await q.add(i);
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
        expect(job.status).toBe(JobStatus.SUCCESS);
        expect(job.output).toBe(job.input[0] * 2);
      }
    }
  });
});
