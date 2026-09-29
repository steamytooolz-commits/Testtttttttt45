import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCatalog } from '@/app/api/catalog/route';
import { GET as getCatalogSku } from '@/app/api/catalog/[sku]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { createCustomerAndUser, setCustomPrice, updateUserStatus } from '@/lib/repo/mysql';

describe('Module 2 API Routes Contract Verification', () => {
  let approvedCookieHeader: string;
  let pendingCookieHeader: string;

  beforeEach(async () => {

    const { customer: customer1, user: user1 } = await createCustomerAndUser(
      {
        company_name: 'Approved Wholesale Buyer',
        contact_name: 'Jane Doe',
        email: 'approved_api_test@trade.co.za',
        phone: '+27 11 555 9876',
        address_json: JSON.stringify({ street: '1 Main', city: 'JHB', province: 'GP', postal_code: '2000' }),
      },
      {
        password_hash: 'test-hash',
        totp_secret_encrypted: 'test-totp',
      }
    );

    await updateUserStatus(user1.id, 'APPROVED');

    const approvedSession = await createSession({
      userId: user1.id,
      customerId: customer1.id,
      role: 'CUSTOMER',
      status: 'APPROVED',
      email: user1.email,
    });
    approvedCookieHeader = `${SESSION_COOKIE_NAME}=${encodeURIComponent(approvedSession.token)}`;
    await setCustomPrice({ customerId: customer1.id, sku: 'SKU-PPR-A4-80G', unitPrice: '85.00', actorId: 1, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: customer1.id, sku: 'SKU-PEN-BLU-05', unitPrice: '110.00', actorId: 1, actorRole: 'ADMIN' });

    const { customer: customer2, user: user2 } = await createCustomerAndUser(
      {
        company_name: 'Pending Wholesale Buyer',
        contact_name: 'Bob Smith',
        email: 'pending_api_test@trade.co.za',
        phone: '+27 11 555 4321',
        address_json: JSON.stringify({ street: '2 Main', city: 'JHB', province: 'GP', postal_code: '2000' }),
      },
      {
        password_hash: 'test-hash',
        totp_secret_encrypted: 'test-totp',
      }
    );

    const pendingSession = await createSession({
      userId: user2.id,
      customerId: customer2.id,
      role: 'CUSTOMER',
      status: 'PENDING_APPROVAL',
      email: user2.email,
    });
    pendingCookieHeader = `${SESSION_COOKIE_NAME}=${encodeURIComponent(pendingSession.token)}`;
  });

  it('GET /api/catalog - Public unauthenticated request returns 200 with ZERO price fields', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog');
    const res = await getCatalog(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    const rawJson = JSON.stringify(body);

    expect(rawJson.toLowerCase().includes('unit_price')).toBe(false);
    expect(rawJson.toLowerCase().includes('price')).toBe(false);
    expect(rawJson.toLowerCase().includes('tier_code')).toBe(false);
    expect(body.trade_gate.is_approved).toBe(false);
    expect(body.trade_gate.status).toBe('PUBLIC');
  });

  it('GET /api/catalog - PENDING_APPROVAL request returns 200 with ZERO price fields', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog', {
      headers: {
        cookie: pendingCookieHeader,
      },
    });
    const res = await getCatalog(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    const rawJson = JSON.stringify(body);

    expect(rawJson.toLowerCase().includes('unit_price')).toBe(false);
    expect(rawJson.toLowerCase().includes('price')).toBe(false);
    expect(rawJson.toLowerCase().includes('tier_code')).toBe(false);
    expect(body.trade_gate.is_approved).toBe(false);
    expect(body.trade_gate.status).toBe('PENDING_APPROVAL');
  });

  it('GET /api/catalog - APPROVED request returns 200 with quoted prices for assigned SKUs', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog', {
      headers: {
        cookie: approvedCookieHeader,
      },
    });
    const res = await getCatalog(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.trade_gate.is_approved).toBe(true);
    expect(body.trade_gate.status).toBe('APPROVED');
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.trade_gate.quotedCount).toBeGreaterThan(0);

    const quoted = body.products.filter((p: { unit_price?: string }) => typeof p.unit_price === 'string');
    expect(quoted.length).toBeGreaterThan(0);
    for (const prod of quoted) {
      expect(prod.unit_price).toMatch(/^\d+\.\d{2}$/);
      expect(prod.tier_code).toBe('CUSTOM');
    }
    const typek = body.products.find((p: { _id: string }) => p._id === 'SKU-PPR-A4-80G');
    expect(typek.unit_price).toBe('85.00');
  });

  it('GET /api/catalog - Invalid query parameters return 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog?packCount=-99');
    const res = await getCatalog(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid filter parameters');
  });

  it('GET /api/catalog/[sku] - Unauthenticated request returns 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog/SKU-PPR-A4-80G');
    const res = await getCatalogSku(req, {
      params: Promise.resolve({ sku: 'SKU-PPR-A4-80G' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/catalog/[sku] - PENDING_APPROVAL request returns 403 Forbidden', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog/SKU-PPR-A4-80G', {
      headers: {
        cookie: pendingCookieHeader,
      },
    });
    const res = await getCatalogSku(req, {
      params: Promise.resolve({ sku: 'SKU-PPR-A4-80G' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('GET /api/catalog/[sku] - APPROVED request returns 200 with quoted pricing', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog/SKU-PPR-A4-80G', {
      headers: {
        cookie: approvedCookieHeader,
      },
    });
    const res = await getCatalogSku(req, {
      params: Promise.resolve({ sku: 'SKU-PPR-A4-80G' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._id).toBe('SKU-PPR-A4-80G');
    expect(body.unit_price).toBe('85.00');
    expect(body.tier_code).toBe('CUSTOM');
  });

  it('GET /api/catalog/[sku] - Non-existent SKU returns 404', async () => {
    const req = new NextRequest('http://localhost:3000/api/catalog/SKU-DOES-NOT-EXIST', {
      headers: {
        cookie: approvedCookieHeader,
      },
    });
    const res = await getCatalogSku(req, {
      params: Promise.resolve({ sku: 'SKU-DOES-NOT-EXIST' }),
    });

    expect(res.status).toBe(404);
  });
});
