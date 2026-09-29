import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthService } from '@/lib/services/auth';
import { findUserByEmail, listStaffUsers, memoryDb } from '@/lib/repo/mysql';
import { GET as listStaffRoute, POST as createStaffRoute } from '@/app/api/admin/users/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';

describe('Staff account creation (ADMIN-only)', () => {
  let adminToken: string;
  let adminCsrf: string;
  let staffToken: string;

  beforeEach(async () => {
    memoryDb.resetDatabase();
    const admin = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `owner_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const adminSession = await createSession({
      userId: admin.id,
      customerId: null,
      role: 'ADMIN',
      status: 'APPROVED',
      email: admin.email,
    });
    adminToken = adminSession.token;
    adminCsrf = adminSession.csrfToken;

    const staff = memoryDb.insertUser({
      customer_id: null,
      role: 'SALES_STAFF',
      email: `clerk_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const staffSession = await createSession({
      userId: staff.id,
      customerId: null,
      role: 'SALES_STAFF',
      status: 'APPROVED',
      email: staff.email,
    });
    staffToken = staffSession.token;
  });

  it('creates an approved staff user with one-time credentials and audit trail', async () => {
    const result = await AuthService.createStaffAccount(
      1,
      'ADMIN',
      { email: 'NewHire@Example.co.za', role: 'SALES_STAFF' },
      '127.0.0.1'
    );
    expect(result.email).toBe('newhire@example.co.za');
    expect(result.tempPassword.length).toBeGreaterThanOrEqual(12);
    expect(result.totpSecret.length).toBeGreaterThan(0);
    expect(result.totpUri).toContain('otpauth://');

    const stored = await findUserByEmail('newhire@example.co.za');
    expect(stored?.role).toBe('SALES_STAFF');
    expect(stored?.status).toBe('APPROVED');
    expect(stored?.customer_id).toBeNull();
    expect(stored?.pwd_reset_required).toBe(true);

    const audits = memoryDb.auditLogs.filter((a) => a.action === 'STAFF_CREATED');
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_id).toBe(1);
  });

  it('refuses non-ADMIN callers and duplicate emails', async () => {
    await expect(
      AuthService.createStaffAccount(2, 'SALES_STAFF', { email: 'x@example.co.za', role: 'SALES_STAFF' }, '127.0.0.1')
    ).rejects.toThrow(/FORBIDDEN/);
    await AuthService.createStaffAccount(1, 'ADMIN', { email: 'dup@example.co.za', role: 'ADMIN' }, '127.0.0.1');
    await expect(
      AuthService.createStaffAccount(1, 'ADMIN', { email: 'dup@example.co.za', role: 'ADMIN' }, '127.0.0.1')
    ).rejects.toThrow(/already exists/);
  });

  it('lists only staff roles without secrets', async () => {
    const list = await listStaffUsers();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((u) => u.role === 'ADMIN' || u.role === 'SALES_STAFF')).toBe(true);
    expect(list.some((u) => 'password_hash' in (u as unknown as Record<string, unknown>))).toBe(false);
    expect(list.some((u) => 'totp_secret_encrypted' in (u as unknown as Record<string, unknown>))).toBe(false);
  });

  it('enforces ADMIN-only access and CSRF on the route', async () => {
    const anonList = await listStaffRoute(new NextRequest('http://localhost:3000/api/admin/users'));
    expect(anonList.status).toBe(401);

    const staffList = await listStaffRoute(
      new NextRequest('http://localhost:3000/api/admin/users', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${staffToken}` },
      })
    );
    expect(staffList.status).toBe(403);

    const noCsrf = await createStaffRoute(
      new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({ email: 'route@example.co.za', role: 'SALES_STAFF' }),
      })
    );
    expect(noCsrf.status).toBe(403);

    const created = await createStaffRoute(
      new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
          'x-csrf-token': adminCsrf,
        },
        body: JSON.stringify({ email: 'route@example.co.za', role: 'SALES_STAFF' }),
      })
    );
    expect(created.status).toBe(201);
    const json = await created.json();
    expect(json.tempPassword).toBeDefined();
    expect(json.totpSecret).toBeDefined();

    const dup = await createStaffRoute(
      new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
          'x-csrf-token': adminCsrf,
        },
        body: JSON.stringify({ email: 'route@example.co.za', role: 'SALES_STAFF' }),
      })
    );
    expect(dup.status).toBe(409);
  });
});
