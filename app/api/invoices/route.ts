import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { checkRateLimit } from '@/lib/repo/redis';
import { OrderHistoryService } from '@/lib/services/order_history';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';

  const rl = await checkRateLimit('invoices_list', clientIp, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please wait a moment.' },
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

  try {
    let customerIdToQuery = session.customerId;

    if (session.role === 'ADMIN' || session.role === 'SALES_STAFF') {
      const url = new URL(req.url);
      const queryCustId = url.searchParams.get('customerId');
      if (queryCustId && !isNaN(Number(queryCustId))) {
        customerIdToQuery = Number(queryCustId);
      }
    }

    if (!customerIdToQuery) {
      if (session.role === 'CUSTOMER') {
        return NextResponse.json(
          { error: 'INVALID_CUSTOMER', message: 'No associated commercial customer profile found' },
          { status: 400 }
        );
      }
      return NextResponse.json({ invoices: [] });
    }

    const invoices = await OrderHistoryService.listCustomerInvoices(customerIdToQuery);
    return NextResponse.json({ invoices });
  } catch (err: unknown) {
    const msg = publicErrorMessage(err, 'Failed to retrieve invoices');
    return NextResponse.json({ error: 'SERVER_ERROR', message: msg }, { status: 500 });
  }
}
