import 'server-only';
import {
  listStaffOrders,
  transitionOrderStatus,
  type StaffQueueOrder,
  type OrderStatus,
  type OrderTransitionAction,
  type TransitionOrderResult,
  type UserRole,
  findSalesOrderById,
  getSalesOrderLines,
  getInvoiceByOrderId,
  findCustomerById,
  listPaymentProofsByOrderId,
} from '@/lib/repo/mysql';
import { getInvoiceDocumentData, buildInvoicePdfBuffer } from './documents';
import { sendMail, salesTeamEmails } from './mailer';

export interface StaffOrderDetails extends StaffQueueOrder {
  customerDetails?: ReturnType<typeof findCustomerById> extends Promise<infer U> ? U : null;
}

/**
 * Best-effort notification: email the sales invoice PDF to the sales team
 * when it is issued. Failures are logged and swallowed — issuance must never
 * break because the mail relay is down.
 */
async function emailInvoiceToSalesTeam(orderId: number): Promise<void> {
  try {
    const invoice = await getInvoiceByOrderId(orderId);
    if (!invoice) return;
    const data = await getInvoiceDocumentData(invoice.id, 'SALES_STAFF', null);
    const pdf = await buildInvoicePdfBuffer(data);
    await sendMail({
      to: salesTeamEmails(),
      subject: `Sales invoice ${data.invoice.invoice_number} — ${data.customer?.company_name || 'customer'} (R ${data.invoice.total})`,
      text:
        `A sales invoice was issued from the order queue.\n\n` +
        `Invoice: ${data.invoice.invoice_number}\n` +
        `Order: ${data.order.order_number}\n` +
        `Customer: ${data.customer?.company_name || 'Unknown'}\n` +
        `Total: R ${data.invoice.total} (incl. VAT R ${data.invoice.vat})\n\n` +
        `The PDF is attached for capture in Pastel.`,
      attachments: [
        {
          filename: `invoice_${data.invoice.invoice_number}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    console.error(
      `[staff_queue] failed to email sales invoice for order #${orderId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

export class StaffQueueService {
 
  static async getQueue(options?: {
    status?: OrderStatus | 'ALL';
    limit?: number;
    offset?: number;
  }): Promise<StaffQueueOrder[]> {
    return listStaffOrders(options);
  }

   static async getOrderDetails(orderId: number): Promise<StaffQueueOrder | null> {
    const order = await findSalesOrderById(orderId);
    if (!order) return null;

    const customer = await findCustomerById(order.customer_id);
    const lines = await getSalesOrderLines(orderId);
    const invoice = await getInvoiceByOrderId(orderId);
    const proofs = await listPaymentProofsByOrderId(orderId);

    return {
      ...order,
      customer,
      lines,
      invoice,
      proofs,
    };
  }

   static async transitionOrder(params: {
    orderId: number;
    action: OrderTransitionAction;
    actorId: number;
    actorRole: UserRole;
    cancelReason?: string;
    clientIp?: string;
  }): Promise<TransitionOrderResult> {
    const result = await transitionOrderStatus(params);

    if (params.action === 'INVOICE' && result.invoice) {
      await emailInvoiceToSalesTeam(params.orderId);
    }

    return result;
  }
}
