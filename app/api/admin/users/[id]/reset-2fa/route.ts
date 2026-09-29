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
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: 'INVALID_USER_ID' }, { status: 400 });
  }
  try {
    const result = await AuthService.adminReset2FA(session.userId, session.role, targetId, clientIp);
    return NextResponse.json({ success: true, secret: result.secret, uri: result.uri }, { status: 200 });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Reset failed');
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.startsWith('USER_NOT_FOUND')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
