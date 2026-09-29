import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { CartUpdateItemSchema, SkuParamSchema } from '@/lib/validation';
import { CartService } from '@/lib/services/cart';

function parseSkuParam(id: string): { ok: true; sku: string } | { ok: false; response: NextResponse } {
  const parsed = SkuParamSchema.safeParse({ sku: id });
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      ),
    };
  }
  return { ok: true, sku: parsed.data.sku.trim().toUpperCase() };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Approved wholesale session required' },
      { status: 403 }
    );
  }

  if (!session.customerId) {
    return NextResponse.json(
      { error: 'INVALID_CUSTOMER', message: 'No customer associated with session' },
      { status: 400 }
    );
  }

  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json(
      { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const skuParsed = parseSkuParam(id);
  if (!skuParsed.ok) return skuParsed.response;
  const sku = skuParsed.sku;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const parsed = CartUpdateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const updatedCart = await CartService.updateItemQty(
      session.customerId,
      sku,
      parsed.data.qty
    );
    return NextResponse.json(updatedCart, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Failed to update item');
    return NextResponse.json({ error: 'CART_MUTATION_FAILED', message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Approved wholesale session required' },
      { status: 403 }
    );
  }

  if (!session.customerId) {
    return NextResponse.json(
      { error: 'INVALID_CUSTOMER', message: 'No customer associated with session' },
      { status: 400 }
    );
  }

  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json(
      { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const skuParsed = parseSkuParam(id);
  if (!skuParsed.ok) return skuParsed.response;
  const sku = skuParsed.sku;

  try {
    const updatedCart = await CartService.removeItem(session.customerId, sku);
    return NextResponse.json(updatedCart, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Failed to remove item');
    return NextResponse.json({ error: 'CART_MUTATION_FAILED', message }, { status: 400 });
  }
}
