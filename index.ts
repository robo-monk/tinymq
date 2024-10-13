import { testTq } from "./queues";
// import { JobStatus } from "./src/tinyq";
// import assert from "assert";

let amountOfJobs = 1_000;
console.time("done working");

testTq.dispatcher.events.on("job:push", (job) => {
  // console.log("pushed on job", job.id);
});

testTq.dispatcher.events.on("job:complete", (job) => {
  // console.log("job done", job.executionTime);
  // console.log("thread got captured");
  amountOfJobs -= 1;
  if (amountOfJobs == 0) console.timeEnd("done working");
});

for (let i = 0; i < amountOfJobs; i++) {
  testTq.enqueueJob(["hello", "hoo"]);
}
