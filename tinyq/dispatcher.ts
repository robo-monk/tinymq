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
  rpush(item: T): Promise<void>;
  lpush(item: T): Promise<void>;
  lpop(): Promise<T | undefined>;
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

  constructor(
    redis: Redis,
    private queueKey: string,
  ) {
    this.redis = redis;
    this.subscriber = redis.duplicate();

    // Subscribe to Redis channels for job events
    this.subscriber.subscribe(
      `${queueKey}:job:push`,
      `${queueKey}:job:complete`,
      `${queueKey}:job:start`,
    );

    this.subscriber.on("messageBuffer", (channel, buffer) => {
      const item = unpack(buffer) as T;

      const event = channel.toString().slice(`${queueKey}:`.length);
      this.events.emit(event, item);
    });
  }

  async publish(event: string, arg: any) {
    const serializedItem = pack(arg);
    await this.redis.publish(`${this.queueKey}:${event}`, serializedItem);
  }

  async rpush(item: T): Promise<void> {
    const serializedItem = pack(item);
    await this.redis.rpush(this.queueKey, serializedItem);
    await this.redis.publish(`${this.queueKey}:job:push`, serializedItem);
  }

  async lpush(item: T): Promise<void> {
    const serializedItem = pack(item);
    await this.redis.lpush(this.queueKey, serializedItem);
    // console.debug("lpush");
  }

  async lpop(): Promise<T | undefined> {
    const buffer = await this.redis.lpopBuffer(this.queueKey);
    if (!buffer) return undefined;
    const item = unpack(buffer);

    return item;
  }

  async getPendingJobCount(): Promise<number> {
    return await this.redis.llen(this.queueKey);
  }
}
