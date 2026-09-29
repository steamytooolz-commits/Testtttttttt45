import { describe, it } from 'vitest';
import assert from 'node:assert';
import { RegistrationSchema, TwoFactorSchema } from '@/lib/validation/index';
import { AuthService } from '@/lib/services/auth';
import { findUserByEmail, getAuditLogs, updateUserStatus } from '@/lib/repo/mysql/index';
import { generateTotpToken, decryptSecret } from '@/lib/security/index';

describe('Module 1: Auth and Gate Security & Validation', () => {
  it('1. Registration with weak password fails Zod schema', () => {
    const invalidData = {
      company_name: 'Test Paper Co',
      contact_name: 'John Doe',
      email: 'valid@example.com',
      phone: '+27 11 555 1234',
      address: {
        street: '123 Main St',
        city: 'Johannesburg',
        province: 'Gauteng',
        postal_code: '2000',
      },
      password: 'weak',
      recaptcha_token: 'test-token-valid',
    };

    const result = RegistrationSchema.safeParse(invalidData);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.some((i) => i.path.includes('password')));
    }
  });

  it('2. Registration with invalid phone fails Zod schema', () => {
    const invalidPhoneData = {
      company_name: 'Test Paper Co',
      contact_name: 'John Doe',
      email: 'valid@example.com',
      phone: 'not-a-phone-number',
      address: {
        street: '123 Main St',
        city: 'Johannesburg',
        province: 'Gauteng',
        postal_code: '2000',
      },
      password: 'StrongP@ssw0rd!2025',
      recaptcha_token: 'test-token-valid',
    };

    const result = RegistrationSchema.safeParse(invalidPhoneData);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.some((i) => i.path.includes('phone')));
    }
  });

  it('3. Login without TOTP code fails (requires 2FA challenge flow)', async () => {
    const invalidPayload = {
      challenge_token: '',
      totp_code: '',
    };
    const parseResult = TwoFactorSchema.safeParse(invalidPayload);
    assert.strictEqual(parseResult.success, false);
  });

  it('4. Login with invalid TOTP code fails', async () => {
    const email = 'user-2fa-test@stationerydepot.co.za';

    await AuthService.register(
      {
        company_name: 'Alpha Supplies',
        contact_name: 'Alpha Contact',
        email,
        phone: '+27 11 999 8888',
        address: {
          street: '10 Market Street',
          city: 'Durban',
          province: 'KwaZulu-Natal',
          postal_code: '4001',
        },
        password: 'ValidPassword123!',
        recaptcha_token: 'test-token-valid',
      },
      '192.168.1.50'
    );

    const loginResult = await AuthService.initiateLogin(
      {
        email,
        password: 'ValidPassword123!',
        recaptcha_token: 'test-token-valid',
      },
      '192.168.1.50'
    );

    assert.strictEqual((loginResult as { requires2Fa: boolean }).requires2Fa, true);
    assert.ok((loginResult as { challenge_token: string }).challenge_token);

    await assert.rejects(
      async () => {
        await AuthService.verify2Fa(
          {
            challenge_token: (loginResult as { challenge_token: string }).challenge_token,
            totp_code: '000000',
          },
          '192.168.1.50'
        );
      },
      {
        message: 'Invalid two-factor authentication code.',
      }
    );
  });

  it('5. Inactive / PENDING_APPROVAL customer cannot be authenticated if suspended, and has pending status', async () => {
    const email = 'pending-cust@stationerydepot.co.za';
    const reg = await AuthService.register(
      {
        company_name: 'Beta School Books',
        contact_name: 'Beta Contact',
        email,
        phone: '+27 21 555 4321',
        address: {
          street: '55 Cape Road',
          city: 'Cape Town',
          province: 'Western Cape',
          postal_code: '8001',
        },
        password: 'ValidPassword123!',
        recaptcha_token: 'test-token-valid',
      },
      '192.168.1.51'
    );

    assert.strictEqual(reg.status, 'PENDING_APPROVAL');

    const user = await findUserByEmail(email);
    assert.ok(user !== null);
    assert.strictEqual(user?.status, 'PENDING_APPROVAL');

    assert.ok(user !== null);
    await updateUserStatus(user.id, 'SUSPENDED');

    await assert.rejects(
      async () => {
        await AuthService.initiateLogin(
          {
            email,
            password: 'ValidPassword123!',
            recaptcha_token: 'test-token-valid',
          },
          '192.168.1.51'
        );
      },
      {
        message: 'This account has been suspended. Please contact support.',
      }
    );
  });

  it('6. 5 failed logins lock the account for the specified duration', async () => {
    const email = 'lockout-test@stationerydepot.co.za';
    await AuthService.register(
      {
        company_name: 'Lockout Test Ltd',
        contact_name: 'Lockout User',
        email,
        phone: '+27 12 555 7777',
        address: {
          street: '77 Church St',
          city: 'Pretoria',
          province: 'Gauteng',
          postal_code: '0002',
        },
        password: 'ValidPassword123!',
        recaptcha_token: 'test-token-valid',
      },
      '192.168.1.52'
    );

    for (let i = 1; i <= 5; i++) {
      try {
        await AuthService.initiateLogin(
          {
            email,
            password: 'WrongPassword123!',
            recaptcha_token: 'test-token-valid',
          },
          '192.168.1.52'
        );
      } catch {

      }
    }

    const lockedUser = await findUserByEmail(email);
    assert.strictEqual(lockedUser?.failed_login_count, 5);
    assert.ok(lockedUser?.locked_until !== null);

    await assert.rejects(
      async () => {
        await AuthService.initiateLogin(
          {
            email,
            password: 'ValidPassword123!',
            recaptcha_token: 'test-token-valid',
          },
          '192.168.1.52'
        );
      },
      {
        message: 'Account temporarily locked due to excessive failed attempts. Try again later.',
      }
    );
  });

  it('7. Audit log contains entries for register, failed login, successful login, logout', async () => {
    const email = 'audit-test@stationerydepot.co.za';
    await AuthService.register(
      {
        company_name: 'Audit Logging Corp',
        contact_name: 'Auditor User',
        email,
        phone: '+27 31 555 9999',
        address: {
          street: '99 Marine Drive',
          city: 'Durban',
          province: 'KwaZulu-Natal',
          postal_code: '4001',
        },
        password: 'ValidPassword123!',
        recaptcha_token: 'test-token-valid',
      },
      '192.168.1.53'
    );

    try {
      await AuthService.initiateLogin(
        {
          email,
          password: 'WrongPassword!',
          recaptcha_token: 'test-token-valid',
        },
        '192.168.1.53'
      );
    } catch {}

    const challenge = await AuthService.initiateLogin(
      {
        email,
        password: 'ValidPassword123!',
        recaptcha_token: 'test-token-valid',
      },
      '192.168.1.53'
    );

    const user = await findUserByEmail(email);
    assert.ok(user !== null);
    const plainSecret = decryptSecret(user.totp_secret_encrypted);
    const validCode = generateTotpToken(plainSecret);

    const sessionRes = await AuthService.verify2Fa(
      {
        challenge_token: (challenge as { challenge_token: string }).challenge_token,
        totp_code: validCode,
      },
      '192.168.1.53'
    );

    await AuthService.logout(sessionRes.token, '192.168.1.53');

    const logs = await getAuditLogs(50);
    const actions = logs.map((l) => l.action);

    assert.ok(actions.includes('REGISTRATION'));
    assert.ok(actions.includes('LOGIN_FAILURE'));
    assert.ok(actions.includes('2FA_CHALLENGE'));
    assert.ok(actions.includes('LOGIN_SUCCESS'));
    assert.ok(actions.includes('LOGOUT'));
  });
});
