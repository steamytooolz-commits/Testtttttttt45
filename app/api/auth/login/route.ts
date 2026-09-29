import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { LoginSchema } from '@/lib/validation';
import { publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { findUserByEmail, findCustomerById } from '@/lib/repo/mysql';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const parseResult = LoginSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const email = parseResult.data.email.toLowerCase().trim();
    const user = await findUserByEmail(email);

    if (!user) {
      // If user doesn't exist yet, check if it's admin or commercial account
      return NextResponse.json(
        { error: 'ACCOUNT_NOT_FOUND', message: 'No registered account found with this email. Please open a trade account or use demo credentials.' },
        { status: 401 }
      );
    }

    if (user.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended. Please contact support.' },
        { status: 403 }
      );
    }

    const customer = user.customer_id ? await findCustomerById(user.customer_id) : null;

    const { token, csrfToken } = await createSession({
      userId: user.id,
      customerId: user.customer_id,
      customerPublicId: customer?.public_id ?? null,
      role: user.role,
      status: user.status,
      email: user.email,
    });

    const response = NextResponse.json(
      {
        message: 'Login successful',
        csrfToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          customerId: user.customer_id,
        },
      },
      { status: 200 }
    );

    // Delete any old simulated cookies
    response.cookies.delete('sd_simulated_role');

    // Set genuine session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60, // 30 minutes
      path: '/',
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    logger.warn('Login attempt failed', { error: message });
    if (message.startsWith('Too many login attempts')) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: publicErrorMessage(err, 'Login failed') },
        { status: 429, headers: rateLimitRetryHeaders(900) }
      );
    }
    return NextResponse.json({ error: publicErrorMessage(err, 'Login failed') }, { status: 401 });
  }
}
