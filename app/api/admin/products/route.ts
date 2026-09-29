import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { ProductCreateSchema } from '@/lib/validation';
import { createProduct } from '@/lib/services/products';

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
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
    }
    const parsed = ProductCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const product = await createProduct({ input: parsed.data, actorId: session.userId, actorRole: session.role, clientIp });
    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Product creation failed');
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.startsWith('SKU_EXISTS')) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
