import { TinyQ, taskFromFile } from "./src/lib";
import type { TestTask } from "./src/test.task";

const tq = new TinyQ()
  .registerWorkerTask(
    "test",
    taskFromFile<TestTask>("./src/test.task", import.meta.url),
    {
      workerCount: 10,
    },
  )
  // .registerWorkerTask<TestTask>("test", "src/tinytq/test.task.ts", {
  //   workerCount: 4,
  // })
  // .registerWorkerTask("pup", "src/tinytq/pup.task.ts", {
  //   workerCount: 4,
  // })
  // .on("job:new", (job) => {
  //   console.log("new job", job.id);
  // })
  // .on("job:started", async (job) => {
  //   console.log("job started", job.id);
  // })
  .on("job:completed", async (job) => {
    // totalJobs += 1;
    // totalMs += job.executionTime;
    // const avg = totalMs / totalJobs;
    // if (max < avg) max = avg;
    // if (min > avg) min = avg;
    // console.log(avg, max, min);
    console.log("job done", job.taskName, job.executionTime);
  });
// .on("job:failed", async (job) => {
//   console.error("job failed :(", job.id);
// })

// console.log("working..");
// for (let i = 0; i < 10; i++) {
// tq.registerWorkerJob("pup", "world");
// }

// tq.registerWorkerJob("test", "a", 1);

const interval = setInterval(async () => {
  console.log(
    "queue len is: ",
    await tq.taskWorkerRegistry.get("test")?.queue.length(),
  );
  console.log("flooding...");
  for (let i = 0; i < 10_000; i++) {
    tq.enqueueJob("test", "world", "490");
  }
}, 5_000);

process.on("SIGINT", async () => {
  console.log("Received SIGINT");
  console.log("Terminating workers");

  const promises = Array.from(tq.taskWorkerRegistry.values()).map(
    ({ pool }) => {
      // terminate each worker gracefully and await confirmation
      pool.threads.forEach((thread) => thread.sendMessage({ type: "close" }));
      return new Promise<void>((resolve) =>
        pool.events.once("pool:kill", resolve),
      );
    },
  );
  await Promise.race([
    Promise.all(promises),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log("Force kill. Process took more than 30s");
        resolve();
      }, 30_000);
    }),
  ]);

  // process.exit();
  clearInterval(interval);
});
