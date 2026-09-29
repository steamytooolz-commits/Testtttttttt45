import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createCustomerAndUser, memoryDb } from '@/lib/repo/mysql';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { GET as listCustomersRoute } from '@/app/api/admin/customers/route';
import { PATCH as updateCustomerRoute } from '@/app/api/admin/customers/[id]/route';
import { GET as listTiersRoute } from '@/app/api/admin/tiers/route';
import { GET as stockRoute } from '@/app/api/admin/stock/route';
import { POST as adjustStockRoute } from '@/app/api/admin/stock/adjust/route';
import { GET as movementsRoute } from '@/app/api/admin/stock/movements/route';
import { GET as auditRoute } from '@/app/api/admin/audit/route';
import { GET as taxRoute } from '@/app/api/admin/reports/tax/route';
import { GET as exportRoute } from '@/app/api/admin/reports/export/route';

function authed(
  url: string,
  token: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): NextRequest {
  return new NextRequest(url, {
    method: init?.method,
    headers: { ...(init?.headers || {}), cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: init?.body,
  });
}

describe('Authorization Matrix: Admin Routes per Role', () => {
  let adminToken: string;
  let adminCsrf: string;
  let staffToken: string;
  let customerToken: string;
  let customerId: number;

  beforeEach(async () => {
    memoryDb.resetDatabase();

    const adminUser = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `matrix_admin_${Date.now()}@stationerydepot.co.za`,
      password_hash: 'hash-admin',
      totp_secret_encrypted: 'totp-admin',
      status: 'APPROVED',
    });
    const adminSession = await createSession({
      userId: adminUser.id,
      email: adminUser.email,
      role: 'ADMIN',
      customerId: null,
      status: 'APPROVED',
    });
    adminToken = adminSession.token;
    adminCsrf = adminSession.csrfToken;

    const staffUser = memoryDb.insertUser({
      customer_id: null,
      role: 'SALES_STAFF',
      email: `matrix_staff_${Date.now()}@stationerydepot.co.za`,
      password_hash: 'hash-staff',
      totp_secret_encrypted: 'totp-staff',
      status: 'APPROVED',
    });
    const staffSession = await createSession({
      userId: staffUser.id,
      email: staffUser.email,
      role: 'SALES_STAFF',
      customerId: null,
      status: 'APPROVED',
    });
    staffToken = staffSession.token;

    const { customer, user: custUser } = await createCustomerAndUser(
      {
        company_name: 'Matrix Customer (Pty) Ltd',
        contact_name: 'Matrix User',
        email: `matrix_cust_${Date.now()}@example.co.za`,
        phone: '+27115550303',
        address_json: JSON.stringify({ street: '3 Matrix Rd', city: 'Pretoria', province: 'GP', postal_code: '0001' }),
      },
      { password_hash: 'hash-cust', totp_secret_encrypted: 'totp-cust' }
    );
    customerId = customer.id;
    const custSession = await createSession({
      userId: custUser.id,
      email: custUser.email,
      role: 'CUSTOMER',
      customerId,
      status: 'APPROVED',
    });
    customerToken = custSession.token;
  });

  it('GET /api/admin/customers allows staff, forbids customers and anonymous callers', async () => {
    expect((await listCustomersRoute(authed('http://localhost:3000/api/admin/customers', staffToken))).status).toBe(200);
    expect((await listCustomersRoute(authed('http://localhost:3000/api/admin/customers', adminToken))).status).toBe(200);
    expect((await listCustomersRoute(authed('http://localhost:3000/api/admin/customers', customerToken))).status).toBe(403);
    expect((await listCustomersRoute(new NextRequest('http://localhost:3000/api/admin/customers'))).status).toBe(403);
  });

  it('PATCH /api/admin/customers/[id] is ADMIN-only', async () => {
    const body = JSON.stringify({ status: 'APPROVED' });
    const adminRes = await updateCustomerRoute(
      authed(`http://localhost:3000/api/admin/customers/${customerId}`, adminToken, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': adminCsrf },
        body,
      }),
      { params: Promise.resolve({ id: String(customerId) }) }
    );
    expect(adminRes.status).toBe(200);

    const staffRes = await updateCustomerRoute(
      authed(`http://localhost:3000/api/admin/customers/${customerId}`, staffToken, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'staff-csrf' },
        body,
      }),
      { params: Promise.resolve({ id: String(customerId) }) }
    );
    expect(staffRes.status).toBe(403);
  });

  it('GET /api/admin/tiers, /stock, /movements, /audit, /tax allow staff and forbid others', async () => {
    const cases: Array<[string, (req: NextRequest) => Promise<Response>, unknown?]> = [
      ['tiers', (req) => listTiersRoute(req)],
      ['stock', (req) => stockRoute(req)],
      ['movements', (req) => movementsRoute(req)],
      ['audit', (req) => auditRoute(req)],
      ['tax', (req) => taxRoute(req)],
    ];
    const urls: Record<string, string> = {
      tiers: 'http://localhost:3000/api/admin/tiers',
      stock: 'http://localhost:3000/api/admin/stock',
      movements: 'http://localhost:3000/api/admin/stock/movements?sku=SKU-PPR-A4-80G',
      audit: 'http://localhost:3000/api/admin/audit',
      tax: 'http://localhost:3000/api/admin/reports/tax',
    };
    for (const [name, handler] of cases) {
      expect((await handler(authed(urls[name], staffToken))).status, name).toBe(200);
      expect((await handler(authed(urls[name], adminToken))).status, name).toBe(200);
      expect((await handler(authed(urls[name], customerToken))).status, name).toBe(403);
      expect((await handler(new NextRequest(urls[name]))).status, name).toBe(403);
    }
  });

  it('POST /api/admin/stock/adjust is ADMIN-only with CSRF', async () => {
    const payload = JSON.stringify({ sku: 'SKU-PPR-A4-80G', delta: 5, reason: 'IMPORT', ref_id: 'MATRIX-1' });
    const adminRes = await adjustStockRoute(
      authed('http://localhost:3000/api/admin/stock/adjust', adminToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': adminCsrf },
        body: payload,
      })
    );
    expect(adminRes.status).toBe(200);

    const noCsrfRes = await adjustStockRoute(
      authed('http://localhost:3000/api/admin/stock/adjust', adminToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
    );
    expect(noCsrfRes.status).toBe(403);

    const staffRes = await adjustStockRoute(
      authed('http://localhost:3000/api/admin/stock/adjust', staffToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'staff-csrf' },
        body: payload,
      })
    );
    expect(staffRes.status).toBe(403);
  });

  it('GET /api/admin/reports/export streams guarded downloads', async () => {
    const url = 'http://localhost:3000/api/admin/reports/export?type=customers&format=csv';
    const adminRes = await exportRoute(authed(url, adminToken));
    expect(adminRes.status).toBe(200);
    expect(adminRes.headers.get('Content-Type')).toContain('text/csv');

    const custRes = await exportRoute(authed(url, customerToken));
    expect(custRes.status).toBe(403);
  });
});
