import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { checkRateLimit } from '@/lib/repo/redis';
import { listStaffUsers } from '@/lib/repo/mysql';
import { StaffCreateSchema } from '@/lib/validation';
import { AuthService } from '@/lib/services/auth';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const users = await listStaffUsers();
  return NextResponse.json({ users }, { status: 200 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 });
  }
  const rl = await checkRateLimit('staff_create', `account-${session.userId}`, 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many staff accounts created. Try again later.' },
      { status: 429, headers: rateLimitRetryHeaders(3600) }
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
  }
  const parsed = StaffCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  try {
    const result = await AuthService.createStaffAccount(session.userId, session.role, parsed.data, clientIp);
    return NextResponse.json(
      {
        success: true,
        message: 'Staff account created. Share the one-time credentials securely — they will not be shown again.',
        user: { id: result.userId, email: result.email, role: result.role },
        tempPassword: result.tempPassword,
        totpSecret: result.totpSecret,
        totpUri: result.totpUri,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = publicErrorMessage(err, 'Staff creation failed');
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.includes('already exists')) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
