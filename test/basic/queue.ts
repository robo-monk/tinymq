import { TinyMQ } from "../../src/";
import type { TestTask } from "./test.job.ts";
import { Redis } from "ioredis";

export const testTq = new TinyMQ("test", new Redis()).useWorkerFile<TestTask>(
  "./test.job.ts",
  import.meta,
);
