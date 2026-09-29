import 'server-only';
import { MongoClient, type Db } from 'mongodb';
import { logger } from '@/lib/logger';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getMongoUri(): string | null {
  const uri = (
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URL ||
    process.env.MONGO_URI ||
    (process.env.DATABASE_URL?.startsWith('mongodb://') || process.env.DATABASE_URL?.startsWith('mongodb+srv://')
      ? process.env.DATABASE_URL
      : null) ||
    ''
  ).trim();

  return uri || null;
}

export function getMongoDbName(): string | undefined {
  const dbName = (
    process.env.MONGODB_DB ||
    process.env.MONGO_DB ||
    process.env.MONGO_DB_NAME ||
    process.env.MONGODB_DATABASE ||
    ''
  ).trim();

  return dbName || undefined;
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getMongoDb(): Promise<Db | null> {
  const uri = getMongoUri();
  if (!uri) {
    return null;
  }

  if (cachedDb) {
    return cachedDb;
  }

  try {
    let client: MongoClient;

    if (process.env.NODE_ENV === 'development') {
      if (!global._mongoClientPromise) {
        const c = new MongoClient(uri, { maxPoolSize: 10 });
        global._mongoClientPromise = c.connect();
      }
      client = await global._mongoClientPromise;
    } else {
      if (!cachedClient) {
        cachedClient = new MongoClient(uri, { maxPoolSize: 10 });
        await cachedClient.connect();
      }
      client = cachedClient;
    }

    const dbName = getMongoDbName();
    cachedDb = dbName ? client.db(dbName) : client.db();
    logger.info('Connected to MongoDB database successfully', { database: cachedDb.databaseName });
    return cachedDb;
  } catch (err) {
    logger.error('Failed to connect to MongoDB', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

