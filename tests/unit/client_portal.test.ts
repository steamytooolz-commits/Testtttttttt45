import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  createCustomerAndUser,
  findCustomerById,
  findCustomerByPublicId,
  listAllCustomers,
  memoryDb,
} from '@/lib/repo/mysql';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { middleware } from '@/middleware';
import { GET as accountRoute } from '@/app/api/account/route';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Client public UUIDs', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('assigns a unique v4 UUID to every new customer', async () => {
    const first = await createCustomerAndUser(
      {
        company_name: 'Uuid Co One',
        contact_name: 'One',
        email: `uuid1_${Date.now()}@example.co.za`,
        phone: '+27115550101',
        address_json: '{}',
      },
      { password_hash: 'h', totp_secret_encrypted: 'e' }
    );
    const second = await createCustomerAndUser(
      {
        company_name: 'Uuid Co Two',
        contact_name: 'Two',
        email: `uuid2_${Date.now()}@example.co.za`,
        phone: '+27115550102',
        address_json: '{}',
      },
      { password_hash: 'h', totp_secret_encrypted: 'e' }
    );
    expect(first.customer.public_id).toMatch(UUID_RE);
    expect(second.customer.public_id).toMatch(UUID_RE);
    expect(first.customer.public_id).not.toBe(second.customer.public_id);
  });

  it('resolves customers by public id and rejects malformed input', async () => {
    const { customer } = await createCustomerAndUser(
      {
        company_name: 'Lookup Co',
        contact_name: 'Look',
        email: `lookup_${Date.now()}@example.co.za`,
        phone: '+27115550103',
        address_json: '{}',
      },
      { password_hash: 'h', totp_secret_encrypted: 'e' }
    );
    const found = await findCustomerByPublicId(customer.public_id);
    expect(found?.id).toBe(customer.id);
    expect(await findCustomerByPublicId('not-a-uuid')).toBeNull();
    expect(await findCustomerByPublicId('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('carries the public id in listings and login sessions', async () => {
    const { user, customer } = await createCustomerAndUser(
      {
        company_name: 'Session Co',
        contact_name: 'Sess',
        email: `sessuuid_${Date.now()}@example.co.za`,
        phone: '+27115550104',
        address_json: '{}',
      },
      { password_hash: 'h', totp_secret_encrypted: 'e' }
    );
    const list = await listAllCustomers();
    expect(list.find((c) => c.id === customer.id)?.public_id).toBe(customer.public_id);

    const session = await createSession({
      userId: user.id,
      customerId: customer.id,
      customerPublicId: customer.public_id,
      role: 'CUSTOMER',
      status: 'APPROVED',
      email: user.email,
    });
    const { getSession } = await import('@/lib/repo/redis');
    const stored = await getSession(session.jti);
    expect(stored?.customerPublicId).toBe(customer.public_id);
  });

  it('looks up customers by id with a well-formed public id attached', async () => {
    const { customer } = await createCustomerAndUser(
      {
        company_name: 'Seed Check Co',
        contact_name: 'Seed',
        email: `seedcheck_${Date.now()}@example.co.za`,
        phone: '+27115550107',
        address_json: '{}',
      },
      { password_hash: 'h', totp_secret_encrypted: 'e' }
    );
    const found = await findCustomerById(customer.id);
    expect(found?.public_id).toMatch(UUID_RE);
  });
});

describe('Staff endpoints hidden from the public', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  function staffApiRequest(path: string, token?: string, method = 'GET'): NextRequest {
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    });
  }

  it('returns 404 (not 401/403) for anonymous staff API access', async () => {
    for (const path of ['/api/staff/queue', '/api/admin/customers', '/api/exports/pastel/customers']) {
      const res = (await middleware(staffApiRequest(path))) as NextResponse;
      expect(res.status).toBe(404);
    }
  });

  it('returns 404 for signed-in customers on staff APIs', async () => {
    const { user } = await createCustomerAndUser(
      {
        company_name: 'Snoop Co',
        contact_name: 'Snoop',
        email: `snoop_${Date.now()}@example.co.za`,
        phone: '+27115550105',
        address_json: '{}',
      },
      { password_hash: 'h', totp_secret_encrypted: 'e' }
    );
    const session = await createSession({
      userId: user.id,
      customerId: user.customer_id,
      role: 'CUSTOMER',
      status: 'APPROVED',
      email: user.email,
    });
    const res = (await middleware(staffApiRequest('/api/admin/tiers', session.token))) as NextResponse;
    expect(res.status).toBe(404);
  });

  it('lets staff through to staff APIs', async () => {
    const staff = memoryDb.insertUser({
      customer_id: null,
      role: 'SALES_STAFF',
      email: `hidecheck_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const session = await createSession({
      userId: staff.id,
      customerId: null,
      role: 'SALES_STAFF',
      status: 'APPROVED',
      email: staff.email,
    });
    const res = (await middleware(staffApiRequest('/api/staff/queue', session.token))) as NextResponse;
    expect(res.status).toBe(200);
  });

  it('leaves public API paths untouched', async () => {
    const res = (await middleware(staffApiRequest('/api/catalog'))) as NextResponse;
    expect(res.status).toBe(200);
  });
});

describe('Client account portal API', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('rejects anonymous callers and hides the portal from non-customers', async () => {
    const anon = await accountRoute(new NextRequest('http://localhost:3000/api/account'));
    expect(anon.status).toBe(401);

    const staff = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `portalstaff_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const staffSession = await createSession({
      userId: staff.id,
      customerId: null,
      role: 'ADMIN',
      status: 'APPROVED',
      email: staff.email,
    });
    const staffRes = await accountRoute(
      new NextRequest('http://localhost:3000/api/account', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${staffSession.token}` },
      })
    );
    expect(staffRes.status).toBe(404);
  });

  it('returns the customer profile with public id and tier', async () => {
    const { user, customer } = await createCustomerAndUser(
      {
        company_name: 'Portal Co',
        contact_name: 'Portal',
        email: `portal_${Date.now()}@example.co.za`,
        phone: '+27115550106',
        address_json: '{}',
      },
      { password_hash: 'h', totp_secret_encrypted: 'e' }
    );
    const session = await createSession({
      userId: user.id,
      customerId: customer.id,
      customerPublicId: customer.public_id,
      role: 'CUSTOMER',
      status: 'APPROVED',
      email: user.email,
    });
    const res = await accountRoute(
      new NextRequest('http://localhost:3000/api/account', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${session.token}` },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.customer.public_id).toBe(customer.public_id);
    expect(json.customer.company_name).toBe('Portal Co');
    expect(json.tier.code).toBe('TIER_1');
    expect(json).not.toHaveProperty('password_hash');
  });

  it('lets staff preview a customer profile without acting as them', async () => {
    const { customer } = await createCustomerAndUser(
      {
        company_name: 'Preview Co',
        contact_name: 'Preview',
        email: `preview_${Date.now()}@example.co.za`,
        phone: '+27115550108',
        address_json: '{}',
      },
      { password_hash: 'h', totp_secret_encrypted: 'e' }
    );
    const staff = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `previewstaff_${Date.now()}@example.co.za`,
      password_hash: 'h',
      totp_secret_encrypted: 'e',
      status: 'APPROVED',
    });
    const staffSession = await createSession({
      userId: staff.id,
      customerId: null,
      role: 'ADMIN',
      status: 'APPROVED',
      email: staff.email,
    });
    const withId = await accountRoute(
      new NextRequest(`http://localhost:3000/api/account?customerId=${customer.id}`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${staffSession.token}` },
      })
    );
    expect(withId.status).toBe(200);
    const json = await withId.json();
    expect(json.customer.public_id).toBe(customer.public_id);
    expect(json.preview).toBe(true);

    const withoutId = await accountRoute(
      new NextRequest('http://localhost:3000/api/account', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${staffSession.token}` },
      })
    );
    expect(withoutId.status).toBe(404);
  });
});
