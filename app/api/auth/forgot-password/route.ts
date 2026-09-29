import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { ForgotPasswordSchema } from '@/lib/validation';
import { AuthService } from '@/lib/services/auth';
import { getClientIp, publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { logger } from '@/lib/logger';

const CONFIRMATION_MESSAGE =
  'Request sent — an admin will email you a new temporary password shortly. Keep an eye on your inbox (and spam folder).';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);

  try {
    const body: unknown = await req.json();
    const parseResult = ForgotPasswordSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    await AuthService.requestPasswordReset(parseResult.data, clientIp);

    return NextResponse.json({ success: true, message: CONFIRMATION_MESSAGE }, { status: 200 });
  } catch (err) {
    logger.error('Forgot-password error', err);
    const message = err instanceof Error ? err.message : 'Request failed';
    if (message.startsWith('Too many reset requests')) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: publicErrorMessage(err, 'Request failed') },
        { status: 429, headers: rateLimitRetryHeaders(3600) }
      );
    }
    if (message.startsWith('Captcha verification failed')) {
      return NextResponse.json({ error: publicErrorMessage(err, 'Request failed') }, { status: 400 });
    }
    return NextResponse.json({ error: publicErrorMessage(err, 'Request failed') }, { status: 400 });
  }
}
