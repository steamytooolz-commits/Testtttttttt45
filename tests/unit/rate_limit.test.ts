import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@/lib/repo/redis';

function uniqueScope(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

describe('Rate Limiting: Token Bucket Tests', () => {
  it('allows up to the limit then denies', async () => {
    const scope = uniqueScope('bucket');
    for (let i = 0; i < 3; i += 1) {
      const result = await checkRateLimit(scope, '127.0.0.1', 3, 900);
      expect(result.allowed).toBe(true);
    }
    const denied = await checkRateLimit(scope, '127.0.0.1', 3, 900);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('tracks buckets independently per identifier', async () => {
    const scope = uniqueScope('isolated');
    for (let i = 0; i < 2; i += 1) {
      await checkRateLimit(scope, '10.0.0.1', 2, 900);
    }
    expect((await checkRateLimit(scope, '10.0.0.1', 2, 900)).allowed).toBe(false);
    expect((await checkRateLimit(scope, '10.0.0.2', 2, 900)).allowed).toBe(true);
  });

  it('tracks IP and account buckets independently', async () => {
    const scope = uniqueScope('dual');
    for (let i = 0; i < 2; i += 1) {
      await checkRateLimit(scope, '10.0.0.9', 2, 900);
    }
    expect((await checkRateLimit(scope, '10.0.0.9', 2, 900)).allowed).toBe(false);
    expect((await checkRateLimit(scope, 'account-77', 2, 900)).allowed).toBe(true);
  });

  it('refills tokens over time', async () => {
    const scope = uniqueScope('refill');
    await checkRateLimit(scope, '127.0.0.1', 1, 1);
    expect((await checkRateLimit(scope, '127.0.0.1', 1, 1)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await checkRateLimit(scope, '127.0.0.1', 1, 1)).allowed).toBe(true);
  });
});
