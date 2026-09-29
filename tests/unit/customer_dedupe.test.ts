import { describe, it, expect, beforeEach } from 'vitest';
import {
  listAllCustomers,
  assignCustomerTier,
  createCustomerAndUser,
  getCustomerTier,
  memoryDb,
} from '@/lib/repo/mysql';

describe('Customer list deduplication (duplicate React key fix)', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('returns one row per customer even with multiple users on the same account', async () => {
    const { customer } = await createCustomerAndUser(
      {
        company_name: 'Multi User Co',
        contact_name: 'First User',
        email: `multi_${Date.now()}@example.co.za`,
        phone: '+27115550101',
        address_json: JSON.stringify({ street: '1 Main Rd', city: 'Cape Town', province: 'WC', postal_code: '8001' }),
      },
      { password_hash: 'hash-1', totp_secret_encrypted: 'totp-1' }
    );
    memoryDb.insertUser({
      customer_id: customer.id,
      role: 'CUSTOMER',
      email: `multi_second_${Date.now()}@example.co.za`,
      password_hash: 'hash-2',
      totp_secret_encrypted: 'totp-2',
      status: 'PENDING_APPROVAL',
    });

    const list = await listAllCustomers();
    const matches = list.filter((c) => c.id === customer.id);
    expect(matches).toHaveLength(1);
  });

  it('replacing a customer tier never creates a second assignment row', async () => {
    const { customer } = await createCustomerAndUser(
      {
        company_name: 'Retier Co',
        contact_name: 'Owner',
        email: `retier_${Date.now()}@example.co.za`,
        phone: '+27115550102',
        address_json: JSON.stringify({ street: '2 Main Rd', city: 'Durban', province: 'KZN', postal_code: '4001' }),
      },
      { password_hash: 'hash-1', totp_secret_encrypted: 'totp-1' }
    );

    await assignCustomerTier(customer.id, 2, 1);
    await assignCustomerTier(customer.id, 1, 1);

    expect(memoryDb.customerTierAssignments.size).toBe(1);
    const tier = await getCustomerTier(customer.id);
    expect(tier?.code).toBe('TIER_1');

    const list = await listAllCustomers();
    expect(list.filter((c) => c.id === customer.id)).toHaveLength(1);
  });

  it('never returns duplicate customer ids across the full list', async () => {
    const list = await listAllCustomers();
    const ids = list.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
