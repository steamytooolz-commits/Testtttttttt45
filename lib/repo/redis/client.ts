import 'server-only';
import { logger } from '@/lib/logger';
import { getMongoDb } from '@/lib/repo/mongo/client';

class MongoBackedMemoryStore {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private streams = new Map<string, Array<{ id: string; fields: string[] }>>();
  private sets = new Map<string, Set<string>>();

  private cleanKey(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.cleanKey(key);
    const entry = this.store.get(key);
    if (entry) return entry.value;

    try {
      const db = await getMongoDb();
      if (db) {
        const doc = await db.collection<{ key: string; value: string; expiresAt?: number }>('kv_store').findOne({ key });
        if (doc) {
          if (doc.expiresAt && doc.expiresAt <= Date.now()) {
            await db.collection('kv_store').deleteOne({ key });
            return null;
          }
          this.store.set(key, { value: doc.value, expiresAt: doc.expiresAt });
          return doc.value;
        }
      }
    } catch (err) {
      logger.error('Failed to get key from MongoDB kv_store', { key, error: err instanceof Error ? err.message : String(err) });
    }

    return null;
  }

  async set(key: string, value: string, ...args: (string | number)[]): Promise<'OK' | null> {
    this.cleanKey(key);
    const hasNx = args.some((a) => String(a).toUpperCase() === 'NX');
    if (hasNx && this.store.has(key)) {
      return null;
    }

    let expiresAt: number | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = String(args[i]).toUpperCase();
      if (arg === 'EX' && i + 1 < args.length) {
        expiresAt = Date.now() + Number(args[i + 1]) * 1000;
        break;
      }
      if (arg === 'PX' && i + 1 < args.length) {
        expiresAt = Date.now() + Number(args[i + 1]);
        break;
      }
    }
    this.store.set(key, { value, expiresAt });

    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('kv_store').updateOne(
          { key },
          { $set: { key, value, expiresAt } },
          { upsert: true }
        );
      }
    } catch (err) {
      logger.error('Failed to set key in MongoDB kv_store', { key, error: err instanceof Error ? err.message : String(err) });
    }

    return 'OK';
  }

  async setnx(key: string, value: string): Promise<number> {
    this.cleanKey(key);
    if (this.store.has(key)) {
      return 0;
    }
    await this.set(key, value);
    return 1;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) {
        count++;
      }
    }
    try {
      const db = await getMongoDb();
      if (db && keys.length > 0) {
        await db.collection('kv_store').deleteMany({ key: { $in: keys } });
      }
    } catch (err) {
      logger.error('Failed to delete keys from MongoDB kv_store', { keys, error: err instanceof Error ? err.message : String(err) });
    }
    return count;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.cleanKey(key);
    const entry = this.store.get(key);
    if (!entry) {
      return 0;
    }
    const expiresAt = Date.now() + seconds * 1000;
    entry.expiresAt = expiresAt;
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('kv_store').updateOne(
          { key },
          { $set: { expiresAt } }
        );
      }
    } catch (err) {
      logger.error('Failed to set expire in MongoDB kv_store', { key, error: err instanceof Error ? err.message : String(err) });
    }
    return 1;
  }

  async ttl(key: string): Promise<number> {
    this.cleanKey(key);
    const entry = this.store.get(key);
    if (!entry) {
      return -2;
    }
    if (!entry.expiresAt) {
      return -1;
    }
    const remainingMs = entry.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  async incr(key: string): Promise<number> {
    this.cleanKey(key);
    const entry = this.store.get(key);
    let nextVal = 1;
    if (entry) {
      const parsed = parseInt(entry.value, 10);
      nextVal = isNaN(parsed) ? 1 : parsed + 1;
      entry.value = String(nextVal);
    } else {
      this.store.set(key, { value: '1' });
    }
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('kv_store').updateOne(
          { key },
          { $set: { key, value: String(nextVal) } },
          { upsert: true }
        );
      }
    } catch (err) {
      logger.error('Failed to incr key in MongoDB kv_store', { key, error: err instanceof Error ? err.message : String(err) });
    }
    return nextVal;
  }

  async xadd(stream: string, id: string, ...args: string[]): Promise<string> {
    const list = this.streams.get(stream) || [];
    const entryId = id === '*' ? `${Date.now()}-0` : id;
    list.push({ id: entryId, fields: args });
    this.streams.set(stream, list);
    return entryId;
  }

  getStreamEntries(stream: string): Array<{ id: string; fields: string[] }> {
    return this.streams.get(stream) || [];
  }

  async flushall(): Promise<'OK'> {
    this.store.clear();
    this.streams.clear();
    this.sets.clear();
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('kv_store').deleteMany({});
        await db.collection('kv_sets').deleteMany({});
      }
    } catch (err) {
      logger.error('Failed to flush MongoDB kv_store', { error: err instanceof Error ? err.message : String(err) });
    }
    return 'OK';
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added += 1;
      }
    }
    try {
      const db = await getMongoDb();
      if (db && members.length > 0) {
        await db.collection('kv_sets').updateOne(
          { key },
          { $addToSet: { members: { $each: members } } },
          { upsert: true }
        );
      }
    } catch (err) {
      logger.error('Failed to sadd to MongoDB kv_sets', { key, error: err instanceof Error ? err.message : String(err) });
    }
    return added;
  }

  async smembers(key: string): Promise<string[]> {
    const memorySet = this.sets.get(key);
    if (memorySet && memorySet.size > 0) {
      return Array.from(memorySet);
    }
    try {
      const db = await getMongoDb();
      if (db) {
        const doc = await db.collection<{ key: string; members: string[] }>('kv_sets').findOne({ key });
        if (doc && Array.isArray(doc.members)) {
          this.sets.set(key, new Set(doc.members));
          return doc.members;
        }
      }
    } catch (err) {
      logger.error('Failed to smembers from MongoDB kv_sets', { key, error: err instanceof Error ? err.message : String(err) });
    }
    return Array.from(memorySet || []);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    let removed = 0;
    if (set) {
      for (const m of members) {
        if (set.delete(m)) removed += 1;
      }
    }
    try {
      const db = await getMongoDb();
      if (db && members.length > 0) {
        await db.collection<{ key: string; members: string[] }>('kv_sets').updateOne(
          { key },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { $pull: { members: { $in: members } } as any }
        );
      }
    } catch (err) {
      logger.error('Failed to srem from MongoDB kv_sets', { key, error: err instanceof Error ? err.message : String(err) });
    }
    return removed;
  }
}

export interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<'OK' | null>;
  setnx(key: string, value: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  xadd(stream: string, id: string, ...args: string[]): Promise<string | null>;
  getStreamEntries?(stream: string): Array<{ id: string; fields: string[] }>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, ...members: string[]): Promise<number>;
  flushall(): Promise<'OK'>;
  ping(): Promise<string>;
}

let redisInstance: IRedisClient | null = null;

export function getRedisClient(): IRedisClient {
  if (redisInstance) {
    return redisInstance;
  }
  logger.info('Using MongoDB-backed key-value store in place of Redis.');
  redisInstance = new MongoBackedMemoryStore();
  return redisInstance;
}
