import 'server-only';
import { MongoClient, type Db } from 'mongodb';
import { logger } from '@/lib/logger';

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function getMongoDb(): Promise<Db | null> {
  const url = process.env.MONGO_URL;
  if (!url) {
    return null;
  }
  if (dbInstance) {
    return dbInstance;
  }

  try {
    client = new MongoClient(url);
    await client.connect();
    dbInstance = client.db();
    return dbInstance;
  } catch (err) {
    logger.error('Failed to connect to MongoDB', err);
    return null;
  }
}
