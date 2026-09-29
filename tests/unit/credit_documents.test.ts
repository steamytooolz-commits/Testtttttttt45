import { describe, it, expect, beforeEach } from 'vitest';
import { memoryDb } from '@/lib/repo/mysql/client';
import { createCreditNote, setStockBalance, getStockBalance } from '@/lib/repo/mysql';
import { getStatementData } from '@/lib/services/documents';
import { formatPastelCode6 } from '@/lib/services/pastel';

describe('Credit notes', () => {
  beforeEach(async () => {
    if (memoryDb.invoices.size === 0) {
      const now = new Date().toISOString();
      memoryDb.salesOrders.set(1001, {
        id: 1001,
        order_number: 'SO-1001',
        customer_id: 1,
        status: 'FULFILLED',
        subtotal: '1700.00',
        vat: '255.00',
        total: '1955.00',
        cancel_reason: null,
        created_by: 4,
        created_at: now,
        updated_at: now,
      });
      memoryDb.salesOrderLines.set(1001, [
        { id: 1, order_id: 1001, sku: 'SKU-PPR-A4-80G', description_snapshot: 'Paper', qty: 20, unit_price: '85.00', tier_code: 'TIER_1', vat_rate: '15.00', line_total: '1700.00' },
      ]);
      memoryDb.invoices.set(1, {
        id: 1,
        invoice_number: 'INV-10001',
        order_id: 1001,
        issued_by: 2,
        issued_at: now,
        subtotal: '1700.00',
        vat: '255.00',
        total: '1955.00',
        status: 'ISSUED',
      });
      if (!memoryDb.customers.get(1)) {
        memoryDb.customers.set(1, {
          id: 1,
          public_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          company_name: 'Test Customer',
          contact_name: 'Test',
          email: 'test@example.co.za',
          phone: '+27115550101',
          address_json: '{}',
          status: 'APPROVED',
          is_new_prospect: false,
          created_at: now,
        });
      }
      await setStockBalance('SKU-PPR-A4-80G', 1500, 0);
    }
    memoryDb.creditNotes.clear();
    for (const inv of memoryDb.invoices.values()) {
      inv.status = 'ISSUED';
    }
  });

  it('issues CN sequence, restocks lines, marks invoice CREDITED', async () => {
    const order = memoryDb.salesOrders.get(1001)!;
    const invoice = Array.from(memoryDb.invoices.values()).find((i) => i.order_id === 1001)!;
    const beforeQty = (await getStockBalance('SKU-PPR-A4-80G'))?.qty || 0;
    const note = await createCreditNote({ invoiceId: invoice.id, reason: 'Damaged goods', actorId: 1, actorRole: 'ADMIN' });
    expect(note.credit_number).toMatch(/^CN-/);
    expect(memoryDb.invoices.get(invoice.id)?.status).toBe('CREDITED');
    const afterQty = (await getStockBalance('SKU-PPR-A4-80G'))?.qty || 0;
    expect(afterQty).toBeGreaterThan(beforeQty);
    expect(order.id).toBe(note.order_id);
  });

  it('blocks double-credit', async () => {
    const invoice = Array.from(memoryDb.invoices.values()).find((i) => i.order_id === 1001)!;
    await createCreditNote({ invoiceId: invoice.id, reason: 'First', actorId: 1, actorRole: 'ADMIN' });
    await expect(createCreditNote({ invoiceId: invoice.id, reason: 'Second', actorId: 1, actorRole: 'ADMIN' })).rejects.toThrow(/CREDIT_ALREADY_ISSUED/);
  });

  it('rejects non-ADMIN upfront', async () => {
    const invoice = Array.from(memoryDb.invoices.values())[0];
    await expect(createCreditNote({ invoiceId: invoice.id, reason: 'x'.repeat(10), actorId: 2, actorRole: 'SALES_STAFF' })).rejects.toThrow(/FORBIDDEN/);
  });
});

describe('Statements', () => {
  it('computes balance as invoices minus credits', async () => {
    const data = await getStatementData(1);
    expect(data.lines.length).toBeGreaterThan(0);
    expect(data.balance).toMatch(/^-?\d+\.\d{2}$/);
  });
});

describe('Pastel code6', () => {
  it('allows ids past 999 and pads to 6', () => {
    expect(formatPastelCode6(1234)).toBe('001234');
    expect(formatPastelCode6(100000)).toBe('100000');
    expect(() => formatPastelCode6('1234567')).toThrow(/6-character/);
  });
  it('truncates long text exports', async () => {
    const { sanitizePastelText } = await import('@/lib/services/pastel');
    expect(sanitizePastelText('x'.repeat(500)).length).toBeLessThanOrEqual(255);
  });
});
