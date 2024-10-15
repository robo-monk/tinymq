import { onDestroy, registerEntrypoint } from "../../src/worker";
export type TestTask = typeof testTask;

export async function testTask(...inputs: string[]) {
  return inputs.join("-");
}

registerEntrypoint(testTask);
onDestroy(async () => {
  console.log(`killing test task...`);
});
