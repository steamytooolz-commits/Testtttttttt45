import 'server-only';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { storeSession, getSession, touchSession, revokeSession, type StoredSession } from '@/lib/repo/redis';
import { findUserById } from '@/lib/repo/mysql';
import type { UserRole, UserStatus } from '@/lib/repo/mysql/types';

export const SESSION_COOKIE_NAME = 'sd_session';
const DEFAULT_SECRET = 'stationery_depot_production_secret_key_minimum_32_bytes_long!';

function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || DEFAULT_SECRET;
  return new TextEncoder().encode(secret);
}

export interface SessionPayload extends JWTPayload {
  jti: string;
  userId: number;
  customerId: number | null;
  customerPublicId: string | null;
  role: UserRole;
  status: UserStatus;
  email: string;
  csrfToken: string;
}

export interface ChallengePayload extends JWTPayload {
  sub: string;
  userId: number;
  email: string;
  type: '2FA_CHALLENGE';
}

 export async function createSession(params: {
  userId: number;
  customerId: number | null;
  customerPublicId?: string | null;
  role: UserRole;
  status: UserStatus;
  email: string;
}): Promise<{ token: string; csrfToken: string; jti: string }> {
  const jti = crypto.randomUUID();
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  const storedSession: StoredSession = {
    userId: params.userId,
    customerId: params.customerId,
    customerPublicId: params.customerPublicId ?? null,
    email: params.email,
    role: params.role,
    status: params.status,
    csrfToken,
    createdAt: now,
  };

  await storeSession(jti, storedSession);

  const secretKey = getJwtSecret();
  const token = await new SignJWT({
    userId: params.userId,
    customerId: params.customerId,
    customerPublicId: params.customerPublicId ?? null,
    role: params.role,
    status: params.status,
    email: params.email,
    csrfToken,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secretKey);

  return { token, csrfToken, jti };
}

export async function authenticateSession(token: string): Promise<StoredSession | null> {
  if (!token || typeof token !== 'string') return null;

  try {
    const secretKey = getJwtSecret();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    const jti = payload.jti as string | undefined;

    let stored: StoredSession | null = null;
    if (jti) {
      stored = await getSession(jti);
    }

    const userId = Number(payload.userId);
    if (isNaN(userId)) return null;

    const user = await findUserById(userId);
    if (!user || user.status === 'SUSPENDED') {
      return null;
    }

    if (!stored) {
      stored = {
        userId,
        customerId: payload.customerId ? Number(payload.customerId) : null,
        customerPublicId: (payload.customerPublicId as string) || null,
        email: String(payload.email || user.email),
        role: user.role,
        status: user.status,
        csrfToken: (payload.csrfToken as string) || 'csrf-token',
        createdAt: typeof payload.iat === 'number' ? payload.iat * 1000 : Date.now(),
      };
      if (jti) {
        await storeSession(jti, stored);
      }
    } else {
      stored.status = user.status;
      stored.role = user.role;
      if (jti) {
        await touchSession(jti);
      }
    }

    return stored;
  } catch {
    return null;
  }
}

export async function destroySession(token: string): Promise<void> {
  try {
    const secretKey = getJwtSecret();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    if (payload.jti) {
      await revokeSession(payload.jti);
    }
  } catch {

  }
}

export function verifyCsrf(session: StoredSession, headerCsrfToken: string | null): boolean {
  if (!headerCsrfToken) {
    return false;
  }
  return session.csrfToken === headerCsrfToken.trim();
}

export async function create2FaChallengeToken(userId: number, email: string): Promise<string> {
  const secretKey = getJwtSecret();
  return new SignJWT({
    userId,
    email,
    type: '2FA_CHALLENGE',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secretKey);
}

export async function verify2FaChallengeToken(
  token: string
): Promise<{ userId: number; email: string } | null> {
  try {
    const secretKey = getJwtSecret();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    if (payload.type !== '2FA_CHALLENGE') {
      return null;
    }
    const userId = Number(payload.userId);
    const email = String(payload.email);
    if (isNaN(userId) || !email) {
      return null;
    }
    return { userId, email };
  } catch {
    return null;
  }
}

export async function createPasswordResetToken(userId: number, email: string): Promise<string> {
  const secretKey = getJwtSecret();
  return new SignJWT({
    userId,
    email,
    type: 'PASSWORD_RESET_CHALLENGE',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secretKey);
}

export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: number; email: string } | null> {
  try {
    const secretKey = getJwtSecret();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    if (payload.type !== 'PASSWORD_RESET_CHALLENGE') {
      return null;
    }
    const userId = Number(payload.userId);
    const email = String(payload.email);
    if (isNaN(userId) || !email) {
      return null;
    }
    return { userId, email };
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(
  req: Request | { cookies: { get(name: string): { value: string } | undefined }; headers: Headers }
): Promise<StoredSession | null> {
  let token: string | undefined;

  if (req && 'cookies' in req && typeof req.cookies === 'object' && typeof req.cookies.get === 'function') {
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  } else if (req && req.headers) {
    const cookieHeader = req.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match) token = decodeURIComponent(match[1]);
    }
  } else {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // safe fallback
    }
  }

  if (!token) {
    return null;
  }

  return authenticateSession(token);
}

