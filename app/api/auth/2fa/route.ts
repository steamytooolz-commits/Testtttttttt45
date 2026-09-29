import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { TwoFactorSchema } from '@/lib/validation';
import { AuthService } from '@/lib/services/auth';
import { SESSION_COOKIE_NAME } from '@/lib/security/session';
import { getClientIp, publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);

  try {
    const body: unknown = await req.json();
    const parseResult = TwoFactorSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await AuthService.verify2Fa(parseResult.data, clientIp);

    const response = NextResponse.json(
      {
        message: 'Authentication successful',
        csrfToken: result.csrfToken,
        user: result.user,
      },
      { status: 200 }
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: result.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1800,
      path: '/',
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Two-factor verification failed';
    logger.warn('2FA verification failed', { error: message });
    if (message.startsWith('Too many 2FA attempts')) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: publicErrorMessage(err, 'Two-factor verification failed') },
        { status: 429, headers: rateLimitRetryHeaders(900) }
      );
    }
    return NextResponse.json({ error: publicErrorMessage(err, 'Two-factor verification failed') }, { status: 401 });
  }
}
