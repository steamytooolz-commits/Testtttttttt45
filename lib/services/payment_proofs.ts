import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createPaymentProof,
  listPaymentProofsByOrderId,
  getPaymentProofFile,
  createAuditLog,
  type PaymentProofRow,
} from '@/lib/repo/mysql';
import { sendMail, salesTeamEmails } from './mailer';

/**
 * Proof-of-payment workflow: customers upload a bank-transfer receipt at
 * checkout; the file is stored on the app server, metadata recorded in the
 * ledger, an audit row is written, and sales staff are emailed a copy.
 */

export const PROOF_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const PROOF_DIR = path.join('uploads', 'payment-proofs');

const PROOF_MIME_EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function proofFilePath(filename: string): string {
  return path.join(process.cwd(), PROOF_DIR, filename);
}

export async function savePaymentProof(params: {
  orderId: number;
  customerId: number;
  uploadedBy: number;
  declaredMime: string;
  bytes: Buffer;
  clientIp?: string;
}): Promise<PaymentProofRow> {
  const { orderId, customerId, uploadedBy, declaredMime, bytes } = params;

  const ext = PROOF_MIME_EXTENSION[declaredMime];
  if (!ext) {
    throw new Error('VALIDATION_ERROR: Unsupported proof format (PNG, JPEG, WebP or PDF only)');
  }

  const filename = `proof-o${orderId}-c${customerId}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const absDir = proofFilePath('');
  await fs.promises.mkdir(absDir, { recursive: true });
  await fs.promises.writeFile(path.join(absDir, filename), bytes);

  const row = await createPaymentProof({
    order_id: orderId,
    customer_id: customerId,
    filename,
    mime_type: declaredMime,
    size_bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    uploaded_by: uploadedBy,
  });

  await createAuditLog({
    actor_id: uploadedBy,
    actor_role: 'CUSTOMER',
    action: 'PAYMENT_PROOF_UPLOADED',
    entity_type: 'payment_proofs',
    entity_id: String(row.id),
    before_hash: null,
    after_hash: row.sha256,
    ip: params.clientIp ?? '127.0.0.1',
  });

  return row;
}

/** Notify the sales team that a proof of payment has been uploaded. */
export async function notifySalesTeamOfProof(params: {
  proof: PaymentProofRow;
  orderNumber: string;
  customerName: string;
  total: string;
  invoiceNumber: string | null;
  bytes: Buffer;
}): Promise<void> {
  const { proof, orderNumber, customerName, total, invoiceNumber, bytes } = params;
  await sendMail({
    to: salesTeamEmails(),
    subject: `Payment proof uploaded — ${orderNumber} (${invoiceNumber ?? 'not yet invoiced'})`,
    text:
      `A proof of payment was uploaded at checkout.\n\n` +
      `Order: ${orderNumber}\n` +
      `Sales invoice: ${invoiceNumber ?? 'not yet issued'}\n` +
      `Customer: ${customerName}\n` +
      `Amount: R ${total}\n` +
      `File: ${proof.filename} (${Math.round(proof.size_bytes / 1024)} KB)\n\n` +
      `The attachment is a copy; the original is in the staff dashboard against the order.`,
    attachments: [
      {
        filename: proof.filename,
        content: bytes,
        contentType: proof.mime_type,
      },
    ],
  });
}

export { listPaymentProofsByOrderId, getPaymentProofFile };
