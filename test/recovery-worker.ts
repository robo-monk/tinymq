import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint((x: number) => {
  // Simulate processing time
  const start = Date.now();
  while (Date.now() - start < 50) {
    // Busy wait for 50ms
  }
  return x * 2;
});
