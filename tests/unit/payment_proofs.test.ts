import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildInvoicePdfBuffer,
  getInvoiceDocumentData,
} from '@/lib/services/documents';
import { memoryDb, createPaymentProof, getPaymentProofFile, listPaymentProofsByOrderId } from '@/lib/repo/mysql';
import { setEmailSpy } from '@/lib/services/mailer';
import { StaffQueueService } from '@/lib/services/staff_queue';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);

type SentMail = { to: string; subject: string; attachments: { filename: string; content: Buffer; contentType?: string }[] };
let sent: SentMail[] = [];

function seedOrderFixture(): { orderId: number; customerId: number; userId: number } {
  if (memoryDb.salesOrders.has(3001)) return { orderId: 3001, customerId: 6, userId: 2 };
  const now = '2026-09-10T09:00:00.000Z';
  memoryDb.customers.set(6, {
    id: 6,
    public_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    company_name: 'Proof Co',
    contact_name: 'Payee',
    email: 'payee@example.co.za',
    phone: '+27115550103',
    address_json: '{}',
    status: 'APPROVED',
    is_new_prospect: false,
    created_at: now,
  });
  memoryDb.salesOrders.set(3001, {
    id: 3001,
    order_number: 'SO-3001',
    customer_id: 6,
    status: 'PENDING_SALES_REVIEW',
    subtotal: '500.00',
    vat: '75.00',
    total: '575.00',
    cancel_reason: null,
    created_by: 2,
    created_at: now,
    updated_at: now,
  });
  memoryDb.salesOrderLines.set(3001, [
    { id: 301, order_id: 3001, sku: 'SKU-PPR-A4-80G', description_snapshot: 'Typek A4 Paper', qty: 5, unit_price: '100.00', tier_code: 'TIER_1', vat_rate: '15.00', line_total: '500.00' },
  ]);
  return { orderId: 3001, customerId: 6, userId: 2 };
}

describe('payment proofs + sales invoice emailing', () => {
  beforeEach(() => {
    sent = [];
    setEmailSpy((msg) => sent.push(msg as unknown as SentMail));
  });
  afterEach(() => {
    setEmailSpy(null);
  });

  it('stores proof metadata with sha256 and returns file bytes intact', async () => {
    const { orderId, customerId, userId } = seedOrderFixture();
    const row = await createPaymentProof({
      order_id: orderId,
      customer_id: customerId,
      filename: 'proof-test.png',
      mime_type: 'image/png',
      size_bytes: PNG_BYTES.length,
      sha256: 'a'.repeat(64),
      uploaded_by: userId,
    });
    expect(row.order_id).toBe(orderId);
    expect(row.sha256).toHaveLength(64);

    // Round-trip via the file-backed store: write the real file where the repo expects it.
    const dir = path.join(process.cwd(), 'uploads', 'payment-proofs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'proof-test.png'), PNG_BYTES);
    try {
      const file = await getPaymentProofFile(row.id);
      expect(file).not.toBeNull();
      expect(file!.bytes.equals(PNG_BYTES)).toBe(true);
      expect(file!.proof.mime_type).toBe('image/png');

      const list = await listPaymentProofsByOrderId(orderId);
      expect(list.some((p) => p.id === row.id)).toBe(true);
    } finally {
      fs.rmSync(path.join(dir, 'proof-test.png'), { force: true });
    }
  });

  it('emails the sales invoice PDF to the sales team when an order is invoiced', async () => {
    const { orderId } = seedOrderFixture();
    // Approve then invoice through the service (spy captures sends; SMTP is off in tests).
    await StaffQueueService.transitionOrder({ orderId, action: 'APPROVE', actorId: 2, actorRole: 'ADMIN' });
    const result = await StaffQueueService.transitionOrder({ orderId, action: 'INVOICE', actorId: 2, actorRole: 'ADMIN' });
    expect(result.invoice).toBeDefined();

    const invoiceMail = sent.find((m) => m.subject.includes(`Sales invoice ${result.invoice!.invoice_number}`));
    expect(invoiceMail).toBeDefined();
    expect(invoiceMail!.to).toContain('sales@stationerydepot.co.za');
    const pdfAttachment = invoiceMail!.attachments.find((a) => a.contentType === 'application/pdf');
    expect(pdfAttachment).toBeDefined();
    expect(Buffer.from(pdfAttachment!.content.subarray(0, 5)).toString('utf8')).toBe('%PDF-');
  });

  it('emailed invoice data tolerates Date timestamps from MySQL rows', async () => {
    const { orderId } = seedOrderFixture();
    const invoice = await (await import('@/lib/repo/mysql')).getInvoiceByOrderId(orderId);
    expect(invoice).not.toBeNull();
    const data = await getInvoiceDocumentData(invoice!.id, 'SALES_STAFF', null);
    const pdf = await buildInvoicePdfBuffer(data);
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
