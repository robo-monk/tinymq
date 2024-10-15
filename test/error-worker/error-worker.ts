import { registerEntrypoint } from "../../src/worker";

registerEntrypoint((x: number) => {
  if (x === 3 || x === 7) {
    throw new Error(`Intentional error for input ${x}`);
  }
  return x * 2;
});
