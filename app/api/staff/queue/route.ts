import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { StaffQueueService } from '@/lib/services/staff_queue';
import type { OrderStatus } from '@/lib/repo/mysql';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.role !== 'SALES_STAFF' && session.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Staff or Admin privileges required' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');
  const allowedStatuses = new Set(['ALL', 'PENDING_SALES_REVIEW', 'APPROVED', 'INVOICED', 'FULFILLED', 'CANCELLED']);
  if (rawStatus !== null && !allowedStatuses.has(rawStatus)) {
    return NextResponse.json({ error: 'INVALID_STATUS', message: 'Invalid status filter' }, { status: 400 });
  }
  const statusParam = (rawStatus as OrderStatus | 'ALL' | null) || undefined;
  const rawLimit = Number(searchParams.get('limit') || '50');
  const rawOffset = Number(searchParams.get('offset') || '0');
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const offset = Number.isInteger(rawOffset) ? Math.max(rawOffset, 0) : 0;

  try {
    const orders = await StaffQueueService.getQueue({
      status: statusParam || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      orders,
      count: orders.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: publicErrorMessage(err, 'Failed to retrieve staff queue') },
      { status: 500 }
    );
  }
}
