// File: edge-case-worker.ts

import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint((x: number) => {
  if (typeof x !== "number" || isNaN(x)) {
    throw new Error(`Invalid input: ${x}`);
  }
  return x * 2;
});
