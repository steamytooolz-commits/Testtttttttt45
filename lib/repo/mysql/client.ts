import 'server-only';
import crypto from 'node:crypto';
import { logger } from '@/lib/logger';
import { getMongoDb } from '@/lib/repo/mongo/client';
import type {
  CustomerRow,
  UserRow,
  AuditLogRow,
  PriceTierRow,
  CustomerTierAssignmentRow,
  CustomerProductPriceRow,
  StockBalanceRow,
  DraftOrderRow,
  SalesOrderRow,
  SalesOrderLineRow,
  StockMovementRow,
  InvoiceRow,
  CreditNoteRow,
  RequisitionTemplateRow,
  PaymentProofRow,
  PasswordResetRequestRow,
} from './types';

export interface SqlQueryResult<T> {
  rows: T[];
  insertId?: number;
  affectedRows?: number;
}

class MemorySqlDb {
  public users: Map<number, UserRow> = new Map();
  public customers: Map<number, CustomerRow> = new Map();
  public auditLogs: AuditLogRow[] = [];
  public priceTiers: Map<number, PriceTierRow> = new Map();
  public customerTierAssignments: Map<number, CustomerTierAssignmentRow> = new Map();
  public customProductPrices: Map<string, CustomerProductPriceRow> = new Map();
  public stockBalances: Map<string, StockBalanceRow> = new Map();
  public draftOrders: Map<number, DraftOrderRow> = new Map();
  public salesOrders: Map<number, SalesOrderRow> = new Map();
  public salesOrderLines: Map<number, SalesOrderLineRow[]> = new Map();
  public stockMovements: StockMovementRow[] = [];
  public invoices: Map<number, InvoiceRow> = new Map();
  public invoiceSequences: Map<number, number> = new Map([[1, 10001]]);
  public creditNotes: Map<number, CreditNoteRow> = new Map();
  public creditNoteSequences: Map<number, number> = new Map([[1, 50001]]);
  public paymentProofs: PaymentProofRow[] = [];
  public passwordResetRequests: Map<number, PasswordResetRequestRow> = new Map();
  public requisitionTemplates: Map<number, RequisitionTemplateRow> = new Map();
  private userSeq = 1;
  private customerSeq = 1;
  private auditSeq = 1;
  public salesOrderSeq = 1001;
  private draftOrderSeq = 1;
  private salesOrderLineSeq = 1;
  private stockMovementSeq = 1;
  public invoiceRowSeq = 1;
  public creditNoteRowSeq = 1;
  public requisitionTemplateSeq = 1;
  public paymentProofSeq = 1;
  public passwordResetRequestSeq = 1;

  private rowLocks = new Map<string, Promise<void>>();

  constructor() {
    this.seedStagingFixtures();
  }

  private seedStagingFixtures(): void {
    const now = new Date().toISOString();

    const defaultHash = '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHRzdGF0aW9uZXJ5$nSsqz7rI40+7dGfxsN71N+2d9Mbgf3QvN7N17R3d9+Q';
    const defaultTotp = 'b1d927a4e69b0c2a71d8e123:c5b8e90a1f2b3c4d5e6f7081:1a2b3c4d5e6f';

    this.users.set(1, {
      id: 1,
      customer_id: null,
      role: 'ADMIN',
      email: 'admin@stationerydepot.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'APPROVED',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    this.users.set(2, {
      id: 2,
      customer_id: null,
      role: 'SALES_STAFF',
      email: 'staff1@stationerydepot.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'APPROVED',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    this.users.set(3, {
      id: 3,
      customer_id: null,
      role: 'SALES_STAFF',
      email: 'staff2@stationerydepot.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'APPROVED',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    this.customers.set(1, {
      id: 1,
      public_id: '11111111-1111-4111-8111-111111111111',
      company_name: 'Cape Office Supplies (Pty) Ltd',
      contact_name: 'Sarah Jenkins',
      email: 'procurement@capeoffice.co.za',
      phone: '+27215551234',
      address_json: JSON.stringify({ street: '14 Industrial Way', city: 'Cape Town', province: 'Western Cape', postal_code: '8001' }),
      status: 'APPROVED',
      created_at: now,
      is_new_prospect: false,
    });
    this.users.set(4, {
      id: 4,
      customer_id: 1,
      role: 'CUSTOMER',
      email: 'procurement@capeoffice.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'APPROVED',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    this.customers.set(2, {
      id: 2,
      public_id: '22222222-2222-4222-8222-222222222222',
      company_name: 'Durban Educational Trust',
      contact_name: 'Sipho Ndlovu',
      email: 'orders@durbanschools.co.za',
      phone: '+27315554321',
      address_json: JSON.stringify({ street: '45 Marine Drive', city: 'Durban', province: 'KwaZulu-Natal', postal_code: '4001' }),
      status: 'PENDING_APPROVAL',
      created_at: now,
      is_new_prospect: false,
    });
    this.users.set(5, {
      id: 5,
      customer_id: 2,
      role: 'CUSTOMER',
      email: 'orders@durbanschools.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'PENDING_APPROVAL',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    this.customers.set(3, {
      id: 3,
      public_id: '33333333-3333-4333-8333-333333333333',
      company_name: 'Highveld Commercial Printers',
      contact_name: 'Johan Botha',
      email: 'admin@highveldprint.co.za',
      phone: '+27115559876',
      address_json: JSON.stringify({ street: '88 Main Reef Rd', city: 'Johannesburg', province: 'Gauteng', postal_code: '2001' }),
      status: 'SUSPENDED',
      created_at: now,
      is_new_prospect: false,
    });
    this.users.set(6, {
      id: 6,
      customer_id: 3,
      role: 'CUSTOMER',
      email: 'admin@highveldprint.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'SUSPENDED',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    this.userSeq = 7;
    this.customerSeq = 4;

    const tier1Prices: Record<string, string> = {
      'SKU-PPR-A4-80G': '85.00',
      'SKU-PPR-A4-75G': '79.50',
      'SKU-PPR-A3-80G': '170.00',
      'SKU-PPR-A4-COL-YLW': '110.00',
      'SKU-PPR-A4-COL-BLU': '110.00',
      'SKU-PPR-A4-COL-GRN': '110.00',
      'SKU-PPR-A4-160G': '160.00',
      'SKU-ENV-DL-WS': '125.00',
      'SKU-ENV-C4-WS': '145.00',
      'SKU-PEN-BLU-05': '110.00',
      'SKU-PEN-RED-05': '110.00',
      'SKU-PEN-BLK-05': '110.00',
      'SKU-PEN-GRN-05': '110.00',
      'SKU-PEN-GEL-BLK': '155.00',
      'SKU-PEN-GEL-BLU': '155.00',
      'SKU-MRK-WBD-AST': '65.00',
      'SKU-HLT-YEL-01': '75.00',
      'SKU-FIL-LVR-BLK': '42.00',
      'SKU-FIL-LVR-BLU': '42.00',
      'SKU-FIL-LVR-RED': '42.00',
      'SKU-FIL-LVR-GRN': '42.00',
      'SKU-FIL-RNG-BLK': '30.00',
      'SKU-FIL-DIV-10T': '24.00',
      'SKU-FIL-DIV-31T': '38.00',
      'SKU-FIL-PPC-A4': '48.00',
    };

    const tier2Prices: Record<string, string> = {
      'SKU-PPR-A4-80G': '78.50',
      'SKU-PPR-A4-75G': '73.00',
      'SKU-PPR-A3-80G': '155.00',
      'SKU-PPR-A4-COL-YLW': '100.00',
      'SKU-PPR-A4-COL-BLU': '100.00',
      'SKU-PPR-A4-COL-GRN': '100.00',
      'SKU-PPR-A4-160G': '145.00',
      'SKU-ENV-DL-WS': '115.00',
      'SKU-ENV-C4-WS': '132.00',
      'SKU-PEN-BLU-05': '98.00',
      'SKU-PEN-RED-05': '98.00',
      'SKU-PEN-BLK-05': '98.00',
      'SKU-PEN-GRN-05': '98.00',
      'SKU-PEN-GEL-BLK': '142.00',
      'SKU-PEN-GEL-BLU': '142.00',
      'SKU-MRK-WBD-AST': '56.00',
      'SKU-HLT-YEL-01': '65.00',
      'SKU-FIL-LVR-BLK': '38.50',
      'SKU-FIL-LVR-BLU': '38.50',
      'SKU-FIL-LVR-RED': '38.50',
      'SKU-FIL-LVR-GRN': '38.50',
      'SKU-FIL-RNG-BLK': '26.00',
      'SKU-FIL-DIV-10T': '20.00',
      'SKU-FIL-DIV-31T': '32.00',
      'SKU-FIL-PPC-A4': '40.00',
    };

    const tier3Prices: Record<string, string> = {
      'SKU-PPR-A4-80G': '72.00',
      'SKU-PPR-A4-75G': '68.00',
      'SKU-PPR-A3-80G': '145.00',
      'SKU-PPR-A4-COL-YLW': '92.00',
      'SKU-PPR-A4-COL-BLU': '92.00',
      'SKU-PPR-A4-COL-GRN': '92.00',
      'SKU-PPR-A4-160G': '135.00',
      'SKU-ENV-DL-WS': '105.00',
      'SKU-ENV-C4-WS': '120.00',
      'SKU-PEN-BLU-05': '92.50',
      'SKU-PEN-RED-05': '92.50',
      'SKU-PEN-BLK-05': '92.50',
      'SKU-PEN-GRN-05': '92.50',
      'SKU-PEN-GEL-BLK': '132.00',
      'SKU-PEN-GEL-BLU': '132.00',
      'SKU-MRK-WBD-AST': '50.00',
      'SKU-HLT-YEL-01': '58.00',
      'SKU-FIL-LVR-BLK': '35.00',
      'SKU-FIL-LVR-BLU': '35.00',
      'SKU-FIL-LVR-RED': '35.00',
      'SKU-FIL-LVR-GRN': '35.00',
      'SKU-FIL-RNG-BLK': '24.00',
      'SKU-FIL-DIV-10T': '17.00',
      'SKU-FIL-DIV-31T': '28.00',
      'SKU-FIL-PPC-A4': '35.00',
    };

    this.priceTiers.set(1, {
      id: 1,
      code: 'TIER_1',
      name: 'Standard Wholesale',
      basis: JSON.stringify(tier1Prices),
      active: true,
    });

    this.priceTiers.set(2, {
      id: 2,
      code: 'TIER_2',
      name: 'Commercial Volume Wholesale',
      basis: JSON.stringify(tier2Prices),
      active: true,
    });

    this.priceTiers.set(3, {
      id: 3,
      code: 'TIER_3',
      name: 'Government & Educational Contract',
      basis: JSON.stringify(tier3Prices),
      active: true,
    });

    this.customerTierAssignments.set(1, {
      customer_id: 1,
      tier_id: 1,
      assigned_by: 1,
      assigned_at: now,
    });

    const defaultStockMap: Record<string, number> = {
      'SKU-PPR-A4-80G': 1500,
      'SKU-PPR-A4-75G': 1200,
      'SKU-PEN-BLU-05': 3000,
      'SKU-PEN-RED-05': 2500,
      'SKU-FIL-LVR-BLK': 800,
      'SKU-FIL-LVR-BLU': 400,
    };

    const allSkus = Object.keys(tier1Prices);
    for (const sku of allSkus) {
      this.stockBalances.set(sku, {
        sku,
        qty: defaultStockMap[sku] ?? 1200,
        reserved: 0,
        updated_at: now,
      });
    }

    this.salesOrders.set(1001, {
      id: 1001,
      order_number: 'SO-1001',
      customer_id: 1,
      status: 'FULFILLED',
      subtotal: '1700.00',
      vat: '255.00',
      total: '1955.00',
      cancel_reason: null,
      created_by: 4,
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    });
    this.salesOrderLines.set(1001, [
      {
        id: 1,
        order_id: 1001,
        sku: 'SKU-PPR-A4-80G',
        description_snapshot: 'Typek A4 White Paper 80gsm (Box of 5 Reams)',
        qty: 20,
        unit_price: '85.00',
        tier_code: 'TIER_1',
        vat_rate: '15.00',
        line_total: '1700.00',
      },
    ]);
    this.invoices.set(1, {
      id: 1,
      invoice_number: 'INV-10001',
      order_id: 1001,
      issued_by: 2,
      issued_at: new Date(Date.now() - 12 * 86400000).toISOString(),
      subtotal: '1700.00',
      vat: '255.00',
      total: '1955.00',
      status: 'ISSUED',
    });

    this.salesOrders.set(1002, {
      id: 1002,
      order_number: 'SO-1002',
      customer_id: 1,
      status: 'FULFILLED',
      subtotal: '3506.00',
      vat: '525.90',
      total: '4031.90',
      cancel_reason: null,
      created_by: 4,
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    });
    this.salesOrderLines.set(1002, [
      {
        id: 2,
        order_id: 1002,
        sku: 'SKU-PEN-BLU-05',
        description_snapshot: 'Pilot G2 0.5mm Gel Pen Blue (Box of 12)',
        qty: 25,
        unit_price: '110.00',
        tier_code: 'TIER_1',
        vat_rate: '15.00',
        line_total: '2750.00',
      },
      {
        id: 3,
        order_id: 1002,
        sku: 'SKU-FIL-LVR-BLK',
        description_snapshot: 'Bantex Lever Arch File 70mm A4 Black',
        qty: 18,
        unit_price: '42.00',
        tier_code: 'TIER_1',
        vat_rate: '15.00',
        line_total: '756.00',
      },
    ]);
    this.invoices.set(2, {
      id: 2,
      invoice_number: 'INV-10002',
      order_id: 1002,
      issued_by: 2,
      issued_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      subtotal: '3506.00',
      vat: '525.90',
      total: '4031.90',
      status: 'ISSUED',
    });

    this.salesOrders.set(1003, {
      id: 1003,
      order_number: 'SO-1003',
      customer_id: 1,
      status: 'INVOICED',
      subtotal: '2250.00',
      vat: '337.50',
      total: '2587.50',
      cancel_reason: null,
      created_by: 4,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    });
    this.salesOrderLines.set(1003, [
      {
        id: 4,
        order_id: 1003,
        sku: 'SKU-PPR-A4-COL-YLW',
        description_snapshot: 'Rotatrim A4 Tinted Paper 80gsm Pastel Yellow',
        qty: 15,
        unit_price: '110.00',
        tier_code: 'TIER_1',
        vat_rate: '15.00',
        line_total: '1650.00',
      },
      {
        id: 5,
        order_id: 1003,
        sku: 'SKU-FIL-DIV-10T',
        description_snapshot: 'Bantex Polypropylene Subject Dividers 10-Tab A4',
        qty: 25,
        unit_price: '24.00',
        tier_code: 'TIER_1',
        vat_rate: '15.00',
        line_total: '600.00',
      },
    ]);
    this.invoices.set(3, {
      id: 3,
      invoice_number: 'INV-10003',
      order_id: 1003,
      issued_by: 2,
      issued_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      subtotal: '2250.00',
      vat: '337.50',
      total: '2587.50',
      status: 'ISSUED',
    });

    this.salesOrderSeq = 1004;
    this.invoiceRowSeq = 4;
    this.salesOrderLineSeq = 6;
    this.invoiceSequences = new Map([[1, 10004]]);
  }

  seedBaselineTiersAndStock(): void {
    const now = new Date().toISOString();
    const defaultHash = '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHRzdGF0aW9uZXJ5$nSsqz7rI40+7dGfxsN71N+2d9Mbgf3QvN7N17R3d9+Q';
    const defaultTotp = 'b1d927a4e69b0c2a71d8e123:c5b8e90a1f2b3c4d5e6f7081:1a2b3c4d5e6f';

    this.users.set(1, {
      id: 1,
      customer_id: null,
      role: 'ADMIN',
      email: 'admin@stationerydepot.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'APPROVED',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    this.users.set(2, {
      id: 2,
      customer_id: null,
      role: 'SALES_STAFF',
      email: 'staff1@stationerydepot.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'APPROVED',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    this.users.set(3, {
      id: 3,
      customer_id: null,
      role: 'SALES_STAFF',
      email: 'staff2@stationerydepot.co.za',
      password_hash: defaultHash,
      totp_secret_encrypted: defaultTotp,
      status: 'APPROVED',
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: false,
      created_at: now,
      updated_at: now,
    });

    const tier1Prices: Record<string, string> = {
      'SKU-PPR-A4-80G': '85.00',
      'SKU-PPR-A4-75G': '79.50',
      'SKU-PPR-A3-80G': '170.00',
      'SKU-PPR-A4-COL-YLW': '110.00',
      'SKU-PPR-A4-COL-BLU': '110.00',
      'SKU-PPR-A4-COL-GRN': '110.00',
      'SKU-PPR-A4-160G': '160.00',
      'SKU-ENV-DL-WS': '125.00',
      'SKU-ENV-C4-WS': '145.00',
      'SKU-PEN-BLU-05': '110.00',
      'SKU-PEN-RED-05': '110.00',
      'SKU-PEN-BLK-05': '110.00',
      'SKU-PEN-GRN-05': '110.00',
      'SKU-PEN-GEL-BLK': '155.00',
      'SKU-PEN-GEL-BLU': '155.00',
      'SKU-MRK-WBD-AST': '65.00',
      'SKU-HLT-YEL-01': '75.00',
      'SKU-FIL-LVR-BLK': '42.00',
      'SKU-FIL-LVR-BLU': '42.00',
      'SKU-FIL-LVR-RED': '42.00',
      'SKU-FIL-LVR-GRN': '42.00',
      'SKU-FIL-RNG-BLK': '30.00',
      'SKU-FIL-DIV-10T': '24.00',
      'SKU-FIL-DIV-31T': '38.00',
      'SKU-FIL-PPC-A4': '48.00',
    };

    const tier2Prices: Record<string, string> = {
      'SKU-PPR-A4-80G': '78.50',
      'SKU-PPR-A4-75G': '73.00',
      'SKU-PPR-A3-80G': '155.00',
      'SKU-PPR-A4-COL-YLW': '100.00',
      'SKU-PPR-A4-COL-BLU': '100.00',
      'SKU-PPR-A4-COL-GRN': '100.00',
      'SKU-PPR-A4-160G': '145.00',
      'SKU-ENV-DL-WS': '115.00',
      'SKU-ENV-C4-WS': '132.00',
      'SKU-PEN-BLU-05': '98.00',
      'SKU-PEN-RED-05': '98.00',
      'SKU-PEN-BLK-05': '98.00',
      'SKU-PEN-GRN-05': '98.00',
      'SKU-PEN-GEL-BLK': '142.00',
      'SKU-PEN-GEL-BLU': '142.00',
      'SKU-MRK-WBD-AST': '56.00',
      'SKU-HLT-YEL-01': '65.00',
      'SKU-FIL-LVR-BLK': '38.50',
      'SKU-FIL-LVR-BLU': '38.50',
      'SKU-FIL-LVR-RED': '38.50',
      'SKU-FIL-LVR-GRN': '38.50',
      'SKU-FIL-RNG-BLK': '26.00',
      'SKU-FIL-DIV-10T': '20.00',
      'SKU-FIL-DIV-31T': '32.00',
      'SKU-FIL-PPC-A4': '40.00',
    };

    const tier3Prices: Record<string, string> = {
      'SKU-PPR-A4-80G': '72.00',
      'SKU-PPR-A4-75G': '68.00',
      'SKU-PPR-A3-80G': '145.00',
      'SKU-PPR-A4-COL-YLW': '92.00',
      'SKU-PPR-A4-COL-BLU': '92.00',
      'SKU-PPR-A4-COL-GRN': '92.00',
      'SKU-PPR-A4-160G': '135.00',
      'SKU-ENV-DL-WS': '105.00',
      'SKU-ENV-C4-WS': '120.00',
      'SKU-PEN-BLU-05': '92.50',
      'SKU-PEN-RED-05': '92.50',
      'SKU-PEN-BLK-05': '92.50',
      'SKU-PEN-GRN-05': '92.50',
      'SKU-PEN-GEL-BLK': '132.00',
      'SKU-PEN-GEL-BLU': '132.00',
      'SKU-MRK-WBD-AST': '50.00',
      'SKU-HLT-YEL-01': '58.00',
      'SKU-FIL-LVR-BLK': '35.00',
      'SKU-FIL-LVR-BLU': '35.00',
      'SKU-FIL-LVR-RED': '35.00',
      'SKU-FIL-LVR-GRN': '35.00',
      'SKU-FIL-RNG-BLK': '24.00',
      'SKU-FIL-DIV-10T': '17.00',
      'SKU-FIL-DIV-31T': '28.00',
      'SKU-FIL-PPC-A4': '35.00',
    };

    this.priceTiers.set(1, {
      id: 1,
      code: 'TIER_1',
      name: 'Standard Wholesale',
      basis: JSON.stringify(tier1Prices),
      active: true,
    });

    this.priceTiers.set(2, {
      id: 2,
      code: 'TIER_2',
      name: 'Commercial Volume Wholesale',
      basis: JSON.stringify(tier2Prices),
      active: true,
    });

    this.priceTiers.set(3, {
      id: 3,
      code: 'TIER_3',
      name: 'Government & Educational Contract',
      basis: JSON.stringify(tier3Prices),
      active: true,
    });

    const defaultStockMap: Record<string, number> = {
      'SKU-PPR-A4-80G': 1500,
      'SKU-PPR-A4-75G': 1200,
      'SKU-PEN-BLU-05': 3000,
      'SKU-PEN-RED-05': 2500,
      'SKU-FIL-LVR-BLK': 800,
      'SKU-FIL-LVR-BLU': 400,
    };

    const allSkus = Object.keys(tier1Prices);
    for (const sku of allSkus) {
      this.stockBalances.set(sku, {
        sku,
        qty: defaultStockMap[sku] ?? 1200,
        reserved: 0,
        updated_at: now,
      });
    }

    this.userSeq = 4;
  }

  private hasHydrated = false;

  async ensureHydrated(): Promise<void> {
    if (this.hasHydrated) return;
    this.hasHydrated = true;
    try {
      const db = await getMongoDb();
      if (!db) return;

      const userCount = await db.collection('users').countDocuments();
      if (userCount === 0) {
        const users = Array.from(this.users.values()).map((u) => ({ ...u })) as Record<string, unknown>[];
        if (users.length > 0) await db.collection<Record<string, unknown>>('users').insertMany(users);

        const customers = Array.from(this.customers.values()).map((c) => ({ ...c })) as Record<string, unknown>[];
        if (customers.length > 0) await db.collection<Record<string, unknown>>('customers').insertMany(customers);

        const priceTiers = Array.from(this.priceTiers.values()).map((t) => ({ ...t })) as Record<string, unknown>[];
        if (priceTiers.length > 0) await db.collection<Record<string, unknown>>('price_tiers').insertMany(priceTiers);

        const tierAssigns = Array.from(this.customerTierAssignments.values()).map((a) => ({ ...a })) as Record<string, unknown>[];
        if (tierAssigns.length > 0) await db.collection<Record<string, unknown>>('customer_tier_assignments').insertMany(tierAssigns);

        const customPrices = Array.from(this.customProductPrices.values()).map((p) => ({ ...p })) as Record<string, unknown>[];
        if (customPrices.length > 0) await db.collection<Record<string, unknown>>('customer_product_prices').insertMany(customPrices);

        const stock = Array.from(this.stockBalances.values()).map((s) => ({ ...s })) as Record<string, unknown>[];
        if (stock.length > 0) await db.collection<Record<string, unknown>>('stock_balances').insertMany(stock);

        const orders = Array.from(this.salesOrders.values()).map((o) => ({ ...o })) as Record<string, unknown>[];
        if (orders.length > 0) await db.collection<Record<string, unknown>>('sales_orders').insertMany(orders);

        const invoices = Array.from(this.invoices.values()).map((i) => ({ ...i })) as Record<string, unknown>[];
        if (invoices.length > 0) await db.collection<Record<string, unknown>>('invoices').insertMany(invoices);
      } else {
        const users = await db.collection<UserRow>('users').find().toArray();
        for (const u of users) {
          this.users.set(u.id, u);
          if (u.id >= this.userSeq) this.userSeq = u.id + 1;
        }

        const customers = await db.collection<CustomerRow>('customers').find().toArray();
        for (const c of customers) {
          this.customers.set(c.id, c);
          if (c.id >= this.customerSeq) this.customerSeq = c.id + 1;
        }

        const priceTiers = await db.collection<PriceTierRow>('price_tiers').find().toArray();
        for (const t of priceTiers) {
          this.priceTiers.set(t.id, t);
        }

        const tierAssigns = await db.collection<CustomerTierAssignmentRow>('customer_tier_assignments').find().toArray();
        for (const a of tierAssigns) {
          this.customerTierAssignments.set(a.customer_id, a);
        }

        const customPrices = await db.collection<CustomerProductPriceRow>('customer_product_prices').find().toArray();
        for (const p of customPrices) {
          const key = `${p.customer_id}:${p.sku.trim().toUpperCase()}`;
          this.customProductPrices.set(key, p);
        }

        const stock = await db.collection<StockBalanceRow>('stock_balances').find().toArray();
        for (const s of stock) {
          this.stockBalances.set(s.sku, s);
        }

        const movements = await db.collection<StockMovementRow>('stock_movements').find().toArray();
        for (const m of movements) {
          this.stockMovements.push(m);
          if (m.id >= this.stockMovementSeq) this.stockMovementSeq = m.id + 1;
        }

        const orders = await db.collection<SalesOrderRow>('sales_orders').find().toArray();
        for (const o of orders) {
          this.salesOrders.set(o.id, o);
          if (o.id >= this.salesOrderSeq) this.salesOrderSeq = o.id + 1;
        }

        const linesList = await db.collection<{ order_id: number; lines: SalesOrderLineRow[] }>('sales_order_lines').find().toArray();
        for (const entry of linesList) {
          this.salesOrderLines.set(entry.order_id, entry.lines);
        }

        const invoices = await db.collection<InvoiceRow>('invoices').find().toArray();
        for (const i of invoices) {
          this.invoices.set(i.id, i);
          if (i.id >= this.invoiceRowSeq) this.invoiceRowSeq = i.id + 1;
        }

        const creditNotes = await db.collection<CreditNoteRow>('credit_notes').find().toArray();
        for (const cn of creditNotes) {
          this.creditNotes.set(cn.id, cn);
          if (cn.id >= this.creditNoteRowSeq) this.creditNoteRowSeq = cn.id + 1;
        }

        const paymentProofs = await db.collection<PaymentProofRow>('payment_proofs').find().toArray();
        for (const p of paymentProofs) {
          this.paymentProofs.push(p);
          if (p.id >= this.paymentProofSeq) this.paymentProofSeq = p.id + 1;
        }

        const resetReqs = await db.collection<PasswordResetRequestRow>('password_reset_requests').find().toArray();
        for (const r of resetReqs) {
          this.passwordResetRequests.set(r.id, r);
          if (r.id >= this.passwordResetRequestSeq) this.passwordResetRequestSeq = r.id + 1;
        }

        const reqTemplates = await db.collection<RequisitionTemplateRow>('requisition_templates').find().toArray();
        for (const t of reqTemplates) {
          this.requisitionTemplates.set(t.id, t);
          if (t.id >= this.requisitionTemplateSeq) this.requisitionTemplateSeq = t.id + 1;
        }
      }
    } catch (err) {
      logger.warn('Failed to hydrate from MongoDB, using in-memory state', { error: String(err) });
    }
  }

  async persistMongo(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>): Promise<void> {
    try {
      const db = await getMongoDb();
      if (!db) return;
      await db.collection(collection).updateOne(filter, { $set: update }, { upsert: true });
    } catch {
      // safe fallback
    }
  }

  async deleteMongo(collection: string, filter: Record<string, unknown>): Promise<void> {
    try {
      const db = await getMongoDb();
      if (!db) return;
      await db.collection(collection).deleteOne(filter);
    } catch {
      // safe fallback
    }
  }

  saveUser(user: UserRow): void {
    this.users.set(user.id, user);
    void this.persistMongo('users', { id: user.id }, user as unknown as Record<string, unknown>);
  }

  saveCustomer(customer: CustomerRow): void {
    this.customers.set(customer.id, customer);
    void this.persistMongo('customers', { id: customer.id }, customer as unknown as Record<string, unknown>);
  }

  savePriceTier(tier: PriceTierRow): void {
    this.priceTiers.set(tier.id, tier);
    void this.persistMongo('price_tiers', { id: tier.id }, tier as unknown as Record<string, unknown>);
  }

  saveCustomerTierAssignment(assignment: CustomerTierAssignmentRow): void {
    this.customerTierAssignments.set(assignment.customer_id, assignment);
    void this.persistMongo('customer_tier_assignments', { customer_id: assignment.customer_id }, assignment as unknown as Record<string, unknown>);
  }

  saveCustomerProductPrice(price: CustomerProductPriceRow): void {
    const normSku = price.sku.trim().toUpperCase();
    const key = `${price.customer_id}:${normSku}`;
    this.customProductPrices.set(key, price);
    void this.persistMongo('customer_product_prices', { customer_id: price.customer_id, sku: normSku }, price as unknown as Record<string, unknown>);
  }

  deleteCustomerProductPrice(customerId: number, sku: string): void {
    const normSku = sku.trim().toUpperCase();
    const key = `${customerId}:${normSku}`;
    this.customProductPrices.delete(key);
    void this.deleteMongo('customer_product_prices', { customer_id: customerId, sku: normSku });
  }

  saveStockBalance(stock: StockBalanceRow): void {
    this.stockBalances.set(stock.sku, stock);
    void this.persistMongo('stock_balances', { sku: stock.sku }, stock as unknown as Record<string, unknown>);
  }

  saveStockMovement(movement: StockMovementRow): void {
    this.stockMovements.push(movement);
    void this.persistMongo('stock_movements', { id: movement.id }, movement as unknown as Record<string, unknown>);
  }

  saveSalesOrder(order: SalesOrderRow): void {
    this.salesOrders.set(order.id, order);
    void this.persistMongo('sales_orders', { id: order.id }, order as unknown as Record<string, unknown>);
  }

  saveSalesOrderLines(orderId: number, lines: SalesOrderLineRow[]): void {
    this.salesOrderLines.set(orderId, lines);
    void this.persistMongo('sales_order_lines', { order_id: orderId }, { order_id: orderId, lines } as unknown as Record<string, unknown>);
  }

  saveInvoice(invoice: InvoiceRow): void {
    this.invoices.set(invoice.id, invoice);
    void this.persistMongo('invoices', { id: invoice.id }, invoice as unknown as Record<string, unknown>);
  }

  saveCreditNote(creditNote: CreditNoteRow): void {
    this.creditNotes.set(creditNote.id, creditNote);
    void this.persistMongo('credit_notes', { id: creditNote.id }, creditNote as unknown as Record<string, unknown>);
  }

  savePaymentProof(proof: PaymentProofRow): void {
    this.paymentProofs.push(proof);
    void this.persistMongo('payment_proofs', { id: proof.id }, proof as unknown as Record<string, unknown>);
  }

  saveRequisitionTemplate(tpl: RequisitionTemplateRow): void {
    this.requisitionTemplates.set(tpl.id, tpl);
    void this.persistMongo('requisition_templates', { id: tpl.id }, tpl as unknown as Record<string, unknown>);
  }

  deleteRequisitionTemplate(id: number): void {
    this.requisitionTemplates.delete(id);
    void this.deleteMongo('requisition_templates', { id });
  }

  savePasswordResetRequest(req: PasswordResetRequestRow): void {
    this.passwordResetRequests.set(req.id, req);
    void this.persistMongo('password_reset_requests', { id: req.id }, req as unknown as Record<string, unknown>);
  }

  insertCustomer(data: Omit<CustomerRow, 'id' | 'created_at' | 'is_new_prospect' | 'public_id'> & { is_new_prospect?: boolean; public_id?: string }): CustomerRow {
    const id = this.customerSeq++;
    const row: CustomerRow = {
      ...data,
      id,
      is_new_prospect: data.is_new_prospect ?? false,
      public_id: data.public_id ?? crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.customers.set(id, row);
    void this.persistMongo('customers', { id: row.id }, row as unknown as Record<string, unknown>);
    return row;
  }

  insertUser(data: Omit<UserRow, 'id' | 'created_at' | 'updated_at' | 'failed_login_count' | 'locked_until' | 'pwd_reset_required'> & { pwd_reset_required?: boolean }): UserRow {
    const id = this.userSeq++;
    const now = new Date().toISOString();
    const row: UserRow = {
      ...data,
      id,
      failed_login_count: 0,
      locked_until: null,
      pwd_reset_required: data.pwd_reset_required ?? false,
      created_at: now,
      updated_at: now,
    };
    this.users.set(id, row);
    void this.persistMongo('users', { id: row.id }, row as unknown as Record<string, unknown>);
    return row;
  }

  insertPasswordResetRequest(data: Omit<PasswordResetRequestRow, 'id' | 'created_at' | 'resolved_at' | 'resolved_by'> & { resolved_at?: string | null; resolved_by?: number | null }): PasswordResetRequestRow {
    const id = this.passwordResetRequestSeq++;
    const row: PasswordResetRequestRow = {
      ...data,
      id,
      created_at: new Date().toISOString(),
      resolved_at: data.resolved_at ?? null,
      resolved_by: data.resolved_by ?? null,
    };
    this.passwordResetRequests.set(id, row);
    void this.persistMongo('password_reset_requests', { id: row.id }, row as unknown as Record<string, unknown>);
    return row;
  }

  insertAuditLog(data: Omit<AuditLogRow, 'id' | 'created_at'>): AuditLogRow {
    const id = this.auditSeq++;
    const row: AuditLogRow = {
      ...data,
      id,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.push(row);
    void this.persistMongo('audit_logs', { id: row.id }, row as unknown as Record<string, unknown>);
    return row;
  }

  upsertDraftOrder(customerId: number, payloadJson: string): DraftOrderRow {
    const existing = this.draftOrders.get(customerId);
    const now = new Date().toISOString();
    if (existing) {
      existing.payload_json = payloadJson;
      existing.updated_at = now;
      void this.persistMongo('draft_orders', { customer_id: customerId }, existing as unknown as Record<string, unknown>);
      return existing;
    }
    const id = this.draftOrderSeq++;
    const row: DraftOrderRow = {
      id,
      customer_id: customerId,
      payload_json: payloadJson,
      updated_at: now,
    };
    this.draftOrders.set(customerId, row);
    void this.persistMongo('draft_orders', { customer_id: customerId }, row as unknown as Record<string, unknown>);
    return row;
  }

  deleteDraftOrder(customerId: number): void {
    this.draftOrders.delete(customerId);
    void this.deleteMongo('draft_orders', { customer_id: customerId });
  }

  resetDatabase(): void {
    this.users.clear();
    this.customers.clear();
    this.auditLogs = [];
    this.customerTierAssignments.clear();
    this.customProductPrices.clear();
    this.draftOrders.clear();
    this.salesOrders.clear();
    this.salesOrderLines.clear();
    this.stockMovements = [];
    this.invoices.clear();
    this.invoiceSequences = new Map([[1, 10001]]);
    this.creditNotes.clear();
    this.creditNoteSequences = new Map([[1, 50001]]);
    this.paymentProofs = [];
    this.passwordResetRequests.clear();
    this.passwordResetRequestSeq = 1;
    this.requisitionTemplates.clear();
    this.userSeq = 1;
    this.customerSeq = 1;
    this.auditSeq = 1;
    this.salesOrderSeq = 1001;
    this.draftOrderSeq = 1;
    this.salesOrderLineSeq = 1;
    this.stockMovementSeq = 1;
    this.invoiceRowSeq = 1;
    this.creditNoteRowSeq = 1;
    this.requisitionTemplateSeq = 1;
    this.paymentProofSeq = 1;

    this.seedBaselineTiersAndStock();
  }

   async acquireRowLocks(keys: string[]): Promise<() => void> {
    const sorted = [...keys].sort();
    const releases: Array<() => void> = [];

    for (const key of sorted) {
      while (this.rowLocks.has(key)) {
        await this.rowLocks.get(key);
      }
      let unlock!: () => void;
      const promise = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      this.rowLocks.set(key, promise);
      releases.push(() => {
        this.rowLocks.delete(key);
        unlock();
      });
    }

    return () => {
      for (const release of releases) {
        release();
      }
    };
  }
}

export const memoryDb = new MemorySqlDb();

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Pool {
  execute<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  getConnection(): Promise<{
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
    execute<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  }>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function getMySqlPool(): Pool | null {
  return null;
}
