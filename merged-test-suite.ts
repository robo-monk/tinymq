

// File: async-worker.ts

import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint(async (x: number) => {
  // Simulate asynchronous operation
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
  return x * 2;
});


// File: e2e-async.test.ts

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";
import { Fuzz } from "./fuzzer";

describe("TinyQ Asynchronous Job Processing", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => Promise<number>>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("async-queue", redis)
      .useWorkerFile("./async-worker.ts", import.meta)
      .setConcurrency(Fuzz.number(1, 10));

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

  it("should process asynchronous jobs correctly", async () => {
    // Enqueue jobs
    const jobCount = Fuzz.number(4, 500);

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => Promise<number>>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    for (let i = 0; i < jobCount; i++) {
      q.enqueueJob([i]);
    }

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
  }, {
    timeout: 10000,
  });
});


// File: e2e.test.ts

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq/index";
import { processTinyQs } from "../tinyq/processor";
import { Fuzz } from "./fuzzer";

describe("End-to-End TinyQ Testing", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("test-queue", redis)
      .useWorkerFile("./test-worker.ts", import.meta)
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

  it("should process jobs correctly", async () => {
    // Enqueue jobs
    const jobCount = Fuzz.number(100, 2000);
    const startTime = Date.now();
    for (let i = 0; i < jobCount; i++) {
      q.enqueueJob([i]);
    }

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });

    // Wait for jobs to complete
    await new Promise<void>((resolve) => {
      const check = () => {
        console.log("completed", completedJobs.length, jobCount);
        if (completedJobs.length >= jobCount) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Verify that all jobs are completed
    expect(completedJobs.length).toBe(jobCount);
    for (const job of completedJobs) {
      expect(job.status).toBe(JobStatus.COMPLETED);
      expect(job.output).toBe(job.input[0] * 2);
    }

    console.log(`Processed ${jobCount} jobs in ${totalTime} ms`);
    console.log(`Average time per job: ${totalTime / jobCount} ms`);
  });
});


// File: worker-one.ts

import { registerEntrypoint } from "../tinyq/worker";

export type FnType1 = typeof fn;

function fn(x: number) {
  return x * 3;
};

registerEntrypoint(fn);


// File: e2e-recovery.test.ts

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";
import { Fuzz } from "./fuzzer";

describe("TinyQ Persistence and Recovery", () => {
  let redis: Redis;
  let q: TinyQ<(x: number) => number>;
  let pools: ReturnType<typeof processTinyQs>;

  beforeAll(async () => {
    // Set up Redis
    redis = new Redis(6377);

    // Create a TinyQ instance
    q = new TinyQ("recovery-queue", redis)
      .useWorkerFile("./recovery-worker.ts", import.meta)
      .setConcurrency(15);

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
    "should recover from worker failure",
    async () => {
      // Enqueue jobs
      const jobCount = Fuzz.number(10, 1000);

      // Set up listener for job completion
      const completedJobs: WorkerJob<(x: number) => number>[] = [];
      q.dispatcher.events.on("job:complete", (job) => {
        completedJobs.push(job);
      });

      for (let i = 0; i < jobCount; i++) {
        q.enqueueJob([i]);
      }

      // Simulate worker failure by killing one of the threads
      const [threadToKill] = pools[0].threads;
      await threadToKill.kill();

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

      // Verify that all jobs are completed despite the worker failure
      expect(completedJobs.length).toBe(jobCount);
      for (const job of completedJobs) {
        expect(job.status).toBe(JobStatus.COMPLETED);
        expect(job.output).toBe(job.input[0] * 2);
      }
    },
    {
      timeout: 10_000,
    },
  );
});


// File: worker-two.ts

import { registerEntrypoint } from "../tinyq/worker";

export type FnType2 = typeof fn;
function fn(x: number) {
  return `Number: ${x}`;
}

registerEntrypoint(fn);


// File: e2e-priority.test.ts

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


// File: fuzzer.ts

export const Fuzz = {
    number(min: number, max: number) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    string(length: number) {
        return Array.from({ length }, () => Math.random().toString(36)[2]).join('');
    }
}


// File: test-worker.ts

import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint((x: number) => {
  return x * 2;
});


// File: e2e-multiple-queues.test.ts

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


// File: e2e-cancellation.test.ts

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";
import { Fuzz } from "./fuzzer";

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
    const jobCount = Fuzz.number(10, 500);

    // Set up listener for job completion
    const completedJobs: WorkerJob<(x: number) => number>[] = [];
    q.dispatcher.events.on("job:complete", (job) => {
      completedJobs.push(job);
    });


    for (let i = 0; i < jobCount; i++) {
      await q.enqueueJob([i]);
    }

    // Cancel jobs before they are processed
    const canceledJob = await q.dispatcher.lpop(); // Remove the next job from the queue

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


// File: preload.ts

import { Subprocess } from "bun";
import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import Redis from "ioredis";

const redisPort = 6377; // Adjust if needed

const  redisProcess = Bun.spawn(
  [
    "redis-server",
    "--port",
    redisPort.toString(),
    "--save",
    '""',
    // "--appendonly",
    // "no",
  ],
  {
    stdout: "pipe",
    stderr: "pipe",
  },
);


beforeEach(async () => {
  console.log("resetting redis!");
  // await new Promise((r) => setTimeout(r, 1000));
  // Set up Redis
  const redis = new Redis(redisPort);
  console.log("clearing all keys");
  await redis.flushall();
  await redis.quit();
  // await redis.discard();
  // // Create a TinyQ instance
  // q = new TinyQ("recovery-queue", redis)
  //   .useWorkerFile("./recovery-worker.ts", import.meta)
  //   .setConcurrency(15);

  // // Start processing
  // pools = processTinyQs(q);
});

afterAll(async () => {
  console.log("killing redis process");
  redisProcess.kill();
  await redisProcess.exited;
});


// File: e2e-stress.test.ts

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { TinyQ, WorkerJob, JobStatus } from "../tinyq";
import { processTinyQs } from "../tinyq/processor";
import { Fuzz } from "./fuzzer";

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
      .setConcurrency(Fuzz.number(10, 50)); // High concurrency

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
      const jobCount = Fuzz.number(1_000, 20_000);
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
    { timeout: 20_000 },
  );
});


// File: error-worker.ts

import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint((x: number) => {
  if (x === 3 || x === 7) {
    throw new Error(`Intentional error for input ${x}`);
  }
  return x * 2;
});


// File: recovery-worker.ts

import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint((x: number) => {
  // Simulate processing time
  const start = Date.now();
  while (Date.now() - start < 50) {
    // Busy wait for 50ms
  }
  return x * 2;
});


// File: e2e-error-handling.test.ts

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
