# TinyMQ
Lightweight job queue solution trying to keep things simple and fast.


1. Set Up a Shared Job Queue
```ts
// shared-queues.ts
import { TinyMQ } from "tinymq"
import { Redis } from "ioredis"
import type { PrimeJob } from "./prime.job.ts"

const redis = new Redis();

export const primeQueue = new TinyQ("prime", redis)
  .useWorkerFile<PrimeJob>("./prime.job.ts", import.meta)
```

2. Define the Job
```ts
// prime.job.ts
import { registerEntrypoint } from "tinymq/worker"

export type PrimeJob = typeof runPrime

function runPrime(limit: number): number[] {
    const primes: number[] = [];

    for (let num = 2; num <= limit; num++) {
        let isPrime = true;
        for (const prime of primes) {
            if (prime * prime > num) break;
            if (num % prime === 0) {
                isPrime = false;
                break;
            }
        }
        if (isPrime) primes.push(num);
    }

    return primes;
}

registerEntrypoint(runPrime)
```

3. Processor process
This is the `master` process, from which all the workers are going to get spawned.
You should have only 1 master process. Clusters are not supported.
```ts
// processor.ts
import { MQProcessor } from "tinymq/processor"
import { primeQueue } from "./shared-queues.ts"
import Redis from "ioredis"

const redis = new Redis();
const p = MQProcessor
  .registerLogger(job => {
    // keep track of jobs
    redis.hset(`job:${job.id}`, {
      ...job,
      metadata: JSON.stringify(job.metadata),
    });
  })
  .addQueue(primeQueue, {
    concurrency: 4
  })
  .start()
```


4. Add jobs to the queue
```ts
// anywhere from your code to register a task
import { JobStatus } from "tinymq"
import { primeQueue } from "..../shared-queues.ts"

primeQueue.add(42)
primeQueue.add(12)

primeQueue.dispatcher.events.on("job:complete", job => {
  switch (job.status) {
    case JobStatus.SUCCESS:
      console.log('job success', job)
    case JobStatus.FAILED:
      console.log('job failed', job)
  }
})
```
