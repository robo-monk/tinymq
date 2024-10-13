import { testTq } from "./queues";
// import { JobStatus } from "./src/tinyq";
// import assert from "assert";

let amountOfJobs = 5_000;
console.time("done working");

testTq.dispatcher.events.on("job:complete", (job) => {
  amountOfJobs -= 1;
  if (amountOfJobs == 0) console.timeEnd("done working 2");
});

for (let i = 0; i < amountOfJobs; i++) {
  testTq.enqueueJob(["hello", "hoo"]);
}
