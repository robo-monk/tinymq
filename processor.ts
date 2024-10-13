import { testTq } from "./queues";
import { processTinyQs } from "./tinyq/processor";

// testTq.dispatcher.events.on("job:complete", (job) => {
//   console.log("job complete", job.executionTime);
// });
processTinyQs(testTq.setConcurrency(2));
