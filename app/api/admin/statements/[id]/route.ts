import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { getStatementData, buildStatementPdfBuffer } from '@/lib/services/documents';
import { findCustomerById } from '@/lib/repo/mysql';
import { checkDailyQuota } from '@/lib/repo/redis';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN' && session.role !== 'SALES_STAFF') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: 'INVALID_CUSTOMER_ID' }, { status: 400 });
  }
  const quota = await checkDailyQuota('statement-pdf', session.userId, 50);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'QUOTA_EXCEEDED', message: 'Daily statement quota reached. Try again tomorrow.' },
      { status: 429, headers: rateLimitRetryHeaders(86400) }
    );
  }
  try {
    const data = await getStatementData(customerId);
    const customer = await findCustomerById(customerId);
    if (!customer) return NextResponse.json({ error: 'CUSTOMER_NOT_FOUND' }, { status: 404 });
    const pdf = await buildStatementPdfBuffer(customerId, customer.company_name, data);
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="statement_${String(customerId).padStart(6, '0')}.pdf"` },
    });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'Statement failed') }, { status: 500 });
  }
}
