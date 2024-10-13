import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint((x: number) => {
  return x * 2;
});
