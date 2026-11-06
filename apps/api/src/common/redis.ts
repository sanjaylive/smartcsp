import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { config } from '../config/config';
import { AppError } from './errors';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: IORedis;
  private readonly prefix: string;

  constructor() {
    this.client = new IORedis(config().REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
    this.prefix = `csp2all:${config().NODE_ENV}:`;
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }

  /** Fixed-window counter. Returns current count and whether it is within the limit. */
  async hit(key: string, limit: number, windowSeconds: number) {
    const k = this.prefix + 'rl:' + key;
    const res = await this.client.multi().incr(k).expire(k, windowSeconds, 'NX').ttl(k).exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    const ttl = Number(res?.[2]?.[1] ?? windowSeconds);
    return { count, allowed: count <= limit, retryAfter: ttl };
  }

  async enforce(
    key: string,
    limit: number,
    windowSeconds: number,
    code: 'RATE_LIMITED' | 'OTP_ATTEMPTS_EXCEEDED' = 'RATE_LIMITED',
  ) {
    const r = await this.hit(key, limit, windowSeconds);
    if (!r.allowed)
      throw new AppError(code, 'Too many requests. Please wait and try again.', {
        retryAfterSeconds: r.retryAfter,
      });
    return r;
  }

  async ping() {
    return (await this.client.ping()) === 'PONG';
  }
}
