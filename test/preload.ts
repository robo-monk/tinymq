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

const  redisProcess = Bun.spawn(
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


beforeEach(async () => {
  console.log("resetting redis!");
  // await new Promise((r) => setTimeout(r, 1000));
  // Set up Redis
  const redis = new Redis(redisPort);
  console.log("clearing all keys");
  await redis.flushall();
  await redis.quit();
  // await redis.discard();
  // // Create a TinyQ instance
  // q = new TinyQ("recovery-queue", redis)
  //   .useWorkerFile("./recovery-worker.ts", import.meta)
  //   .setConcurrency(15);

  // // Start processing
  // pools = processTinyQs(q);
});

afterAll(async () => {
  console.log("killing redis process");
  redisProcess.kill();
  await redisProcess.exited;
});
