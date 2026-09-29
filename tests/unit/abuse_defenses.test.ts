import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueCaptchaChallenge,
  verifyCaptcha,
  getPowDifficulty,
  recordAuthAbuse,
  CAPTCHA_DIFFICULTY_PREFIX,
  CAPTCHA_HIGH_DIFFICULTY,
} from '@/lib/security/captcha';
import { checkDailyQuota, getRedisClient } from '@/lib/repo/redis';
import { tarpit } from '@/lib/security/request';
import { RegistrationSchema } from '@/lib/validation';
import { sniffImageExtension } from '@/app/api/admin/catalog/image/route';

describe('Adaptive PoW difficulty under abuse', () => {
  beforeEach(async () => {
    await getRedisClient().flushall();
  });

  it('issues base difficulty normally and escalates after sustained abuse', async () => {
    expect(await getPowDifficulty()).toBe(CAPTCHA_DIFFICULTY_PREFIX);
    const calm = await issueCaptchaChallenge();
    expect(calm.difficulty).toBe(CAPTCHA_DIFFICULTY_PREFIX);

    for (let i = 0; i < 30; i++) {
      await recordAuthAbuse();
    }
    expect(await getPowDifficulty()).toBe(CAPTCHA_HIGH_DIFFICULTY);
    const heated = await issueCaptchaChallenge();
    expect(heated.difficulty).toBe(CAPTCHA_HIGH_DIFFICULTY);
  });

  it('still verifies solutions issued at either difficulty', async () => {
    const crypto = await import('node:crypto');
    const issued = await issueCaptchaChallenge();
    let found = '';
    for (let i = 0; i < 500000; i++) {
      const hash = crypto.createHash('sha256').update(`${issued.nonce}:${i}`).digest('hex');
      if (hash.startsWith(issued.difficulty)) {
        found = String(i);
        break;
      }
    }
    expect(found).not.toBe('');
    expect(await verifyCaptcha({ nonce: issued.nonce, solution: found, honeypot: '' })).toBe(true);
  });
});

describe('Registration disposable-email blocklist', () => {
  function baseEmail(email: string) {
    return {
      company_name: 'Spam Test Co',
      contact_name: 'Spammer',
      email,
      phone: '+27115550101',
      address: { street: '1 Spam Rd', city: 'Cape Town', province: 'WC', postal_code: '8001' },
      password: 'SpamPass123!x',
      recaptcha_token: 'test-token-valid',
    };
  }

  it('rejects known disposable domains', () => {
    for (const domain of ['mailinator.com', 'tempmail.com', 'yopmail.com', '10minutemail.com', 'guerrillamail.com']) {
      const parsed = RegistrationSchema.safeParse(baseEmail(`bot@${domain}`));
      expect(parsed.success).toBe(false);
    }
  });

  it('accepts genuine company emails', () => {
    expect(RegistrationSchema.safeParse(baseEmail('buyer@acme.co.za')).success).toBe(true);
    expect(RegistrationSchema.safeParse(baseEmail('orders@durbanschools.co.za')).success).toBe(true);
  });
});

describe('Daily abuse quotas on expensive endpoints', () => {
  it('allows up to the limit then denies with remaining at zero', async () => {
    const userId = 9001;
    for (let i = 0; i < 3; i++) {
      const result = await checkDailyQuota('test-scope', userId, 3);
      expect(result.allowed).toBe(true);
    }
    const denied = await checkDailyQuota('test-scope', userId, 3);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('isolates quotas per user and scope', async () => {
    expect((await checkDailyQuota('a', 1, 1)).allowed).toBe(true);
    expect((await checkDailyQuota('a', 1, 1)).allowed).toBe(false);
    expect((await checkDailyQuota('a', 2, 1)).allowed).toBe(true);
    expect((await checkDailyQuota('b', 1, 1)).allowed).toBe(true);
  });
});

describe('Image upload magic-byte sniffing', () => {
  it('accepts real PNG, JPEG, GIF and WebP headers', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(sniffImageExtension(png)).toBe('image/png');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(sniffImageExtension(jpeg)).toBe('image/jpeg');
    const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.from([0x01])]);
    expect(sniffImageExtension(gif)).toBe('image/gif');
    const webp = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'ascii')]);
    expect(sniffImageExtension(webp)).toBe('image/webp');
  });

  it('rejects scripts masquerading as images', () => {
    expect(sniffImageExtension(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniffImageExtension(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull();
    expect(sniffImageExtension(Buffer.alloc(0))).toBeNull();
  });
});

describe('Tarpit helper', () => {
  it('resolves after a delay without throwing', async () => {
    const start = Date.now();
    await tarpit(50, 50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
