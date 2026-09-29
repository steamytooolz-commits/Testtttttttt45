import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import { getCreditNoteDocumentData, buildCreditNotePdfBuffer } from '@/lib/services/documents';
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
  const creditNoteId = Number(id);
  if (!Number.isInteger(creditNoteId) || creditNoteId <= 0) {
    return NextResponse.json({ error: 'INVALID_CREDIT_NOTE_ID' }, { status: 400 });
  }
  const quota = await checkDailyQuota('credit-note-pdf', session.userId, 100);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'QUOTA_EXCEEDED', message: 'Daily credit note PDF quota reached. Try again tomorrow.' },
      { status: 429, headers: rateLimitRetryHeaders(86400) }
    );
  }
  try {
    const data = await getCreditNoteDocumentData(creditNoteId);
    const pdf = await buildCreditNotePdfBuffer(data);
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="credit_note_${data.creditNote.credit_number}.pdf"`,
      },
    });
  } catch (err) {
    const msg = publicErrorMessage(err, 'PDF failed');
    if (msg.startsWith('CREDIT_NOTE_NOT_FOUND')) return NextResponse.json({ error: msg }, { status: 404 });
    if (msg.startsWith('ORDER_NOT_FOUND')) return NextResponse.json({ error: msg }, { status: 404 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
