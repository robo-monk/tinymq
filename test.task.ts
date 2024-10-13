import { onDestroy, registerEntrypoint } from "./tinyq/worker";
export type TestTask = typeof testTask;

export async function testTask(...inputs: string[]) {
  return Math.random();
}

registerEntrypoint(testTask);
onDestroy(async () => {
  console.log(`killing...`);
});
