// shared-tinyqueues.ts
import { pack } from "msgpackr";
import { TinyQ } from "./tinyq";

import type { TestTask } from "./test.task.ts";
import { Redis } from "ioredis";

export const testTq = new TinyQ("test", new Redis()).useWorkerFile<TestTask>(
  "./test.task.ts",
  import.meta,
);
