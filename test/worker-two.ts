import { registerEntrypoint } from "../tinyq/worker";

export type FnType2 = typeof fn;
function fn(x: number) {
  return `Number: ${x}`;
}

registerEntrypoint(fn);
