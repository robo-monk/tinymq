import EventEmitter from "node:events";
import assert from "node:assert";
import { JobStatus, type WorkerJob } from "./tinyq";
import type {
  MasterToWorkerEvent,
  WorkerToMasterEvent,
} from "./tinyq-processor.js";

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

// console.assert(process.send)
function sendMessage(message: WorkerToMasterEvent<any>) {
  // self.postMessage(message);
  process.send!(message);
}

const processJob = async (job: WorkerJob<any>) => {
  try {
    const start = performance.now();
    try {
      job.output = await __worker.entrypoint(job.input); // Run the entrypoint function
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
    // assert(event.type == "message", "expected a message");
    // const message: MasterToWorkerEvent = event.data;
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

// self.addEventListener("message", handleMessage);
// self.onmessage = handleMessage;
// console.log(`${Bun.env.workerName}] inited`);

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

  if (__worker.isProcessing) {
    console.log("Worker is still working");
    await new Promise<void>((resolve) => {
      let timeout = 250;
      const check = () => {
        if (!__worker.isProcessing) {
          resolve();
        } else {
          console.log(
            `Worker is still working. Checking back in ${timeout / 1000}s`,
          );
          setTimeout(check, (timeout *= 2));
        }
      };

      check();
    });
  }
  console.log("Recieved command to terminate");
  await __worker?.onDestroy?.call(this);
  console.log("ok, all clean");
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("SIGHUP", cleanup);

console.log("Ready to work");
