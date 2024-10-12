// shared-tinyqueues.ts
import { pack } from "msgpackr";
import { TinyQ } from "./src/tinyq";
import { RedisTinyDispatcher } from "./src/tinyq-dispatcher";
import type { TestTask } from "./test.task.ts";
import { Redis } from "ioredis";

const redis = new Redis();

export const testTq = new TinyQ("test", new Redis())
  .useWorkerFile<TestTask>("./test.task.ts", import.meta)
  .setConcurrency(4);

testTq.dispatcher.events
  .on("job:push", (job) => {
    console.log("queue : job pushed");
  })
  .on("job:complete", (job) => {
    redis.lpush("jobs-processed", pack(job));
    console.log("job done", job.executionTime);
  });

console.log("queue-ts");
