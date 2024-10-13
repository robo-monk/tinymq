import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint(async (x: number) => {
  // Simulate asynchronous operation
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
  return x * 2;
});
