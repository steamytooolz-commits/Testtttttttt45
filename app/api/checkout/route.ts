import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { checkRateLimit } from '@/lib/repo/redis';
import { CheckoutService } from '@/lib/services/checkout';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  const rl = await checkRateLimit('checkout', clientIp, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many checkout requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required to checkout' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Wholesale checkout is restricted to approved accounts' },
      { status: 403 }
    );
  }

  if (!session.customerId) {
    return NextResponse.json(
      { error: 'INVALID_ROLE', message: 'Checkout requires a linked wholesale customer account' },
      { status: 403 }
    );
  }

  const accountRl = await checkRateLimit('checkout', `account-${session.customerId}`, 10, 60);
  if (!accountRl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many checkout requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json(
      { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
      { status: 403 }
    );
  }

  try {
    const result = await CheckoutService.processCheckout({
      customerId: session.customerId,
      userId: session.userId,
      clientIp,
    });

    return NextResponse.json(
      {
        success: true,
        order: result.order,
        lines: result.lines,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : '';
    const isClientError =
      raw.startsWith('CART_EMPTY') ||
      raw.startsWith('INSUFFICIENT_STOCK') ||
      raw.startsWith('STOCK_LOCK_CONFLICT') ||
      raw.startsWith('ORDER_TOTAL_EXCEEDS_LEDGER_PRECISION');

    return NextResponse.json(
      {
        error: isClientError ? 'CHECKOUT_CONFLICT' : 'CHECKOUT_ERROR',
        message: publicErrorMessage(err, 'Checkout failed'),
      },
      { status: isClientError ? 409 : 500 }
    );
  }
}
