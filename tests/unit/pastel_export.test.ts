import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  buildPastelExport,
  loadPastelMapping,
  formatPastelDate,
  formatPastelAmount,
  formatPastelCode3,
  sanitizePastelText,
} from '@/lib/services/pastel';
import { GET as pastelRoute } from '@/app/api/exports/pastel/[entity]/route';
import {
  createCustomerAndUser,
  getAuditLogs,
  memoryDb,
} from '@/lib/repo/mysql';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';

describe('Module 6: Pastel CSV Export Tests', () => {
  let staffToken: string;
  let customerToken: string;

  beforeEach(async () => {
    memoryDb.resetDatabase();

    const staffUser = memoryDb.insertUser({
      customer_id: null,
      role: 'SALES_STAFF',
      email: `pastel_staff_${Date.now()}@stationerydepot.co.za`,
      password_hash: 'hash-staff',
      totp_secret_encrypted: 'totp-staff',
      status: 'APPROVED',
    });
    const staffSession = await createSession({
      userId: staffUser.id,
      email: staffUser.email,
      role: 'SALES_STAFF',
      customerId: null,
      status: 'APPROVED',
    });
    staffToken = staffSession.token;

    const { user: custUser } = await createCustomerAndUser(
      {
        company_name: 'Pastel Buyer (Pty) Ltd',
        contact_name: 'Pastel User',
        email: `pastel_buyer_${Date.now()}@example.co.za`,
        phone: '+27115550101',
        address_json: JSON.stringify({ street: '1 Pastel Rd', city: 'Cape Town', province: 'WC', postal_code: '8001' }),
      },
      { password_hash: 'hash-cust', totp_secret_encrypted: 'totp-cust' }
    );
    const custSession = await createSession({
      userId: custUser.id,
      email: custUser.email,
      role: 'CUSTOMER',
      customerId: custUser.customer_id,
      status: 'APPROVED',
    });
    customerToken = custSession.token;
  });

  it('loads mapping files with exact headers for both entities', () => {
    const customers = loadPastelMapping('customers');
    expect(customers.columns.map((c) => c.header)).toEqual([
      'AccountCode',
      'CompanyName',
      'ContactName',
      'Email',
      'Phone',
      'Street',
      'City',
      'Province',
      'PostalCode',
      'Status',
      'CreatedDate',
      'Reserved1',
      'Reserved2',
    ]);

    const orders = loadPastelMapping('sales_orders');
    expect(orders.columns.map((c) => c.header)[0]).toBe('OrderNumber');
    expect(orders.columns.map((c) => c.header)).toContain('TotalAmount');
  });

  it('rejects unknown mapping entities', () => {
    expect(() => loadPastelMapping('payfast_payouts')).toThrow(/VALIDATION_ERROR/);
    expect(() => loadPastelMapping('../../package')).toThrow(/VALIDATION_ERROR/);
  });

  it('formats dates as DD/MM/YYYY from ISO and SQL inputs', () => {
    expect(formatPastelDate('2026-09-08T10:00:00.000Z')).toBe('08/09/2026');
    expect(formatPastelDate('2026-09-08 10:00:00')).toBe('08/09/2026');
    expect(() => formatPastelDate('not-a-date')).toThrow(/Invalid date/);
  });

  it('enforces two-decimal amounts, 6-char codes, and text sanitizing', () => {
    expect(formatPastelAmount('85.00')).toBe('85.00');
    expect(() => formatPastelAmount('85.5')).toThrow(/two decimals/);
    expect(() => formatPastelAmount('85')).toThrow(/two decimals/);
    expect(formatPastelCode3(7)).toBe('000007');
    expect(formatPastelCode3('42')).toBe('000042');
    expect(() => formatPastelCode3('1234567')).toThrow(/6-character/);
    expect(() => formatPastelCode3('AB')).toThrow(/6-character/);
    expect(sanitizePastelText('a,b"c;d|e\nf')).toBe('a b c d e f');
  });

  it('exports customers to CSV with blank unused fields and zero skips', async () => {
    const result = await buildPastelExport({ entity: 'customers', actorId: 1, actorRole: 'ADMIN' });
    const [header, ...rows] = result.csv.split('\n');
    expect(header).toBe(
      'AccountCode,CompanyName,ContactName,Email,Phone,Street,City,Province,PostalCode,Status,CreatedDate,Reserved1,Reserved2'
    );
    expect(result.total).toBe(1);
    expect(result.exported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(rows[0]).toContain('Pastel Buyer (Pty) Ltd');
    expect(rows[0].endsWith(',')).toBe(true);

    const audits = await getAuditLogs(10);
    expect(audits.some((a) => a.action === 'DATA_EXPORT' && a.entity_type === 'pastel_exports')).toBe(true);
  });

  it('skips invalid rows and reports them without failing the export', async () => {
    memoryDb.customers.set(999, {
      id: 999,
      public_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      company_name: '',
      contact_name: 'Broken Row',
      email: 'broken@example.co.za',
      phone: '',
      address_json: '{}',
      status: 'APPROVED',
      is_new_prospect: false,
      created_at: new Date().toISOString(),
    });

    const result = await buildPastelExport({ entity: 'customers', actorId: 1, actorRole: 'ADMIN' });
    expect(result.total).toBe(2);
    expect(result.exported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].field).toBe('CompanyName');
  });

  it('rejects export builds from unauthorized roles', async () => {
    await expect(buildPastelExport({ entity: 'customers', actorId: 99, actorRole: 'CUSTOMER' })).rejects.toThrow(
      /FORBIDDEN/
    );
  });

  it('enforces RBAC on GET /api/exports/pastel/[entity]', async () => {
    const anonRes = await pastelRoute(new NextRequest('http://localhost:3000/api/exports/pastel/customers'), {
      params: Promise.resolve({ entity: 'customers' }),
    });
    expect(anonRes.status).toBe(403);

    const custRes = await pastelRoute(
      new NextRequest('http://localhost:3000/api/exports/pastel/customers', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${customerToken}` },
      }),
      { params: Promise.resolve({ entity: 'customers' }) }
    );
    expect(custRes.status).toBe(403);

    const staffRes = await pastelRoute(
      new NextRequest('http://localhost:3000/api/exports/pastel/customers', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${staffToken}` },
      }),
      { params: Promise.resolve({ entity: 'customers' }) }
    );
    expect(staffRes.status).toBe(200);
    expect(staffRes.headers.get('Content-Type')).toContain('text/csv');
    expect(staffRes.headers.get('Content-Disposition')).toContain('pastel_customers_');
    expect(staffRes.headers.get('X-Pastel-Skipped')).toBe('0');

    const badRes = await pastelRoute(
      new NextRequest('http://localhost:3000/api/exports/pastel/payfast', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${staffToken}` },
      }),
      { params: Promise.resolve({ entity: 'payfast' }) }
    );
    expect(badRes.status).toBe(400);
  });
});
