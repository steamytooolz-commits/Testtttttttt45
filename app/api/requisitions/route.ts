import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { RequisitionTemplateCreateSchema } from '@/lib/validation';
import { RequisitionService } from '@/lib/services/requisition';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Restricted to approved trade accounts' },
      { status: 403 }
    );
  }

  if (!session.customerId) {
    return NextResponse.json(
      { error: 'INVALID_CUSTOMER', message: 'No customer associated with session' },
      { status: 400 }
    );
  }

  try {
    const templates = await RequisitionService.listTemplates(session.customerId);
    return NextResponse.json({ templates }, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Failed to list requisition templates');
    return NextResponse.json({ error: 'REQUISITION_ERROR', message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Restricted to approved trade accounts' },
      { status: 403 }
    );
  }

  if (!session.customerId) {
    return NextResponse.json(
      { error: 'INVALID_CUSTOMER', message: 'No customer associated with session' },
      { status: 400 }
    );
  }

  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json(
      { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const parsed = RequisitionTemplateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const template = await RequisitionService.createTemplate(
      session.customerId,
      parsed.data.name,
      parsed.data.description,
      parsed.data.items
    );
    return NextResponse.json({ template }, { status: 201 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Failed to create requisition template');
    return NextResponse.json({ error: 'CREATION_FAILED', message }, { status: 400 });
  }
}
