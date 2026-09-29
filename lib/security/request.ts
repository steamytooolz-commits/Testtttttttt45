import 'server-only';
import { type NextRequest } from 'next/server';

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);
    const last = hops[hops.length - 1];
    if (last) {
      return last;
    }
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

export function publicErrorMessage(err: unknown, fallback: string): string {
  if (process.env.NODE_ENV === 'production') {
    return fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

export async function tarpit(baseMs = 2000, jitterMs = 2000): Promise<void> {
  const delay = baseMs + Math.floor(Math.random() * Math.max(0, jitterMs));
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export function rateLimitRetryHeaders(retryAfterSeconds: number): Record<string, string> {
  return {
    'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    'X-RateLimit-Limit': 'exceeded',
  };
}
