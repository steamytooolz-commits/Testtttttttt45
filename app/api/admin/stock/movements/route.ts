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
    const rl = await checkRateLimit('admin_movements', clientIp, 60, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please wait.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const skuRaw = searchParams.get('sku') || undefined;
    const sku = skuRaw ? skuRaw.trim().toUpperCase().slice(0, 64) : undefined;
    if (sku !== undefined && !/^[A-Za-z0-9_-]{3,64}$/.test(sku)) {
      return NextResponse.json({ error: 'INVALID_SKU', message: 'Invalid SKU filter' }, { status: 400 });
    }
    const rawLimit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100;
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;

    const movements = await AdminService.listStockMovements({
      sku,
      limit,
    });

    return NextResponse.json({
      movements,
      total: movements.length,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'Failed to retrieve stock movements');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
