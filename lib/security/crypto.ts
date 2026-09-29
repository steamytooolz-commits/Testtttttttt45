import 'server-only';
import { hash, verify } from '@node-rs/argon2';
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const DEFAULT_CRYPTO_SECRET = 'stationery_depot_default_secure_secret_key_32_bytes!';

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || DEFAULT_CRYPTO_SECRET;
  return crypto.createHash('sha256').update(secret).digest();
}

 export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

 export async function verifyPassword(hashVal: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashVal, plain);
  } catch {
    return false;
  }
}

 export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

 export function decryptSecret(cipherText: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

 export function computeSha256(data: unknown): string {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
