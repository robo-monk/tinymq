import assert from "assert";
import { JobStatus, type WorkerJob } from "./lib.js";
import type {
  MasterToWorkerEvent,
  WorkerToMasterEvent,
} from "./thread-pool.js";

interface WorkerContext {
  entrypoint: (...params: any) => any;
  onDestroy?: (...params: any) => any;
  isProcessing: boolean;
}

const __worker: WorkerContext = {
  entrypoint: () => {
    throw new Error(
      `${__filename} does not provide a valid entrypoint. Use 'registerEntrypoint' to register your worker's entrypoint`,
    );
  },
  onDestroy: () => `Terminating ${__filename} worker`,
  isProcessing: false,
};

export const onDestroy = (cb: typeof __worker.onDestroy) =>
  (__worker.onDestroy = cb);

function sendMessage(message: WorkerToMasterEvent) {
  self.postMessage(message);
}

const processJob = async (job: WorkerJob) => {
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
    sendMessage({ type: "job", job }); // Send the result back
  }
};

const handleMessage = async (event: MessageEvent) => {
  try {
    assert(event.type == "message", "expected a message");
    const message: MasterToWorkerEvent = event.data;
    switch (message.type) {
      case "close":
        if (__worker.isProcessing) await __worker?.onDestroy?.call(this);
        return sendMessage({ type: "closed" });
      case "job":
        assert(!__worker.isProcessing, `worker is currently working on job`);
        __worker.isProcessing = true;
        const job = message.job;
        processJob(job);
        break;
    }
  } catch (e) {
    console.error("Worker error!", e);
  }
};

// self.addEventListener("message", handleMessage);
self.onmessage = handleMessage;
console.log("inited");
// addEventListener("message", handleMessage);

export function registerEntrypoint(callback: (...p: any) => any) {
  __worker.entrypoint = callback;
  return callback;
}

sendMessage({ type: "hello" });
