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
    this.subscriber
      .subscribe(
        `${queueKey}:job:push`,
        `${queueKey}:job:complete`,
        `${queueKey}:job:start`,
      )
      .catch((error) => {
        console.error("Error subscribing to Redis channels:", error);
      });

    this.subscriber.on("messageBuffer", (channel, buffer) => {
      try {
        const item = unpack(buffer) as T;
        const event = channel
          .toString()
          .slice(`${queueKey}:`.length) as keyof TinyDispatcherEvents<T>;
        this.events.emit(event, item);
      } catch (error) {
        console.error("Error processing Redis message:", error);
      }
    });
  }

  async publish(event: string, arg: any) {
    try {
      const serializedItem = pack(arg);
      await this.redis.publish(`${this.queueKey}:${event}`, serializedItem);
    } catch (error) {
      console.error("Error publishing event:", error);
    }
  }

  async rpush(item: T): Promise<void> {
    try {
      const serializedItem = pack(item);
      await Promise.all([
        this.redis.rpush(this.queueKey, serializedItem),
        this.redis.publish(`${this.queueKey}:job:push`, serializedItem),
      ]);
    } catch (error) {
      console.error("Error pushing item to queue:", error);
    }
  }

  async lpush(item: T): Promise<void> {
    try {
      const serializedItem = pack(item);
      await this.redis.lpush(this.queueKey, serializedItem);
    } catch (error) {
      console.error("Error pushing item to front of queue:", error);
    }
  }

  async lpop(): Promise<T | undefined> {
    try {
      const buffer = await this.redis.lpopBuffer(this.queueKey);
      if (!buffer) return undefined;
      return unpack(buffer);
    } catch (error) {
      console.error("Error popping item from queue:", error);
      return undefined;
    }
  }

  async getPendingJobCount(): Promise<number> {
    try {
      return await this.redis.llen(this.queueKey);
    } catch (error) {
      console.error("Error getting pending job count:", error);
      return 0;
    }
  }
}
