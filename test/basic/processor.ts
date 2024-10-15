import { testTq } from "./queue";
import { MQProcessor } from "../../src/processor";

MQProcessor.addQueue(testTq, {
  concurrency: 4,
}).start();
