import 'server-only';
import {
  findProducts,
  findProductBySku,
  listCategories,
  type ProductDocument,
  type CategoryDocument,
} from '@/lib/repo/mongo';
import { getCustomPrice, listCustomPrices } from '@/lib/repo/mysql';
import {
  computeFilterHash,
  getCachedCatalog,
  setCachedCatalog,
  type StoredSession,
} from '@/lib/repo/redis';
import { logger } from '@/lib/logger';
import type { CatalogQueryInput } from '@/lib/validation';

export interface PublicCatalogProduct {
  _id: string;
  sku: string;
  name: string;
  description: string;
  categoryRef: string;
  attributes: {
    paperWeight?: string;
    packCount?: number;
    colour?: string;
  };
  variants: string[];
  mediaRefs: string[];
  imageUrl?: string;
  active: boolean;
  updatedAt: string;
}

export interface ApprovedCatalogProduct extends PublicCatalogProduct {
  unit_price: string;
  tier_code: string;
  tier_name: string;
}

export interface CatalogTradeGateMeta {
  is_approved: boolean;
  status: 'PUBLIC' | 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED';
  message: string;
  quotedCount?: number;
  totalCount?: number;
}

export interface CatalogResponsePayload {
  products: (PublicCatalogProduct | ApprovedCatalogProduct)[];
  total: number;
  trade_gate: CatalogTradeGateMeta;
  filters_applied: {
    categoryRef?: string;
    paperWeight?: string;
    packCount?: number;
    colour?: string;
  };
}

  function sanitizePublicProduct(prod: ProductDocument): PublicCatalogProduct {
  return {
    _id: prod._id,
    sku: prod._id,
    name: prod.name,
    description: prod.description,
    categoryRef: prod.categoryRef,
    attributes: {
      ...(prod.attributes.paperWeight ? { paperWeight: prod.attributes.paperWeight } : {}),
      ...(prod.attributes.packCount ? { packCount: prod.attributes.packCount } : {}),
      ...(prod.attributes.colour ? { colour: prod.attributes.colour } : {}),
    },
    variants: Array.isArray(prod.variants) ? [...prod.variants] : [],
    mediaRefs: Array.isArray(prod.mediaRefs) ? [...prod.mediaRefs] : [],
    ...(prod.imageUrl ? { imageUrl: prod.imageUrl } : {}),
    active: prod.active,
    updatedAt: prod.updatedAt,
  };
}

export class CatalogService {
 
  static async getCatalog(
    filters: CatalogQueryInput,
    session: StoredSession | null
  ): Promise<CatalogResponsePayload> {
    const isApproved = session !== null && session.status === 'APPROVED';

    const filterKeyObj = {
      categoryRef: filters.categoryRef || '',
      paperWeight: filters.paperWeight || '',
      packCount: filters.packCount || '',
      colour: filters.colour || '',
    };
    const filterHash = computeFilterHash(filterKeyObj);

    let rawProducts: ProductDocument[] = [];
    const cachedData = await getCachedCatalog(filterHash);

    if (cachedData) {
      try {
        rawProducts = JSON.parse(cachedData) as ProductDocument[];
      } catch (err) {
        logger.warn('Failed to parse cached catalog JSON, falling back to MongoDB', { error: String(err) });
      }
    }

    if (rawProducts.length === 0) {

      rawProducts = await findProducts({
        categoryRef: filters.categoryRef,
        paperWeight: filters.paperWeight,
        packCount: filters.packCount,
        colour: filters.colour,
        activeOnly: true,
      });

      await setCachedCatalog(filterHash, JSON.stringify(rawProducts));
    }

    if (!isApproved) {

      const sanitized = rawProducts.map(sanitizePublicProduct);
      const userStatus = session ? session.status : 'PUBLIC';
      const message =
        userStatus === 'PENDING_APPROVAL'
          ? 'Thanks — your account is being set up. Full catalog access unlocks as soon as it is ready.'
          : 'Browse freely — sign up, then sign in, to unlock full catalog access and ordering.';

      return {
        products: sanitized,
        total: sanitized.length,
        trade_gate: {
          is_approved: false,
          status: userStatus,
          message,
        },
        filters_applied: {
          ...(filters.categoryRef ? { categoryRef: filters.categoryRef } : {}),
          ...(filters.paperWeight ? { paperWeight: filters.paperWeight } : {}),
          ...(filters.packCount ? { packCount: filters.packCount } : {}),
          ...(filters.colour ? { colour: filters.colour } : {}),
        },
      };
    }

    const customerId = session.customerId || 0;
    const customPrices = new Map(
      (await listCustomPrices(customerId)).map((row) => [row.sku, row.unit_price])
    );

    const enrichedProducts: (PublicCatalogProduct | ApprovedCatalogProduct)[] = rawProducts.map((prod) => {
      const publicBase = sanitizePublicProduct(prod);
      const custom = customPrices.get(prod._id);
      if (custom) {
        return {
          ...publicBase,
          unit_price: custom,
          tier_code: 'CUSTOM',
          tier_name: 'Quoted Price',
        };
      }
      return publicBase;
    });

    const quotedCount = enrichedProducts.filter((p) => 'unit_price' in p).length;

    return {
      products: enrichedProducts,
      total: enrichedProducts.length,
      trade_gate: {
        is_approved: true,
        status: 'APPROVED',
        message:
          quotedCount === 0
            ? 'No quoted prices yet — your sales representative will load your pricing shortly.'
            : `Showing ${quotedCount} of ${enrichedProducts.length} quoted prices. Items without a quoted price cannot be ordered.`,
        quotedCount,
        totalCount: enrichedProducts.length,
      },
      filters_applied: {
        ...(filters.categoryRef ? { categoryRef: filters.categoryRef } : {}),
        ...(filters.paperWeight ? { paperWeight: filters.paperWeight } : {}),
        ...(filters.packCount ? { packCount: filters.packCount } : {}),
        ...(filters.colour ? { colour: filters.colour } : {}),
      },
    };
  }

   static async getCatalogItemBySku(
    sku: string,
    session: StoredSession | null
  ): Promise<ApprovedCatalogProduct | null> {
    if (!session || session.status !== 'APPROVED') {
      throw new Error('ACCESS_DENIED_NOT_APPROVED');
    }

    const normSku = sku.trim().toUpperCase();
    const rawProduct = await findProductBySku(normSku);
    if (!rawProduct || !rawProduct.active) {
      return null;
    }

    const customerId = session.customerId || 0;
    const custom = await getCustomPrice(customerId, normSku);
    if (!custom) {
      return null;
    }
    return {
      ...sanitizePublicProduct(rawProduct),
      unit_price: custom,
      tier_code: 'CUSTOM',
      tier_name: 'Quoted Price',
    };
  }

   static async getCustomerTierPrice(
    customerId: number,
    sku: string
  ): Promise<{ unitPrice: string; tierCode: string; tierName: string } | null> {
    const normSku = sku.trim().toUpperCase();
    const custom = await getCustomPrice(customerId, normSku);
    if (!custom) {
      return null;
    }
    return { unitPrice: custom, tierCode: 'CUSTOM', tierName: 'Quoted Price' };
  }

   static async getCategories(): Promise<CategoryDocument[]> {
    return await listCategories();
  }
}
