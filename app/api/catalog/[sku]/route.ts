import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/lib/services/catalog';
import { getSessionFromRequest } from '@/lib/security/session';
import { SkuParamSchema } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sku: string }> }
): Promise<NextResponse> {
  try {
    const rawParams = await context.params;
    const parsedSku = SkuParamSchema.safeParse(rawParams);

    if (!parsedSku.success) {
      return NextResponse.json(
        { error: 'Invalid SKU parameter', details: parsedSku.error.format() },
        { status: 400 }
      );
    }

    const session = await getSessionFromRequest(req);

    if (!session) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Trade login required. Product pricing and ordering are restricted to approved accounts.',
        },
        { status: 401 }
      );
    }

    if (session.status !== 'APPROVED') {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Wholesale trade account approval required to access product pricing.',
          status: session.status,
        },
        { status: 403 }
      );
    }

    const normSku = parsedSku.data.sku.trim().toUpperCase();
    const item = await CatalogService.getCatalogItemBySku(normSku, session);

    if (!item) {
      return NextResponse.json(
        { error: 'Not Found', message: `Product ${normSku} not found or inactive` },
        { status: 404 }
      );
    }

    return NextResponse.json(item, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'ACCESS_DENIED_NOT_APPROVED') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Wholesale trade account approval required to access product pricing.' },
        { status: 403 }
      );
    }
    logger.error('Failed to retrieve catalog item', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve product item' },
      { status: 500 }
    );
  }
}
