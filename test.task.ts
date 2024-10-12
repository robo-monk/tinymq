import { randomUUID } from "node:crypto";
import { onDestroy, registerEntrypoint } from "./src/worker";
export type TestTask = typeof testTask;

export async function testTask(...inputs: string[]) {
  // console.log("test task", inputs);
  let bs = "";

  // for (let i = 0; i < 10_000_000; i++) {
  //   bs += randomUUID();
  // }

  // return 0;
  // return bs.slice(-5, -1);

  await new Promise((r) => {
    setTimeout(r, 5_000);
  });
  return Math.random();
}

// setInterval(() => {
//   const heapTotalInMB = process.memoryUsage().heapUsed / 1024 / 1024;
//   console.log(
//     `memory usage from this process is: `,
//     heapTotalInMB.toFixed(2), // rounding to 2 decimal places
//     "MB",
//   );
// }, 1_000);

// console.log(`${self.name} init`);

registerEntrypoint(testTask);
onDestroy(async () => {
  console.log(`killing...`);
  // clean up code
});
