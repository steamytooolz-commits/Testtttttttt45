import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '@/lib/services/auth';
import { findCustomerById, listAllCustomers, memoryDb } from '@/lib/repo/mysql';

function registrationPayload(email: string, extra: Record<string, unknown> = {}) {
  return {
    company_name: 'Prospect Co (Pty) Ltd',
    contact_name: 'Prospect Buyer',
    email,
    phone: '+27115550101',
    address: { street: '1 Prospect Rd', city: 'Cape Town', province: 'Western Cape', postal_code: '8001' },
    password: 'ProspectPass123!x',
    recaptcha_token: 'test-token-valid',
    ...extra,
  };
}

describe('New-prospect registration flow', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('registers unticked signups as prospects with a PROSPECT_REGISTERED audit', async () => {
    const result = await AuthService.register(
      registrationPayload(`prospect_${Date.now()}@example.co.za`, { is_existing_client: false }),
      '127.0.0.1'
    );
    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.isNewProspect).toBe(true);

    const customer = await findCustomerById(result.customerId);
    expect(customer?.is_new_prospect).toBe(true);

    const audits = memoryDb.auditLogs.filter((a) => a.entity_id === String(result.userId));
    expect(audits.some((a) => a.action === 'PROSPECT_REGISTERED')).toBe(true);
  });

  it('keeps the default registration path for existing clients', async () => {
    const result = await AuthService.register(
      registrationPayload(`existing_${Date.now()}@example.co.za`),
      '127.0.0.1'
    );
    expect(result.isNewProspect).toBe(false);

    const customer = await findCustomerById(result.customerId);
    expect(customer?.is_new_prospect).toBe(false);

    const audits = memoryDb.auditLogs.filter((a) => a.entity_id === String(result.userId));
    expect(audits.some((a) => a.action === 'REGISTRATION')).toBe(true);
  });

  it('surfaces prospects in the customer list for the staff ping', async () => {
    await AuthService.register(
      registrationPayload(`ping_${Date.now()}@example.co.za`, { is_existing_client: false }),
      '127.0.0.1'
    );
    const list = await listAllCustomers();
    const awaiting = list.filter((c) => c.is_new_prospect && c.status === 'PENDING_APPROVAL');
    expect(awaiting.length).toBeGreaterThanOrEqual(1);
    expect(awaiting[0].email).toContain('ping_');
  });
});
