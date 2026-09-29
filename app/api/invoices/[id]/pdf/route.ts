import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { getInvoiceDocumentData, buildInvoicePdfBuffer } from '@/lib/services/documents';
import { checkDailyQuota } from '@/lib/repo/redis';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.status !== 'APPROVED') return NextResponse.json({ error: 'TRADE_GATE_PENDING' }, { status: 403 });
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: 'INVALID_INVOICE_ID' }, { status: 400 });
  }
  const quota = await checkDailyQuota('invoice-pdf', session.userId, 100);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'QUOTA_EXCEEDED', message: 'Daily invoice PDF quota reached. Try again tomorrow.' },
      { status: 429, headers: rateLimitRetryHeaders(86400) }
    );
  }
  try {
    const data = await getInvoiceDocumentData(invoiceId, session.role, session.customerId);
    const pdf = await buildInvoicePdfBuffer(data);
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice_${data.invoice.invoice_number}.pdf"`,
      },
    });
  } catch (err) {
    const msg = publicErrorMessage(err, 'PDF failed');
    if (msg.startsWith('INVOICE_NOT_FOUND')) return NextResponse.json({ error: msg }, { status: 404 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
