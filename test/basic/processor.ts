import { testTq } from "./queue";
import { TinyQProcessor } from "../../tinyq/processor";

TinyQProcessor.addQueue(testTq, {
  concurrency: 4,
}).start();
