import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { AuthService } from '@/lib/services/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: 'INVALID_REQUEST_ID' }, { status: 400 });
  }
  try {
    await AuthService.dismissPasswordResetRequest(session.userId, session.role, requestId, clientIp);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Dismiss failed');
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.startsWith('PASSWORD_RESET_REQUEST_NOT_FOUND')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
