import { cache } from "./redis";

type RateLimitCounter = {
  incr(key: string, ttlSec: number): Promise<number>;
};

type CounterFactory = () => Promise<RateLimitCounter>;

export function createAuthRateLimitStorage(counterFactory: CounterFactory = cache) {
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const counter = await counterFactory();
      const count = await counter.incr(`auth:${key}`, rule.window);
      return {
        allowed: count <= rule.max,
        retryAfter: count <= rule.max ? null : rule.window,
      };
    },
  };
}

export const authRateLimitStorage = createAuthRateLimitStorage();
