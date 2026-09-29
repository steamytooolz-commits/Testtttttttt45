import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { AdminService } from '@/lib/services/admin';
import { checkRateLimit } from '@/lib/repo/redis';
import type { UserStatus } from '@/lib/repo/mysql';

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
    const rl = await checkRateLimit('admin_customers', clientIp, 60, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please wait.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as UserStatus | null;
    const search = searchParams.get('search') || undefined;

    const customers = await AdminService.listCustomers({
      status: status || undefined,
      search,
    });

    return NextResponse.json({
      customers,
      total: customers.length,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'Failed to retrieve customers');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
