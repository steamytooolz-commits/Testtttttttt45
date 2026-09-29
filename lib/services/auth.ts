import 'server-only';
import {
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
  computeSha256,
  generateTotpSecret,
  verifyTotp,
  verifyCaptcha,
  recordAuthAbuse,
  createSession,
  authenticateSession,
  destroySession,
  create2FaChallengeToken,
  verify2FaChallengeToken,
  createPasswordResetToken,
  verifyPasswordResetToken,
} from '@/lib/security';
import {
  findUserByEmail,
  findUserById,
  findCustomerById,
  createCustomerAndUser,
  createStaffUser,
  recordLoginFailure,
  recordLoginSuccess,
  createAuditLog,
  setPwdResetRequired,
  updateUserPassword,
  updateUserTotpSecret,
  createPasswordResetRequest,
  findPasswordResetRequestById,
  findPendingPasswordResetRequestByEmail,
  listPasswordResetRequests,
  resolvePasswordResetRequest,
  type PasswordResetRequestRow,
  type UserRow,
  type UserRole,
  type UserStatus,
} from '@/lib/repo/mysql';
import { checkRateLimit, getRedisClient, revokeAllUserSessions } from '@/lib/repo/redis';
import { tarpit } from '@/lib/security/request';
import { sendMail, salesTeamEmails } from './mailer';
import type { RegistrationInput, LoginInput, TwoFactorInput, ChangePasswordInput, ForgotPasswordInput } from '@/lib/validation';
import crypto from 'node:crypto';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export interface AuthSessionUser {
  id: number;
  email: string;
  role: UserRole;
  status: UserStatus;
  customerId: number | null;
}

export interface RegisterResult {
  userId: number;
  customerId: number;
  status: UserStatus;
  isNewProspect: boolean;
  totpSecret: string;
  totpUri: string;
}

export interface LoginChallengeResult {
  requires2Fa: true;
  challenge_token: string;
  email: string;
}

export interface PasswordResetRequiredResult {
  requiresPasswordReset: true;
  password_reset_token: string;
  email: string;
}

export interface LoginSuccessResult {
  token: string;
  csrfToken: string;
  user: AuthSessionUser;
}

export class AuthService {
 
  static async register(input: RegistrationInput, clientIp: string): Promise<RegisterResult> {

    const rateLimit = await checkRateLimit('register', clientIp, 5, 3600);
    if (!rateLimit.allowed) {
      await recordAuthAbuse();
      throw new Error('Too many registration attempts. Please try again later.');
    }

    const accountRateLimit = await checkRateLimit('register', `account-${input.email}`, 3, 3600);
    if (!accountRateLimit.allowed) {
      await recordAuthAbuse();
      throw new Error('Too many registration attempts. Please try again later.');
    }

    const captchaOk = await verifyCaptcha({
      nonce: input.captcha_nonce,
      solution: input.captcha_solution,
      honeypot: input.website,
      recaptchaToken: input.recaptcha_token,
    });
    if (!captchaOk) {
      await recordAuthAbuse();
      await tarpit();
      throw new Error('Captcha verification failed. Please try again.');
    }

    const existing = await findUserByEmail(input.email);
    if (existing) {
      throw new Error('An account with this email address already exists.');
    }

    const passwordHash = await hashPassword(input.password);

    const totp = generateTotpSecret(input.email);
    const totpEncrypted = encryptSecret(totp.secret);
    const isExistingClient = input.is_existing_client ?? true;

    const { customer, user } = await createCustomerAndUser(
      {
        company_name: input.company_name,
        contact_name: input.contact_name,
        email: input.email,
        phone: input.phone,
        address_json: JSON.stringify(input.address),
        is_new_prospect: !isExistingClient,
      },
      {
        password_hash: passwordHash,
        totp_secret_encrypted: totpEncrypted,
      }
    );

    await createAuditLog({
      actor_id: user.id,
      actor_role: user.role,
      action: isExistingClient ? 'REGISTRATION' : 'PROSPECT_REGISTERED',
      entity_type: 'USER',
      entity_id: String(user.id),
      before_hash: null,
      after_hash: computeSha256({ email: user.email, status: user.status }),
      ip: clientIp,
    });

    return {
      userId: user.id,
      customerId: customer.id,
      status: user.status,
      isNewProspect: !isExistingClient,
      totpSecret: totp.secret,
      totpUri: totp.uri,
    };
  }

   static async initiateLogin(input: LoginInput, clientIp: string): Promise<LoginChallengeResult | PasswordResetRequiredResult> {

    const user = await findUserByEmail(input.email);
    if (user && user.locked_until) {
      const lockTime = new Date(user.locked_until).getTime();
      if (Date.now() < lockTime) {
        throw new Error('Account temporarily locked due to excessive failed attempts. Try again later.');
      }
    }

    const ipRateLimit = await checkRateLimit('login', clientIp, 20, 900);
    if (!ipRateLimit.allowed) {
      await recordAuthAbuse();
      throw new Error('Too many login attempts. Please try again in 15 minutes.');
    }
    const accountRateLimit = await checkRateLimit('login', `account-${input.email}`, 20, 900);
    if (!accountRateLimit.allowed) {
      await recordAuthAbuse();
      throw new Error('Too many login attempts. Please try again in 15 minutes.');
    }

    const captchaOk = await verifyCaptcha({
      nonce: input.captcha_nonce,
      solution: input.captcha_solution,
      honeypot: input.website,
      recaptchaToken: input.recaptcha_token,
    });
    if (!captchaOk) {
      await recordAuthAbuse();
      await tarpit();
      throw new Error('Captcha verification failed.');
    }

    if (!user) {
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password);
      await createAuditLog({
        actor_id: null,
        actor_role: null,
        action: 'LOGIN_FAILURE',
        entity_type: 'AUTH',
        entity_id: input.email,
        before_hash: null,
        after_hash: null,
        ip: clientIp,
      });
      throw new Error('Invalid email or password.');
    }

    if (user.status === 'SUSPENDED') {
      throw new Error('This account has been suspended. Please contact support.');
    }

    const passwordMatch = await verifyPassword(user.password_hash, input.password);
    if (!passwordMatch) {
      const nextFailCount = user.failed_login_count + 1;
      let lockedUntil: string | null = null;
      if (nextFailCount >= 5) {

        lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      await recordLoginFailure(user.id, nextFailCount, lockedUntil);
      await createAuditLog({
        actor_id: user.id,
        actor_role: user.role,
        action: 'LOGIN_FAILURE',
        entity_type: 'USER',
        entity_id: String(user.id),
        before_hash: null,
        after_hash: null,
        ip: clientIp,
      });
      throw new Error('Invalid email or password.');
    }

    if (user.pwd_reset_required) {
      const passwordResetToken = await createPasswordResetToken(user.id, user.email);
      await createAuditLog({
        actor_id: user.id,
        actor_role: user.role,
        action: 'PASSWORD_RESET_REQUIRED',
        entity_type: 'USER',
        entity_id: String(user.id),
        before_hash: null,
        after_hash: null,
        ip: clientIp,
      });
      return {
        requiresPasswordReset: true as const,
        password_reset_token: passwordResetToken,
        email: user.email,
      };
    }

    const challengeToken = await create2FaChallengeToken(user.id, user.email);

    await createAuditLog({
      actor_id: user.id,
      actor_role: user.role,
      action: '2FA_CHALLENGE',
      entity_type: 'USER',
      entity_id: String(user.id),
      before_hash: null,
      after_hash: null,
      ip: clientIp,
    });

    return {
      requires2Fa: true,
      challenge_token: challengeToken,
      email: user.email,
    };
  }

   static async verify2Fa(input: TwoFactorInput, clientIp: string): Promise<LoginSuccessResult> {

    const rateLimit = await checkRateLimit('2fa', clientIp, 5, 900);
    if (!rateLimit.allowed) {
      await recordAuthAbuse();
      throw new Error('Too many 2FA attempts. Please try again in 15 minutes.');
    }

    const challenge = await verify2FaChallengeToken(input.challenge_token);
    if (!challenge) {
      throw new Error('Invalid or expired 2FA challenge. Please log in again.');
    }

    const user = await findUserById(challenge.userId);
    if (!user || user.status === 'SUSPENDED') {
      throw new Error('Account not found or suspended.');
    }

    const accountRateLimit = await checkRateLimit('2fa', `account-${user.id}`, 5, 900);
    if (!accountRateLimit.allowed) {
      await recordAuthAbuse();
      throw new Error('Too many 2FA attempts. Please try again in 15 minutes.');
    }

    let plainSecret = '';
    try {
      plainSecret = decryptSecret(user.totp_secret_encrypted);
    } catch {
      throw new Error('Unable to decrypt two-factor authentication secret.');
    }

    const redis = getRedisClient();
    const usedCodeKey = `totp-used:${user.id}:${input.totp_code.trim()}`;
    if (await redis.get(usedCodeKey)) {
      throw new Error('Invalid two-factor authentication code.');
    }
    const totpValid = verifyTotp(input.totp_code, plainSecret);
    if (!totpValid) {
      await recordAuthAbuse();
      await createAuditLog({
        actor_id: user.id,
        actor_role: user.role,
        action: '2FA_FAILURE',
        entity_type: 'USER',
        entity_id: String(user.id),
        before_hash: null,
        after_hash: null,
        ip: clientIp,
      });
      throw new Error('Invalid two-factor authentication code.');
    }

    await redis.set(usedCodeKey, '1', 'EX', 90);
    await recordLoginSuccess(user.id);

    let customerPublicId: string | null = null;
    if (user.customer_id !== null) {
      const customer = await findCustomerById(user.customer_id);
      customerPublicId = customer?.public_id || null;
    }

    const { token, csrfToken } = await createSession({
      userId: user.id,
      customerId: user.customer_id,
      customerPublicId,
      role: user.role,
      status: user.status,
      email: user.email,
    });

    await createAuditLog({
      actor_id: user.id,
      actor_role: user.role,
      action: 'LOGIN_SUCCESS',
      entity_type: 'USER',
      entity_id: String(user.id),
      before_hash: null,
      after_hash: null,
      ip: clientIp,
    });

    return {
      token,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        customerId: user.customer_id,
      },
    };
  }

   static async logout(token: string, clientIp: string): Promise<void> {
    try {
      const session = await authenticateSession(token);
      if (session) {
        await createAuditLog({
          actor_id: session.userId,
          actor_role: session.role,
          action: 'LOGOUT',
          entity_type: 'USER',
          entity_id: String(session.userId),
          before_hash: null,
          after_hash: null,
          ip: clientIp,
        });
      }
    } catch {
    }
    await destroySession(token);
  }

  static async changePassword(userId: number, input: ChangePasswordInput, clientIp: string): Promise<void> {
    const user = await findUserById(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND: Account not found');
    }
    const ok = await verifyPassword(user.password_hash, input.current_password);
    if (!ok) {
      throw new Error('Invalid current password.');
    }
    const newHash = await hashPassword(input.new_password);
    await updateUserPassword(userId, newHash);
    await revokeAllUserSessions(userId);
    await createAuditLog({
      actor_id: userId,
      actor_role: user.role,
      action: 'PASSWORD_CHANGED',
      entity_type: 'USER',
      entity_id: String(userId),
      before_hash: null,
      after_hash: computeSha256({ userId }),
      ip: clientIp,
    });
  }

  static async changePasswordWithResetToken(
    resetToken: string,
    currentPassword: string,
    newPassword: string,
    clientIp: string
  ): Promise<void> {
    const challenge = await verifyPasswordResetToken(resetToken);
    if (!challenge) {
      throw new Error('Invalid or expired password reset token. Please sign in again to get a new one.');
    }
    const user = await findUserById(challenge.userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND: Account not found');
    }
    if (!user.pwd_reset_required) {
      throw new Error('PASSWORD_RESET_NOT_REQUIRED: Your password is already up to date. Please sign in normally.');
    }
    const ok = await verifyPassword(user.password_hash, currentPassword);
    if (!ok) {
      throw new Error('Invalid current password.');
    }
    const newHash = await hashPassword(newPassword);
    await updateUserPassword(user.id, newHash);
    await revokeAllUserSessions(user.id);
    await createAuditLog({
      actor_id: user.id,
      actor_role: user.role,
      action: 'PASSWORD_CHANGED',
      entity_type: 'USER',
      entity_id: String(user.id),
      before_hash: null,
      after_hash: computeSha256({ userId: user.id }),
      ip: clientIp,
    });
  }

  static generateTempPassword(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%^&*';
    const all = upper + lower + digits + special;
    const pick = (chars: string): string => chars[crypto.randomInt(chars.length)];
    let pwd = pick(upper) + pick(lower) + pick(digits) + pick(special);
    for (let i = 0; i < 12; i++) {
      pwd += pick(all);
    }
    return pwd
      .split('')
      .sort(() => crypto.randomInt(3) - 1)
      .join('');
  }

  static async adminResetPassword(adminId: number, adminRole: UserRole, targetUserId: number, clientIp: string): Promise<{ tempPassword: string; email: string }> {
    if (adminRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only administrators can reset passwords');
    }
    const target = await findUserById(targetUserId);
    if (!target) {
      throw new Error(`USER_NOT_FOUND: User #${targetUserId} does not exist`);
    }
    const tempPassword = AuthService.generateTempPassword();
    const hash = await hashPassword(tempPassword);
    await updateUserPassword(targetUserId, hash);
    await setPwdResetRequired(targetUserId, true);
    await revokeAllUserSessions(targetUserId);
    await createAuditLog({
      actor_id: adminId,
      actor_role: adminRole,
      action: 'PASSWORD_RESET',
      entity_type: 'USER',
      entity_id: String(targetUserId),
      before_hash: null,
      after_hash: computeSha256({ targetUserId }),
      ip: clientIp,
    });
    return { tempPassword, email: target.email };
  }

  static buildTempPasswordEmail(email: string, tempPassword: string): { subject: string; text: string } {
    const subject = 'Your new Stationery Depot password';
    const text = [
      `Hi,`,
      ``,
      `An administrator has issued a new temporary password for your Stationery Depot trade account (${email}).`,
      ``,
      `Your new temporary password is:`,
      ``,
      `  ${tempPassword}`,
      ``,
      `What to do next:`,
      `1. Sign in at the trade portal with your email and this temporary password.`,
      `2. You will be taken straight to the change-password screen — enter this temporary password and choose a new one.`,
      `3. Sign in again with your new password plus your authenticator app code as usual.`,
      ``,
      `If you did not request this, contact our sales team straight away. Never share this password with anyone.`,
      ``,
      `Stationery Depot (Pty) Ltd`,
    ].join('\n');
    return { subject, text };
  }

  static async requestPasswordReset(input: ForgotPasswordInput, clientIp: string): Promise<void> {
    const ipRateLimit = await checkRateLimit('forgot_password', clientIp, 5, 3600);
    if (!ipRateLimit.allowed) {
      await recordAuthAbuse();
      throw new Error('Too many reset requests. Please try again later.');
    }
    const accountRateLimit = await checkRateLimit('forgot_password', `account-${input.email}`, 3, 3600);
    if (!accountRateLimit.allowed) {
      await recordAuthAbuse();
      throw new Error('Too many reset requests. Please try again later.');
    }

    const captchaOk = await verifyCaptcha({
      nonce: input.captcha_nonce,
      solution: input.captcha_solution,
      honeypot: input.website,
      recaptchaToken: input.recaptcha_token,
    });
    if (!captchaOk) {
      await recordAuthAbuse();
      await tarpit();
      throw new Error('Captcha verification failed. Please try again.');
    }

    const user = await findUserByEmail(input.email);
    if (!user) {
      return;
    }

    const existing = await findPendingPasswordResetRequestByEmail(user.email);
    if (!existing) {
      await createPasswordResetRequest({ userId: user.id, email: user.email, ip: clientIp });
    }
    await createAuditLog({
      actor_id: null,
      actor_role: null,
      action: 'PASSWORD_RESET_REQUESTED',
      entity_type: 'USER',
      entity_id: String(user.id),
      before_hash: null,
      after_hash: null,
      ip: clientIp,
    });
    await sendMail({
      to: salesTeamEmails(),
      subject: `Password reset request — ${user.email}`,
      text: [
        `A password reset was requested for ${user.email} (user #${user.id}, role ${user.role}).`,
        ``,
        `Open Admin > Password resets to review the request and issue a new temporary password.`,
        `The user will receive the temporary password by email once you fulfil the request.`,
      ].join('\n'),
    });
  }

  static async fulfilPasswordResetRequest(
    adminId: number,
    adminRole: UserRole,
    requestId: number,
    clientIp: string
  ): Promise<{ tempPassword: string; email: string; emailSubject: string; emailText: string }> {
    if (adminRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only administrators can fulfil password reset requests');
    }
    const request = await findPasswordResetRequestById(requestId);
    if (!request) {
      throw new Error(`PASSWORD_RESET_REQUEST_NOT_FOUND: Request #${requestId} does not exist`);
    }
    if (request.status !== 'PENDING') {
      throw new Error(`PASSWORD_RESET_REQUEST_RESOLVED: Request #${requestId} is already ${request.status.toLowerCase()}`);
    }
    const target = request.user_id !== null ? await findUserById(request.user_id) : await findUserByEmail(request.email);
    if (!target) {
      await resolvePasswordResetRequest(requestId, 'DISMISSED', adminId);
      throw new Error('USER_NOT_FOUND: The account for this request no longer exists; the request was dismissed');
    }
    const { tempPassword } = await AuthService.adminResetPassword(adminId, adminRole, target.id, clientIp);
    await resolvePasswordResetRequest(requestId, 'FULFILLED', adminId);
    const { subject, text } = AuthService.buildTempPasswordEmail(target.email, tempPassword);
    await sendMail({ to: target.email, subject, text });
    await createAuditLog({
      actor_id: adminId,
      actor_role: adminRole,
      action: 'PASSWORD_RESET_FULFILLED',
      entity_type: 'USER',
      entity_id: String(target.id),
      before_hash: null,
      after_hash: computeSha256({ targetUserId: target.id }),
      ip: clientIp,
    });
    return { tempPassword, email: target.email, emailSubject: subject, emailText: text };
  }

  static async dismissPasswordResetRequest(
    adminId: number,
    adminRole: UserRole,
    requestId: number,
    clientIp: string
  ): Promise<void> {
    if (adminRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only administrators can dismiss password reset requests');
    }
    const request = await findPasswordResetRequestById(requestId);
    if (!request) {
      throw new Error(`PASSWORD_RESET_REQUEST_NOT_FOUND: Request #${requestId} does not exist`);
    }
    if (request.status !== 'PENDING') {
      throw new Error(`PASSWORD_RESET_REQUEST_RESOLVED: Request #${requestId} is already ${request.status.toLowerCase()}`);
    }
    await resolvePasswordResetRequest(requestId, 'DISMISSED', adminId);
    await createAuditLog({
      actor_id: adminId,
      actor_role: adminRole,
      action: 'PASSWORD_RESET_DISMISSED',
      entity_type: 'PASSWORD_RESET_REQUEST',
      entity_id: String(requestId),
      before_hash: null,
      after_hash: null,
      ip: clientIp,
    });
  }

  static async adminResetPasswordByEmail(
    adminId: number,
    adminRole: UserRole,
    email: string,
    clientIp: string
  ): Promise<{ tempPassword: string; email: string; emailSubject: string; emailText: string }> {
    if (adminRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only administrators can reset passwords');
    }
    const target = await findUserByEmail(email.trim().toLowerCase());
    if (!target) {
      throw new Error(`USER_NOT_FOUND: No account exists for ${email.trim().toLowerCase()}`);
    }
    const { tempPassword } = await AuthService.adminResetPassword(adminId, adminRole, target.id, clientIp);
    await createPasswordResetRequest({ userId: target.id, email: target.email, ip: clientIp });
    const pending = await findPendingPasswordResetRequestByEmail(target.email);
    if (pending) {
      await resolvePasswordResetRequest(pending.id, 'FULFILLED', adminId);
    }
    const { subject, text } = AuthService.buildTempPasswordEmail(target.email, tempPassword);
    await sendMail({ to: target.email, subject, text });
    return { tempPassword, email: target.email, emailSubject: subject, emailText: text };
  }

  static async listPasswordResetRequests(status: PasswordResetRequestRow['status'] | 'ALL' = 'PENDING'): Promise<PasswordResetRequestRow[]> {
    return listPasswordResetRequests(status);
  }

  static async adminReset2FA(adminId: number, adminRole: UserRole, targetUserId: number, clientIp: string): Promise<{ secret: string; uri: string }> {
    if (adminRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only administrators can reset 2FA');
    }
    const target = await findUserById(targetUserId);
    if (!target) {
      throw new Error(`USER_NOT_FOUND: User #${targetUserId} does not exist`);
    }
    const totp = generateTotpSecret(target.email);
    const encrypted = encryptSecret(totp.secret);
    await updateUserTotpSecret(targetUserId, encrypted);
    await revokeAllUserSessions(targetUserId);
    await createAuditLog({
      actor_id: adminId,
      actor_role: adminRole,
      action: '2FA_RESET',
      entity_type: 'USER',
      entity_id: String(targetUserId),
      before_hash: null,
      after_hash: computeSha256({ targetUserId }),
      ip: clientIp,
    });
    return { secret: totp.secret, uri: totp.uri };
  }

  static async createStaffAccount(
    adminId: number,
    adminRole: UserRole,
    input: { email: string; role: 'SALES_STAFF' | 'ADMIN' },
    clientIp: string
  ): Promise<{ userId: number; email: string; role: 'SALES_STAFF' | 'ADMIN'; tempPassword: string; totpSecret: string; totpUri: string }> {
    if (adminRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only administrators can create staff accounts');
    }
    const email = input.email.trim().toLowerCase();
    const existing = await findUserByEmail(email);
    if (existing) {
      throw new Error('An account with this email address already exists.');
    }
    const tempPassword = AuthService.generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const totp = generateTotpSecret(email);
    const user = await createStaffUser({
      email,
      role: input.role,
      passwordHash,
      totpSecretEncrypted: encryptSecret(totp.secret),
    });
    await createAuditLog({
      actor_id: adminId,
      actor_role: adminRole,
      action: 'STAFF_CREATED',
      entity_type: 'USER',
      entity_id: String(user.id),
      before_hash: null,
      after_hash: computeSha256({ email: user.email, role: user.role }),
      ip: clientIp,
    });
    return {
      userId: user.id,
      email: user.email,
      role: input.role,
      tempPassword,
      totpSecret: totp.secret,
      totpUri: totp.uri,
    };
  }
}
