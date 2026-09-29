import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { CartService } from '@/lib/services/cart';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required to view cart' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Wholesale pricing and cart are restricted to approved accounts' },
      { status: 403 }
    );
  }

  if (!session.customerId) {
    return NextResponse.json(
      { error: 'INVALID_CUSTOMER', message: 'No wholesale customer account associated with session' },
      { status: 400 }
    );
  }

  try {
    const cart = await CartService.getCart(session.customerId);
    return NextResponse.json(cart, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Failed to retrieve cart');
    return NextResponse.json({ error: 'CART_ERROR', message }, { status: 500 });
  }
}
