import 'server-only';
import { ensureCategory, findProductBySku, upsertProduct, type ProductDocument } from '@/lib/repo/mongo';
import {
  getStockBalance,
  setStockBalance,
  createAuditLog,
  createPriceTier,
  updatePriceTier,
  listPriceTiers,
  type UserRole,
} from '@/lib/repo/mysql';
import { invalidateCatalogCache } from '@/lib/repo/redis';
import { computeSha256 } from '@/lib/security/crypto';
import type { ProductCreateInput, ProductUpdateInput } from '@/lib/validation';

export async function createProduct(params: {
  input: ProductCreateInput;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<ProductDocument> {
  const { input, actorId, actorRole, clientIp = '127.0.0.1' } = params;
  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can create products');
  }
  const existing = await findProductBySku(input.sku);
  if (existing) {
    throw new Error(`SKU_EXISTS: Product '${input.sku}' already exists`);
  }
  const category = await ensureCategory(input.category);
  const doc = await upsertProduct({
    _id: input.sku,
    name: input.name,
    description: input.description || '',
    categoryRef: category._id,
    attributes: {
      ...(input.paperWeight ? { paperWeight: input.paperWeight } : {}),
      ...(input.packCount ? { packCount: input.packCount } : {}),
      ...(input.colour ? { colour: input.colour } : {}),
    },
    variants: [],
    mediaRefs: [],
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    active: input.active,
    updatedAt: new Date().toISOString(),
  });
  const currentStock = await getStockBalance(input.sku);
  if (!currentStock) {
    await setStockBalance(input.sku, input.stockQty, 0);
  }
  if (input.prices) {
    await applyTierPrices(input.sku, input.prices, actorId, actorRole, clientIp);
  }
  await invalidateCatalogCache();
  await createAuditLog({
    actor_id: actorId,
    actor_role: actorRole,
    action: 'PRODUCT_CREATED',
    entity_type: 'products',
    entity_id: input.sku,
    before_hash: null,
    after_hash: computeSha256({ sku: input.sku, name: input.name }),
    ip: clientIp,
  });
  return doc;
}

export async function updateProduct(params: {
  sku: string;
  input: ProductUpdateInput;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<ProductDocument> {
  const { sku, input, actorId, actorRole, clientIp = '127.0.0.1' } = params;
  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can update products');
  }
  const existing = await findProductBySku(sku);
  if (!existing) {
    throw new Error(`PRODUCT_NOT_FOUND: Product '${sku}' does not exist`);
  }
  const categoryRef = input.category ? (await ensureCategory(input.category))._id : existing.categoryRef;
  const paperWeight = input.paperWeight ?? existing.attributes.paperWeight;
  const packCount = input.packCount ?? existing.attributes.packCount;
  const colour = input.colour ?? existing.attributes.colour;
  const next: ProductDocument = {
    ...existing,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    categoryRef,
    attributes: {
      ...(paperWeight ? { paperWeight } : {}),
      ...(packCount ? { packCount } : {}),
      ...(colour ? { colour } : {}),
    },
    active: input.active ?? existing.active,
    updatedAt: new Date().toISOString(),
  };
  if (input.imageUrl !== undefined) {
    if (input.imageUrl) {
      next.imageUrl = input.imageUrl;
    } else {
      delete next.imageUrl;
    }
  }
  const doc = await upsertProduct(next);
  if (input.prices) {
    await applyTierPrices(sku, input.prices, actorId, actorRole, clientIp);
  }
  await invalidateCatalogCache();
  await createAuditLog({
    actor_id: actorId,
    actor_role: actorRole,
    action: 'PRODUCT_UPDATED',
    entity_type: 'products',
    entity_id: sku,
    before_hash: computeSha256({ name: existing.name }),
    after_hash: computeSha256({ name: doc.name }),
    ip: clientIp,
  });
  return doc;
}

async function applyTierPrices(
  sku: string,
  prices: Record<string, string>,
  actorId: number,
  actorRole: UserRole,
  clientIp: string
): Promise<void> {
  const tiers = await listPriceTiers();
  const byCode = new Map(tiers.map((t) => [t.code, t]));
  for (const [tierCode, price] of Object.entries(prices)) {
    const code = tierCode.trim().toUpperCase();
    const tier = byCode.get(code);
    if (!tier) {
      await createPriceTier({
        code,
        name: code,
        basis: JSON.stringify({ [sku]: price }),
        active: true,
        actorId,
        actorRole,
        clientIp,
      });
      continue;
    }
    let basis: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(tier.basis);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'string') basis[k] = v;
        }
      }
    } catch {
      basis = {};
    }
    basis[sku] = price;
    await updatePriceTier({ id: tier.id, basis: JSON.stringify(basis), actorId, actorRole, clientIp });
  }
}
