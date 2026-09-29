import 'server-only';

export type UserRole = 'CUSTOMER' | 'SALES_STAFF' | 'ADMIN';
export type UserStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED';

export interface UserRow {
  id: number;
  customer_id: number | null;
  role: UserRole;
  email: string;
  password_hash: string;
  totp_secret_encrypted: string;
  status: UserStatus;
  failed_login_count: number;
  locked_until: string | null;
  pwd_reset_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: number;
  public_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_json: string;
  status: UserStatus;
  is_new_prospect: boolean;
  business_type?: string | null;
  vat_number?: string | null;
  credit_limit?: string | null;
  payment_terms?: string | null;
  logo_url?: string | null;
  created_at: string;
}

export interface BusinessSettingsRow {
  id: number;
  company_name: string;
  tagline: string;
  vat_number: string;
  reg_number: string;
  phone: string;
  email: string;
  address_json: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: number;
  actor_id: number | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_hash: string | null;
  after_hash: string | null;
  ip: string;
  created_at: string;
}

export interface PriceTierRow {
  id: number;
  code: string;
  name: string;
  basis: string;
  active: boolean;
}

export interface CustomerTierAssignmentRow {
  customer_id: number;
  tier_id: number;
  assigned_by: number;
  assigned_at: string;
}

export interface CustomerProductPriceRow {
  customer_id: number;
  sku: string;
  unit_price: string;
  updated_by: number;
  updated_at: string;
}

export interface DraftOrderRow {
  id: number;
  customer_id: number;
  payload_json: string;
  updated_at: string;
}

export type OrderStatus = 'PENDING_SALES_REVIEW' | 'APPROVED' | 'INVOICED' | 'FULFILLED' | 'CANCELLED';

export interface SalesOrderRow {
  id: number;
  order_number: string;
  customer_id: number;
  status: OrderStatus;
  subtotal: string;
  vat: string;
  total: string;
  cancel_reason: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SalesOrderLineRow {
  id: number;
  order_id: number;
  sku: string;
  description_snapshot: string;
  qty: number;
  unit_price: string;
  tier_code: string;
  vat_rate: string;
  line_total: string;
}

export interface InvoiceSequenceRow {
  id: number;
  next_value: number;
}

export interface InvoiceRow {
  id: number;
  invoice_number: string;
  order_id: number;
  issued_by: number;
  issued_at: string;
  subtotal: string;
  vat: string;
  total: string;
  status: 'ISSUED' | 'CREDITED';
}

export interface CreditNoteRow {
  id: number;
  credit_number: string;
  invoice_id: number;
  order_id: number;
  customer_id: number;
  subtotal: string;
  vat: string;
  total: string;
  reason: string;
  created_by: number;
  created_at: string;
}

export type PasswordResetRequestStatus = 'PENDING' | 'FULFILLED' | 'DISMISSED';

export interface PasswordResetRequestRow {
  id: number;
  user_id: number | null;
  email: string;
  status: PasswordResetRequestStatus;
  requested_ip: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
}

export interface PaymentProofRow {
  id: number;
  order_id: number;
  customer_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by: number;
  created_at: string;
}

export interface StockBalanceRow {
  sku: string;
  qty: number;
  reserved: number;
  updated_at: string;
}

export interface StockMovementRow {
  id: number;
  sku: string;
  delta: number;
  reason: 'ORDER' | 'ADJUSTMENT' | 'IMPORT' | 'REFUND';
  ref_type: string;
  ref_id: string;
  actor: number;
  created_at: string;
}

export interface RequisitionItemData {
  sku: string;
  qty: number;
  notes?: string;
}

export interface RequisitionTemplateRow {
  id: number;
  customer_id: number;
  name: string;
  description: string | null;
  items_json: string;
  created_at: string;
  updated_at: string;
}
