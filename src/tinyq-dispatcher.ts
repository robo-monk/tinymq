import { Redis } from "ioredis";
import { EventEmitter } from "events";

interface TinyDispatcherEvents<T> {
  "job:push": [T];
  "job:pop": [T];
  "job:complete": [T];
  "job:start": [T];
}

interface TinyDispatcher<T> {
  pushJob(item: T): Promise<void>;
  popJob(): Promise<T | undefined>;
  getPendingJobCount(): Promise<number>;
  events: EventEmitter;
}

export class RedisTinyDispatcher<T> implements TinyDispatcher<T> {
  private redis: Redis;
  private subscriber: Redis;
  public events = new EventEmitter();

  private queueKey: string;

  constructor(redis: Redis, queueKey: string) {
    this.redis = redis;
    this.subscriber = redis.duplicate();
    this.queueKey = queueKey;

    // Subscribe to Redis channels for job events
    this.subscriber.subscribe(
      "job:push",
      "job:pop",
      "job:complete",
      "job:start",
    );

    // Handle incoming messages and re-emit them via EventEmitter
    this.subscriber.on("message", (channel, message) => {
      const item = JSON.parse(message) as T;
      this.events.emit(channel, item);
    });
  }

  async pushJob(item: T): Promise<void> {
    const serializedItem = JSON.stringify(item);
    await this.redis.lpush(this.queueKey, serializedItem);
    await this.redis.publish("job:push", serializedItem);
  }

  async popJob(): Promise<T | undefined> {
    const serializedItem = await this.redis.rpop(this.queueKey);
    if (serializedItem) {
      const item = JSON.parse(serializedItem) as T;
      await this.redis.publish("job:pop", serializedItem);
      return item;
    }
    return undefined;
  }

  async getPendingJobCount(): Promise<number> {
    return await this.redis.llen(this.queueKey);
  }
}
