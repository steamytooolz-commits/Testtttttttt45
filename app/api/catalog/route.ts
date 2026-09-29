import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/lib/services/catalog';
import { getSessionFromRequest } from '@/lib/security/session';
import { CatalogQuerySchema } from '@/lib/validation';
import { publicErrorMessage } from '@/lib/security/request';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const rawQuery: Record<string, string> = {};

    searchParams.forEach((val, key) => {
      rawQuery[key] = val;
    });

    const parsed = CatalogQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid filter parameters',
          details: parsed.error.format(),
        },
        { status: 400 }
      );
    }

    const session = await getSessionFromRequest(req);
    const catalog = await CatalogService.getCatalog(parsed.data, session);

    return NextResponse.json(catalog, { status: 200 });
  } catch (error) {
    logger.error('Failed to retrieve catalog', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: publicErrorMessage(error, 'Failed to retrieve catalog') },
      { status: 500 }
    );
  }
}
