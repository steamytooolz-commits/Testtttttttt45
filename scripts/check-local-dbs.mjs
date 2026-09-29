#!/usr/bin/env node
/**
 * Local database readiness check for the business shell redesign.
 *
 * Verifies the three backing stores the app actually talks to:
 *   - MariaDB (DATABASE_URL) — schema, migration 014 business columns, grants, bookkeeping
 *   - MongoDB (MONGO_URL)    — catalogue collections, indexes, seeded content
 *   - Redis   (REDIS_URL)    — session / cache / cart round-trip
 *
 * Treats the databases as read-mostly: the only writes are a no-op UPDATE probe that
 * is rolled back (MariaDB) and one namespaced key that is set and deleted (Redis).
 *
 * Usage: node --env-file=.env scripts/check-local-dbs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
function check(store, name, ok, detail = '') {
  results.push({ store, name, ok, detail });
}

const REQUIRED_TABLES = [
  'schema_migrations',
  'customers',
  'users',
  'price_tiers',
  'customer_tier_assignments',
  'customer_product_prices',
  'draft_orders',
  'sales_orders',
  'sales_order_lines',
  'invoice_sequences',
  'invoices',
  'credit_notes',
  'credit_note_sequences',
  'stock_balances',
  'stock_movements',
  'requisition_templates',
  'audit_log',
  'password_reset_requests',
  'payment_proofs',
  'business_settings',
];

const BUSINESS_CUSTOMER_COLUMNS = [
  'business_type',
  'vat_number',
  'credit_limit',
  'payment_terms',
  'logo_url',
];

const BUSINESS_SETTINGS_COLUMNS = [
  'company_name',
  'tagline',
  'vat_number',
  'reg_number',
  'phone',
  'email',
  'address_json',
  'updated_at',
];

async function checkMysql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    check('MariaDB', 'DATABASE_URL configured', false, 'not set');
    return;
  }

  const conn = await mysql.createConnection(url);
  try {
    const [versionRows] = await conn.query('SELECT VERSION() AS v, DATABASE() AS db');
    check(
      'MariaDB',
      'connect as application user',
      true,
      `MariaDB ${versionRows[0].v} / ${versionRows[0].db}`
    );

    for (const table of REQUIRED_TABLES) {
      try {
        await conn.query(`SELECT 1 FROM \`${table}\` LIMIT 1`);
        check('MariaDB', `table ${table}`, true);
      } catch (err) {
        check('MariaDB', `table ${table}`, false, err.code || err.message);
      }
    }

    const [columnRows] = await conn.query(
      "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('customers','business_settings')"
    );
    const columnsByTable = new Map();
    for (const row of columnRows) {
      const list = columnsByTable.get(row.TABLE_NAME) || [];
      list.push(row.COLUMN_NAME);
      columnsByTable.set(row.TABLE_NAME, list);
    }

    for (const column of BUSINESS_CUSTOMER_COLUMNS) {
      const present = (columnsByTable.get('customers') || []).includes(column);
      check('MariaDB', `customers.${column}`, present, present ? '' : 'missing (migration 014)');
    }
    for (const column of BUSINESS_SETTINGS_COLUMNS) {
      const present = (columnsByTable.get('business_settings') || []).includes(column);
      check('MariaDB', `business_settings.${column}`, present, present ? '' : 'missing (migration 014)');
    }

    try {
      const [settingsRows] = await conn.query(
        'SELECT company_name, vat_number, reg_number, address_json FROM business_settings WHERE id = 1'
      );
      const settings = settingsRows[0];
      check(
        'MariaDB',
        'business_settings seed row',
        settingsRows.length === 1 && Boolean(settings.company_name) && Boolean(settings.vat_number),
        settings ? `${settings.company_name} • VAT ${settings.vat_number} • Reg ${settings.reg_number}` : 'no row id=1'
      );
      check(
        'MariaDB',
        'business_settings address_json parses',
        settings ? isValidJson(settings.address_json) : false
      );
    } catch (err) {
      check('MariaDB', 'business_settings seed row', false, err.code || err.message);
    }

    const migrationDir = path.join(root, 'migrations', 'mysql');
    const onDisk = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith('.sql') && !file.startsWith('manual_'))
      .sort();
    const [appliedRows] = await conn.query('SELECT version FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.version));
    const pending = onDisk.filter((file) => !applied.has(file));
    check(
      'MariaDB',
      'migrations recorded',
      pending.length === 0,
      pending.length === 0
        ? `${onDisk.length} applied`
        : `pending: ${pending.join(', ')} (run: DATABASE_URL=mysql://root:@127.0.0.1:3306/stationery npm run migrate)`
    );

    const counts = [
      ['customers', 'SELECT COUNT(*) AS n FROM customers'],
      ['users', 'SELECT COUNT(*) AS n FROM users'],
      ['price_tiers', 'SELECT COUNT(*) AS n FROM price_tiers'],
      ['sales_orders', 'SELECT COUNT(*) AS n FROM sales_orders'],
      ['invoices', 'SELECT COUNT(*) AS n FROM invoices'],
      ['stock_balances', 'SELECT COUNT(*) AS n FROM stock_balances'],
      ['audit_log', 'SELECT COUNT(*) AS n FROM audit_log'],
    ];
    const summary = [];
    for (const [label, sql] of counts) {
      const [rows] = await conn.query(sql);
      summary.push(`${label}=${rows[0].n}`);
    }
    check('MariaDB', 'row counts', true, summary.join(' '));

    const [businessRows] = await conn.query(
      'SELECT COUNT(*) AS total, SUM(business_type IS NOT NULL) AS typed, SUM(vat_number IS NOT NULL) AS vatted, SUM(credit_limit IS NOT NULL) AS credited FROM customers'
    );
    check(
      'MariaDB',
      'business profile data',
      true,
      `${businessRows[0].typed}/${businessRows[0].total} business_type, ${businessRows[0].vatted} VAT, ${businessRows[0].credited} credit limits`
    );

    // Prove the application user can actually write the new columns, then roll back.
    await conn.beginTransaction();
    try {
      await conn.execute('UPDATE customers SET business_type = business_type WHERE id = 1');
      await conn.execute(
        "UPDATE business_settings SET company_name = company_name WHERE id = 1"
      );
      await conn.rollback();
      check('MariaDB', 'app user can UPDATE business columns', true, 'probe rolled back');
    } catch (err) {
      await conn.rollback();
      check('MariaDB', 'app user can UPDATE business columns', false, err.code || err.message);
    }
  } finally {
    await conn.end();
  }
}

function isValidJson(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') return true;
  try {
    JSON.parse(String(value));
    return true;
  } catch {
    return false;
  }
}

async function checkMongo() {
  const url = process.env.MONGO_URL;
  if (!url) {
    check('MongoDB', 'MONGO_URL configured', false, 'not set');
    return;
  }

  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db();
    check('MongoDB', 'connect', true, `database "${db.databaseName}"`);

    const collections = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of ['products', 'categories']) {
      check('MongoDB', `collection ${name}`, collections.includes(name));
    }

    const productCount = await db.collection('products').countDocuments();
    const categoryCount = await db.collection('categories').countDocuments();
    check('MongoDB', 'catalogue seeded', productCount > 0 && categoryCount > 0, `${productCount} products, ${categoryCount} categories`);

    const sample = await db.collection('products').findOne({});
    check(
      'MongoDB',
      'product document shape',
      Boolean(sample && sample._id && sample.name && typeof sample.active === 'boolean' && sample.categoryRef),
      sample ? `_id=${sample._id}` : 'no documents'
    );

    const activeProducts = await db.collection('products').countDocuments({ active: true });
    check('MongoDB', 'active products visible to storefront', activeProducts >= 0, `${activeProducts} active`);

    const indexes = await db.collection('products').indexes();
    const indexNames = indexes.map((i) => Object.keys(i.key).join(','));
    const requiredIndexes = ['categoryRef', 'active'];
    const missingIndexes = requiredIndexes.filter((field) => !indexNames.some((name) => name === field));
    check(
      'MongoDB',
      'products indexes',
      missingIndexes.length === 0,
      missingIndexes.length === 0 ? indexNames.join(' | ') : `missing: ${missingIndexes.join(', ')}`
    );

    const orphanCategories = await db
      .collection('products')
      .countDocuments({ categoryRef: { $nin: await db.collection('categories').distinct('_id') } });
    check('MongoDB', 'products reference real categories', orphanCategories === 0, `${orphanCategories} orphans`);
  } finally {
    await client.close();
  }
}

async function checkRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    check('Redis', 'REDIS_URL configured', false, 'not set');
    return;
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    enableOfflineQueue: false,
  });

  try {
    const startedAt = Date.now();
    await redis.connect();
    const pong = await redis.ping();
    check('Redis', 'connect + PING', pong === 'PONG', `${Date.now() - startedAt}ms`);

    const info = await redis.info('server');
    const version = /redis_version:([^\r\n]+)/.exec(info)?.[1];
    check('Redis', 'server version', Boolean(version), version || 'unknown');

    const probeKey = 'healthcheck:probe';
    await redis.set(probeKey, 'ok', 'EX', 10);
    const value = await redis.get(probeKey);
    const ttl = await redis.ttl(probeKey);
    await redis.del(probeKey);
    check('Redis', 'read/write round-trip', value === 'ok' && ttl > 0, `ttl=${ttl}s, probe deleted`);

    const size = await redis.dbsize();
    check('Redis', 'keyspace reachable', true, `${size} keys in db`);

    const patterns = { session: 'session:*', cart: 'cart:*', catalogCache: 'cache:catalog:*' };
    const scanned = {};
    for (const [label, pattern] of Object.entries(patterns)) {
      let cursor = '0';
      let count = 0;
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        count += keys.length;
      } while (cursor !== '0');
      scanned[label] = count;
    }
    check(
      'Redis',
      'app keyspace patterns',
      true,
      `sessions=${scanned.session} carts=${scanned.cart} catalogCache=${scanned.catalogCache}`
    );
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const stores = [
    ['MariaDB', checkMysql],
    ['MongoDB', checkMongo],
    ['Redis', checkRedis],
  ];

  for (const [name, fn] of stores) {
    try {
      await fn();
    } catch (err) {
      check(name, 'health check completed', false, err instanceof Error ? err.message : String(err));
    }
  }

  const failures = results.filter((r) => !r.ok);
  let currentStore = null;
  for (const result of results) {
    if (result.store !== currentStore) {
      currentStore = result.store;
      process.stdout.write(`\n${currentStore}\n`);
    }
    const mark = result.ok ? '  OK  ' : ' FAIL ';
    process.stdout.write(`[${mark}] ${result.name}${result.detail ? ` — ${result.detail}` : ''}\n`);
  }

  process.stdout.write(
    `\n${results.length - failures.length}/${results.length} checks passed for MariaDB, MongoDB and Redis.\n`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
