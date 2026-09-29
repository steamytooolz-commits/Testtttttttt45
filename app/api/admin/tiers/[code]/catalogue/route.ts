import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { publicErrorMessage } from '@/lib/security/request';
import { getPriceTierByCode } from '@/lib/repo/mysql';
import { findProducts, type ProductDocument } from '@/lib/repo/mongo';
import { buildTierCataloguePdfBuffer } from '@/lib/services/documents';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || (session.role !== 'ADMIN' && session.role !== 'SALES_STAFF')) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Staff or Admin privileges required' }, { status: 403 });
    }

    const { code } = await params;
    const tier = await getPriceTierByCode(code.toUpperCase());
    if (!tier) {
      return NextResponse.json({ error: 'TIER_NOT_FOUND', message: `Tier '${code}' not found` }, { status: 404 });
    }

    const products = await findProducts({});
    const pdf = await buildTierCataloguePdfBuffer(tier, products.map((p: ProductDocument) => ({
      sku: p._id,
      name: p.name,
      categoryRef: p.categoryRef,
      description: p.description,
    })));

    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="tier_${tier.code}_catalogue.pdf"`,
      },
    });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Tier catalogue export failed');
    return NextResponse.json({ error: 'EXPORT_FAILED', message: msg }, { status: 500 });
  }
}
