import { primeQueue } from "./queue";
import { MQProcessor } from "../../src/processor";

MQProcessor.addQueue(primeQueue, {
  concurrency: 4,
}).start();
