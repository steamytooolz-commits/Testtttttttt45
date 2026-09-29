import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { AdminService } from '@/lib/services/admin';
import { checkRateLimit, checkDailyQuota } from '@/lib/repo/redis';

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
    const rl = await checkRateLimit('export', clientIp, 20, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many export requests. Please wait a minute.' },
        { status: 429 }
      );
    }
    const accountRl = await checkRateLimit('export', `account-${session.userId}`, 20, 60);
    if (!accountRl.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many export requests. Please wait a minute.' },
        { status: 429 }
      );
    }
    const quota = await checkDailyQuota('data-export', session.userId, 50);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: 'QUOTA_EXCEEDED', message: 'Daily export quota reached. Try again tomorrow.' },
        { status: 429, headers: rateLimitRetryHeaders(86400) }
      );
    }

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') || 'invoices') as 'invoices' | 'customers' | 'inventory' | 'audit';
    const format = (searchParams.get('format') || 'csv') as 'csv' | 'json';

    const validTypes = ['invoices', 'customers', 'inventory', 'audit'];
    const validFormats = ['csv', 'json'];

    if (!validTypes.includes(type) || !validFormats.includes(format)) {
      return NextResponse.json(
        { error: 'INVALID_PARAMETERS', message: 'Type must be invoices/customers/inventory/audit and format must be csv/json' },
        { status: 400 }
      );
    }

    const exported = await AdminService.exportData({
      type,
      format,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });

    return new NextResponse(exported.content, {
      status: 200,
      headers: {
        'Content-Type': exported.contentType,
        'Content-Disposition': `attachment; filename="${exported.filename}"`,
      },
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Export failed');
    const status = raw.startsWith('FORBIDDEN') ? 403 : raw.startsWith('EXPORT_TOO_LARGE') ? 413 : 500;
    return NextResponse.json({ error: 'EXPORT_FAILED', message }, { status });
  }
}
