import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { checkRateLimit } from '@/lib/repo/redis';
import { findSalesOrderById, findCustomerById } from '@/lib/repo/mysql';
import {
  PROOF_MAX_BYTES,
  savePaymentProof,
  notifySalesTeamOfProof,
} from '@/lib/services/payment_proofs';
import { imageMimeMatches } from '@/lib/security/file-upload';

const ALLOWED_PROOF_MIMES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  const orderId = Number(params.id);
  if (!orderId || isNaN(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid order ID' }, { status: 400 });
  }

  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'CUSTOMER' || !session.customerId) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Only customer accounts can upload payment proofs' },
      { status: 403 }
    );
  }
  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 });
  }

  const rl = await checkRateLimit('payment-proof', `account-${session.customerId}`, 20, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many uploads. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const order = await findSalesOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Order not found' }, { status: 404 });
    }
    if (order.customer_id !== session.customerId) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Not your order' }, { status: 403 });
    }
    if (order.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'ORDER_CANCELLED', message: 'Cannot upload proof for a cancelled order' },
        { status: 409 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return NextResponse.json({ error: 'NO_FILE', message: 'No file uploaded' }, { status: 400 });
    }
    const blob = file as Blob & { type?: string };
    const declared = blob.type || '';

    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.length === 0 || buffer.length > PROOF_MAX_BYTES) {
      return NextResponse.json(
        { error: 'INVALID_FILE', message: 'File must be between 1 byte and 5 MB' },
        { status: 400 }
      );
    }

    // Content-based validation: images must sniff to their declared type; PDFs
    // must start with the %PDF magic. This blocks disguised executables.
    if (declared === 'application/pdf') {
      if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return NextResponse.json(
          { error: 'INVALID_FILE', message: 'File content does not match PDF format' },
          { status: 400 }
        );
      }
    } else if (ALLOWED_PROOF_MIMES[declared]) {
      if (!imageMimeMatches(buffer, declared)) {
        return NextResponse.json(
          { error: 'INVALID_FILE', message: 'File content does not match its declared type' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'INVALID_FILE', message: 'Only PNG, JPEG, WebP images or PDF documents are allowed' },
        { status: 400 }
      );
    }

    const proof = await savePaymentProof({
      orderId,
      customerId: session.customerId,
      uploadedBy: session.userId,
      declaredMime: declared,
      bytes: buffer,
      clientIp,
    });

    // Email a copy to the sales team (best effort, never blocks the response).
    const customer = await findCustomerById(session.customerId);
    setImmediate(() => {
      void notifySalesTeamOfProof({
        proof,
        orderNumber: order.order_number,
        customerName: customer?.company_name || 'Customer',
        total: order.total,
        invoiceNumber: null,
        bytes: buffer,
      }).catch(() => undefined);
    });

    return NextResponse.json(
      {
        success: true,
        proof: {
          id: proof.id,
          filename: proof.filename,
          size_bytes: proof.size_bytes,
          created_at: proof.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : '';
    if (raw.startsWith('VALIDATION_ERROR')) {
      return NextResponse.json({ error: 'INVALID_FILE', message: publicErrorMessage(err, 'Invalid file') }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'UPLOAD_FAILED', message: publicErrorMessage(err, 'Upload failed') },
      { status: 500 }
    );
  }
}
