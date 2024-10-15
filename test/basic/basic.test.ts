import { Subprocess } from "bun";
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "bun:test";

import { testTq } from "./queue";
import { spawnProcessor } from "../preload";
import { JobStatus, WorkerJob } from "../../src";

describe("default test", () => {
  it("works", async () => {
    const kill = await spawnProcessor(import.meta);
    const inputs = ["one", "two", "three"];
    const { job, result } = testTq.add(...inputs);
    expect(job.id).toBeString();
    expect(job.input).toEqual(inputs);
    expect(job.status).toBe(JobStatus.PENDING);
    const output = await result;
    expect(job.status).toBe(JobStatus.SUCCESS);
    expect(output).toBe(inputs.join("-"));
    expect(await kill()).toBe(0);
  });
});

describe("multiple jobs", () => {
  it("handles multiple jobs", async () => {
    const kill = await spawnProcessor(import.meta);
    const inputs = ["one", "two", "three"];
    const jobCount = 1_000;

    for (let i = 0; i < jobCount; i++) {
      testTq.add(...inputs);
    }

    let jobComplete = 0;
    const fn = (job: WorkerJob<any>, resolve: any) => {
      jobComplete += 1;
      expect(job.output == job.input.join("-"));
      if (jobComplete == jobCount) {
        resolve(true);
      }
    };

    const nice = await new Promise<boolean>((resolve) => {
      testTq.dispatcher.events.on("job:complete", (j) => fn(j, resolve));
    });

    testTq.dispatcher.events.off("job:complete", fn);

    expect(nice).toBeTrue();
    expect(await kill()).toBe(0);
  });
});

describe("multiple jobs fancy api", () => {
  it("handles multiple jobs", async () => {
    const kill = await spawnProcessor(import.meta);
    const inputs = ["one", "two", "three"];
    const jobCount = 1_000;

    const promises = Array(jobCount)
      .fill(0)
      .map(() => testTq.add(...inputs));

    const i = await Promise.all(promises.map((p) => p.result));
    console.log(i);
    promises.forEach(({ job }) => {
      expect(job.status).toBe(JobStatus.SUCCESS);
      expect(job.output).toBe(job.input.join("-"));
    });

    expect(await kill()).toBe(0);
  });
});
