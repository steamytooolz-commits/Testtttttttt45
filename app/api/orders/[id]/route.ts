import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { checkRateLimit } from '@/lib/repo/redis';
import { OrderHistoryService } from '@/lib/services/order_history';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  const rl = await checkRateLimit('order_detail', clientIp, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again in a moment.' },
      { status: 429 }
    );
  }

  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active login session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Access restricted to approved wholesale accounts' },
      { status: 403 }
    );
  }

  const { id } = await params;
  const orderId = Number(id);
  if (isNaN(orderId) || orderId <= 0) {
    return NextResponse.json(
      { error: 'INVALID_ORDER_ID', message: 'Order ID must be a positive integer' },
      { status: 400 }
    );
  }

  try {
    const order = await OrderHistoryService.getOrderDetails({
      orderId,
      actorRole: session.role,
      actorCustomerId: session.customerId,
    });

    return NextResponse.json({ order });
  } catch (err: unknown) {
    const msg = publicErrorMessage(err, 'Failed to retrieve order details');
    if (msg.startsWith('ORDER_NOT_FOUND')) {
      return NextResponse.json({ error: 'ORDER_NOT_FOUND', message: msg }, { status: 404 });
    }
    if (msg.startsWith('FORBIDDEN')) {
      return NextResponse.json({ error: 'FORBIDDEN', message: msg }, { status: 403 });
    }
    return NextResponse.json({ error: 'SERVER_ERROR', message: msg }, { status: 500 });
  }
}
