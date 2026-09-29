import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { checkRateLimit, checkDailyQuota } from '@/lib/repo/redis';
import { buildPastelExport, PASTEL_ENTITIES, type PastelEntity } from '@/lib/services/pastel';

const MAX_HEADER_ERRORS = 25;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ entity: string }> }
) {
  try {
    const { entity: rawEntity } = await context.params;
    if (!/^[a-z_]+$/.test(rawEntity) || !(PASTEL_ENTITIES as readonly string[]).includes(rawEntity)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: `Unknown export entity '${rawEntity}'` },
        { status: 400 }
      );
    }
    const entity = rawEntity as PastelEntity;

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
    const quota = await checkDailyQuota('pastel-export', session.userId, 50);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: 'QUOTA_EXCEEDED', message: 'Daily Pastel export quota reached. Try again tomorrow.' },
        { status: 429, headers: rateLimitRetryHeaders(86400) }
      );
    }

    const result = await buildPastelExport({
      entity,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });

    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Pastel-Exported': String(result.exported),
        'X-Pastel-Skipped': String(result.skipped),
        'X-Pastel-Truncated': result.truncated ? 'true' : 'false',
        'X-Pastel-Errors': JSON.stringify(result.errors.slice(0, MAX_HEADER_ERRORS)),
      },
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Pastel export failed');
    const status = raw.startsWith('FORBIDDEN')
      ? 403
      : raw.startsWith('VALIDATION_ERROR') || raw.startsWith('MAPPING_CORRUPT')
        ? 400
        : 500;
    return NextResponse.json({ error: 'EXPORT_FAILED', message }, { status });
  }
}
