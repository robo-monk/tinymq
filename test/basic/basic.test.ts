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
import { WorkerJob } from "../../src";

describe("default test", () => {
  it("works", async () => {
    const kill = await spawnProcessor(import.meta);
    const inputs = ["one", "two", "three"];
    testTq.add(inputs);

    const nice = await new Promise<boolean>((resolve) =>
      testTq.dispatcher.events.once("job:complete", (job) => {
        // console.log({ job });
        resolve(job.output == inputs.join("-"));
      }),
    );

    expect(nice);
    expect((await kill()) == 0);
  });
});

// afterAll(async () => {
//   await killProcessor(import.meta);
//   console.log("killed!");
// });
describe("multiple jobs", () => {
  it("handles multiple jobs", async () => {
    const kill = await spawnProcessor(import.meta);
    const inputs = ["one", "two", "three"];
    const jobCount = 1_000;

    for (let i = 0; i < jobCount; i++) {
      testTq.add(inputs);
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

    console.log;
    testTq.dispatcher.events.off("job:complete", fn);

    expect(nice);
    expect((await kill()) == 0);
  });
});
