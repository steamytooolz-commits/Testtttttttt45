import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { getStatementData, buildStatementPdfBuffer } from '@/lib/services/documents';
import { findCustomerById } from '@/lib/repo/mysql';
import { checkDailyQuota } from '@/lib/repo/redis';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.status !== 'APPROVED') return NextResponse.json({ error: 'TRADE_GATE_PENDING' }, { status: 403 });
  if (!session.customerId) return NextResponse.json({ error: 'INVALID_ROLE' }, { status: 403 });
  const quota = await checkDailyQuota('statement-pdf', session.userId, 50);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'QUOTA_EXCEEDED', message: 'Daily statement quota reached. Try again tomorrow.' },
      { status: 429, headers: rateLimitRetryHeaders(86400) }
    );
  }
  try {
    const data = await getStatementData(session.customerId);
    const customer = await findCustomerById(session.customerId);
    const pdf = await buildStatementPdfBuffer(session.customerId, customer?.company_name || '', data);
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="statement.pdf"' },
    });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'Statement failed') }, { status: 500 });
  }
}
