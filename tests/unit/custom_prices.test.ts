import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { memoryDb } from '@/lib/repo/mysql/client';
import {
  setCustomPrice,
  deleteCustomPrice,
  listCustomPrices,
  getCustomPrice,
} from '@/lib/repo/mysql';
import { CatalogService } from '@/lib/services/catalog';
import { CartService } from '@/lib/services/cart';
import { GET as listPricesRoute, POST as savePricesRoute } from '@/app/api/admin/customers/[id]/prices/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';

describe('Per-customer custom quoted prices', () => {
  const SKU = 'SKU-PPR-A4-80G';
  let customerId: number;

  beforeEach(async () => {
    memoryDb.resetDatabase();
    const customer = memoryDb.insertCustomer({
      company_name: 'Custom Price Co',
      contact_name: 'Buyer',
      email: `custom_${Date.now()}@example.co.za`,
      phone: '+27115550101',
      address_json: '{}',
      status: 'APPROVED',
    });
    customerId = customer.id;
  });

  it('rejects non-ADMIN writes and invalid input', async () => {
    await expect(
      setCustomPrice({ customerId, sku: SKU, unitPrice: '10.00', actorId: 2, actorRole: 'SALES_STAFF' })
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      setCustomPrice({ customerId, sku: 'BAD SKU!', unitPrice: '10.00', actorId: 1, actorRole: 'ADMIN' })
    ).rejects.toThrow(/VALIDATION_ERROR/);
    await expect(
      setCustomPrice({ customerId, sku: SKU, unitPrice: '10.999', actorId: 1, actorRole: 'ADMIN' })
    ).rejects.toThrow(/INVALID_AMOUNT/);
    await expect(
      setCustomPrice({ customerId, sku: SKU, unitPrice: '-5.00', actorId: 1, actorRole: 'ADMIN' })
    ).rejects.toThrow(/VALIDATION_ERROR/);
  });

  it('custom price wins over tier pricing across catalog and cart', async () => {
    const tierBefore = await CatalogService.getCustomerTierPrice(customerId, SKU);
    expect(tierBefore?.tierCode).not.toBe('CUSTOM');

    await setCustomPrice({ customerId, sku: SKU, unitPrice: '42.50', actorId: 1, actorRole: 'ADMIN' });
    expect(await getCustomPrice(customerId, SKU)).toBe('42.50');

    const resolved = await CatalogService.getCustomerTierPrice(customerId, SKU);
    expect(resolved?.unitPrice).toBe('42.50');
    expect(resolved?.tierCode).toBe('CUSTOM');

    const cart = await CartService.addItem(customerId, SKU, 2);
    const line = cart.items.find((i) => i.sku === SKU);
    expect(line?.unit_price).toBe('42.50');
    expect(line?.tier_code).toBe('CUSTOM');
    expect(line?.line_total).toBe('85.00');
  });

  it('removing a custom price falls back to tier pricing', async () => {
    await setCustomPrice({ customerId, sku: SKU, unitPrice: '42.50', actorId: 1, actorRole: 'ADMIN' });
    await deleteCustomPrice({ customerId, sku: SKU, actorId: 1, actorRole: 'ADMIN' });
    expect(await getCustomPrice(customerId, SKU)).toBeNull();
    expect((await listCustomPrices(customerId)).length).toBe(0);
    const resolved = await CatalogService.getCustomerTierPrice(customerId, SKU);
    expect(resolved?.tierCode).not.toBe('CUSTOM');
  });

  it('enforces ADMIN-only access and validates ids on the prices route', async () => {
    const staff = memoryDb.insertUser({
      customer_id: null,
      role: 'SALES_STAFF',
      email: `cprice_staff_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const staffSession = await createSession({ userId: staff.id, customerId: null, role: 'SALES_STAFF', status: 'APPROVED', email: staff.email });
    const staffReq = new NextRequest(`http://localhost:3000/api/admin/customers/${customerId}/prices`);
    const staffRes = await listPricesRoute(staffReq, { params: Promise.resolve({ id: String(customerId) }) });
    expect(staffRes.status).toBe(401);

    const anonReq = new NextRequest('http://localhost:3000/api/admin/customers/abc/prices', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${staffSession.token}` },
    });
    const anonRes = await listPricesRoute(anonReq, { params: Promise.resolve({ id: 'abc' }) });
    expect(anonRes.status).toBe(403);

    const admin = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `cprice_admin_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const adminSession = await createSession({ userId: admin.id, customerId: null, role: 'ADMIN', status: 'APPROVED', email: admin.email });
    const authed = (body: unknown) =>
      new NextRequest(`http://localhost:3000/api/admin/customers/${customerId}/prices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${adminSession.token}`,
          'x-csrf-token': adminSession.csrfToken,
        },
        body: JSON.stringify(body),
      });

    const badSku = await savePricesRoute(authed({ sku: 'NOPE-NOT-REAL', unitPrice: '10.00' }), {
      params: Promise.resolve({ id: String(customerId) }),
    });
    expect(badSku.status).toBe(400);

    const bulk = await savePricesRoute(
      authed({ prices: [{ sku: SKU, unitPrice: '39.99' }, { sku: 'NOPE-NOT-REAL', unitPrice: '10.00' }] }),
      { params: Promise.resolve({ id: String(customerId) }) }
    );
    expect(bulk.status).toBe(200);
    const bulkJson = await bulk.json();
    expect(bulkJson.saved).toHaveLength(1);
    expect(bulkJson.errors).toHaveLength(1);
    expect(await getCustomPrice(customerId, SKU)).toBe('39.99');
  });
});
