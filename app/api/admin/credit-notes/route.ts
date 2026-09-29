import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { createCreditNote, listAllCreditNotes } from '@/lib/repo/mysql';
import { z } from 'zod';

const CreditNoteSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN' && session.role !== 'SALES_STAFF') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const list = await listAllCreditNotes(100);
  return NextResponse.json({ creditNotes: list }, { status: 200 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Only administrators can issue credit notes' }, { status: 403 });
  }
  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 });
  }
  try {
    const body: unknown = await req.json();
    const parsed = CreditNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const note = await createCreditNote({
      invoiceId: parsed.data.invoiceId,
      reason: parsed.data.reason,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });
    return NextResponse.json({ success: true, creditNote: note }, { status: 201 });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Credit failed');
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.startsWith('INVOICE_NOT_FOUND')) return NextResponse.json({ error: msg }, { status: 404 });
    if (msg.startsWith('CREDIT_ALREADY_ISSUED')) return NextResponse.json({ error: msg }, { status: 409 });
    if (msg.startsWith('VALIDATION_ERROR')) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
