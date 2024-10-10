import { onDestroy, registerEntrypoint } from "./worker.js";
// import { randomUUID } from "crypto";

export type TestTask = typeof testTask;

export async function testTask(...inputs: string[]) {
  // let shit = "";
  // for (let i = 0; i < 10; i++) {
  //   shit += randomUUID();
  // }
  return `hello ${inputs.join(".")}`;
}

// setInterval(() => {
//   console.log("gc...");
// }, 500);

console.log(`[Inited] :: ${__filename}`);

registerEntrypoint(testTask);
onDestroy(async () => {
  console.log("killing...");
  // await new Promise((r) => setTimeout(r, 1));
});
