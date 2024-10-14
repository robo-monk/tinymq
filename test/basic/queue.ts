import { TinyQ } from "../../tinyq/";
import type { TestTask } from "./test.job.ts";
import { Redis } from "ioredis";

export const testTq = new TinyQ("test", new Redis()).useWorkerFile<TestTask>(
  "./test.job.ts",
  import.meta,
);
