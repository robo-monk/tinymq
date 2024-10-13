import { Redis } from "ioredis";
import { EventEmitter } from "events";
import { pack, unpack } from "msgpackr";
import { WorkerJob } from "./index";

interface TinyDispatcherEvents<T> {
  "job:push": [T];
  "job:complete": [T];
  "job:start": [T];
}

export interface TinyDispatcher<T> {
  pushJob(item: T): Promise<void>;
  popJob(): Promise<T | undefined>;
  getPendingJobCount(): Promise<number>;
  events: EventEmitter<TinyDispatcherEvents<T>>;
  publish(event: string, arg: any): Promise<void>;
}

export class RedisTinyDispatcher<T extends WorkerJob<any>>
  implements TinyDispatcher<T>
{
  private redis: Redis;
  private subscriber: Redis;
  public events = new EventEmitter<TinyDispatcherEvents<T>>();

  private queueKey: string;

  constructor(redis: Redis, queueKey: string) {
    this.redis = redis;
    this.subscriber = redis.duplicate();
    this.queueKey = queueKey;

    // Subscribe to Redis channels for job events
    this.subscriber.subscribe("job:push", "job:complete", "job:start");

    this.subscriber.on("messageBuffer", (channel, buffer) => {
      const item = unpack(buffer) as T;
      this.events.emit(channel, item);
    });
  }

  async publish(event: string, arg: any) {
    const serializedItem = pack(arg);
    await this.redis.publish(event, serializedItem);
  }

  async pushJob(item: T): Promise<void> {
    const serializedItem = pack(item);
    await this.redis.lpush(this.queueKey, serializedItem);
    await this.redis.publish("job:push", serializedItem);
  }

  async popJob(): Promise<T | undefined> {
    const buffer = await this.redis.rpopBuffer(this.queueKey);
    if (!buffer) return undefined;
    const item = unpack(buffer);

    return item;
  }

  async getPendingJobCount(): Promise<number> {
    return await this.redis.llen(this.queueKey);
  }
}
