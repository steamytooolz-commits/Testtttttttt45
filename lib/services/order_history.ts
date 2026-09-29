import 'server-only';
import {
  findSalesOrderById,
  listSalesOrdersByCustomer,
  getSalesOrderLines,
  getInvoiceByOrderId,
  getInvoiceById,
  listInvoicesByCustomerId,
  findCustomerById,
  createAuditLog,
  type SalesOrderRow,
  type SalesOrderLineRow,
  type InvoiceRow,
  type CustomerRow,
  type UserRole,
} from '@/lib/repo/mysql';
import { CartService } from '@/lib/services/cart';
import { findProductBySku } from '@/lib/repo/mongo';
import { computeSha256 } from '@/lib/security/crypto';
import type { CartData } from '@/lib/repo/redis';

export interface CustomerOrderHistoryItem extends SalesOrderRow {
  lines: SalesOrderLineRow[];
  invoice?: InvoiceRow | null;
}

export interface CustomerInvoiceHistoryItem extends InvoiceRow {
  order_number: string;
  lines: SalesOrderLineRow[];
  customer?: CustomerRow | null;
}

export class OrderHistoryService {
 
  static async listCustomerOrders(customerId: number): Promise<CustomerOrderHistoryItem[]> {
    const orders = await listSalesOrdersByCustomer(customerId);

    const fullOrders: CustomerOrderHistoryItem[] = await Promise.all(
      orders.map(async (order) => {
        const [lines, invoice] = await Promise.all([
          getSalesOrderLines(order.id),
          getInvoiceByOrderId(order.id),
        ]);
        return {
          ...order,
          lines,
          invoice,
        };
      })
    );

    return fullOrders;
  }

   static async getOrderDetails(params: {
    orderId: number;
    actorRole: UserRole;
    actorCustomerId?: number | null;
  }): Promise<CustomerOrderHistoryItem> {
    const { orderId, actorRole, actorCustomerId } = params;

    const order = await findSalesOrderById(orderId);
    if (!order) {
      throw new Error(`ORDER_NOT_FOUND: Sales order #${orderId} was not found`);
    }

    if (actorRole === 'CUSTOMER' && order.customer_id !== actorCustomerId) {
      throw new Error('FORBIDDEN: You do not have permission to view this order');
    }

    const [lines, invoice] = await Promise.all([
      getSalesOrderLines(order.id),
      getInvoiceByOrderId(order.id),
    ]);

    return {
      ...order,
      lines,
      invoice,
    };
  }

   static async repeatOrder(params: {
    orderId: number;
    customerId: number;
    userId: number;
    clientIp?: string;
  }): Promise<{
    success: boolean;
    cart: CartData;
    clonedCount: number;
    skippedSkus: string[];
    orderNumber: string;
  }> {
    const { orderId, customerId, userId, clientIp = '127.0.0.1' } = params;

    const order = await findSalesOrderById(orderId);
    if (!order) {
      throw new Error(`ORDER_NOT_FOUND: Sales order #${orderId} was not found`);
    }

    if (order.customer_id !== customerId) {
      throw new Error('FORBIDDEN: You can only repeat orders placed by your account');
    }

    const lines = await getSalesOrderLines(orderId);
    if (lines.length === 0) {
      throw new Error('EMPTY_ORDER: No line items found on this order to repeat');
    }

    let clonedCount = 0;
    const skippedSkus: string[] = [];

    for (const line of lines) {
      try {
        const product = await findProductBySku(line.sku);
        if (!product || !product.active) {
          skippedSkus.push(line.sku);
          continue;
        }

        await CartService.addItem(customerId, line.sku, line.qty);
        clonedCount++;
      } catch {
        skippedSkus.push(line.sku);
      }
    }

    const updatedCart = await CartService.getCart(customerId);

    await createAuditLog({
      actor_id: userId,
      actor_role: 'CUSTOMER',
      action: 'ORDER_REPEAT',
      entity_type: 'sales_orders',
      entity_id: String(orderId),
      before_hash: null,
      after_hash: computeSha256({
        original_order_number: order.order_number,
        cloned_items_count: clonedCount,
        skipped_skus: skippedSkus,
      }),
      ip: clientIp,
    });

    return {
      success: true,
      cart: updatedCart,
      clonedCount,
      skippedSkus,
      orderNumber: order.order_number,
    };
  }

   static async listCustomerInvoices(customerId: number): Promise<CustomerInvoiceHistoryItem[]> {
    const invoices = await listInvoicesByCustomerId(customerId);
    const customer = await findCustomerById(customerId);

    const fullInvoices: CustomerInvoiceHistoryItem[] = await Promise.all(
      invoices.map(async (inv) => {
        const [order, lines] = await Promise.all([
          findSalesOrderById(inv.order_id),
          getSalesOrderLines(inv.order_id),
        ]);
        return {
          ...inv,
          order_number: order?.order_number || `SO-${inv.order_id}`,
          lines,
          customer,
        };
      })
    );

    return fullInvoices;
  }

   static async getInvoiceDetails(params: {
    invoiceId: number;
    actorRole: UserRole;
    actorCustomerId?: number | null;
  }): Promise<CustomerInvoiceHistoryItem> {
    const { invoiceId, actorRole, actorCustomerId } = params;

    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      throw new Error(`INVOICE_NOT_FOUND: Invoice #${invoiceId} was not found`);
    }

    const order = await findSalesOrderById(invoice.order_id);
    if (!order) {
      throw new Error(`ORDER_NOT_FOUND: Order #${invoice.order_id} associated with invoice not found`);
    }

    if (actorRole === 'CUSTOMER' && order.customer_id !== actorCustomerId) {
      throw new Error('FORBIDDEN: You do not have permission to view this invoice');
    }

    const [lines, customer] = await Promise.all([
      getSalesOrderLines(order.id),
      findCustomerById(order.customer_id),
    ]);

    return {
      ...invoice,
      order_number: order.order_number,
      lines,
      customer,
    };
  }
}
