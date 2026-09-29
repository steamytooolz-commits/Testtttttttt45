import 'server-only';
import {
  getCart,
  saveCart,
  deleteCart,
  type CartData,
  type CartLineItem,
} from '@/lib/repo/redis';
import {
  upsertDraftOrder,
  getDraftOrder,
  deleteDraftOrder,
  parseCents,
  formatCents,
} from '@/lib/repo/mysql';
import { findProductBySku } from '@/lib/repo/mongo';
import { CatalogService } from './catalog';

function calculateCartTotals(items: CartLineItem[]): { subtotal: string; vat: string; total: string } {
  let subtotalCents = BigInt(0);
  for (const item of items) {
    const unitPriceCents = parseCents(item.unit_price);
    const lineTotalCents = unitPriceCents * BigInt(item.qty);
    item.line_total = formatCents(lineTotalCents);
    subtotalCents += lineTotalCents;
  }

  const vatCents = (subtotalCents * BigInt(15) + BigInt(50)) / BigInt(100);
  const totalCents = subtotalCents + vatCents;

  return {
    subtotal: formatCents(subtotalCents),
    vat: formatCents(vatCents),
    total: formatCents(totalCents),
  };
}

export class CartService {
 
  static async getCart(customerId: number): Promise<CartData> {
    const cached = await getCart(customerId);
    if (cached) {
      return cached;
    }

    const draft = await getDraftOrder(customerId);
    if (draft) {
      try {
        const parsed = JSON.parse(draft.payload_json) as CartData;

        await saveCart(customerId, parsed);
        return parsed;
      } catch {

      }
    }

    return {
      customerId,
      items: [],
      subtotal: '0.00',
      vat: '0.00',
      total: '0.00',
      updatedAt: new Date().toISOString(),
    };
  }

   static async addItem(customerId: number, sku: string, qty: number): Promise<CartData> {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error('Quantity must be a positive integer');
    }

    const normSku = sku.trim().toUpperCase();

    const product = await findProductBySku(normSku);
    if (!product || !product.active) {
      throw new Error(`Product ${normSku} not found or inactive`);
    }

    const resolvedPrice = await CatalogService.getCustomerTierPrice(customerId, normSku);
    if (!resolvedPrice) {
      throw new Error(`No quoted price for SKU ${normSku} — contact sales to have it quoted`);
    }

    const currentCart = await this.getCart(customerId);
    const existingIndex = currentCart.items.findIndex((item) => item.sku === normSku);

    if (existingIndex >= 0) {
      currentCart.items[existingIndex].qty += qty;

      currentCart.items[existingIndex].unit_price = resolvedPrice.unitPrice;
      currentCart.items[existingIndex].tier_code = resolvedPrice.tierCode;
    } else {
      const unitPriceCents = parseCents(resolvedPrice.unitPrice);
      const lineTotalCents = unitPriceCents * BigInt(qty);
      currentCart.items.push({
        sku: normSku,
        description: product.name,
        qty,
        unit_price: resolvedPrice.unitPrice,
        tier_code: resolvedPrice.tierCode,
        vat_rate: '15.00',
        line_total: formatCents(lineTotalCents),
      });
    }

    const totals = calculateCartTotals(currentCart.items);
    currentCart.subtotal = totals.subtotal;
    currentCart.vat = totals.vat;
    currentCart.total = totals.total;
    currentCart.updatedAt = new Date().toISOString();

    await saveCart(customerId, currentCart);

    await upsertDraftOrder(customerId, JSON.stringify(currentCart));

    return currentCart;
  }

   static async updateItemQty(customerId: number, sku: string, qty: number): Promise<CartData> {
    if (!Number.isInteger(qty) || qty < 0) {
      throw new Error('Quantity must be a non-negative integer');
    }

    if (qty === 0) {
      return this.removeItem(customerId, sku);
    }

    const normSku = sku.trim().toUpperCase();
    const currentCart = await this.getCart(customerId);
    const existingIndex = currentCart.items.findIndex((item) => item.sku === normSku);

    if (existingIndex === -1) {
      throw new Error(`SKU ${normSku} not found in cart`);
    }

    currentCart.items[existingIndex].qty = qty;

    const resolvedPrice = await CatalogService.getCustomerTierPrice(customerId, normSku);
    if (!resolvedPrice) {
      throw new Error(`No quoted price for SKU ${normSku} — contact sales to have it quoted`);
    }
    currentCart.items[existingIndex].unit_price = resolvedPrice.unitPrice;
    currentCart.items[existingIndex].tier_code = resolvedPrice.tierCode;

    const totals = calculateCartTotals(currentCart.items);
    currentCart.subtotal = totals.subtotal;
    currentCart.vat = totals.vat;
    currentCart.total = totals.total;
    currentCart.updatedAt = new Date().toISOString();

    await saveCart(customerId, currentCart);
    await upsertDraftOrder(customerId, JSON.stringify(currentCart));

    return currentCart;
  }

   static async removeItem(customerId: number, sku: string): Promise<CartData> {
    const normSku = sku.trim().toUpperCase();
    const currentCart = await this.getCart(customerId);
    currentCart.items = currentCart.items.filter((item) => item.sku !== normSku);

    const totals = calculateCartTotals(currentCart.items);
    currentCart.subtotal = totals.subtotal;
    currentCart.vat = totals.vat;
    currentCart.total = totals.total;
    currentCart.updatedAt = new Date().toISOString();

    await saveCart(customerId, currentCart);
    await upsertDraftOrder(customerId, JSON.stringify(currentCart));

    return currentCart;
  }

   static async clearCart(customerId: number): Promise<void> {
    await deleteCart(customerId);
    await deleteDraftOrder(customerId);
  }
}
