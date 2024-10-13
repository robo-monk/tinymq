import { registerEntrypoint } from "../tinyq/worker";

export type FnType1 = typeof fn;

function fn(x: number) {
  return x * 3;
};

registerEntrypoint(fn);
