import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, verifyCsrf } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { AdminService } from '@/lib/services/admin';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId) || customerId <= 0) {
      return NextResponse.json({ error: 'INVALID_ID', message: 'Invalid customer ID' }, { status: 400 });
    }

    const session = await getSessionFromRequest(req);

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Admin privileges required' },
        { status: 403 }
      );
    }

    if (!verifyCsrf(session, req.headers.get('x-csrf-token'))) {
      return NextResponse.json(
        { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    let tierIdParsed: number | undefined = undefined;
    const text = await req.text();
    if (text.trim().length > 0) {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
      }
      const rawTierId =
        typeof body === 'object' && body !== null && 'tier_id' in body
          ? (body as { tier_id?: unknown }).tier_id
          : undefined;
      if (rawTierId !== undefined && rawTierId !== null) {
        tierIdParsed = parseInt(String(rawTierId), 10);
        if (isNaN(tierIdParsed) || tierIdParsed <= 0) {
          return NextResponse.json(
            { error: 'VALIDATION_ERROR', message: 'Invalid tier ID' },
            { status: 400 }
          );
        }
      }
    }

    const clientIp = getClientIp(req);
    const customer = await AdminService.updateCustomer({
      customerId,
      status: 'APPROVED',
      tierId: tierIdParsed,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });

    return NextResponse.json({ success: true, customer }, { status: 200 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Failed to approve customer');
    const status = raw.startsWith('FORBIDDEN')
      ? 403
      : raw.includes('NOT_FOUND')
        ? 404
        : 400;
    return NextResponse.json({ error: 'OPERATION_FAILED', message }, { status });
  }
}
