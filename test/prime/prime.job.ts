import { registerEntrypoint } from "../../src/worker";

export type PrimeJob = typeof runPrime;

function runPrime(limit: number): number[] {
  console.log("run prime", limit);
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

registerEntrypoint(runPrime);

console.log("hello form worker");
