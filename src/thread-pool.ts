import { EventEmitter } from "events";
import { WorkerJob } from "./lib";
import assert from "assert";

export type MasterToWorkerEvent =
  | { type: "job"; job: WorkerJob<any> }
  | { type: "close" };

export type WorkerToMasterEvent =
  | { type: "hello" }
  | { type: "job"; job: WorkerJob }
  | { type: "closed" };

export interface Thread {
  _worker: Worker;
  sendMessage: (message: MasterToWorkerEvent) => any;
  isBusy: boolean;
  isOpen: boolean;
}

export interface ThreadPool {
  events: EventEmitter<{
    "thread:free": [Thread];
    "thread:kill": [Thread];
    "pool:kill": [];
  }>;
  count: number;
  threads: Thread[];
}

export function findAvailableThread(pool: ThreadPool) {
  return pool.threads.find((t) => !t.isBusy && t.isOpen);
}

export function newThreadPool(
  filename: string,
  count: number,
  onmessage: (thread: Thread, event: WorkerToMasterEvent) => void,
) {
  const pool: ThreadPool = {
    events: new EventEmitter(),
    count,
    threads: [],
  };

  pool.events.addListener("thread:kill", (thread) => {
    if (pool.threads.every((th) => !th.isOpen)) {
      pool.events.emit("pool:kill");
    }
  });

  pool.threads = Array(count)
    .fill(0)
    .map(() => {
      const worker = new Worker(filename);

      const thread: Thread = {
        _worker: worker,
        sendMessage: worker.postMessage.bind(worker),
        isBusy: false,
        isOpen: true,
      };

      worker.onmessage = (event: MessageEvent) => {
        // console.log("event", event);
        assert(event.type == "message");
        const message = event.data as WorkerToMasterEvent;
        switch (message.type) {
          case "hello": {
            thread.isOpen = true;
            break;
          }
          case "closed": {
            thread._worker.terminate();
            thread.isOpen = false;
            pool.events.emit("thread:kill", thread);
            break;
          }
          case "job":
            thread.isBusy = false;
            pool.events.emit("thread:free", thread);
            onmessage(thread, message);
            break;
        }
      };
      return thread;
    });
  return pool;
}
