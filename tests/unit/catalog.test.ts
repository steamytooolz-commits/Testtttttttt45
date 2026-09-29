import { describe, it, expect, beforeEach } from 'vitest';
import { CatalogService } from '@/lib/services/catalog';
import { CatalogQuerySchema, SkuParamSchema } from '@/lib/validation';
import { setCustomPrice } from '@/lib/repo/mysql';
import { computeFilterHash, getCachedCatalog, setCachedCatalog, type StoredSession } from '@/lib/repo/redis';

describe('Module 2: Catalog and Trade Gate Security', () => {
  const publicSession: StoredSession | null = null;

  const pendingSession: StoredSession = {
    userId: 101,
    customerId: 201,
    email: 'pending_buyer@retailer.co.za',
    role: 'CUSTOMER',
    status: 'PENDING_APPROVAL',
    csrfToken: 'test-csrf-pending',
    createdAt: Date.now(),
  };

  const suspendedSession: StoredSession = {
    userId: 102,
    customerId: 202,
    email: 'suspended_buyer@retailer.co.za',
    role: 'CUSTOMER',
    status: 'SUSPENDED',
    csrfToken: 'test-csrf-suspended',
    createdAt: Date.now(),
  };

  const approvedSessionTier1: StoredSession = {
    userId: 103,
    customerId: 203,
    email: 'approved_t1@wholesalepaper.co.za',
    role: 'CUSTOMER',
    status: 'APPROVED',
    csrfToken: 'test-csrf-t1',
    createdAt: Date.now(),
  };

  const approvedSessionTier2: StoredSession = {
    userId: 104,
    customerId: 204,
    email: 'volume_buyer@corporate.co.za',
    role: 'CUSTOMER',
    status: 'APPROVED',
    csrfToken: 'test-csrf-t2',
    createdAt: Date.now(),
  };

  const approvedSessionTier3: StoredSession = {
    userId: 105,
    customerId: 205,
    email: 'gov_procurement@dept.gov.za',
    role: 'CUSTOMER',
    status: 'APPROVED',
    csrfToken: 'test-csrf-t3',
    createdAt: Date.now(),
  };

  beforeEach(async () => {
    await setCustomPrice({ customerId: 203, sku: 'SKU-PPR-A4-80G', unitPrice: '85.00', actorId: 1, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: 203, sku: 'SKU-PEN-BLU-05', unitPrice: '110.00', actorId: 1, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: 204, sku: 'SKU-PPR-A4-80G', unitPrice: '78.50', actorId: 1, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: 204, sku: 'SKU-PEN-BLU-05', unitPrice: '98.00', actorId: 1, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: 205, sku: 'SKU-PPR-A4-80G', unitPrice: '72.00', actorId: 1, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: 205, sku: 'SKU-PEN-BLU-05', unitPrice: '92.50', actorId: 1, actorRole: 'ADMIN' });
  });

  it('1. Public (unauthenticated) payload contains ZERO price fields', async () => {
    const catalog = await CatalogService.getCatalog({}, publicSession);

    expect(catalog.trade_gate.is_approved).toBe(false);
    expect(catalog.trade_gate.status).toBe('PUBLIC');
    expect(catalog.products.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(catalog);

    expect(serialized.toLowerCase().includes('price')).toBe(false);
    expect(serialized.toLowerCase().includes('unit_price')).toBe(false);
    expect(serialized.toLowerCase().includes('tier_code')).toBe(false);
    expect(serialized.toLowerCase().includes('tier_name')).toBe(false);

    for (const prod of catalog.products) {
      expect('unit_price' in prod).toBe(false);
      expect('price' in prod).toBe(false);
      expect('tier_code' in prod).toBe(false);
      expect('tier_name' in prod).toBe(false);
    }
  });

  it('2. PENDING_APPROVAL session payload contains ZERO price fields', async () => {
    const catalog = await CatalogService.getCatalog({}, pendingSession);

    expect(catalog.trade_gate.is_approved).toBe(false);
    expect(catalog.trade_gate.status).toBe('PENDING_APPROVAL');
    expect(catalog.products.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(catalog);

    expect(serialized.toLowerCase().includes('price')).toBe(false);
    expect(serialized.toLowerCase().includes('unit_price')).toBe(false);
    expect(serialized.toLowerCase().includes('tier_code')).toBe(false);
    expect(serialized.toLowerCase().includes('tier_name')).toBe(false);

    for (const prod of catalog.products) {
      expect('unit_price' in prod).toBe(false);
      expect('price' in prod).toBe(false);
      expect('tier_code' in prod).toBe(false);
    }
  });

  it('3. SUSPENDED session payload contains ZERO price fields', async () => {
    const catalog = await CatalogService.getCatalog({}, suspendedSession);

    expect(catalog.trade_gate.is_approved).toBe(false);
    expect(catalog.trade_gate.status).toBe('SUSPENDED');

    const serialized = JSON.stringify(catalog);
    expect(serialized.toLowerCase().includes('price')).toBe(false);
    expect(serialized.toLowerCase().includes('unit_price')).toBe(false);
    expect(serialized.toLowerCase().includes('tier_code')).toBe(false);
  });

  it('4. APPROVED session payload contains quoted prices with decimal formatting', async () => {
    const catalog = await CatalogService.getCatalog({}, approvedSessionTier1);

    expect(catalog.trade_gate.is_approved).toBe(true);
    expect(catalog.trade_gate.status).toBe('APPROVED');
    expect(catalog.products.length).toBeGreaterThan(0);
    expect(catalog.trade_gate.quotedCount).toBeGreaterThan(0);

    const typek = catalog.products.find((p) => p._id === 'SKU-PPR-A4-80G') as { unit_price: string };
    expect(typek).toBeDefined();
    expect(typek.unit_price).toBe('85.00');
    expect(typek.unit_price).toMatch(/^\d+\.\d{2}$/);

    const quoted = catalog.products.filter((p) => 'unit_price' in p);
    for (const prod of quoted) {
      const q = prod as { unit_price: string; tier_code: string };
      expect(q.unit_price).toMatch(/^\d+\.\d{2}$/);
      expect(q.tier_code).toBe('CUSTOM');
    }
  });

  it('5. Different quoted prices per customer resolve independently', async () => {
    const catalogT1 = await CatalogService.getCatalog({}, approvedSessionTier1);
    const catalogT2 = await CatalogService.getCatalog({}, approvedSessionTier2);
    const catalogT3 = await CatalogService.getCatalog({}, approvedSessionTier3);

    const typekT1 = catalogT1.products.find((p) => p._id === 'SKU-PPR-A4-80G') as { unit_price: string };
    const typekT2 = catalogT2.products.find((p) => p._id === 'SKU-PPR-A4-80G') as { unit_price: string };
    const typekT3 = catalogT3.products.find((p) => p._id === 'SKU-PPR-A4-80G') as { unit_price: string };

    expect(typekT1.unit_price).toBe('85.00');
    expect(typekT2.unit_price).toBe('78.50');
    expect(typekT3.unit_price).toBe('72.00');

    const penT1 = catalogT1.products.find((p) => p._id === 'SKU-PEN-BLU-05') as { unit_price: string };
    const penT2 = catalogT2.products.find((p) => p._id === 'SKU-PEN-BLU-05') as { unit_price: string };
    const penT3 = catalogT3.products.find((p) => p._id === 'SKU-PEN-BLU-05') as { unit_price: string };

    expect(penT1.unit_price).toBe('110.00');
    expect(penT2.unit_price).toBe('98.00');
    expect(penT3.unit_price).toBe('92.50');
  });

  it('6. Attribute filtering: filters by paperWeight (80gsm vs 75gsm)', async () => {
    const filter80 = await CatalogService.getCatalog({ paperWeight: '80gsm' }, publicSession);
    expect(filter80.products.length).toBeGreaterThan(0);
    for (const prod of filter80.products) {
      expect(prod.attributes.paperWeight).toBe('80gsm');
    }

    const filter75 = await CatalogService.getCatalog({ paperWeight: '75gsm' }, publicSession);
    expect(filter75.products.length).toBeGreaterThan(0);
    for (const prod of filter75.products) {
      expect(prod.attributes.paperWeight).toBe('75gsm');
    }
  });

  it('7. Attribute filtering: filters by packCount (50 vs 500)', async () => {
    const filter50 = await CatalogService.getCatalog({ packCount: 50 }, publicSession);
    expect(filter50.products.length).toBeGreaterThan(0);
    for (const prod of filter50.products) {
      expect(prod.attributes.packCount).toBe(50);
    }

    const filter500 = await CatalogService.getCatalog({ packCount: 500 }, publicSession);
    expect(filter500.products.length).toBeGreaterThan(0);
    for (const prod of filter500.products) {
      expect(prod.attributes.packCount).toBe(500);
    }
  });

  it('8. Attribute filtering: filters by colour (Blue, Red, Black, White)', async () => {
    const filterBlue = await CatalogService.getCatalog({ colour: 'Blue' }, publicSession);
    expect(filterBlue.products.length).toBeGreaterThan(0);
    for (const prod of filterBlue.products) {
      expect(prod.attributes.colour).toBe('Blue');
    }

    const filterBlack = await CatalogService.getCatalog({ colour: 'Black' }, publicSession);
    expect(filterBlack.products.length).toBeGreaterThan(0);
    for (const prod of filterBlack.products) {
      expect(prod.attributes.colour).toBe('Black');
    }
  });

  it('9. 60-second Redis catalog caching stores and retrieves cached data', async () => {
    const filter = { colour: 'Black' };
    const filterHash = computeFilterHash({ categoryRef: '', paperWeight: '', packCount: '', colour: 'Black' });

    const firstCall = await CatalogService.getCatalog(filter, publicSession);
    expect(firstCall.products.length).toBeGreaterThan(0);

    const cachedJson = await getCachedCatalog(filterHash);
    expect(cachedJson).not.toBeNull();
    const parsedCache = JSON.parse(cachedJson!);
    expect(Array.isArray(parsedCache)).toBe(true);
    expect(parsedCache.length).toBe(firstCall.products.length);
  });

  it('10. Single SKU detail lookup: rejects unauthenticated and pending sessions', async () => {
    await expect(CatalogService.getCatalogItemBySku('SKU-PPR-A4-80G', null)).rejects.toThrow(
      'ACCESS_DENIED_NOT_APPROVED'
    );

    await expect(CatalogService.getCatalogItemBySku('SKU-PPR-A4-80G', pendingSession)).rejects.toThrow(
      'ACCESS_DENIED_NOT_APPROVED'
    );

    await expect(CatalogService.getCatalogItemBySku('SKU-PPR-A4-80G', suspendedSession)).rejects.toThrow(
      'ACCESS_DENIED_NOT_APPROVED'
    );
  });

  it('11. Single SKU detail lookup: succeeds for APPROVED customer with quoted price', async () => {
    const item = await CatalogService.getCatalogItemBySku('SKU-PPR-A4-80G', approvedSessionTier1);
    expect(item).not.toBeNull();
    expect(item!.sku).toBe('SKU-PPR-A4-80G');
    expect(item!.unit_price).toBe('85.00');
    expect(item!.tier_code).toBe('CUSTOM');

    const itemT2 = await CatalogService.getCatalogItemBySku('SKU-PPR-A4-80G', approvedSessionTier2);
    expect(itemT2!.unit_price).toBe('78.50');
    expect(itemT2!.tier_code).toBe('CUSTOM');
  });

  it('12. Validation schemas: rejects injection or invalid parameters', () => {
    const invalidQuery = CatalogQuerySchema.safeParse({ packCount: -5 });
    expect(invalidQuery.success).toBe(false);

    const invalidSku = SkuParamSchema.safeParse({ sku: 'SKU; DROP TABLE' });
    expect(invalidSku.success).toBe(false);

    const validSku = SkuParamSchema.safeParse({ sku: 'SKU-PPR-A4-80G' });
    expect(validSku.success).toBe(true);
  });
});
