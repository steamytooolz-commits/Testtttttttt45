import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMysqlMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stdout.write('DATABASE_URL not set; skipping MySQL migrations\n');
    return;
  }

  process.stdout.write('Running MySQL migrations...\n');
  const connection = await mysql.createConnection(databaseUrl);

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        executed_at DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const dir = path.join(__dirname, 'mysql');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.startsWith('manual_')).sort();

    for (const file of files) {
      const [rows] = await connection.execute(
        'SELECT version FROM schema_migrations WHERE version = ?',
        [file]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        process.stdout.write(`  [MySQL] ${file} already applied.\n`);
        continue;
      }

      process.stdout.write(`  [MySQL] Applying ${file}...\n`);
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await connection.beginTransaction();
      try {
        for (const statement of statements) {
          await connection.query(statement);
        }
        await connection.execute(
          'INSERT INTO schema_migrations (version, executed_at) VALUES (?, UTC_TIMESTAMP())',
          [file]
        );
        await connection.commit();
        process.stdout.write(`  [MySQL] ${file} applied successfully.\n`);
      } catch (err) {
        await connection.rollback();
        throw err;
      }
    }
  } finally {
    await connection.end();
  }
}

async function runMongoMigrations() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    process.stdout.write('MONGO_URL not set; skipping MongoDB migrations\n');
    return;
  }

  process.stdout.write('Running MongoDB migrations...\n');
  const client = new MongoClient(mongoUrl);
  try {
    await client.connect();
    const db = client.db();
    const dir = path.join(__dirname, 'mongo');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') || f.endsWith('.js')).sort();

    for (const file of files) {
      process.stdout.write(`  [Mongo] Applying ${file}...\n`);
      const fileUrl = pathToFileURL(path.join(dir, file)).href;
      const migration = await import(fileUrl);
      if (typeof migration.up === 'function') {
        await migration.up(db);
        process.stdout.write(`  [Mongo] ${file} applied successfully.\n`);
      }
    }
  } finally {
    await client.close();
  }
}

async function main() {
  try {
    await runMysqlMigrations();
    await runMongoMigrations();
    process.stdout.write('All migrations completed.\n');
  } catch (err) {
    process.stderr.write(`Migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

main();
