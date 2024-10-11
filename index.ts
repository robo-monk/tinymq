// shared-tinyqueues.ts
import { generateHeapSnapshot } from "bun";
import { TinyQ } from "./src/tinyq";
import { processTinyQs } from "./src/tinyq-processor";
import type { TestTask } from "./test.task";

export const testTq = new TinyQ("test")
  .useWorkerFile<TestTask>("./test.task", import.meta)
  .setConcurrency(2);

testTq.dispatcher.events.on("job:complete", (job) => {
  // console.log("job done", job.executionTime, job.output);
});

const pools = processTinyQs(testTq);

// testTq.enqueueJob("hello", "hoo");
// testTq.enqueueJob("hello", "hoo");
// testTq.enqueueJob("hello", "hoo");
// testTq.enqueueJob("hello", "hoo");
// testTq.enqueueJob("hello", "hoo");
const i = setInterval(() => {
  // generateHeapSnapshot().
  // Bun.gc(true);
  console.time("flood");
  for (let i = 0; i < 200_000; i++) {
    testTq.enqueueJob("hello", "hoo");
  }
  console.timeEnd("flood");
  // console.log("memory usage is", process.memoryUsage());
  // Bun.gc(true);
  // console.log("after gc memory usage is", process.memoryUsage());
}, 5_000);

setInterval(() => {
  const heapTotalInMB = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(
    `[main] memory usage from this process is: `,
    heapTotalInMB.toFixed(2), // rounding to 2 decimal places
    "MB",
  );
}, 1_000);

process.on("SIGINT", async () => {
  console.log("Received SIGINT");
  console.log("Terminating workers");
  const promises = pools.flatMap((pool) => {
    return new Promise<void>((resolve) => {
      pool.threads.forEach((thread) => {
        thread.sendMessage({ type: "close" });
      });
      pool.events.once("pool:kill", resolve);
    });
  });
  await Promise.all(promises);
  console.log("kill all");
  clearInterval(i);
});

// .concurrency(4)
// .on("completed", (job) => console.log("job done"))

// tinyque processor
// import { processQueues } from "tinyq"
// import { testTq } from "./shared-tinyqueues.ts"

// processQueues(testTq)

// // somewhere else in the code
// import { testTq } from "./shared-tinyqueues.ts"

// testTq.enqueJob({ /* input data that are typed */}) // this will put it in the queue
