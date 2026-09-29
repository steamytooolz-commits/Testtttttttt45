import { describe, it, expect } from 'vitest';
import {
  buildInvoicePdfBuffer,
  buildStatementPdfBuffer,
  buildTierCataloguePdfBuffer,
  buildCreditNotePdfBuffer,
  getStatementData,
  getCreditNoteDocumentData,
} from '@/lib/services/documents';
import { memoryDb } from '@/lib/repo/mysql/client';

/** Seed one fully-credited invoice + credit note for credit-document tests. */
function seedCreditNoteFixtures(): void {
  if (memoryDb.creditNotes.has(7)) return;
  const now = '2026-09-01T10:00:00.000Z';
  memoryDb.salesOrders.set(2002, {
    id: 2002,
    order_number: 'SO-2002',
    customer_id: 5,
    status: 'FULFILLED',
    subtotal: '800.00',
    vat: '120.00',
    total: '920.00',
    cancel_reason: null,
    created_by: 4,
    created_at: now,
    updated_at: now,
  });
  memoryDb.salesOrderLines.set(2002, [
    { id: 201, order_id: 2002, sku: 'SKU-PEN-BLUE', description_snapshot: 'Ballpoint Pens Blue (Box 50)', qty: 10, unit_price: '80.00', tier_code: 'TIER_1', vat_rate: '15.00', line_total: '800.00' },
  ]);
  memoryDb.invoices.set(2, {
    id: 2,
    invoice_number: 'INV-20001',
    order_id: 2002,
    issued_by: 2,
    issued_at: now,
    subtotal: '800.00',
    vat: '120.00',
    total: '920.00',
    status: 'CREDITED',
  });
  memoryDb.customers.set(5, {
    id: 5,
    public_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    company_name: 'Credited Co',
    contact_name: 'Buyer',
    email: 'buyer2@example.co.za',
    phone: '+27115550102',
    address_json: '{}',
    status: 'APPROVED',
    is_new_prospect: false,
    created_at: now,
  });
  memoryDb.creditNotes.set(7, {
    id: 7,
    credit_number: 'CN-50001',
    invoice_id: 2,
    order_id: 2002,
    customer_id: 5,
    subtotal: '800.00',
    vat: '120.00',
    total: '920.00',
    reason: 'Goods returned — damaged in transit',
    created_by: 1,
    created_at: now,
  });
}

describe('PDF document builders (server-side @react-pdf/renderer)', () => {
  it('builds a sales invoice PDF starting with a %PDF header', async () => {
    const buffer = await buildInvoicePdfBuffer({
      invoice: {
        id: 1,
        invoice_number: 'INV-10001',
        order_id: 1001,
        issued_by: 2,
        issued_at: '2026-09-01T10:00:00.000Z',
        subtotal: '1700.00',
        vat: '255.00',
        total: '1955.00',
        status: 'ISSUED',
      },
      order: {
        id: 1001,
        order_number: 'SO-1001',
        customer_id: 1,
        status: 'INVOICED',
        subtotal: '1700.00',
        vat: '255.00',
        total: '1955.00',
        cancel_reason: null,
        created_by: 4,
        created_at: '2026-09-01T10:00:00.000Z',
        updated_at: '2026-09-01T10:00:00.000Z',
      },
      lines: [
        {
          id: 1,
          order_id: 1001,
          sku: 'SKU-PPR-A4-80G',
          description_snapshot: 'Typek A4 Paper',
          qty: 20,
          unit_price: '85.00',
          tier_code: 'TIER_1',
          vat_rate: '15.00',
          line_total: '1700.00',
        },
      ],
      customer: {
        id: 1,
        public_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        company_name: 'Test Co',
        contact_name: 'Buyer',
        email: 'buyer@example.co.za',
        phone: '+27115550101',
        address_json: '{}',
        status: 'APPROVED',
        is_new_prospect: false,
        created_at: '2026-09-01T10:00:00.000Z',
      },
    });
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('builds statement and tier catalogue PDFs', async () => {
    const statement = await buildStatementPdfBuffer(1, 'Test Co', {
      lines: [
        { date: '2026-09-01T10:00:00.000Z', reference: 'INV-10001', description: 'Sales invoice INV-10001', debit: '1955.00', credit: '0.00' },
      ],
      balance: '1955.00',
    });
    expect(statement.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    const catalogue = await buildTierCataloguePdfBuffer(
      { code: 'TIER_1', name: 'Standard', basis: JSON.stringify({ 'SKU-PPR-A4-80G': '85.00' }) },
      [{ sku: 'SKU-PPR-A4-80G', name: 'Typek A4', categoryRef: 'cat-paper', description: 'Paper' }]
    );
    expect(catalogue.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it('builds a credit note PDF starting with a %PDF header', async () => {
    seedCreditNoteFixtures();
    const data = await getCreditNoteDocumentData(7);
    const buffer = await buildCreditNotePdfBuffer(data);
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('references the credited sales invoice in statement credit lines', async () => {
    seedCreditNoteFixtures();
    const data = await getStatementData(5);
    expect(data.lines).toHaveLength(2);
    const cnLine = data.lines.find((l) => l.reference === 'CN-50001');
    expect(cnLine?.description).toBe('Credit note CN-50001 against sales invoice INV-20001');
    // Fully credited invoice nets the statement balance to zero.
    expect(data.balance).toBe('0.00');
  });

  it('labels statement lines as sales invoices, not tax invoices', async () => {
    const data = await getStatementData(999999);
    expect(data.lines).toEqual([]);
    expect(data.balance).toBe('0.00');
  });
});
