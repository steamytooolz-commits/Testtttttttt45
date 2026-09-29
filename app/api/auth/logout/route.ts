import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth';
import { SESSION_COOKIE_NAME, authenticateSession, verifyCsrf } from '@/lib/security/session';
import { getClientIp } from '@/lib/security/request';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    const session = await authenticateSession(token);
    if (!session) {
      const res = NextResponse.json({ message: 'Logged out' }, { status: 200 });
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }

    const csrfHeader = req.headers.get('x-csrf-token');
    if (!verifyCsrf(session, csrfHeader)) {
      return NextResponse.json({ error: 'CSRF token validation failed' }, { status: 403 });
    }

    await AuthService.logout(token, clientIp);

    const response = NextResponse.json({ message: 'Logged out successfully' }, { status: 200 });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch {
    const res = NextResponse.json({ message: 'Logged out' }, { status: 200 });
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }
}
