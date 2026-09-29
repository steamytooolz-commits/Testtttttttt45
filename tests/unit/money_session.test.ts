import { describe, it, expect } from 'vitest';
import { parseCents, formatCents } from '@/lib/repo/mysql';
import { revokeAllUserSessions, storeSession, getSession } from '@/lib/repo/redis';
import { createSession } from '@/lib/security/session';
import { memoryDb } from '@/lib/repo/mysql/client';

describe('Money correctness', () => {
  it('rejects 3-decimal amounts instead of truncating', () => {
    expect(() => parseCents('10.999')).toThrow(/INVALID_AMOUNT/);
    expect(() => parseCents('abc')).toThrow(/INVALID_AMOUNT/);
  });
  it('round-trips valid DECIMAL strings', () => {
    expect(formatCents(parseCents('85.00'))).toBe('85.00');
    expect(formatCents(parseCents('0.05'))).toBe('0.05');
  });
  it('handles negatives safely', () => {
    expect(formatCents(BigInt(-105))).toBe('-1.05');
    expect(parseCents('-1.05')).toBe(BigInt(-105));
  });
  it('parses integer tier values as .00', async () => {
    expect(parseCents('72')).toBe(BigInt(7200));
  });
});

describe('Session invalidation', () => {
  it('revokes all user sessions immediately', async () => {
    memoryDb.resetDatabase();
    const user = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `sess_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const s1 = await createSession({ userId: user.id, customerId: null, role: 'ADMIN', status: 'APPROVED', email: user.email });
    const s2 = await createSession({ userId: user.id, customerId: null, role: 'ADMIN', status: 'APPROVED', email: user.email });
    expect(await getSession(s1.jti)).not.toBeNull();
    const revoked = await revokeAllUserSessions(user.id);
    expect(revoked).toBeGreaterThanOrEqual(2);
    expect(await getSession(s1.jti)).toBeNull();
    expect(await getSession(s2.jti)).toBeNull();
  });
  it('tracks sessions per-user in Redis sets', async () => {
    memoryDb.resetDatabase();
    const user = memoryDb.insertUser({
      customer_id: null,
      role: 'CUSTOMER',
      email: `track_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    await storeSession('test-jti-123', { userId: user.id, customerId: null, email: user.email, role: 'CUSTOMER', status: 'APPROVED', csrfToken: 'abc', createdAt: Date.now() });
    const fetched = await getSession('test-jti-123');
    expect(fetched?.userId).toBe(user.id);
  });
});
