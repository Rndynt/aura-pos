import { EventEmitter } from 'node:events';
import { createClient, type RedisClientType } from 'redis';

const REDIS_URL = process.env.REDIS_URL?.trim()
  || process.env.CACHE_REDIS_URL?.trim()
  || process.env.PUBSUB_REDIS_URL?.trim()
  || '';

const REDIS_DISABLED = process.env.REDIS_DISABLED === 'true';
const KEY_PREFIX = process.env.CACHE_KEY_PREFIX?.trim() || 'aurapos';
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2)}`;

const localEvents = new EventEmitter();
localEvents.setMaxListeners(200);

interface LocalCacheEntry {
  value: string;
  expiresAt: number | null;
}

const localCache = new Map<string, LocalCacheEntry>();

let redisClientPromise: Promise<RedisClientType | null> | null = null;
let redisSubscriberPromise: Promise<RedisClientType | null> | null = null;
let redisAvailable = false;
let redisWarningLogged = false;

function namespaced(key: string): string {
  return key.startsWith(`${KEY_PREFIX}:`) ? key : `${KEY_PREFIX}:${key}`;
}

function logRedisWarning(error: unknown): void {
  if (redisWarningLogged) return;
  redisWarningLogged = true;
  console.warn('[distributed-cache] Redis unavailable; using process-local fallback only.', error);
}

async function connectRedis(kind: 'client' | 'subscriber'): Promise<RedisClientType | null> {
  if (!REDIS_URL || REDIS_DISABLED) return null;

  const client = createClient({ url: REDIS_URL }) as RedisClientType;
  client.on('error', (error) => logRedisWarning(error));

  try {
    await client.connect();
    redisAvailable = true;
    return client;
  } catch (error) {
    logRedisWarning({ kind, error });
    try {
      await client.quit();
    } catch {}
    return null;
  }
}

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!redisClientPromise) {
    redisClientPromise = connectRedis('client');
  }
  return redisClientPromise;
}

async function getRedisSubscriber(): Promise<RedisClientType | null> {
  if (!redisSubscriberPromise) {
    redisSubscriberPromise = connectRedis('subscriber');
  }
  return redisSubscriberPromise;
}

function localGet(key: string): string | null {
  const entry = localCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    localCache.delete(key);
    return null;
  }
  return entry.value;
}

function localSet(key: string, value: string, ttlSeconds?: number): void {
  localCache.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

function localDelete(key: string): void {
  localCache.delete(key);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function localDeletePattern(pattern: string): number {
  const regex = globToRegExp(pattern);
  let deleted = 0;
  for (const key of Array.from(localCache.keys())) {
    if (regex.test(key)) {
      localCache.delete(key);
      deleted += 1;
    }
  }
  return deleted;
}

export const cacheKeys = {
  tenant: (identifier: string) => `cache:tenant:${identifier}`,
  feature: (tenantId: string, featureCode: string) => `cache:tenant:${tenantId}:feature:${featureCode}`,
  module: (tenantId: string, moduleKey: string) => `cache:tenant:${tenantId}:module:${moduleKey}`,
  outlets: (tenantId: string) => `cache:tenant:${tenantId}:outlets:list`,
  outlet: (tenantId: string, outletId: string) => `cache:tenant:${tenantId}:outlet:${outletId}`,
  cfdLatest: (tenantId: string, outletId: string, deviceId: string) => `cfd:latest:tenant:${tenantId}:outlet:${outletId}:device:${deviceId}`,
  cfdTenantLatestPattern: (tenantId: string) => `cfd:latest:tenant:${tenantId}:outlet:*:device:*`,
};

export const cacheChannels = {
  orderQueue: `${KEY_PREFIX}:events:order_queue`,
  cfd: `${KEY_PREFIX}:events:cfd`,
  invalidation: `${KEY_PREFIX}:events:cache_invalidation`,
};

export function isRedisCacheConfigured(): boolean {
  return Boolean(REDIS_URL) && !REDIS_DISABLED;
}

export function isRedisCacheConnected(): boolean {
  return redisAvailable;
}

export function getInstanceId(): string {
  return INSTANCE_ID;
}

export async function getCacheString(key: string): Promise<string | null> {
  const fullKey = namespaced(key);
  const client = await getRedisClient();
  if (client) {
    try {
      return await client.get(fullKey);
    } catch (error) {
      logRedisWarning(error);
    }
  }
  return localGet(fullKey);
}

export async function setCacheString(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const fullKey = namespaced(key);
  const client = await getRedisClient();
  if (client) {
    try {
      if (ttlSeconds) {
        await client.set(fullKey, value, { EX: ttlSeconds });
      } else {
        await client.set(fullKey, value);
      }
      return;
    } catch (error) {
      logRedisWarning(error);
    }
  }
  localSet(fullKey, value, ttlSeconds);
}

export async function getCacheJson<T>(key: string): Promise<T | null> {
  const raw = await getCacheString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    await deleteCacheKey(key);
    return null;
  }
}

export async function setCacheJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  await setCacheString(key, JSON.stringify(value), ttlSeconds);
}

export async function deleteCacheKey(key: string): Promise<void> {
  const fullKey = namespaced(key);
  const client = await getRedisClient();
  if (client) {
    try {
      await client.del(fullKey);
    } catch (error) {
      logRedisWarning(error);
    }
  }
  localDelete(fullKey);
}

export async function deleteCachePattern(pattern: string): Promise<number> {
  const fullPattern = namespaced(pattern);
  let deleted = 0;
  const client = await getRedisClient();
  if (client) {
    try {
      for await (const key of client.scanIterator({ MATCH: fullPattern, COUNT: 100 })) {
        const keys = Array.isArray(key) ? key : [key];
        if (keys.length) {
          deleted += await client.del(keys);
        }
      }
    } catch (error) {
      logRedisWarning(error);
    }
  }
  deleted += localDeletePattern(fullPattern);
  return deleted;
}

export async function publishEvent(channel: string, payload: Record<string, unknown>): Promise<void> {
  const message = JSON.stringify({ ...payload, instanceId: INSTANCE_ID, ts: Date.now() });
  localEvents.emit(channel, message);

  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.publish(channel, message);
  } catch (error) {
    logRedisWarning(error);
  }
}

export async function subscribeEvent(
  channel: string,
  handler: (payload: Record<string, unknown>, meta: { isLocalEcho: boolean }) => void | Promise<void>,
): Promise<() => Promise<void>> {
  const localHandler = (message: string) => {
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      void handler(parsed, { isLocalEcho: parsed.instanceId === INSTANCE_ID });
    } catch (error) {
      console.warn(`[distributed-cache] Invalid local message on ${channel}`, error);
    }
  };

  localEvents.on(channel, localHandler);

  const subscriber = await getRedisSubscriber();
  if (subscriber) {
    try {
      await subscriber.subscribe(channel, async (message) => {
        try {
          const parsed = JSON.parse(message) as Record<string, unknown>;
          await handler(parsed, { isLocalEcho: parsed.instanceId === INSTANCE_ID });
        } catch (error) {
          console.warn(`[distributed-cache] Invalid Redis message on ${channel}`, error);
        }
      });
    } catch (error) {
      logRedisWarning(error);
    }
  }

  return async () => {
    localEvents.off(channel, localHandler);
    if (subscriber) {
      try {
        await subscriber.unsubscribe(channel);
      } catch {}
    }
  };
}
