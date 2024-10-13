import { Subprocess } from "bun";
import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import Redis from "ioredis";

const redisPort = 6377; // Adjust if needed
let redisProcess: Subprocess;

beforeAll(async () => {
  console.log("resetting redis!");
  redisProcess = Bun.spawn(
    [
      "redis-server",
      "--port",
      redisPort.toString(),
      "--save",
      '""',
      // "--appendonly",
      // "no",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  await new Promise((r) => setTimeout(r, 500));
  // Set up Redis
  const redis = new Redis(redisPort);
  console.log("clearing all keys");
  await redis.flushall();
  await redis.quit();

  // // Create a TinyQ instance
  // q = new TinyQ("recovery-queue", redis)
  //   .useWorkerFile("./recovery-worker.ts", import.meta)
  //   .setConcurrency(15);

  // // Start processing
  // pools = processTinyQs(q);
});

afterAll(async () => {
  redisProcess.kill();
  await redisProcess.exited;
});
