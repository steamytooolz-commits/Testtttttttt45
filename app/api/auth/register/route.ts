import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { RegistrationSchema } from '@/lib/validation';
import { AuthService } from '@/lib/services/auth';
import { getClientIp, publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);

  try {
    const body: unknown = await req.json();
    const parseResult = RegistrationSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await AuthService.register(parseResult.data, clientIp);
    const { updateUserStatus, updateCustomerStatus, findCustomerById } = await import('@/lib/repo/mysql');
    const { createSession, SESSION_COOKIE_NAME } = await import('@/lib/security/session');

    await updateUserStatus(result.userId, 'APPROVED');
    await updateCustomerStatus(result.customerId, 'APPROVED');

    const customer = await findCustomerById(result.customerId);
    const { token } = await createSession({
      userId: result.userId,
      customerId: result.customerId,
      customerPublicId: customer?.public_id ?? null,
      role: 'CUSTOMER',
      status: 'APPROVED',
      email: parseResult.data.email.toLowerCase(),
    });

    const response = NextResponse.json(
      {
        message: 'Account registered and approved successfully. Welcome to Stationery Depot!',
        status: 'APPROVED',
        isNewProspect: result.isNewProspect,
        totpUri: result.totpUri,
        totpSecret: result.totpSecret,
      },
      { status: 201 }
    );

    response.cookies.delete('sd_simulated_role');
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60,
      path: '/',
    });

    return response;
  } catch (err) {
    logger.error('Registration error', err);
    const message = err instanceof Error ? err.message : 'Registration failed';
    if (message.startsWith('Too many registration attempts')) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: publicErrorMessage(err, 'Registration failed') },
        { status: 429, headers: rateLimitRetryHeaders(3600) }
      );
    }
    return NextResponse.json({ error: publicErrorMessage(err, 'Registration failed') }, { status: 400 });
  }
}
