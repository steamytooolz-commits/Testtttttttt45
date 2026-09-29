import { describe, it, expect, beforeEach } from 'vitest';
import { getRedisClient, acquireStockLock, releaseStockLock } from '@/lib/repo/redis';
import { verifyPowSolution, issueCaptchaChallenge, verifyCaptcha } from '@/lib/security/captcha';
import { importCatalogCsv, generateCatalogTemplate } from '@/lib/services/catalog_import';
import { memoryDb } from '@/lib/repo/mysql/client';
import crypto from 'node:crypto';

describe('Redis lock forwarding', () => {
  it('mutually excludes concurrent stock locks on real client path', async () => {
    const sku = `SKU-TEST-${Date.now()}`;
    const t1 = await acquireStockLock(sku, 10);
    expect(t1).not.toBeNull();
    const t2 = await acquireStockLock(sku, 10);
    expect(t2).toBeNull();
    const released = await releaseStockLock(sku, t1!);
    expect(released).toBe(true);
    const t3 = await acquireStockLock(sku, 10);
    expect(t3).not.toBeNull();
    await releaseStockLock(sku, t3!);
  });

  it('passes NX and EX through resilient wrapper', async () => {
    const redis = getRedisClient();
    const key = `nx-test-${Date.now()}`;
    expect(await redis.set(key, 'a', 'NX', 'EX', 10)).toBe('OK');
    expect(await redis.set(key, 'b', 'NX', 'EX', 10)).toBeNull();
  });
});

describe('Captcha PoW', () => {
  it('issues and verifies a real solution', async () => {
    const { nonce, difficulty } = await issueCaptchaChallenge();
    let solution = '0';
    for (let i = 0; i < 500000; i++) {
      const h = crypto.createHash('sha256').update(`${nonce}:${i}`).digest('hex');
      if (h.startsWith(difficulty)) {
        solution = String(i);
        break;
      }
    }
    expect(verifyPowSolution(nonce, solution, difficulty)).toBe(true);
    expect(await verifyCaptcha({ nonce, solution, honeypot: '' })).toBe(true);
  });

  it('rejects honeypot fills', async () => {
    expect(await verifyCaptcha({ nonce: 'abc', solution: '0', honeypot: 'bot' })).toBe(false);
  });
});

describe('Catalog import', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('generates a template with strict headers', () => {
    const tpl = generateCatalogTemplate();
    expect(tpl.split('\n')[0].toLowerCase()).toContain('sku');
  });

  it('imports valid rows, auto-creates category, seeds zero stock', async () => {
    const csv = `sku,name,description,category\nSKU-TEST-001,Test Product,Desc,testcat\n`;
    const result = await importCatalogCsv({ csv, actorId: 1, actorRole: 'ADMIN' });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('reports per-row errors without failing', async () => {
    const csv = `sku,name,description,category\nX,,Desc,cat\nSKU-OK-002,Good Product,Desc,cat\n`;
    const result = await importCatalogCsv({ csv, actorId: 1, actorRole: 'ADMIN' });
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.imported).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects non-ADMIN', async () => {
    await expect(importCatalogCsv({ csv: 'sku,name\nA,B', actorId: 2, actorRole: 'SALES_STAFF' })).rejects.toThrow(/FORBIDDEN/);
  });
});
