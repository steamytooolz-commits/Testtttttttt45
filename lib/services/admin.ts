import 'server-only';
import {
  listAllCustomers,
  updateCustomerStatusAndTier,
  updateCustomerBusinessProfile,
  listAllStockBalances,
  adjustStockBalance,
  listStockMovements,
  getTaxReportSummary,
  listAuditLogsFiltered,
  listPriceTiers,
  createPriceTier,
  updatePriceTier,
  eraseCustomerPii,
  createAuditLog,
  type UserStatus,
  type UserRole,
  type CustomerWithTierInfo,
  type StockBalanceRow,
  type StockMovementRow,
  type TaxReportSummary,
  type AuditLogRow,
} from '@/lib/repo/mysql';
import { computeSha256 } from '@/lib/security/crypto';
import { revokeAllUserSessions } from '@/lib/repo/redis';
import { findProducts, type ProductDocument } from '@/lib/repo/mongo';

export function escapeSpreadsheetCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\r\n;|]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export interface InventoryStockItem {
  sku: string;
  name: string;
  category: string;
  description: string;
  qty: number;
  reserved: number;
  available: number;
  updated_at: string;
}

export class AdminService {
 
  static async listCustomers(params?: {
    status?: UserStatus;
    search?: string;
  }): Promise<CustomerWithTierInfo[]> {
    return listAllCustomers(params);
  }

   static async updateCustomer(params: {
    customerId: number;
    status?: UserStatus;
    tierId?: number;
    actorId: number;
    actorRole: UserRole;
    clientIp?: string;
  }): Promise<CustomerWithTierInfo> {
    const result = await updateCustomerStatusAndTier(params);
    if (params.status === 'SUSPENDED' || params.status === 'PENDING_APPROVAL') {
      if (result.user_id) {
        await revokeAllUserSessions(result.user_id);
      }
    }
    return result;
  }

  static async updateBusinessProfile(params: {
    customerId: number;
    businessType: string | null;
    vatNumber: string | null;
    creditLimit: string | null;
    paymentTerms: string;
    logoUrl: string | null;
    actorId: number;
    actorRole: UserRole;
    clientIp?: string;
  }): Promise<CustomerWithTierInfo> {
    return updateCustomerBusinessProfile(params);
  }

   static async listPriceTiers() {
    return listPriceTiers();
  }

  static async createTier(params: {
    code: string;
    name: string;
    basis: Record<string, string>;
    active?: boolean;
    actorId: number;
    actorRole: UserRole;
    clientIp?: string;
  }) {
    return createPriceTier({
      code: params.code,
      name: params.name,
      basis: JSON.stringify(params.basis),
      active: params.active ?? true,
      actorId: params.actorId,
      actorRole: params.actorRole,
      clientIp: params.clientIp,
    });
  }

  static async updateTier(params: {
    id: number;
    code?: string;
    name?: string;
    basis?: Record<string, string>;
    active?: boolean;
    actorId: number;
    actorRole: UserRole;
    clientIp?: string;
  }) {
    return updatePriceTier({
      id: params.id,
      code: params.code,
      name: params.name,
      basis: params.basis === undefined ? undefined : JSON.stringify(params.basis),
      active: params.active,
      actorId: params.actorId,
      actorRole: params.actorRole,
      clientIp: params.clientIp,
    });
  }

  static async eraseCustomer(params: { customerId: number; actorId: number; actorRole: UserRole; clientIp?: string }) {
    const result = await eraseCustomerPii(params);
    const { memoryDb } = await import('@/lib/repo/mysql/client');
    for (const u of memoryDb.users.values()) {
      if (u.customer_id === params.customerId) {
        await revokeAllUserSessions(u.id);
      }
    }
    return result;
  }

   static async listInventoryStock(): Promise<InventoryStockItem[]> {
    const [balances, mongoProducts] = await Promise.all([
      listAllStockBalances(),
      findProducts({}),
    ]);

    const productMap = new Map<string, ProductDocument>();
    for (const p of mongoProducts) {
      const sku = p._id || (p as { sku?: string }).sku;
      if (sku) {
        productMap.set(sku, p);
      }
    }

    const stockItems: InventoryStockItem[] = [];

    for (const b of balances) {
      const prod = productMap.get(b.sku);
      stockItems.push({
        sku: b.sku,
        name: prod?.name || b.sku,
        category: prod?.categoryRef || 'General Stationery',
        description: prod?.description || '',
        qty: b.qty,
        reserved: b.reserved,
        available: Math.max(0, b.qty - b.reserved),
        updated_at: b.updated_at,
      });
      productMap.delete(b.sku);
    }

    for (const prod of productMap.values()) {
      const sku = prod._id || (prod as { sku?: string }).sku;
      if (!sku) continue;
      stockItems.push({
        sku,
        name: prod.name,
        category: prod.categoryRef,
        description: prod.description,
        qty: 0,
        reserved: 0,
        available: 0,
        updated_at: new Date().toISOString(),
      });
    }

    return stockItems.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
  }

   static async adjustStock(params: {
    sku: string;
    delta: number;
    reason: 'ADJUSTMENT' | 'IMPORT' | 'REFUND';
    refId: string;
    actorId: number;
    actorRole: UserRole;
    clientIp?: string;
  }): Promise<{ stock: StockBalanceRow; movement: StockMovementRow }> {
    return adjustStockBalance(params);
  }

   static async listStockMovements(params?: {
    sku?: string;
    limit?: number;
  }): Promise<StockMovementRow[]> {
    return listStockMovements(params);
  }

   static async getTaxReport(params?: {
    fromDate?: string;
    toDate?: string;
  }): Promise<TaxReportSummary> {
    return getTaxReportSummary(params);
  }

   static async listAuditLogs(params?: {
    action?: string;
    entityType?: string;
    actorRole?: string;
    limit?: number;
  }): Promise<AuditLogRow[]> {
    return listAuditLogsFiltered(params);
  }

   static async exportData(params: {
    type: 'invoices' | 'customers' | 'inventory' | 'audit';
    format: 'csv' | 'json';
    actorId: number;
    actorRole: UserRole;
    clientIp?: string;
  }): Promise<{ content: string; contentType: string; filename: string }> {
    const { type, format, actorId, actorRole, clientIp = '127.0.0.1' } = params;

    if (actorRole !== 'ADMIN' && actorRole !== 'SALES_STAFF') {
      throw new Error('FORBIDDEN: Insufficient permissions for data export');
    }

    await createAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'DATA_EXPORT',
      entity_type: type,
      entity_id: format,
      before_hash: null,
      after_hash: computeSha256({ type, format, timestamp: new Date().toISOString() }),
      ip: clientIp,
    });

    const timestamp = new Date().toISOString().slice(0, 10);

    if (type === 'invoices') {
      const taxReport = await getTaxReportSummary();
      if (taxReport.invoices.length > 20000) {
        throw new Error('EXPORT_TOO_LARGE: Invoice export exceeds the 20000 row limit');
      }
      if (format === 'json') {
        return {
          content: JSON.stringify(taxReport, null, 2),
          contentType: 'application/json',
          filename: `sales_invoices_${timestamp}.json`,
        };
      }

      const headers = ['Invoice Number', 'Order Number', 'Company Name', 'Issued Date', 'Subtotal (ZAR)', 'VAT 15% (ZAR)', 'Total (ZAR)', 'Status'];
      const rows = taxReport.invoices.map((inv) => [
        inv.invoice_number,
        inv.order_number || `SO-${inv.order_id}`,
        inv.company_name || '',
        inv.issued_at,
        inv.subtotal,
        inv.vat,
        inv.total,
        inv.status,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.map(escapeSpreadsheetCell).join(','))].join('\r\n');
      return {
        content: csvContent,
        contentType: 'text/csv',
        filename: `sales_invoices_${timestamp}.csv`,
      };
    }

    if (type === 'customers') {
      const customers = await listAllCustomers();
      if (customers.length > 20000) {
        throw new Error('EXPORT_TOO_LARGE: Customer export exceeds the 20000 row limit');
      }
      if (format === 'json') {
        return {
          content: JSON.stringify(customers, null, 2),
          contentType: 'application/json',
          filename: `trade_customers_${timestamp}.json`,
        };
      }

      const headers = ['ID', 'Company Name', 'Contact Name', 'Email', 'Phone', 'Status', 'Price Tier', 'User Status', 'Created At'];
      const rows = customers.map((c) => [
        c.id,
        c.company_name,
        c.contact_name,
        c.email,
        c.phone,
        c.status,
        c.assigned_tier_code || 'TIER_1',
        c.user_status || 'PENDING_APPROVAL',
        c.created_at,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.map(escapeSpreadsheetCell).join(','))].join('\r\n');
      return {
        content: csvContent,
        contentType: 'text/csv',
        filename: `trade_customers_${timestamp}.csv`,
      };
    }

    if (type === 'inventory') {
      const inventory = await this.listInventoryStock();
      if (inventory.length > 20000) {
        throw new Error('EXPORT_TOO_LARGE: Inventory export exceeds the 20000 row limit');
      }
      if (format === 'json') {
        return {
          content: JSON.stringify(inventory, null, 2),
          contentType: 'application/json',
          filename: `inventory_stock_${timestamp}.json`,
        };
      }

      const headers = ['SKU', 'Product Name', 'Category', 'Total Physical Qty', 'Reserved Qty', 'Available Qty', 'Last Updated'];
      const rows = inventory.map((item) => [
        item.sku,
        item.name,
        item.category,
        item.qty,
        item.reserved,
        item.available,
        item.updated_at,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.map(escapeSpreadsheetCell).join(','))].join('\r\n');
      return {
        content: csvContent,
        contentType: 'text/csv',
        filename: `inventory_stock_${timestamp}.csv`,
      };
    }

    if (type === 'audit') {
      const logs = await listAuditLogsFiltered({ limit: 500 });
      if (format === 'json') {
        return {
          content: JSON.stringify(logs, null, 2),
          contentType: 'application/json',
          filename: `compliance_audit_log_${timestamp}.json`,
        };
      }

      const headers = ['ID', 'Timestamp', 'Actor ID', 'Actor Role', 'Action', 'Entity Type', 'Entity ID', 'Before Hash', 'After Hash', 'IP Address'];
      const rows = logs.map((l) => [
        l.id,
        l.created_at,
        l.actor_id ?? 'SYSTEM',
        l.actor_role ?? 'SYSTEM',
        l.action,
        l.entity_type,
        l.entity_id,
        l.before_hash || '',
        l.after_hash || '',
        l.ip,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.map(escapeSpreadsheetCell).join(','))].join('\r\n');
      return {
        content: csvContent,
        contentType: 'text/csv',
        filename: `compliance_audit_log_${timestamp}.csv`,
      };
    }

    throw new Error(`UNSUPPORTED_EXPORT_TYPE: Export type '${type}' is not supported`);
  }
}
