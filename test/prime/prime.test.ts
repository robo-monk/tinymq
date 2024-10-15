import { describe, expect, it } from "bun:test";

import { primeQueue } from "./queue";
import { spawnProcessor } from "../preload";

describe("multiple primes", () => {
  it("cooks hard on those prime jobs", async () => {
    const kill = await spawnProcessor(import.meta);
    const jobCount = 420;

    for (let i = 0; i < jobCount; i++) {
      primeQueue.add(i);
    }

    let jobComplete = 0;
    const nice = await new Promise<boolean>((resolve) => {
      primeQueue.dispatcher.events.on("job:complete", (job) => {
        jobComplete += 1;
        // console.log("job output", job.output, job.input);
        // console.log(jobComplete);

        expect(job.output?.length ?? 0).toBeLessThanOrEqual(job.input[0]);

        // console.log(jobComplete, jobCount);
        if (jobComplete == jobCount) {
          resolve(true);
        }
      });
    });

    // console.log({ nice });

    expect(nice).toBeTrue();
    // console.log;
    // primeQueue.dispatcher.events.off("job:complete", fn);

    // expect(false, "Error");
    expect(await kill()).toBe(0);
  });
});
