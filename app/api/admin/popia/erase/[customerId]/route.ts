import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, verifyCsrf } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { AdminService } from '@/lib/services/admin';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId: rawId } = await context.params;
    const customerId = parseInt(rawId, 10);
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

    const clientIp = getClientIp(req);
    const result = await AdminService.eraseCustomer({
      customerId,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Failed to erase customer PII');
    const status = raw.startsWith('FORBIDDEN')
      ? 403
      : raw.includes('NOT_FOUND')
        ? 404
        : 400;
    return NextResponse.json({ error: 'OPERATION_FAILED', message }, { status });
  }
}
