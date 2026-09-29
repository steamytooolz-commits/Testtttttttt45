import { describe, it, expect, beforeEach } from 'vitest';
import { memoryDb } from '@/lib/repo/mysql/client';
import { AdminService } from '@/lib/services/admin';
import { createCustomerAndUser, findUserByEmail } from '@/lib/repo/mysql';

describe('Module 6: Admin Governance, Inventory Ledger & Tax Compliance', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('1. Lists customer trade accounts with accurate tier assignments and search filtering', async () => {

    const c1 = await createCustomerAndUser(
      {
        company_name: 'Acme Supplies Ltd',
        contact_name: 'John Doe',
        email: 'john@acme.co.za',
        phone: '+27 11 987 6543',
        address_json: JSON.stringify({ street: '12 Main Rd', city: 'Johannesburg' }),
      },
      {
        password_hash: '$argon2id$...',
        totp_secret_encrypted: 'b1:c5:1a',
      }
    );

    const c2 = await createCustomerAndUser(
      {
        company_name: 'Beta School District',
        contact_name: 'Jane Smith',
        email: 'admin@betaschools.edu.za',
        phone: '+27 21 555 1234',
        address_json: JSON.stringify({ street: '45 School St', city: 'Cape Town' }),
      },
      {
        password_hash: '$argon2id$...',
        totp_secret_encrypted: 'b1:c5:1a',
      }
    );

    const all = await AdminService.listCustomers();
    expect(all.length).toBe(2);

    const filteredAcme = await AdminService.listCustomers({ search: 'Acme' });
    expect(filteredAcme.length).toBe(1);
    expect(filteredAcme[0].company_name).toBe('Acme Supplies Ltd');

    const pending = await AdminService.listCustomers({ status: 'PENDING_APPROVAL' });
    expect(pending.length).toBe(2);
  });

  it('2. Approves customer account, syncs user login status, reassigns price tier, and logs audit events', async () => {
    const { customer, user } = await createCustomerAndUser(
      {
        company_name: 'Enterprise Logistics Pty',
        contact_name: 'David Miller',
        email: 'david@enterprisegroup.co.za',
        phone: '+27 31 100 2000',
        address_json: JSON.stringify({ street: '8 Harbor Way', city: 'Durban' }),
      },
      {
        password_hash: '$argon2id$...',
        totp_secret_encrypted: 'b1:c5:1a',
      }
    );

    const updated = await AdminService.updateCustomer({
      customerId: customer.id,
      status: 'APPROVED',
      tierId: 2,
      actorId: 1,
      actorRole: 'ADMIN',
      clientIp: '196.25.1.1',
    });

    expect(updated.status).toBe('APPROVED');
    expect(updated.assigned_tier_id).toBe(2);
    expect(updated.assigned_tier_code).toBe('TIER_2');

    const updatedUser = await findUserByEmail('david@enterprisegroup.co.za');
    expect(updatedUser?.status).toBe('APPROVED');
    expect(updatedUser?.locked_until).toBeNull();
    expect(updatedUser?.failed_login_count).toBe(0);

    const audit = await AdminService.listAuditLogs();
    const statusAudit = audit.find(
      (a) => a.action === 'CUSTOMER_STATUS_UPDATED' && a.entity_id === String(customer.id)
    );
    const tierAudit = audit.find(
      (a) => a.action === 'CUSTOMER_TIER_ASSIGNED' && a.entity_id === String(customer.id)
    );

    expect(statusAudit).toBeDefined();
    expect(statusAudit?.after_hash).toBe('APPROVED');
    expect(tierAudit).toBeDefined();
    expect(tierAudit?.after_hash).toBe('2');
  });

  it('3. Rejects customer updates if actor is unauthorized (CUSTOMER role)', async () => {
    const { customer } = await createCustomerAndUser(
      {
        company_name: 'Small Retailer',
        contact_name: 'Sam Jones',
        email: 'sam@smallretail.co.za',
        phone: '+27 12 345 6789',
        address_json: '{}',
      },
      {
        password_hash: '$argon2id$...',
        totp_secret_encrypted: 'b1:c5:1a',
      }
    );

    await expect(
      AdminService.updateCustomer({
        customerId: customer.id,
        status: 'APPROVED',
        actorId: 99,
        actorRole: 'CUSTOMER',
      })
    ).rejects.toThrow('FORBIDDEN');
  });

  it('4. Merges inventory catalog with real-time stock balances and reserved order quantities', async () => {
    const inventory = await AdminService.listInventoryStock();
    expect(inventory.length).toBeGreaterThanOrEqual(6);

    const paperItem = inventory.find((i) => i.sku === 'SKU-PPR-A4-80G');
    expect(paperItem).toBeDefined();
    expect(paperItem?.qty).toBe(1500);
    expect(paperItem?.reserved).toBe(0);
    expect(paperItem?.available).toBe(1500);
  });

  it('5. Adjusts stock balances atomically and records stock movement entries', async () => {
    const sku = 'SKU-PPR-A4-80G';

    const res1 = await AdminService.adjustStock({
      sku,
      delta: 200,
      reason: 'IMPORT',
      refId: 'CONTAINER-ZA-890',
      actorId: 1,
      actorRole: 'ADMIN',
      clientIp: '196.25.1.1',
    });

    expect(res1.stock.qty).toBe(1700);
    expect(res1.movement.delta).toBe(200);
    expect(res1.movement.reason).toBe('IMPORT');
    expect(res1.movement.ref_id).toBe('CONTAINER-ZA-890');

    const res2 = await AdminService.adjustStock({
      sku,
      delta: -50,
      reason: 'ADJUSTMENT',
      refId: 'AUDIT-DAMAGED-PALLET',
      actorId: 1,
      actorRole: 'ADMIN',
    });

    expect(res2.stock.qty).toBe(1650);
    expect(res2.movement.delta).toBe(-50);
    expect(res2.movement.reason).toBe('ADJUSTMENT');

    const movements = await AdminService.listStockMovements({ sku });
    expect(movements.length).toBe(2);
    expect(movements[0].ref_id).toBe('AUDIT-DAMAGED-PALLET');
  });

  it('5b. Rejects stock adjustments from SALES_STAFF (ADMIN only)', async () => {
    await expect(
      AdminService.adjustStock({
        sku: 'SKU-PPR-A4-80G',
        delta: 10,
        reason: 'ADJUSTMENT',
        refId: 'STAFF-NOT-ALLOWED',
        actorId: 2,
        actorRole: 'SALES_STAFF',
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('6. Prevents manual adjustments that would cause negative inventory stock', async () => {
    const sku = 'SKU-FIL-LVR-BLU';

    await expect(
      AdminService.adjustStock({
        sku,
        delta: -450,
        reason: 'ADJUSTMENT',
        refId: 'COUNT-ERR',
        actorId: 1,
        actorRole: 'ADMIN',
      })
    ).rejects.toThrow('NEGATIVE_STOCK_PREVENTED');

    const inv = await AdminService.listInventoryStock();
    const item = inv.find((i) => i.sku === sku);
    expect(item?.qty).toBe(400);
  });

  it('7. Aggregates tax report summary with exact integer cents precision', async () => {

    memoryDb.invoices.set(1, {
      id: 1,
      invoice_number: 'INV-10001',
      order_id: 1001,
      issued_by: 1,
      issued_at: '2026-09-01T10:00:00.000Z',
      subtotal: '1000.00',
      vat: '150.00',
      total: '1150.00',
      status: 'ISSUED',
    });

    memoryDb.invoices.set(2, {
      id: 2,
      invoice_number: 'INV-10002',
      order_id: 1002,
      issued_by: 1,
      issued_at: '2026-09-02T11:00:00.000Z',
      subtotal: '2500.00',
      vat: '375.00',
      total: '2875.00',
      status: 'ISSUED',
    });

    const taxSummary = await AdminService.getTaxReport();
    expect(taxSummary.totalInvoicesCount).toBe(2);
    expect(taxSummary.taxableSubtotalCents).toBe('3500.00');
    expect(taxSummary.vatCents).toBe('525.00');
    expect(taxSummary.totalGrossCents).toBe('4025.00');
    expect(taxSummary.invoices.length).toBe(2);
  });

  it('8. Exports invoices, customers, and inventory in RFC-4180 CSV and JSON formats', async () => {

    memoryDb.invoices.set(1, {
      id: 1,
      invoice_number: 'INV-10001',
      order_id: 1001,
      issued_by: 1,
      issued_at: '2026-09-01T10:00:00.000Z',
      subtotal: '1000.00',
      vat: '150.00',
      total: '1150.00',
      status: 'ISSUED',
    });

    const csvExport = await AdminService.exportData({
      type: 'invoices',
      format: 'csv',
      actorId: 1,
      actorRole: 'ADMIN',
      clientIp: '196.25.1.1',
    });

    expect(csvExport.contentType).toBe('text/csv');
    expect(csvExport.content).toContain('Invoice Number,Order Number,Company Name');
    expect(csvExport.content).toContain('INV-10001');
    expect(csvExport.content).toContain('1000.00,150.00,1150.00');

    const jsonExport = await AdminService.exportData({
      type: 'invoices',
      format: 'json',
      actorId: 1,
      actorRole: 'ADMIN',
    });

    expect(jsonExport.contentType).toBe('application/json');
    const parsed = JSON.parse(jsonExport.content);
    expect(parsed.totalInvoicesCount).toBe(1);
    expect(parsed.taxableSubtotalCents).toBe('1000.00');

    const invExport = await AdminService.exportData({
      type: 'inventory',
      format: 'csv',
      actorId: 1,
      actorRole: 'ADMIN',
    });
    expect(invExport.content).toContain('SKU,Product Name,Category,Total Physical Qty');
    expect(invExport.content).toContain('SKU-PPR-A4-80G');

    const auditLogs = await AdminService.listAuditLogs({ action: 'DATA_EXPORT' });
    expect(auditLogs.length).toBe(3);
  });
});
