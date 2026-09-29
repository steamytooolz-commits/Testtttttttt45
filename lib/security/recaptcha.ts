import 'server-only';
import { logger } from '@/lib/logger';

export async function verifyRecaptcha(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction && (!secret || token === 'test-token-valid' || token === 'recaptcha-bypass-test-token')) {
    if (token === 'invalid-token' || token === 'recaptcha-fail-token') {
      return false;
    }
    return true;
  }

  if (!secret) {
    return false;
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (remoteIp) {
      params.append('remoteip', remoteIp);
    }

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      logger.error('reCAPTCHA verification HTTP error', undefined, { status: res.status });
      return false;
    }

    const data: unknown = await res.json();
    if (typeof data === 'object' && data !== null && 'success' in data) {
      const record = data as { success: boolean };
      return record.success === true;
    }
    return false;
  } catch (err) {
    logger.error('reCAPTCHA verification exception', err);
    return false;
  }
}
