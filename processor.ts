import { testTq } from "./queues";
import { TinyQ } from "./src/tinyq";
import { processTinyQs } from "./src/tinyq-processor2";

console.log("starting process");
const pools = processTinyQs(testTq);

process.on("SIGINT", async () => {
  console.log("Received SIGINT");
  console.log("Terminating workers");
  const promises = pools.flatMap((pool) => {
    return new Promise<void>((resolve) => {
      pool.threads.forEach((thread) => {
        thread.sendMessage({ type: "close" });
      });
      pool.events.once("pool:kill", resolve);
    });
  });
  await Promise.all(promises);
  console.log("kill all");
  process.exit();
});
