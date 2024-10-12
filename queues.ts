// shared-tinyqueues.ts
import { TinyQ } from "./src/tinyq";
import { RedisTinyDispatcher } from "./src/tinyq-dispatcher";
import type { TestTask } from "./test.task.ts";
import { Redis } from "ioredis";

const redis = new Redis();

export const testTq = new TinyQ("test")
  .useWorkerFile<TestTask>("./test.task.ts", import.meta)
  .useDispatcher(new RedisTinyDispatcher(redis, "test"))
  .setConcurrency(4);

testTq.dispatcher.events
  .on("job:push", (job) => {
    console.log("queue : job pushed", job);
  })
  .on("job:complete", (job) => {
    console.log("queue :job done", job.executionTime, job.output);
  });

console.log("queue-ts");
