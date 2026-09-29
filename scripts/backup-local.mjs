import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(root, '.local-db', 'backups', stamp);
fs.mkdirSync(outDir, { recursive: true });

const failures = [];

function parseDatabaseUrl(url) {
  const match = /^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/.exec(url || '');
  if (!match) return null;
  return { user: match[1], password: match[2], host: match[3], port: match[4], database: match[5] };
}

function findMysqlDump() {
  const candidates = [
    'C:\\Program Files\\MariaDB 12.3\\bin\\mysqldump.exe',
    'mysqldump',
  ];
  for (const candidate of candidates) {
    if (candidate === 'mysqldump' || fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function backupMysql() {
  const db = parseDatabaseUrl(process.env.DATABASE_URL);
  const dumper = findMysqlDump();
  if (!db || !dumper) {
    failures.push('MySQL skipped (no DATABASE_URL or mysqldump found)');
    return;
  }
  const target = path.join(outDir, 'mysql-stationery.sql');
  const result = spawnSync(
    dumper,
    ['-h', db.host, '-P', db.port, '-u', db.user, '-p' + db.password, '--single-transaction', '--routines', db.database],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  if (result.status !== 0 || !result.stdout) {
    failures.push('MySQL dump failed: ' + (result.stderr || 'unknown error').slice(0, 200));
    return;
  }
  fs.writeFileSync(target, result.stdout);
  console.log('MySQL -> ' + target);
}

async function backupMongo() {
  if (!process.env.MONGO_URL) {
    failures.push('Mongo skipped (no MONGO_URL)');
    return;
  }
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(process.env.MONGO_URL);
  try {
    await client.connect();
    const db = client.db();
    const collections = await db.listCollections().toArray();
    for (const { name } of collections) {
      const docs = await db.collection(name).find({}).toArray();
      fs.writeFileSync(path.join(outDir, 'mongo-' + name + '.json'), JSON.stringify(docs, null, 1));
    }
    console.log('Mongo -> ' + collections.length + ' collections');
  } catch (err) {
    failures.push('Mongo dump failed: ' + (err instanceof Error ? err.message : String(err)).slice(0, 200));
  } finally {
    await client.close().catch(() => {});
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
      count += 1;
    }
  }
  return count;
}

function backupFiles() {
  const images = copyDir(path.join(root, 'public', 'product-images'), path.join(outDir, 'product-images'));
  for (const file of ['brand-logo.png']) {
    const src = path.join(root, 'public', file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, file));
    }
  }
  console.log('Files -> ' + images + ' product images + brand logo');
}

function backupRedis() {
  const rdbCandidates = [
    path.join(root, '.local-db', 'redis-bin', 'dump.rdb'),
    path.join(root, '.local-db', 'dump.rdb'),
  ];
  const save = spawnSync(path.join(root, '.local-db', 'redis-bin', 'redis-cli.exe'), ['-p', '6379', 'BGSAVE']);
  if (save.status !== 0) {
    failures.push('Redis BGSAVE failed (server may be down)');
    return;
  }
  const found = rdbCandidates.find((c) => fs.existsSync(c));
  if (found) {
    fs.copyFileSync(found, path.join(outDir, 'redis-dump.rdb'));
    console.log('Redis -> redis-dump.rdb');
  } else {
    failures.push('Redis snapshot not found after BGSAVE');
  }
}

backupMysql();
await backupMongo();
backupFiles();
backupRedis();

const manifest = { takenAt: new Date().toISOString(), failures };
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (failures.length > 0) {
  console.log('Backup completed with warnings:');
  for (const failure of failures) console.log(' - ' + failure);
  process.exitCode = 1;
} else {
  console.log('Backup complete: ' + outDir);
}
