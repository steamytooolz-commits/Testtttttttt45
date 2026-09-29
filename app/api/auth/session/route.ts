import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  return NextResponse.json(
    {
      csrfToken: session.csrfToken,
      user: {
        id: session.userId,
        email: session.email,
        role: session.role,
        status: session.status,
        customerId: session.customerId,
      },
    },
    { status: 200 }
  );
}
