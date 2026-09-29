import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { BulkOrderMatrixSchema } from '@/lib/validation';
import { QuickOrderService } from '@/lib/services/quick_order';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required to validate bulk orders' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Wholesale pricing and ordering are restricted to approved accounts' },
      { status: 403 }
    );
  }

  if (!session.customerId) {
    return NextResponse.json(
      { error: 'INVALID_CUSTOMER', message: 'No wholesale customer account associated with session' },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Malformed JSON request body' },
      { status: 400 }
    );
  }

  const parsed = BulkOrderMatrixSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const result = await QuickOrderService.validateBulkItems(session.customerId, parsed.data.items);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Bulk validation failed');
    return NextResponse.json({ error: 'VALIDATION_FAILED', message }, { status: 500 });
  }
}
