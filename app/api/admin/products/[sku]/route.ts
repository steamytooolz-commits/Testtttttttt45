import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { ProductUpdateSchema } from '@/lib/validation';
import { updateProduct } from '@/lib/services/products';
import { findProductBySku } from '@/lib/repo/mongo';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN' && session.role !== 'SALES_STAFF') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const { sku } = await params;
  const product = await findProductBySku(sku.trim().toUpperCase());
  if (!product) return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ product }, { status: 200 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 });
  }
  const { sku } = await params;
  const normSku = sku.trim().toUpperCase();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(normSku)) {
    return NextResponse.json({ error: 'INVALID_SKU' }, { status: 400 });
  }
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
    }
    const parsed = ProductUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const product = await updateProduct({ sku: normSku, input: parsed.data, actorId: session.userId, actorRole: session.role, clientIp });
    return NextResponse.json({ success: true, product }, { status: 200 });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Product update failed');
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.startsWith('PRODUCT_NOT_FOUND')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
