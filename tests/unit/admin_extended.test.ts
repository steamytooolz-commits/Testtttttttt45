import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AdminService } from '@/lib/services/admin';
import { CartService } from '@/lib/services/cart';
import { CheckoutService } from '@/lib/services/checkout';
import {
  createCustomerAndUser,
  updateUserStatus,
  setStockBalance,
  setCustomPrice,
  findCustomerById,
  findUserById,
  findUserByEmail,
  findSalesOrderById,
  getCustomerTier,
  getAuditLogs,
  memoryDb,
} from '@/lib/repo/mysql';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { PriceTierCreateSchema } from '@/lib/validation';
import { POST as approveRoute } from '@/app/api/admin/customers/[id]/approve/route';
import { POST as createTierRoute, PATCH as updateTierRoute } from '@/app/api/admin/tiers/route';
import { POST as eraseRoute } from '@/app/api/admin/popia/erase/[customerId]/route';

describe('Module 7: Tier Management, Approval & POPIA Erasure Tests', () => {
  let adminToken: string;
  let adminCsrf: string;
  let staffToken: string;
  let staffCsrf: string;
  let customerToken: string;
  let customerCsrf: string;
  let customerId: number;
  let customerUserId: number;
  let customerEmail: string;

  beforeEach(async () => {
    memoryDb.resetDatabase();

    const adminUser = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `tier_admin_${Date.now()}@stationerydepot.co.za`,
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
      email: `tier_staff_${Date.now()}@stationerydepot.co.za`,
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
    staffCsrf = staffSession.csrfToken;

    const { customer, user: custUser } = await createCustomerAndUser(
      {
        company_name: 'Tier Prospect (Pty) Ltd',
        contact_name: 'Tier Prospect',
        email: `tier_prospect_${Date.now()}@example.co.za`,
        phone: '+27115550202',
        address_json: JSON.stringify({ street: '2 Tier Rd', city: 'Durban', province: 'KZN', postal_code: '4001' }),
      },
      { password_hash: 'hash-cust', totp_secret_encrypted: 'totp-cust' }
    );
    customerId = customer.id;
    customerUserId = custUser.id;
    customerEmail = custUser.email;
    const custSession = await createSession({
      userId: custUser.id,
      email: custUser.email,
      role: 'CUSTOMER',
      customerId,
      status: 'PENDING_APPROVAL',
    });
    customerToken = custSession.token;
    customerCsrf = custSession.csrfToken;
  });

  it('creates price tiers as ADMIN and rejects duplicates and non-admins', async () => {
    const created = await AdminService.createTier({
      code: 'TIER_X',
      name: 'Experimental Contract',
      basis: { 'SKU-PPR-A4-80G': '80.00' },
      actorId: 1,
      actorRole: 'ADMIN',
    });
    expect(created.code).toBe('TIER_X');
    expect(JSON.parse(created.basis)).toEqual({ 'SKU-PPR-A4-80G': '80.00' });

    await expect(
      AdminService.createTier({
        code: 'TIER_1',
        name: 'Duplicate',
        basis: { 'SKU-PPR-A4-80G': '80.00' },
        actorId: 1,
        actorRole: 'ADMIN',
      })
    ).rejects.toThrow(/TIER_CODE_EXISTS/);

    await expect(
      AdminService.createTier({
        code: 'TIER_Y',
        name: 'Staff Attempt',
        basis: { 'SKU-PPR-A4-80G': '80.00' },
        actorId: 2,
        actorRole: 'SALES_STAFF',
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('updates price tiers as ADMIN with validation', async () => {
    const updated = await AdminService.updateTier({
      id: 1,
      name: 'Standard Wholesale Renamed',
      actorId: 1,
      actorRole: 'ADMIN',
    });
    expect(updated.name).toBe('Standard Wholesale Renamed');

    await expect(
      AdminService.updateTier({ id: 9999, name: 'Ghost', actorId: 1, actorRole: 'ADMIN' })
    ).rejects.toThrow(/TIER_NOT_FOUND/);

    await expect(
      AdminService.updateTier({ id: 2, code: 'TIER_1', actorId: 1, actorRole: 'ADMIN' })
    ).rejects.toThrow(/TIER_CODE_EXISTS/);
  });

  it('validates tier basis prices as DECIMAL strings', () => {
    expect(
      PriceTierCreateSchema.safeParse({ code: 'TIER_Z', name: 'Zed', basis: { SKU: '10.00' } }).success
    ).toBe(true);
    expect(
      PriceTierCreateSchema.safeParse({ code: 'TIER_Z', name: 'Zed', basis: { SKU: '10.5' } }).success
    ).toBe(false);
    expect(PriceTierCreateSchema.safeParse({ code: 'tier_z', name: 'Zed', basis: {} }).success).toBe(false);
  });

  it('enforces RBAC on POST/PATCH /api/admin/tiers', async () => {
    const staffRes = await createTierRoute(
      new NextRequest('http://localhost:3000/api/admin/tiers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': staffCsrf,
          cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
        },
        body: JSON.stringify({ code: 'TIER_S', name: 'Staff Tier', basis: { SKU: '1.00' } }),
      })
    );
    expect(staffRes.status).toBe(403);

    const createdRes = await createTierRoute(
      new NextRequest('http://localhost:3000/api/admin/tiers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminCsrf,
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({ code: 'TIER_S', name: 'Staff Tier', basis: { SKU: '1.00' } }),
      })
    );
    expect(createdRes.status).toBe(201);
    const createdData = await createdRes.json();
    expect(createdData.tier.code).toBe('TIER_S');

    const patchedRes = await updateTierRoute(
      new NextRequest('http://localhost:3000/api/admin/tiers', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminCsrf,
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({ id: createdData.tier.id, name: 'Renamed Tier' }),
      })
    );
    expect(patchedRes.status).toBe(200);

    const missingRes = await updateTierRoute(
      new NextRequest('http://localhost:3000/api/admin/tiers', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminCsrf,
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({ id: 9999, name: 'Ghost' }),
      })
    );
    expect(missingRes.status).toBe(404);
  });

  it('approves pending customers via POST /api/admin/customers/[id]/approve', async () => {
    const pending = await findCustomerById(customerId);
    expect(pending?.status).toBe('PENDING_APPROVAL');

    const staffRes = await approveRoute(
      new NextRequest(`http://localhost:3000/api/admin/customers/${customerId}/approve`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': staffCsrf,
          cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
        },
      }),
      { params: Promise.resolve({ id: String(customerId) }) }
    );
    expect(staffRes.status).toBe(403);

    const okRes = await approveRoute(
      new NextRequest(`http://localhost:3000/api/admin/customers/${customerId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminCsrf,
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({ tier_id: 2 }),
      }),
      { params: Promise.resolve({ id: String(customerId) }) }
    );
    expect(okRes.status).toBe(200);

    const approved = await findCustomerById(customerId);
    expect(approved?.status).toBe('APPROVED');
    const tier = await getCustomerTier(customerId);
    expect(tier?.code).toBe('TIER_2');

    const badRes = await approveRoute(
      new NextRequest('http://localhost:3000/api/admin/customers/abc/approve', {
        method: 'POST',
        headers: { 'X-CSRF-Token': adminCsrf, cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
      }),
      { params: Promise.resolve({ id: 'abc' }) }
    );
    expect(badRes.status).toBe(400);

    const missingRes = await approveRoute(
      new NextRequest('http://localhost:3000/api/admin/customers/99999/approve', {
        method: 'POST',
        headers: { 'X-CSRF-Token': adminCsrf, cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
      }),
      { params: Promise.resolve({ id: '99999' }) }
    );
    expect(missingRes.status).toBe(404);
  });

  it('erases customer PII while preserving financial records', async () => {
    await updateUserStatus(customerUserId, 'APPROVED');
    await setStockBalance('SKU-PPR-A4-80G', 100);
    await setCustomPrice({ customerId, sku: 'SKU-PPR-A4-80G', unitPrice: '85.00', actorId: customerUserId, actorRole: 'ADMIN' });
    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 4);
    const checkout = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });

    const denied = await eraseRoute(
      new NextRequest(`http://localhost:3000/api/admin/popia/erase/${customerId}`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': staffCsrf, cookie: `${SESSION_COOKIE_NAME}=${staffToken}` },
      }),
      { params: Promise.resolve({ customerId: String(customerId) }) }
    );
    expect(denied.status).toBe(403);

    const forbidden = await eraseRoute(
      new NextRequest(`http://localhost:3000/api/admin/popia/erase/${customerId}`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': customerCsrf, cookie: `${SESSION_COOKIE_NAME}=${customerToken}` },
      }),
      { params: Promise.resolve({ customerId: String(customerId) }) }
    );
    expect(forbidden.status).toBe(403);

    const okRes = await eraseRoute(
      new NextRequest(`http://localhost:3000/api/admin/popia/erase/${customerId}`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': adminCsrf, cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
      }),
      { params: Promise.resolve({ customerId: String(customerId) }) }
    );
    expect(okRes.status).toBe(200);

    const erased = await findCustomerById(customerId);
    expect(erased?.email).toBe(`erased-${customerId}@erased.local`);
    expect(erased?.company_name).toContain('ERASED');
    expect(erased?.status).toBe('SUSPENDED');

    expect(await findUserByEmail(customerEmail)).toBeNull();
    const users = Array.from(memoryDb.users.values()).filter((u) => u.customer_id === customerId);
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.status).toBe('SUSPENDED');
      expect(u.email).toContain('@erased.local');
    }
    const firstUser = await findUserById(users[0].id);
    expect(firstUser?.password_hash).toBe('UNUSABLE');

    const order = await findSalesOrderById(checkout.order.id);
    expect(order?.total).toBe(checkout.order.total);

    const audits = await getAuditLogs(20);
    expect(audits.some((a) => a.action === 'POPIA_ERASURE' && a.entity_id === String(customerId))).toBe(true);
  });

  it('returns 404 when erasing a missing customer', async () => {
    const missingRes = await eraseRoute(
      new NextRequest('http://localhost:3000/api/admin/popia/erase/99999', {
        method: 'POST',
        headers: { 'X-CSRF-Token': adminCsrf, cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
      }),
      { params: Promise.resolve({ customerId: '99999' }) }
    );
    expect(missingRes.status).toBe(404);
  });
});
