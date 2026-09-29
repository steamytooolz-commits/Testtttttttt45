import 'server-only';
import {
  acquireStockLock,
  releaseStockLock,
} from '@/lib/repo/redis';
import {
  executeCheckoutTransaction,
  type CheckoutResult,
} from '@/lib/repo/mysql';
import { CartService } from './cart';

export class CheckoutService {
 
  static async processCheckout(params: {
    customerId: number;
    userId: number;
    clientIp: string;
  }): Promise<CheckoutResult> {
    const { customerId, userId, clientIp } = params;

    const cart = await CartService.getCart(customerId);
    if (!cart.items || cart.items.length === 0) {
      throw new Error('CART_EMPTY: Cannot checkout an empty cart');
    }

    const sortedSkus = [...new Set(cart.items.map((i) => i.sku))].sort();
    const acquiredLocks = new Map<string, string>();

    try {

      for (const sku of sortedSkus) {
        const token = await acquireStockLock(sku, 10);
        if (!token) {
          throw new Error(
            `STOCK_LOCK_CONFLICT: Inventory for SKU ${sku} is currently locked by a concurrent checkout. Please try again.`
          );
        }
        acquiredLocks.set(sku, token);
      }

      const result = await executeCheckoutTransaction({
        customerId,
        createdBy: userId,
        lines: cart.items,
        clientIp,
      });

      await CartService.clearCart(customerId);

      return result;
    } finally {

      for (const [sku, token] of acquiredLocks.entries()) {
        try {
          await releaseStockLock(sku, token);
        } catch {

        }
      }
    }
  }
}
