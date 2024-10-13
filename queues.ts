// shared-tinyqueues.ts
import { pack } from "msgpackr";
import { TinyQ } from "./src/tinyq";
import { RedisTinyDispatcher } from "./src/tinyq-dispatcher";
import type { TestTask } from "./test.task.ts";
import { Redis } from "ioredis";

export const testTq = new TinyQ("test", new Redis())
  .useWorkerFile<TestTask>("./test.task.ts", import.meta)
  .setConcurrency(1);
