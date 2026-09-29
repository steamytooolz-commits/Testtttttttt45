import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { memoryDb } from '@/lib/repo/mysql/client';
import { findProductBySku } from '@/lib/repo/mongo';
import { importCatalogExcel, importCatalogCsv, generateCatalogExcelTemplate } from '@/lib/services/catalog_import';
import { POST as createProductRoute } from '@/app/api/admin/products/route';
import { PATCH as updateProductRoute } from '@/app/api/admin/products/[sku]/route';
import { POST as uploadImageRoute } from '@/app/api/admin/catalog/image/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';

describe('Excel catalogue import with images', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('imports .xlsx rows including image URLs and creates categories', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.json_to_sheet([
      { sku: 'SKU-XLS-001', name: 'Excel Pen', description: 'Blue pen', category: 'writing', packCount: 12, colour: 'Blue', image: 'https://example.co.za/pen.jpg', active: 'true' },
      { sku: 'SKU-XLS-002', name: 'Excel Paper', description: 'Copy paper', category: 'paper', paperWeight: '80gsm', packCount: 500, colour: 'White', image: '', active: 'true' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Catalogue');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = await importCatalogExcel({ buffer, actorId: 1, actorRole: 'ADMIN' });
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);

    const pen = await findProductBySku('SKU-XLS-001');
    expect(pen?.imageUrl).toBe('https://example.co.za/pen.jpg');
    const paper = await findProductBySku('SKU-XLS-002');
    expect(paper?.imageUrl).toBeUndefined();
  });

  it('rejects non-ADMIN excel imports and flags bad image URLs per-row', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.json_to_sheet([
      { sku: 'SKU-XLS-003', name: 'Bad Image Item', category: 'general', image: 'not-a-url' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Catalogue');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    await expect(importCatalogExcel({ buffer, actorId: 2, actorRole: 'SALES_STAFF' })).rejects.toThrow(/FORBIDDEN/);
    const result = await importCatalogExcel({ buffer, actorId: 1, actorRole: 'ADMIN' });
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].reason).toMatch(/Image/);
  });

  it('accepts CSV rows with an image column', async () => {
    const csv = `sku,name,description,category,image,active\nSKU-CSV-IMG-01,Imaged Item,Desc,general,https://example.co.za/item.jpg,true\n`;
    const result = await importCatalogCsv({ csv, actorId: 1, actorRole: 'ADMIN' });
    expect(result.imported).toBe(1);
    const item = await findProductBySku('SKU-CSV-IMG-01');
    expect(item?.imageUrl).toBe('https://example.co.za/item.jpg');
  });

  it('generates a valid Excel template with headers', async () => {
    const buffer = await generateCatalogExcelTemplate();
    expect(buffer.length).toBeGreaterThan(0);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    expect(rows.length).toBeGreaterThan(0);
    const keys = Object.keys(rows[0]).map((k) => k.toLowerCase());
    expect(keys).toContain('sku');
    expect(keys).toContain('image');
  });
});

describe('Product create/update API (ADMIN-only)', () => {
  let adminToken: string;
  let adminCsrf: string;
  let staffToken: string;
  let staffCsrf: string;

  beforeEach(async () => {
    memoryDb.resetDatabase();
    const admin = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `prod_admin_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const adminSession = await createSession({ userId: admin.id, customerId: null, role: 'ADMIN', status: 'APPROVED', email: admin.email });
    adminToken = adminSession.token;
    adminCsrf = adminSession.csrfToken;

    const staff = memoryDb.insertUser({
      customer_id: null,
      role: 'SALES_STAFF',
      email: `prod_staff_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const staffSession = await createSession({ userId: staff.id, customerId: null, role: 'SALES_STAFF', status: 'APPROVED', email: staff.email });
    staffToken = staffSession.token;
    staffCsrf = staffSession.csrfToken;
  });

  function authedJson(url: string, token: string, csrf: string, body: unknown, method = 'POST'): NextRequest {
    return new NextRequest(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify(body),
    });
  }

  it('creates a product with image and tier prices as ADMIN', async () => {
    const res = await createProductRoute(
      authedJson('http://localhost:3000/api/admin/products', adminToken, adminCsrf, {
        sku: 'SKU-NEW-001',
        name: 'New Test Product',
        description: 'Created via API',
        category: 'writing',
        packCount: 10,
        colour: 'Blue',
        imageUrl: 'https://example.co.za/new.jpg',
        stockQty: 25,
        prices: { TIER_1: '99.99' },
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.product._id).toBe('SKU-NEW-001');
    expect(json.product.imageUrl).toBe('https://example.co.za/new.jpg');

    const stored = await findProductBySku('SKU-NEW-001');
    expect(stored?.name).toBe('New Test Product');
  });

  it('rejects product creation from non-ADMIN roles and duplicates', async () => {
    const staffRes = await createProductRoute(
      authedJson('http://localhost:3000/api/admin/products', staffToken, staffCsrf, {
        sku: 'SKU-NEW-002',
        name: 'Staff Product',
        category: 'paper',
      })
    );
    expect(staffRes.status).toBe(403);

    const first = await createProductRoute(
      authedJson('http://localhost:3000/api/admin/products', adminToken, adminCsrf, {
        sku: 'SKU-NEW-003',
        name: 'Original',
        category: 'paper',
      })
    );
    expect(first.status).toBe(201);
    const dup = await createProductRoute(
      authedJson('http://localhost:3000/api/admin/products', adminToken, adminCsrf, {
        sku: 'SKU-NEW-003',
        name: 'Duplicate',
        category: 'paper',
      })
    );
    expect(dup.status).toBe(409);
  });

  it('updates a product image via PATCH', async () => {
    await createProductRoute(
      authedJson('http://localhost:3000/api/admin/products', adminToken, adminCsrf, {
        sku: 'SKU-UPD-001',
        name: 'Updatable',
        category: 'filing',
      })
    );
    const res = await updateProductRoute(
      authedJson('http://localhost:3000/api/admin/products/SKU-UPD-001', adminToken, adminCsrf, {
        imageUrl: 'https://example.co.za/updated.jpg',
      }, 'PATCH'),
      { params: Promise.resolve({ sku: 'SKU-UPD-001' }) }
    );
    expect(res.status).toBe(200);
    const stored = await findProductBySku('SKU-UPD-001');
    expect(stored?.imageUrl).toBe('https://example.co.za/updated.jpg');
  });

  it('rejects non-image uploads and accepts PNG uploads', async () => {
    const badForm = new FormData();
    badForm.append('sku', 'SKU-UPD-002');
    badForm.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'notes.txt');
    const badRes = await uploadImageRoute(
      new NextRequest('http://localhost:3000/api/admin/catalog/image', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}`, 'x-csrf-token': adminCsrf },
        body: badForm,
      })
    );
    expect(badRes.status).toBe(400);

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const goodForm = new FormData();
    goodForm.append('sku', 'SKU-UPD-002');
    goodForm.append('file', new Blob([new Uint8Array(pngBytes)], { type: 'image/png' }), 'pixel.png');
    const goodRes = await uploadImageRoute(
      new NextRequest('http://localhost:3000/api/admin/catalog/image', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}`, 'x-csrf-token': adminCsrf },
        body: goodForm,
      })
    );
    expect(goodRes.status).toBe(201);
    const json = await goodRes.json();
    expect(json.url).toMatch(/^\/product-images\/SKU-UPD-002-/);
  });
});
