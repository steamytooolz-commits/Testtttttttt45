import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { RequisitionService } from '@/lib/services/requisition';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED' || !session.customerId) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Restricted to approved trade accounts' },
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
    const result = await RequisitionService.loadTemplateToCart(session.customerId, templateId);
    return NextResponse.json(
      {
        message: `Successfully loaded ${result.added_count} items into cart`,
        ...result,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = publicErrorMessage(err, 'Failed to load requisition template into cart');
    return NextResponse.json({ error: 'LOAD_FAILED', message }, { status: 400 });
  }
}
