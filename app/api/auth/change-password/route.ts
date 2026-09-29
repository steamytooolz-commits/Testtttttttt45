import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { ChangePasswordSchema } from '@/lib/validation';
import { AuthService } from '@/lib/services/auth';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  try {
    const body: unknown = await req.json();
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const resetToken =
      typeof body === 'object' && body !== null && 'reset_token' in body ? String((body as { reset_token: unknown }).reset_token) : '';

    if (resetToken) {
      await AuthService.changePasswordWithResetToken(resetToken, parsed.data.current_password, parsed.data.new_password, clientIp);
      return NextResponse.json({ success: true, message: 'Password changed. Please log in again.' }, { status: 200 });
    }

    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Active session required' }, { status: 401 });
    }
    const csrfHeader = req.headers.get('x-csrf-token');
    if (!csrfHeader || csrfHeader !== session.csrfToken) {
      return NextResponse.json({ error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    await AuthService.changePassword(session.userId, parsed.data, clientIp);
    return NextResponse.json({ success: true, message: 'Password changed. Please log in again.' }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'Password change failed') }, { status: 400 });
  }
}
