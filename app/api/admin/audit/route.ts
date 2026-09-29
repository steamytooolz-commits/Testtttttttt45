import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { AdminService } from '@/lib/services/admin';
import { checkRateLimit } from '@/lib/repo/redis';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session || (session.role !== 'ADMIN' && session.role !== 'SALES_STAFF')) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Staff or Admin privileges required' },
        { status: 403 }
      );
    }

    const clientIp = getClientIp(req);
    const rl = await checkRateLimit('admin_audit', clientIp, 60, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please wait.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || undefined;
    const entityType = searchParams.get('entity_type') || undefined;
    const actorRole = searchParams.get('actor_role') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100;

    const logs = await AdminService.listAuditLogs({
      action,
      entityType,
      actorRole,
      limit: isNaN(limit) ? 100 : limit,
    });

    return NextResponse.json({
      logs,
      total: logs.length,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'Failed to retrieve audit log');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
