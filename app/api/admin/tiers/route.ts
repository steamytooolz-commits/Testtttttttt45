import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, verifyCsrf } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { AdminService } from '@/lib/services/admin';
import { PriceTierCreateSchema, PriceTierUpdateSchema } from '@/lib/validation';

async function requireAdmin(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'ADMIN') {
    return null;
  }
  return session;
}

function errorStatus(message: string): number {
  if (message.startsWith('FORBIDDEN')) return 403;
  if (message.includes('NOT_FOUND')) return 404;
  if (message.startsWith('VALIDATION_ERROR') || message.startsWith('TIER_CODE_EXISTS')) return 400;
  return 400;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session || (session.role !== 'ADMIN' && session.role !== 'SALES_STAFF')) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Staff or Admin privileges required' },
        { status: 403 }
      );
    }

    const tiers = await AdminService.listPriceTiers();
    return NextResponse.json({
      tiers,
      total: tiers.length,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'Failed to retrieve price tiers');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin(req);
    if (!session) {
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
    }

    const parsed = PriceTierCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(req);
    const tier = await AdminService.createTier({
      code: parsed.data.code,
      name: parsed.data.name,
      basis: parsed.data.basis,
      active: parsed.data.active,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });
    return NextResponse.json({ success: true, tier }, { status: 201 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Failed to create price tier');
    return NextResponse.json({ error: 'OPERATION_FAILED', message }, { status: errorStatus(raw) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAdmin(req);
    if (!session) {
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
    }

    const parsed = PriceTierUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(req);
    const tier = await AdminService.updateTier({
      id: parsed.data.id,
      code: parsed.data.code,
      name: parsed.data.name,
      basis: parsed.data.basis,
      active: parsed.data.active,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });
    return NextResponse.json({ success: true, tier }, { status: 200 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Failed to update price tier');
    return NextResponse.json({ error: 'OPERATION_FAILED', message }, { status: errorStatus(raw) });
  }
}
