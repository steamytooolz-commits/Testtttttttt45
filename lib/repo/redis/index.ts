import 'server-only';
import crypto from 'node:crypto';
import { getRedisClient } from './client';

export interface StoredSession {
  userId: number;
  customerId: number | null;
  customerPublicId?: string | null;
  email: string;
  role: 'CUSTOMER' | 'SALES_STAFF' | 'ADMIN';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED';
  csrfToken: string;
  createdAt: number;
}

const SESSION_TTL_SECONDS = 1800;

export async function storeSession(jti: string, session: StoredSession): Promise<void> {
  const redis = getRedisClient();
  const key = `session:${jti}`;
  await redis.set(key, JSON.stringify(session), 'EX', SESSION_TTL_SECONDS);
  await redis.sadd(`user_sessions:${session.userId}`, jti);
}

export async function getSession(jti: string): Promise<StoredSession | null> {
  const redis = getRedisClient();
  const key = `session:${jti}`;
  const data = await redis.get(key);
  if (!data) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'object' && parsed !== null && 'userId' in parsed && 'role' in parsed) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

export async function touchSession(jti: string): Promise<void> {
  const redis = getRedisClient();
  const key = `session:${jti}`;
  await redis.expire(key, SESSION_TTL_SECONDS);
}

export async function revokeSession(jti: string): Promise<void> {
  const redis = getRedisClient();
  const key = `session:${jti}`;
  const data = await redis.get(key);
  if (data) {
    try {
      const parsed = JSON.parse(data) as StoredSession;
      if (parsed && typeof parsed.userId === 'number') {
        await redis.srem(`user_sessions:${parsed.userId}`, jti);
      }
    } catch {
    }
  }
  await redis.del(key);
}

export async function revokeAllUserSessions(userId: number): Promise<number> {
  const redis = getRedisClient();
  const members = await redis.smembers(`user_sessions:${userId}`);
  let revoked = 0;
  for (const jti of members) {
    await redis.del(`session:${jti}`);
    revoked += 1;
  }
  await redis.del(`user_sessions:${userId}`);
  return revoked;
}

export interface DailyQuotaResult {
  allowed: boolean;
  remaining: number;
}

export async function checkDailyQuota(scope: string, userId: number, limit: number): Promise<DailyQuotaResult> {
  const redis = getRedisClient();
  const day = new Date().toISOString().slice(0, 10);
  const key = `quota:${scope}:${userId}:${day}`;
  const count = await redis.incr(key);
  if (count === 1) {
    const now = new Date();
    const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    await redis.expire(key, Math.max(60, Math.ceil((midnightUtc - now.getTime()) / 1000)));
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
}

 export async function checkRateLimit(
  scope: 'login' | 'register' | '2fa' | 'checkout' | 'export' | 'orders' | 'orders_list' | 'order_detail' | 'order_repeat' | 'invoices' | 'invoices_list' | 'staff_queue' | (string & {}),
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const sanitizedIdentifier = identifier.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const key = `rl:${scope}:${sanitizedIdentifier}`;

  const nowSeconds = Date.now() / 1000;
  const refillPerSecond = limit / windowSeconds;

  let tokens = limit;
  let updatedAt = nowSeconds;
  const stored = await redis.get(key);
  if (stored) {
    const separator = stored.lastIndexOf(':');
    const storedTokens = Number(stored.slice(0, separator));
    const storedAt = Number(stored.slice(separator + 1));
    if (Number.isFinite(storedTokens) && Number.isFinite(storedAt)) {
      tokens = storedTokens;
      updatedAt = storedAt;
    }
  }

  const elapsed = Math.max(0, nowSeconds - updatedAt);
  tokens = Math.min(limit, tokens + elapsed * refillPerSecond);

  let allowed = false;
  if (tokens >= 1) {
    tokens -= 1;
    allowed = true;
  }

  await redis.set(key, `${tokens}:${nowSeconds}`, 'EX', Math.max(1, Math.ceil(windowSeconds * 2)));

  const remaining = Math.max(0, Math.floor(tokens));
  return {
    allowed,
    count: limit - remaining,
    remaining,
  };
}

export const CATALOG_CACHE_TTL_SECONDS = 60;
const CATALOG_CACHE_VERSION_KEY = 'cache:catalog:version';

export async function getCatalogCacheVersion(): Promise<number> {
  const redis = getRedisClient();
  const raw = await redis.get(CATALOG_CACHE_VERSION_KEY);
  const version = raw ? Number(raw) : 1;
  return Number.isInteger(version) && version > 0 ? version : 1;
}

export async function invalidateCatalogCache(): Promise<number> {
  const redis = getRedisClient();
  const next = await redis.incr(CATALOG_CACHE_VERSION_KEY);
  return next;
}

export function computeFilterHash(filter: Record<string, unknown>): string {
  const sortedKeys = Object.keys(filter).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    if (filter[key] !== undefined && filter[key] !== null && filter[key] !== '') {
      normalized[key] = filter[key];
    }
  }
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export async function getCachedCatalog(filterHash: string): Promise<string | null> {
  const redis = getRedisClient();
  const version = await getCatalogCacheVersion();
  const key = `cache:catalog:v${version}:${filterHash}`;
  return await redis.get(key);
}

export async function setCachedCatalog(filterHash: string, dataJson: string): Promise<void> {
  const redis = getRedisClient();
  const version = await getCatalogCacheVersion();
  const key = `cache:catalog:v${version}:${filterHash}`;
  await redis.set(key, dataJson, 'EX', CATALOG_CACHE_TTL_SECONDS);
}

export const CART_TTL_SECONDS = 7 * 24 * 3600;

export interface CartLineItem {
  sku: string;
  description: string;
  qty: number;
  unit_price: string;
  tier_code: string;
  vat_rate: string;
  line_total: string;
}

export interface CartData {
  customerId: number;
  items: CartLineItem[];
  subtotal: string;
  vat: string;
  total: string;
  updatedAt: string;
}

export async function getCart(customerId: number): Promise<CartData | null> {
  const redis = getRedisClient();
  const key = `cart:${customerId}`;
  const data = await redis.get(key);
  if (!data) {
    return null;
  }
  try {
    const parsed = JSON.parse(data) as CartData;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCart(customerId: number, cart: CartData): Promise<void> {
  const redis = getRedisClient();
  const key = `cart:${customerId}`;
  await redis.set(key, JSON.stringify(cart), 'EX', CART_TTL_SECONDS);
}

export async function deleteCart(customerId: number): Promise<void> {
  const redis = getRedisClient();
  const key = `cart:${customerId}`;
  await redis.del(key);
}

export const STOCK_LOCK_TTL_SECONDS = 10;

export async function acquireStockLock(sku: string, ttlSeconds = STOCK_LOCK_TTL_SECONDS): Promise<string | null> {
  const redis = getRedisClient();
  const token = crypto.randomUUID();
  const key = `lock:stock:${sku}`;
  const res = await redis.set(key, token, 'NX', 'EX', ttlSeconds);
  if (res === 'OK') {
    return token;
  }
  return null;
}

export async function releaseStockLock(sku: string, token: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `lock:stock:${sku}`;
  const current = await redis.get(key);
  if (current === token) {
    await redis.del(key);
    return true;
  }
  return false;
}

export interface StaffNotificationPayload {
  orderId: number;
  orderNumber: string;
  customerId: number;
  total: string;
  createdAt: string;
}

export async function publishStaffNotification(notification: StaffNotificationPayload): Promise<string | null> {
  const redis = getRedisClient();
  return await redis.xadd(
    'queue:staff_notifications',
    '*',
    'order_id',
    String(notification.orderId),
    'order_number',
    notification.orderNumber,
    'customer_id',
    String(notification.customerId),
    'total',
    notification.total,
    'created_at',
    notification.createdAt
  );
}

export async function getRedisStreamEntries(
  stream: string
): Promise<Array<{ id: string; fields: Record<string, string> }>> {
  const redis = getRedisClient();
  if (typeof redis.getStreamEntries === 'function') {
    const raw = redis.getStreamEntries(stream);
    return raw.map((entry) => {
      const fieldMap: Record<string, string> = {};
      for (let i = 0; i < entry.fields.length; i += 2) {
        fieldMap[entry.fields[i]] = entry.fields[i + 1];
      }
      return { id: entry.id, fields: fieldMap };
    });
  }
  return [];
}

export { getRedisClient } from './client';

