import { Subprocess } from "bun";
let sub: Subprocess;

export async function spawnProcessor(importMeta: ImportMeta) {
  if (sub) {
    sub.kill();
    await sub.exited;
    throw "another sub is running";
  }

  sub = Bun.spawn(["bun", new URL("./processor.ts", importMeta.url).pathname], {
    // stdout: "inherit",
    onExit() {
      console.log(": exited");
    },
  });

  return async () => {
    sub.kill();
    const code = await sub.exited;
    sub = null;
    return code;
  };
}
