import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { findCustomerById, getCustomerTier, listCustomPrices } from '@/lib/repo/mysql';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Active login session required' },
      { status: 401 }
    );
  }

  if (session.role !== 'CUSTOMER' || !session.customerId) {
    if (session.role !== 'SALES_STAFF' && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const url = new URL(req.url);
    const previewId = url.searchParams.get('customerId');
    if (!previewId || isNaN(Number(previewId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    try {
      const customer = await findCustomerById(Number(previewId));
      if (!customer) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const tier = await getCustomerTier(customer.id);
      const customPrices = await listCustomPrices(customer.id);
      return NextResponse.json({
        customer: {
          public_id: customer.public_id,
          company_name: customer.company_name,
          contact_name: customer.contact_name,
          email: customer.email,
          phone: customer.phone,
          status: customer.status,
          is_new_prospect: customer.is_new_prospect,
          created_at: customer.created_at,
        },
        tier: tier ? { code: tier.code, name: tier.name } : null,
        customPriceCount: customPrices.length,
        preview: true,
      });
    } catch (err: unknown) {
      const msg = publicErrorMessage(err, 'Failed to retrieve account profile');
      return NextResponse.json({ error: 'SERVER_ERROR', message: msg }, { status: 500 });
    }
  }

  try {
    const customer = await findCustomerById(session.customerId);
    if (!customer) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const tier = await getCustomerTier(session.customerId);
    const customPrices = await listCustomPrices(session.customerId);
    return NextResponse.json({
      customer: {
        public_id: customer.public_id,
        company_name: customer.company_name,
        contact_name: customer.contact_name,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        is_new_prospect: customer.is_new_prospect,
        created_at: customer.created_at,
      },
      tier: tier ? { code: tier.code, name: tier.name } : null,
      customPriceCount: customPrices.length,
    });
  } catch (err: unknown) {
    const msg = publicErrorMessage(err, 'Failed to retrieve account profile');
    return NextResponse.json({ error: 'SERVER_ERROR', message: msg }, { status: 500 });
  }
}
