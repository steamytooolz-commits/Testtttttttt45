import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, verifyCsrf } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { AdminService } from '@/lib/services/admin';

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json();
    const { sku, delta, reason, ref_id } = body;

    if (!sku || typeof sku !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Valid SKU is required' },
        { status: 400 }
      );
    }

    const deltaNum = parseInt(String(delta), 10);
    if (isNaN(deltaNum) || deltaNum === 0) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Non-zero integer delta is required' },
        { status: 400 }
      );
    }

    const validReasons = ['ADJUSTMENT', 'IMPORT', 'REFUND'];
    if (!reason || !validReasons.includes(reason)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: `Reason must be one of: ${validReasons.join(', ')}` },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(req);

    const result = await AdminService.adjustStock({
      sku: sku.trim(),
      delta: deltaNum,
      reason,
      refId: (ref_id && String(ref_id).trim()) || `ADJ-${Date.now()}`,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });

    return NextResponse.json({
      success: true,
      stock: result.stock,
      movement: result.movement,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Stock adjustment failed');
    const status = raw.startsWith('FORBIDDEN') ? 403 : raw.includes('NOT_FOUND') ? 404 : 400;
    return NextResponse.json({ error: 'OPERATION_FAILED', message }, { status });
  }
}
