import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { StaffQueueService } from '@/lib/services/staff_queue';

const transitionSchema = z
  .object({
    action: z.enum(['APPROVE', 'INVOICE', 'FULFIL', 'CANCEL']),
    reason: z.string().trim().optional(),
  })
  .refine(
    (data) => {
      if (data.action === 'CANCEL') {
        return !!data.reason && data.reason.length > 0;
      }
      return true;
    },
    {
      message: 'Cancellation reason is required when cancelling an order',
      path: ['reason'],
    }
  );

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  const orderId = Number(params.id);

  if (!orderId || isNaN(orderId) || orderId <= 0) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Invalid order ID' },
      { status: 400 }
    );
  }

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

  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json(
      { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
      { status: 403 }
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  const parseResult = transitionSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_ERROR',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      },
      { status: 400 }
    );
  }

  const { action, reason } = parseResult.data;
  const clientIp = getClientIp(req);

  try {
    const result = await StaffQueueService.transitionOrder({
      orderId,
      action,
      actorId: session.userId,
      actorRole: session.role,
      cancelReason: reason,
      clientIp,
    });

    return NextResponse.json({
      success: true,
      order: result.order,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
      invoice: result.invoice,
    });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Order transition failed');
    if (raw.startsWith('INVALID_TRANSITION') || raw.startsWith('VALIDATION_ERROR')) {
      return NextResponse.json({ error: 'INVALID_TRANSITION', message }, { status: 400 });
    }
    if (raw.startsWith('ORDER_NOT_FOUND')) {
      return NextResponse.json({ error: 'NOT_FOUND', message }, { status: 404 });
    }
    if (raw.startsWith('INVOICE_ALREADY_EXISTS')) {
      return NextResponse.json({ error: 'CONFLICT', message }, { status: 409 });
    }
    if (raw.startsWith('FORBIDDEN')) {
      return NextResponse.json({ error: 'FORBIDDEN', message }, { status: 403 });
    }

    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
