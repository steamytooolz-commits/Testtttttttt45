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
    const rl = await checkRateLimit('admin_tax_report', clientIp, 60, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please wait.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get('from') || undefined;
    const toDate = searchParams.get('to') || undefined;

    const report = await AdminService.getTaxReport({
      fromDate,
      toDate,
    });

    return NextResponse.json(report);
  } catch (err) {
    const message = publicErrorMessage(err, 'Failed to generate sales invoice report');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
