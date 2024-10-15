import { TinyMQ } from "../../src/";
import { Redis } from "ioredis";
import type { PrimeJob } from "./prime.job.ts";

const redis = new Redis();

export const primeQueue = new TinyMQ("prime", redis).useWorkerFile<PrimeJob>(
  "./prime.job.ts",
  import.meta,
);
