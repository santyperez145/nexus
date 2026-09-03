type CounterStore = {
  incr(key: string, ttlSec: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
};

const memory = new Map<string, { value: string; exp: number }>();

function memGet(key: string) {
  const row = memory.get(key);
  if (!row) return null;
  if (row.exp && row.exp < Date.now()) {
    memory.delete(key);
    return null;
  }
  return row.value;
}

const memoryStore: CounterStore = {
  async incr(key, ttlSec) {
    const current = Number(memGet(key) ?? "0") + 1;
    const prev = memory.get(key);
    const exp = prev?.exp && prev.exp > Date.now() ? prev.exp : Date.now() + ttlSec * 1000;
    memory.set(key, { value: String(current), exp });
    return current;
  },
  async get(key) {
    return memGet(key);
  },
  async set(key, value, ttlSec) {
    memory.set(key, { value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  },
};

let store: CounterStore | null = null;

async function createStore(): Promise<CounterStore> {
  const production = process.env.NODE_ENV === "production";
  const restUrl =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const restToken =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (restUrl && restToken) {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({
      url: restUrl,
      token: restToken,
    });
    return {
      async incr(key, ttlSec) {
        const n = await redis.incr(key);
        if (n === 1) await redis.expire(key, ttlSec);
        return Number(n);
      },
      async get(key) {
        const v = await redis.get<string>(key);
        return v == null ? null : String(v);
      },
      async set(key, value, ttlSec) {
        if (ttlSec) await redis.set(key, value, { ex: ttlSec });
        else await redis.set(key, value);
      },
    };
  }

  if (process.env.REDIS_URL) {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
    try {
      await redis.connect();
    } catch (error) {
      if (production) throw error;
      return memoryStore;
    }
    return {
      async incr(key, ttlSec) {
        const n = await redis.incr(key);
        if (n === 1) await redis.expire(key, ttlSec);
        return n;
      },
      async get(key) {
        return redis.get(key);
      },
      async set(key, value, ttlSec) {
        if (ttlSec) await redis.set(key, value, "EX", ttlSec);
        else await redis.set(key, value);
      },
    };
  }

  if (production) {
    throw new Error(
      "A distributed Redis rate-limit store is required in production (UPSTASH_REDIS_REST_* or REDIS_URL)",
    );
  }
  return memoryStore;
}

export async function cache(): Promise<CounterStore> {
  if (!store) store = await createStore();
  return store;
}
