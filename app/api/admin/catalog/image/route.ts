import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { createAuditLog } from '@/lib/repo/mysql';
import { computeSha256 } from '@/lib/security/crypto';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function sniffImageExtension(buffer: Buffer): string | null {
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const jpegMagic = [0xff, 0xd8, 0xff];
  const gif87 = 'GIF87a';
  const gif89 = 'GIF89a';
  const startsWith = (bytes: number[]): boolean =>
    buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);
  if (startsWith(pngMagic)) return 'image/png';
  if (startsWith(jpegMagic)) return 'image/jpeg';
  const head = buffer.subarray(0, 6).toString('ascii');
  if (head === gif87 || head === gif89) return 'image/gif';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function sanitizeSku(sku: string): string | null {
  const norm = sku.trim().toUpperCase();
  return /^[A-Za-z0-9_-]{3,64}$/.test(norm) ? norm : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 });
  }
  try {
    const formData = await req.formData();
    const skuRaw = formData.get('sku');
    const sku = typeof skuRaw === 'string' ? sanitizeSku(skuRaw) : null;
    if (!sku) {
      return NextResponse.json({ error: 'INVALID_SKU', message: 'A valid product SKU is required' }, { status: 400 });
    }
    const file = formData.get('file');
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return NextResponse.json({ error: 'NO_FILE', message: 'No image file uploaded' }, { status: 400 });
    }
    const blob = file as Blob & { type?: string };
    const ext = ALLOWED_EXTENSIONS[blob.type || ''];
    if (!ext) {
      return NextResponse.json({ error: 'INVALID_IMAGE', message: 'Only PNG, JPEG, WebP or GIF images are allowed' }, { status: 400 });
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: 'INVALID_IMAGE', message: 'Image must be between 1 byte and 3 MB' }, { status: 400 });
    }
    const sniffed = sniffImageExtension(buffer);
    if (!sniffed || ALLOWED_EXTENSIONS[sniffed] === undefined) {
      return NextResponse.json({ error: 'INVALID_IMAGE', message: 'Uploaded file is not a valid image' }, { status: 400 });
    }
    if (sniffed !== blob.type) {
      return NextResponse.json({ error: 'INVALID_IMAGE', message: 'Image content does not match its declared type' }, { status: 400 });
    }
    const dir = path.join(process.cwd(), 'public', 'product-images');
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = `${sku}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    await fs.promises.writeFile(path.join(dir, filename), buffer);
    const url = `/product-images/${filename}`;
    await createAuditLog({
      actor_id: session.userId,
      actor_role: session.role,
      action: 'PRODUCT_IMAGE_UPLOADED',
      entity_type: 'products',
      entity_id: sku,
      before_hash: null,
      after_hash: computeSha256({ sku, filename }),
      ip: clientIp,
    });
    return NextResponse.json({ success: true, url }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'Image upload failed') }, { status: 400 });
  }
}
