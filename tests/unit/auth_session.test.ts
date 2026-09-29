import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { memoryDb } from '@/lib/repo/mysql/client';
import { GET as sessionRoute } from '@/app/api/auth/session/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';

describe('GET /api/auth/session (CSRF token bootstrap, no browser storage)', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('returns 401 without a session', async () => {
    const res = await sessionRoute(new NextRequest('http://localhost:3000/api/auth/session'));
    expect(res.status).toBe(401);
  });

  it('returns the CSRF token for the cookie session', async () => {
    const user = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `sess_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const created = await createSession({
      userId: user.id,
      customerId: null,
      role: 'ADMIN',
      status: 'APPROVED',
      email: user.email,
    });
    const res = await sessionRoute(
      new NextRequest('http://localhost:3000/api/auth/session', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${created.token}` },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.csrfToken).toBe(created.csrfToken);
    expect(json.user.role).toBe('ADMIN');
  });
});
