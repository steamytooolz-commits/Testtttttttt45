import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { ForgotPasswordSchema } from '@/lib/validation';
import { AuthService } from '@/lib/services/auth';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const status = req.nextUrl.searchParams.get('status');
  const filter = status === 'ALL' || status === 'FULFILLED' || status === 'DISMISSED' ? status : 'PENDING';
  const requests = await AuthService.listPasswordResetRequests(filter);
  return NextResponse.json({ requests }, { status: 200 });
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
  }
  const parsed = ForgotPasswordSchema.pick({ email: true }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  try {
    const result = await AuthService.adminResetPasswordByEmail(session.userId, session.role, parsed.data.email, clientIp);
    return NextResponse.json(
      {
        success: true,
        email: result.email,
        tempPassword: result.tempPassword,
        emailSubject: result.emailSubject,
        emailText: result.emailText,
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = publicErrorMessage(err, 'Reset failed');
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.startsWith('USER_NOT_FOUND')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
