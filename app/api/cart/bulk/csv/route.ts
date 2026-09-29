import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { QuickOrderService } from '@/lib/services/quick_order';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active session required to parse CSV orders' },
      { status: 401 }
    );
  }

  if (session.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'TRADE_GATE_PENDING', message: 'Wholesale features are restricted to approved accounts' },
      { status: 403 }
    );
  }

  if (!session.customerId) {
    return NextResponse.json(
      { error: 'INVALID_CUSTOMER', message: 'No wholesale customer account associated with session' },
      { status: 400 }
    );
  }

  let csvContent = '';
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const body = await req.json();
      csvContent = typeof body.csv === 'string' ? body.csv : '';
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
    }
  } else if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('file');
      if (file && typeof file === 'object' && 'text' in file) {
        csvContent = await (file as Blob).text();
      } else {
        const textParam = formData.get('csv');
        if (typeof textParam === 'string') {
          csvContent = textParam;
        }
      }
    } catch {
      return NextResponse.json({ error: 'INVALID_FORM_DATA', message: 'Failed to process multipart upload' }, { status: 400 });
    }
  } else {

    try {
      csvContent = await req.text();
    } catch {
      return NextResponse.json({ error: 'INVALID_PAYLOAD', message: 'Could not read CSV text' }, { status: 400 });
    }
  }

  if (!csvContent || csvContent.trim().length === 0) {
    return NextResponse.json(
      { error: 'EMPTY_CSV', message: 'No CSV content provided' },
      { status: 400 }
    );
  }

  let parsedItems: Array<{ sku: string; qty: number; notes?: string }>;
  try {
    parsedItems = QuickOrderService.parseCsvContent(csvContent);
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    if (raw.startsWith('CSV_TOO_LARGE') || raw.startsWith('CSV_TOO_MANY_ROWS')) {
      return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE', message: raw }, { status: 413 });
    }
    return NextResponse.json({ error: 'CSV_PARSE_FAILED', message: publicErrorMessage(err, 'Failed to parse CSV') }, { status: 400 });
  }
  if (parsedItems.length === 0) {
    return NextResponse.json(
      { error: 'NO_VALID_ROWS', message: 'No valid SKU and Quantity rows could be extracted from the CSV' },
      { status: 400 }
    );
  }

  let validation;
  try {
    validation = await QuickOrderService.validateBulkItems(session.customerId, parsedItems);
  } catch (err) {
    return NextResponse.json({ error: 'VALIDATION_FAILED', message: publicErrorMessage(err, 'Bulk validation failed') }, { status: 400 });
  }

  return NextResponse.json(
    {
      parsed_count: parsedItems.length,
      validation,
    },
    { status: 200 }
  );
}
