import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { CartAddItemSchema } from '@/lib/validation';
import { CartService } from '@/lib/services/cart';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required to modify cart' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Cart modification is restricted to approved accounts' },
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const parsed = CartAddItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const updatedCart = await CartService.addItem(
      session.customerId,
      parsed.data.sku,
      parsed.data.qty
    );
    return NextResponse.json(updatedCart, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Failed to add item to cart');
    return NextResponse.json({ error: 'CART_MUTATION_FAILED', message }, { status: 400 });
  }
}
