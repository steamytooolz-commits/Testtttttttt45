import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthService } from '@/lib/services/auth';
import { findUserByEmail, memoryDb } from '@/lib/repo/mysql';
import { getRedisClient } from '@/lib/repo/redis';
import { setEmailSpy } from '@/lib/services/mailer';
import { POST as forgotPasswordRoute } from '@/app/api/auth/forgot-password/route';
import { GET as listResetsRoute, POST as directResetRoute } from '@/app/api/admin/password-resets/route';
import { POST as fulfilResetRoute } from '@/app/api/admin/password-resets/[id]/fulfil/route';
import { POST as dismissResetRoute } from '@/app/api/admin/password-resets/[id]/dismiss/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';

describe('Forgot-password request flow', () => {
  let adminToken: string;
  let adminCsrf: string;
  let staffToken: string;
  let customerEmail: string;
  const sent: Array<{ to: string; subject: string }> = [];

  beforeEach(async () => {
    memoryDb.resetDatabase();
    await getRedisClient().flushall();
    sent.length = 0;
    setEmailSpy((msg) => {
      sent.push({ to: msg.to, subject: msg.subject });
    });

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

    customerEmail = `buyer_${Date.now()}@example.co.za`;
    memoryDb.insertUser({
      customer_id: 1,
      role: 'CUSTOMER',
      email: customerEmail,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
  });

  it('creates a PENDING request and notifies the sales team for an existing account', async () => {
    await AuthService.requestPasswordReset(
      { email: customerEmail, recaptcha_token: 'test-token-valid' },
      '127.0.0.1'
    );

    const pending = await AuthService.listPasswordResetRequests('PENDING');
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe(customerEmail);

    const audits = memoryDb.auditLogs.filter((a) => a.action === 'PASSWORD_RESET_REQUESTED');
    expect(audits).toHaveLength(1);

    expect(sent.some((m) => m.subject.startsWith('Password reset request'))).toBe(true);
  });

  it('stays silent for unknown emails (no request row, no reveal)', async () => {
    await AuthService.requestPasswordReset(
      { email: 'nobody@example.co.za', recaptcha_token: 'test-token-valid' },
      '127.0.0.1'
    );

    expect(memoryDb.passwordResetRequests.size).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('rejects failed captchas', async () => {
    await expect(
      AuthService.requestPasswordReset({ email: customerEmail, recaptcha_token: 'invalid-token' }, '127.0.0.1')
    ).rejects.toThrow(/Captcha/);
    expect(memoryDb.passwordResetRequests.size).toBe(0);
  });

  it('fulfils a request: temp password, email to user, FULFILLED status', async () => {
    await AuthService.requestPasswordReset(
      { email: customerEmail, recaptcha_token: 'test-token-valid' },
      '127.0.0.1'
    );
    const [request] = await AuthService.listPasswordResetRequests('PENDING');

    const result = await AuthService.fulfilPasswordResetRequest(1, 'ADMIN', request.id, '127.0.0.1');

    expect(result.email).toBe(customerEmail);
    expect(result.tempPassword.length).toBeGreaterThanOrEqual(12);
    expect(result.emailText).toContain(result.tempPassword);

    const stored = await findUserByEmail(customerEmail);
    expect(stored?.pwd_reset_required).toBe(true);

    const after = await AuthService.listPasswordResetRequests('PENDING');
    expect(after).toHaveLength(0);

    expect(sent.some((m) => m.to === customerEmail && m.subject === 'Your new Stationery Depot password')).toBe(true);

    await expect(AuthService.fulfilPasswordResetRequest(1, 'ADMIN', request.id, '127.0.0.1')).rejects.toThrow(
      /already dismissed|already fulfilled/i
    );
  });

  it('refuses non-ADMIN fulfilment and dismissal', async () => {
    await AuthService.requestPasswordReset(
      { email: customerEmail, recaptcha_token: 'test-token-valid' },
      '127.0.0.1'
    );
    const [request] = await AuthService.listPasswordResetRequests('PENDING');

    await expect(AuthService.fulfilPasswordResetRequest(2, 'SALES_STAFF', request.id, '127.0.0.1')).rejects.toThrow(
      /FORBIDDEN/
    );
    await expect(AuthService.dismissPasswordResetRequest(2, 'SALES_STAFF', request.id, '127.0.0.1')).rejects.toThrow(
      /FORBIDDEN/
    );
  });

  it('dismisses a request without touching the password', async () => {
    await AuthService.requestPasswordReset(
      { email: customerEmail, recaptcha_token: 'test-token-valid' },
      '127.0.0.1'
    );
    const [request] = await AuthService.listPasswordResetRequests('PENDING');

    await AuthService.dismissPasswordResetRequest(1, 'ADMIN', request.id, '127.0.0.1');

    const dismissed = await AuthService.listPasswordResetRequests('DISMISSED');
    expect(dismissed).toHaveLength(1);
    const stored = await findUserByEmail(customerEmail);
    expect(stored?.pwd_reset_required).toBe(false);
  });

  it('resets directly by visible email and returns a copyable template', async () => {
    const result = await AuthService.adminResetPasswordByEmail(1, 'ADMIN', customerEmail, '127.0.0.1');
    expect(result.email).toBe(customerEmail);
    expect(result.emailSubject).toBe('Your new Stationery Depot password');
    expect(result.emailText).toContain(result.tempPassword);
    expect(sent.some((m) => m.to === customerEmail)).toBe(true);

    await expect(AuthService.adminResetPasswordByEmail(1, 'ADMIN', 'ghost@example.co.za', '127.0.0.1')).rejects.toThrow(
      /USER_NOT_FOUND/
    );
  });

  it('forgot-password route always confirms (even for unknown emails)', async () => {
    const known = await forgotPasswordRoute(
      new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: customerEmail, recaptcha_token: 'test-token-valid' }),
      })
    );
    expect(known.status).toBe(200);
    expect((await known.json()).success).toBe(true);

    const unknown = await forgotPasswordRoute(
      new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ghost@example.co.za', recaptcha_token: 'test-token-valid' }),
      })
    );
    expect(unknown.status).toBe(200);
    expect((await unknown.json()).success).toBe(true);

    const bad = await forgotPasswordRoute(
      new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', recaptcha_token: 'test-token-valid' }),
      })
    );
    expect(bad.status).toBe(400);
  });

  it('admin routes enforce ADMIN + CSRF', async () => {
    const anon = await listResetsRoute(new NextRequest('http://localhost:3000/api/admin/password-resets'));
    expect(anon.status).toBe(401);

    const staff = await listResetsRoute(
      new NextRequest('http://localhost:3000/api/admin/password-resets', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${staffToken}` },
      })
    );
    expect(staff.status).toBe(403);

    await AuthService.requestPasswordReset(
      { email: customerEmail, recaptcha_token: 'test-token-valid' },
      '127.0.0.1'
    );
    const [request] = await AuthService.listPasswordResetRequests('PENDING');

    const noCsrf = await fulfilResetRoute(
      new NextRequest(`http://localhost:3000/api/admin/password-resets/${request.id}/fulfil`, {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
      }),
      { params: Promise.resolve({ id: String(request.id) }) }
    );
    expect(noCsrf.status).toBe(403);

    const fulfilled = await fulfilResetRoute(
      new NextRequest(`http://localhost:3000/api/admin/password-resets/${request.id}/fulfil`, {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}`, 'x-csrf-token': adminCsrf },
      }),
      { params: Promise.resolve({ id: String(request.id) }) }
    );
    expect(fulfilled.status).toBe(200);
    const json = await fulfilled.json();
    expect(json.tempPassword).toBeDefined();
    expect(json.emailText).toContain(json.tempPassword);

    const direct = await directResetRoute(
      new NextRequest('http://localhost:3000/api/admin/password-resets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
          'x-csrf-token': adminCsrf,
        },
        body: JSON.stringify({ email: customerEmail }),
      })
    );
    expect(direct.status).toBe(200);

    const missing = await directResetRoute(
      new NextRequest('http://localhost:3000/api/admin/password-resets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
          'x-csrf-token': adminCsrf,
        },
        body: JSON.stringify({ email: 'ghost@example.co.za' }),
      })
    );
    expect(missing.status).toBe(404);

    const dismissed = await dismissResetRoute(
      new NextRequest('http://localhost:3000/api/admin/password-resets/999999/dismiss', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}`, 'x-csrf-token': adminCsrf },
      }),
      { params: Promise.resolve({ id: '999999' }) }
    );
    expect(dismissed.status).toBe(404);
  });
});
