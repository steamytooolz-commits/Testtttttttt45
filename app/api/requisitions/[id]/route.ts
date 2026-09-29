import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { RequisitionTemplateUpdateSchema } from '@/lib/validation';
import { RequisitionService } from '@/lib/services/requisition';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED' || !session.customerId) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Access restricted' },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: 'INVALID_ID', message: 'Invalid template ID' }, { status: 400 });
  }

  try {
    const template = await RequisitionService.getTemplate(session.customerId, templateId);
    if (!template) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Template not found' }, { status: 404 });
    }
    return NextResponse.json({ template }, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Error retrieving template');
    return NextResponse.json({ error: 'SERVER_ERROR', message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED' || !session.customerId) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Access restricted' },
      { status: 403 }
    );
  }

  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json(
      { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: 'INVALID_ID', message: 'Invalid template ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON' }, { status: 400 });
  }

  const parsed = RequisitionTemplateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const updated = await RequisitionService.updateTemplate(session.customerId, templateId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Template not found' }, { status: 404 });
    }
    return NextResponse.json({ template: updated }, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Update failed');
    return NextResponse.json({ error: 'UPDATE_FAILED', message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED' || !session.customerId) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Access restricted' },
      { status: 403 }
    );
  }

  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json(
      { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: 'INVALID_ID', message: 'Invalid template ID' }, { status: 400 });
  }

  try {
    const success = await RequisitionService.deleteTemplate(session.customerId, templateId);
    if (!success) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Template not found or already deleted' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Template deleted' }, { status: 200 });
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Delete failed');
    return NextResponse.json({ error: 'DELETE_FAILED', message }, { status: 500 });
  }
}
