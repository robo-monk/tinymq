import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";
import { Fuzz } from "./fuzzer";
import type { FnType1 } from "./worker-one";
import type { FnType2 } from "./worker-two";

describe("TinyQ Multiple Queues Processing", () => {
  let redis: Redis;
  let q1: TinyQ<FnType1>;
  let q2: TinyQ<FnType2>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create TinyQ instances
    q1 = new TinyQ("queue-one", redis)
      .useWorkerFile("./worker-one.ts", import.meta)
      .setConcurrency(Fuzz.number(1, 30));

    q2 = new TinyQ("queue-two", redis)
      .useWorkerFile("./worker-two.ts", import.meta)
      .setConcurrency(2);

    // Start processing both queues
    pools = processTinyQs(q1, q2);
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

  it("should process multiple queues correctly", async () => {
    // Enqueue jobs to both queues
    const jobCount = Fuzz.number(100, 2000);

    // Set up listeners for job completions
    const completedJobsQ1: WorkerJob<(x: number) => number>[] = [];
    const completedJobsQ2: WorkerJob<(x: number) => string>[] = [];

    q1.dispatcher.events.on("job:complete", (job) => {
      completedJobsQ1.push(job);
    });

    q2.dispatcher.events.on("job:complete", (job) => {
      completedJobsQ2.push(job);
    });


    for (let i = 0; i < jobCount; i++) {
      await q1.enqueueJob([i]);
      await q2.enqueueJob([i]);
    }

    // Wait for all jobs to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        if (
          completedJobsQ1.length >= jobCount &&
          completedJobsQ2.length >= jobCount
        ) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    // Verify jobs from queue one
    expect(completedJobsQ1.length).toBe(jobCount);
    for (const job of completedJobsQ1) {
      expect(job.status).toBe(JobStatus.COMPLETED);
      expect(job.output).toBe(job.input[0] * 3); // worker-one multiplies input by 3
    }

    // Verify jobs from queue two
    expect(completedJobsQ2.length).toBe(jobCount);
    for (const job of completedJobsQ2) {
      expect(job.status).toBe(JobStatus.COMPLETED);
      expect(job.output).toBe(`Number: ${job.input[0]}`); // worker-two formats input as string
    }
  });
});
