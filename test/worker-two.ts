import { registerEntrypoint } from "../tinyq/worker";

registerEntrypoint((x: number) => {
  return `Number: ${x}`;
});
