import { testTq } from "./queues";

testTq.dispatcher.events
  .on("job:push", (job) => {
    console.log("job pushed", job);
  })
  .on("job:complete", (job) => {
    console.log("job done", job.executionTime, job.output);
  });

// testTq.enqueueJob("hello", "hoo");
// testTq.enqueueJob("hello", "hoo");
// testTq.enqueueJob("hello", "hoo");
// testTq.enqueueJob("hello", "hoo");
// testTq.enqueueJob("hello", "hoo");

// testTq.enqueueJob("hello", "hoo");

// const i = setInterval(() => {
//   // generateHeapSnapshot().
//   // Bun.gc(true);
//   console.time("flood");
//   for (let i = 0; i < 10_000; i++) {
//     testTq.enqueueJob("hello", "hoo");
//   }
//   console.timeEnd("flood");
// }, 5_000);

for (let i = 0; i < 10_000; i++) {
  testTq.enqueueJob("hello", "hoo");
}

// console.log("memory usage is", process.memoryUsage());
// Bun.gc(true);
// console.log("after gc memory usage is", process.memoryUsage());
// }, 5_000);

// setInterval(() => {
//   const heapTotalInMB = process.memoryUsage().heapUsed / 1024 / 1024;
//   console.log(
//     `[main] memory usage from this process is: `,
//     heapTotalInMB.toFixed(2), // rounding to 2 decimal places
//     "MB",
//   );
// }, 1_000);

// setTimeout(() => {

// }, 10_000);

// .concurrency(4)
// .on("completed", (job) => console.log("job done"))

// tinyque processor
// import { processQueues } from "tinyq"
// import { testTq } from "./shared-tinyqueues.ts"

// processQueues(testTq)

// // somewhere else in the code
// import { testTq } from "./shared-tinyqueues.ts"

// testTq.enqueJob({ /* input data that are typed */}) // this will put it in the queue
