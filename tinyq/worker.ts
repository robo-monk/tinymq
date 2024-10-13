import assert from "node:assert";
import { JobStatus, type WorkerJob } from "./index";
import type { MasterToWorkerEvent, WorkerToMasterEvent } from "./processor.js";

interface WorkerContext {
  entrypoint: (...params: any) => any;
  onDestroy?: (...params: any) => any;
  isProcessing: boolean;
}

const __worker: WorkerContext = {
  entrypoint: () => {
    throw new Error(
      `${self.name} does not provide a valid entrypoint. Use 'registerEntrypoint' to register your worker's entrypoint`,
    );
  },
  onDestroy: () => {
    console.log(`Terminating ${self.name} worker. Skipping all active jobs.`);
  },
  isProcessing: false,
};

export const onDestroy = (cb: typeof __worker.onDestroy) =>
  (__worker.onDestroy = cb);

function sendMessage(message: WorkerToMasterEvent<any>) {
  process.send!(message);
}

const processJob = async (job: WorkerJob<any>) => {
  try {
    const start = performance.now();
    try {
      job.output = await __worker.entrypoint(...job.input); // Run the entrypoint function
      job.status = JobStatus.COMPLETED;
    } catch (e: any) {
      console.error(`Job ${job.id} errored`, e);
      job.errors = [e];
      job.status = JobStatus.FAILED;
    }
    job.executionTime = performance.now() - start;
  } catch (e) {
    console.error("Task processing failed: ", e);
  } finally {
    __worker.isProcessing = false; // Task completed, set flag to false
    sendMessage({ type: "job:processed", job }); // Send the result back
  }
};

// const handleMessage = async (event: MessageEvent) => {
const handleMessage = async (message: MasterToWorkerEvent) => {
  // console.log("got message", message);
  try {
    switch (message.type) {
      case "job:start":
        assert(!__worker.isProcessing, `worker is currently working on job`);
        __worker.isProcessing = true;
        const job = message.job;
        processJob(job);
        break;
    }
  } catch (e) {
    console.error("ERROR", e);
  }
};

const consoleProxy = new Proxy(console, {
  get(target: Console, property: keyof Console) {
    if (typeof target[property] === "function") {
      return (...args: any) => {
        const prefix = `[${Bun.env.workerName}]`; // The prefix you want to add
        // @ts-ignore
        target[property].apply(target, [`${prefix}`, ...args]);
      };
    }
    return target[property]; // If it's not a function, return it as-is
  },
});
globalThis.console = consoleProxy;

export function registerEntrypoint(callback: (...p: any) => any) {
  __worker.entrypoint = callback;
  return callback;
}

sendMessage({ type: "hello" });
process.on("message", handleMessage);

let isCleaningUp = false;
const cleanup = async () => {
  if (isCleaningUp) return;
  isCleaningUp = true;

  const maxWaitTime = parseInt(process.env.maxWaitTime || "60000"); // Maximum wait time in milliseconds (e.g., 30 seconds)
  const startTime = Date.now();

  console.log("I received a command to terminate");
  if (__worker.isProcessing) {
    console.log("I'm still processing a job");

    await new Promise<void>((resolve) => {
      const check = () => {
        const elapsedTime = Date.now() - startTime;
        if (!__worker.isProcessing) {
          resolve();
        } else if (elapsedTime >= maxWaitTime) {
          console.warn(
            `I've been processing for more than ${
              maxWaitTime / 1000
            } seconds. I'm forcefully terminating myself. Bye :(`,
          );
          resolve();
        } else {
          console.log("I'm still working. Checking again in 1 second.");
          setTimeout(check, 1000);
        }
      };

      check();
    });
  }

  console.log("Calling onDestroy");
  await __worker?.onDestroy?.call(this);
  console.log("Cleaned up");
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("SIGHUP", cleanup);

console.log("Ready to work");
