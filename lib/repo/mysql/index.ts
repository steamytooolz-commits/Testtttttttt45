import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
/* eslint-disable @typescript-eslint/no-explicit-any */
export type RowDataPacket = {
  [column: string]: any;
  [column: number]: any;
};
export type ResultSetHeader = {
  insertId: number;
  affectedRows: number;
  [key: string]: any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */
import { getMySqlPool, memoryDb } from './client';
export { memoryDb, getMySqlPool } from './client';
import type {
  UserRow,
  CustomerRow,
  AuditLogRow,
  UserStatus,
  PriceTierRow,
  DraftOrderRow,
  SalesOrderRow,
  SalesOrderLineRow,
  StockBalanceRow,
  StockMovementRow,
  InvoiceRow,
  UserRole,
  OrderStatus,
  RequisitionTemplateRow,
  RequisitionItemData,
  PaymentProofRow,
} from './types';

export * from './types';

export function parseCents(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`INVALID_AMOUNT: '${amount}' must be a DECIMAL(12,2) string with at most 2 decimals`);
  }
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const parts = unsigned.split('.');
  const whole = BigInt(parts[0] || '0');
  const fraction = (parts[1] || '').padEnd(2, '0').slice(0, 2);
  const cents = whole * BigInt(100) + BigInt(fraction || '0');
  return negative ? -cents : cents;
}

export function formatCents(cents: bigint): string {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  const whole = abs / BigInt(100);
  const frac = abs % BigInt(100);
  return `${negative ? '-' : ''}${whole}.${frac < BigInt(10) ? '0' : ''}${frac}`;
}

function isUserRow(item: unknown): item is UserRow {
  if (typeof item !== 'object' || item === null) return false;
  const r = item as Record<string, unknown>;
  return typeof r.id === 'number' && typeof r.email === 'string' && typeof r.password_hash === 'string';
}

function isCustomerRow(item: unknown): item is CustomerRow {
  if (typeof item !== 'object' || item === null) return false;
  const r = item as Record<string, unknown>;
  return typeof r.id === 'number' && typeof r.company_name === 'string' && typeof r.email === 'string';
}

function isAuditLogRow(item: unknown): item is AuditLogRow {
  if (typeof item !== 'object' || item === null) return false;
  const r = item as Record<string, unknown>;
  return typeof r.id === 'number' && typeof r.action === 'string';
}

function normalizeUserRow(row: UserRow): UserRow {
  return {
    ...row,
    pwd_reset_required: Boolean((row as { pwd_reset_required?: unknown }).pwd_reset_required ?? false),
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const pool = getMySqlPool();
  const normalizedEmail = email.trim().toLowerCase();

  if (!pool) {
    await memoryDb.ensureHydrated();
    for (const user of memoryDb.users.values()) {
      if (user.email.toLowerCase() === normalizedEmail) {
        return { ...user, pwd_reset_required: user.pwd_reset_required ?? false };
      }
    }
    return null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, customer_id, role, email, password_hash, totp_secret_encrypted, status, failed_login_count, locked_until, pwd_reset_required, created_at, updated_at FROM users WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );

  if (rows.length > 0 && isUserRow(rows[0])) {
    return normalizeUserRow(rows[0]);
  }
  return null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const user = memoryDb.users.get(id);
    return user ? { ...user, pwd_reset_required: user.pwd_reset_required ?? false } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, customer_id, role, email, password_hash, totp_secret_encrypted, status, failed_login_count, locked_until, pwd_reset_required, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );

  if (rows.length > 0 && isUserRow(rows[0])) {
    return normalizeUserRow(rows[0]);
  }
  return null;
}

function normalizeCustomerRow<T extends { is_new_prospect?: unknown; public_id?: unknown }>(
  row: T
): T & { is_new_prospect: boolean; public_id: string } {
  const rawPublicId = (row as { public_id?: unknown }).public_id;
  return {
    ...row,
    is_new_prospect: Boolean((row as { is_new_prospect?: unknown }).is_new_prospect ?? false),
    public_id: typeof rawPublicId === 'string' && rawPublicId.length > 0 ? rawPublicId : '',
  };
}

export async function findCustomerByPublicId(publicId: string): Promise<CustomerRow | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(publicId.trim())) {
    return null;
  }
  const pool = getMySqlPool();
  const norm = publicId.trim();

  if (!pool) {
    await memoryDb.ensureHydrated();
    for (const customer of memoryDb.customers.values()) {
      if (customer.public_id === norm) {
        return normalizeCustomerRow({ ...customer });
      }
    }
    return null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, public_id, company_name, contact_name, email, phone, address_json, status, is_new_prospect, created_at FROM customers WHERE public_id = ? LIMIT 1',
    [norm]
  );

  if (rows.length > 0 && isCustomerRow(rows[0])) {
    return normalizeCustomerRow(rows[0]);
  }
  return null;
}

export async function findCustomerById(id: number): Promise<CustomerRow | null> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const customer = memoryDb.customers.get(id);
    return customer ? normalizeCustomerRow({ ...customer }) : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, public_id, company_name, contact_name, email, phone, address_json, status, is_new_prospect, created_at FROM customers WHERE id = ? LIMIT 1',
    [id]
  );

  if (rows.length > 0 && isCustomerRow(rows[0])) {
    return normalizeCustomerRow(rows[0]);
  }
  return null;
}

export async function createCustomerAndUser(
  customerData: {
    company_name: string;
    contact_name: string;
    email: string;
    phone: string;
    address_json: string;
    is_new_prospect?: boolean;
  },
  userData: {
    password_hash: string;
    totp_secret_encrypted: string;
  }
): Promise<{ customer: CustomerRow; user: UserRow }> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const customer = memoryDb.insertCustomer({
      company_name: customerData.company_name,
      contact_name: customerData.contact_name,
      email: customerData.email,
      phone: customerData.phone,
      address_json: customerData.address_json,
      status: 'PENDING_APPROVAL',
      is_new_prospect: customerData.is_new_prospect ?? false,
    });

    const user = memoryDb.insertUser({
      customer_id: customer.id,
      role: 'CUSTOMER',
      email: customerData.email,
      password_hash: userData.password_hash,
      totp_secret_encrypted: userData.totp_secret_encrypted,
      status: 'PENDING_APPROVAL',
    });

    return { customer, user };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [custResult] = await conn.execute<ResultSetHeader>(
      'INSERT INTO customers (company_name, contact_name, email, phone, address_json, status, is_new_prospect, public_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UUID(), UTC_TIMESTAMP())',
      [
        customerData.company_name,
        customerData.contact_name,
        customerData.email,
        customerData.phone,
        customerData.address_json,
        'PENDING_APPROVAL',
        customerData.is_new_prospect ? 1 : 0,
      ]
    );

    const customerId = custResult.insertId;

    const [userResult] = await conn.execute<ResultSetHeader>(
      'INSERT INTO users (customer_id, role, email, password_hash, totp_secret_encrypted, status, failed_login_count, locked_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
      [
        customerId,
        'CUSTOMER',
        customerData.email,
        userData.password_hash,
        userData.totp_secret_encrypted,
        'PENDING_APPROVAL',
      ]
    );

    const userId = userResult.insertId;
    await conn.commit();

    const customer = await findCustomerById(customerId);
    const user = await findUserById(userId);

    if (!customer || !user) {
      throw new Error('Failed to retrieve newly created customer or user');
    }

    return { customer, user };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateUserStatus(userId: number, status: UserStatus): Promise<void> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const user = memoryDb.users.get(userId);
    if (user) {
      user.status = status;
      user.updated_at = new Date().toISOString();
      memoryDb.saveUser(user);
    }
    return;
  }

  await pool.execute('UPDATE users SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [
    status,
    userId,
  ]);
}

export async function updateCustomerStatus(customerId: number, status: UserStatus): Promise<void> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const cust = memoryDb.customers.get(customerId);
    if (cust) {
      cust.status = status;
      memoryDb.saveCustomer(cust);
    }
    return;
  }

  await pool.execute('UPDATE customers SET status = ? WHERE id = ?', [status, customerId]);
}

export async function recordLoginFailure(
  userId: number,
  failedCount: number,
  lockedUntil: string | null
): Promise<void> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const user = memoryDb.users.get(userId);
    if (user) {
      user.failed_login_count = failedCount;
      user.locked_until = lockedUntil;
      user.updated_at = new Date().toISOString();
      memoryDb.saveUser(user);
    }
    return;
  }

  await pool.execute(
    'UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
    [failedCount, lockedUntil, userId]
  );
}

export async function recordLoginSuccess(userId: number): Promise<void> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const user = memoryDb.users.get(userId);
    if (user) {
      user.failed_login_count = 0;
      user.locked_until = null;
      user.updated_at = new Date().toISOString();
      memoryDb.saveUser(user);
    }
    return;
  }

  await pool.execute(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?',
    [userId]
  );
}

export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const user = memoryDb.users.get(userId);
    if (user) {
      user.password_hash = passwordHash;
      user.pwd_reset_required = false;
      user.updated_at = new Date().toISOString();
      memoryDb.saveUser(user);
    }
    return;
  }

  await pool.execute(
    'UPDATE users SET password_hash = ?, pwd_reset_required = FALSE, updated_at = UTC_TIMESTAMP() WHERE id = ?',
    [passwordHash, userId]
  );
}

export async function setPwdResetRequired(userId: number, required: boolean): Promise<void> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const user = memoryDb.users.get(userId);
    if (user) {
      user.pwd_reset_required = required;
      user.updated_at = new Date().toISOString();
      memoryDb.saveUser(user);
    }
    return;
  }
  await pool.execute('UPDATE users SET pwd_reset_required = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [
    required ? 1 : 0,
    userId,
  ]);
}

export async function updateUserTotpSecret(userId: number, encryptedSecret: string): Promise<void> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const user = memoryDb.users.get(userId);
    if (user) {
      user.totp_secret_encrypted = encryptedSecret;
      user.updated_at = new Date().toISOString();
      memoryDb.saveUser(user);
    }
    return;
  }
  await pool.execute('UPDATE users SET totp_secret_encrypted = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [
    encryptedSecret,
    userId,
  ]);
}

export type StaffRole = 'SALES_STAFF' | 'ADMIN';

export interface StaffUserInfo {
  id: number;
  email: string;
  role: StaffRole;
  status: UserStatus;
  pwd_reset_required: boolean;
  failed_login_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

function toStaffUserInfo(row: UserRow): StaffUserInfo {
  return {
    id: row.id,
    email: row.email,
    role: row.role as StaffRole,
    status: row.status,
    pwd_reset_required: row.pwd_reset_required ?? false,
    failed_login_count: row.failed_login_count,
    locked_until: row.locked_until,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createStaffUser(params: {
  email: string;
  role: StaffRole;
  passwordHash: string;
  totpSecretEncrypted: string;
}): Promise<UserRow> {
  const { email, role, passwordHash, totpSecretEncrypted } = params;
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    return memoryDb.insertUser({
      customer_id: null,
      role,
      email,
      password_hash: passwordHash,
      totp_secret_encrypted: totpSecretEncrypted,
      status: 'APPROVED',
      pwd_reset_required: true,
    });
  }

  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO users (customer_id, role, email, password_hash, totp_secret_encrypted, status, failed_login_count, locked_until, pwd_reset_required, created_at, updated_at) VALUES (NULL, ?, ?, ?, ?, ?, 0, NULL, TRUE, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
    [role, email, passwordHash, totpSecretEncrypted]
  );
  const created = await findUserById(result.insertId);
  if (!created) {
    throw new Error('STAFF_CREATE_FAILED: Unable to read back created staff user');
  }
  return created;
}

export async function listStaffUsers(): Promise<StaffUserInfo[]> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    return [...memoryDb.users.values()]
      .filter((u) => u.role === 'SALES_STAFF' || u.role === 'ADMIN')
      .sort((a, b) => a.id - b.id)
      .map(toStaffUserInfo);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, customer_id, role, email, password_hash, totp_secret_encrypted, status, failed_login_count, locked_until, pwd_reset_required, created_at, updated_at FROM users WHERE role IN ('SALES_STAFF', 'ADMIN') ORDER BY id ASC"
  );
  const result: StaffUserInfo[] = [];
  for (const row of rows) {
    if (isUserRow(row)) {
      result.push(toStaffUserInfo(row));
    }
  }
  return result;
}

function isPasswordResetRequestRow(item: unknown): item is import('./types').PasswordResetRequestRow {
  if (typeof item !== 'object' || item === null) return false;
  const r = item as Record<string, unknown>;
  return (
    typeof r.id === 'number' &&
    typeof r.email === 'string' &&
    (r.status === 'PENDING' || r.status === 'FULFILLED' || r.status === 'DISMISSED')
  );
}

export async function createPasswordResetRequest(params: {
  userId: number | null;
  email: string;
  ip: string;
}): Promise<import('./types').PasswordResetRequestRow> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    return memoryDb.insertPasswordResetRequest({
      user_id: params.userId,
      email: normalizedEmail,
      status: 'PENDING',
      requested_ip: params.ip,
    });
  }

  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO password_reset_requests (user_id, email, status, requested_ip, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
    [params.userId, normalizedEmail, 'PENDING', params.ip]
  );
  const created = await findPasswordResetRequestById(result.insertId);
  if (!created) {
    throw new Error('PASSWORD_RESET_REQUEST_FAILED: Unable to read back created request');
  }
  return created;
}

export async function findPasswordResetRequestById(id: number): Promise<import('./types').PasswordResetRequestRow | null> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const row = memoryDb.passwordResetRequests.get(id);
    return row ? { ...row } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM password_reset_requests WHERE id = ? LIMIT 1', [id]);
  if (rows.length > 0 && isPasswordResetRequestRow(rows[0])) {
    return rows[0];
  }
  return null;
}

export async function findPendingPasswordResetRequestByEmail(email: string): Promise<import('./types').PasswordResetRequestRow | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    for (const row of memoryDb.passwordResetRequests.values()) {
      if (row.email.toLowerCase() === normalizedEmail && row.status === 'PENDING') {
        return { ...row };
      }
    }
    return null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM password_reset_requests WHERE email = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1",
    [normalizedEmail]
  );
  if (rows.length > 0 && isPasswordResetRequestRow(rows[0])) {
    return rows[0];
  }
  return null;
}

export async function listPasswordResetRequests(status: import('./types').PasswordResetRequestStatus | 'ALL' = 'PENDING', limit = 100): Promise<import('./types').PasswordResetRequestRow[]> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    return Array.from(memoryDb.passwordResetRequests.values())
      .filter((r) => status === 'ALL' || r.status === status)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  const [rows] =
    status === 'ALL'
      ? await pool.execute<RowDataPacket[]>('SELECT * FROM password_reset_requests ORDER BY id DESC LIMIT ?', [limit])
      : await pool.execute<RowDataPacket[]>('SELECT * FROM password_reset_requests WHERE status = ? ORDER BY id DESC LIMIT ?', [status, limit]);
  const result: import('./types').PasswordResetRequestRow[] = [];
  for (const row of rows) {
    if (isPasswordResetRequestRow(row)) {
      result.push(row);
    }
  }
  return result;
}

export async function resolvePasswordResetRequest(
  id: number,
  status: 'FULFILLED' | 'DISMISSED',
  resolvedBy: number
): Promise<void> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const row = memoryDb.passwordResetRequests.get(id);
    if (row) {
      row.status = status;
      row.resolved_at = new Date().toISOString();
      row.resolved_by = resolvedBy;
      memoryDb.savePasswordResetRequest(row);
    }
    return;
  }

  await pool.execute(
    'UPDATE password_reset_requests SET status = ?, resolved_at = UTC_TIMESTAMP(), resolved_by = ? WHERE id = ?',
    [status, resolvedBy, id]
  );
}

export async function createCreditNote(params: {
  invoiceId: number;
  reason: string;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<import('./types').CreditNoteRow> {
  const { invoiceId, reason, actorId, actorRole, clientIp = '127.0.0.1' } = params;
  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can issue credit notes');
  }
  if (!reason || reason.trim().length < 3) {
    throw new Error('VALIDATION_ERROR: Credit reason is required');
  }
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    let invoice: import('./types').InvoiceRow | undefined;
    for (const inv of memoryDb.invoices.values()) {
      if (inv.id === invoiceId) {
        invoice = inv;
        break;
      }
    }
    if (!invoice) {
      throw new Error(`INVOICE_NOT_FOUND: Invoice #${invoiceId} does not exist`);
    }
    if (invoice.status === 'CREDITED') {
      throw new Error(`CREDIT_ALREADY_ISSUED: Invoice ${invoice.invoice_number} already credited`);
    }
    for (const cn of memoryDb.creditNotes.values()) {
      if (cn.invoice_id === invoiceId) {
        throw new Error(`CREDIT_ALREADY_ISSUED: Invoice ${invoice.invoice_number} already credited`);
      }
    }
    const order = memoryDb.salesOrders.get(invoice.order_id);
    if (!order) {
      throw new Error(`ORDER_NOT_FOUND: Order #${invoice.order_id} not found`);
    }
    const lines = memoryDb.salesOrderLines.get(order.id) || [];
    const now = new Date().toISOString();
    for (const line of lines) {
      const stock = memoryDb.stockBalances.get(line.sku);
      if (stock) {
        stock.qty += line.qty;
        stock.updated_at = now;
        memoryDb.saveStockBalance(stock);
      }
      const movement: StockMovementRow = {
        id: memoryDb.stockMovements.length + 1,
        sku: line.sku,
        delta: line.qty,
        reason: 'REFUND',
        ref_type: 'CREDIT_NOTE',
        ref_id: invoice.invoice_number,
        actor: actorId,
        created_at: now,
      };
      memoryDb.saveStockMovement(movement);
    }
    const currentSeq = memoryDb.creditNoteSequences.get(1) || 50001;
    memoryDb.creditNoteSequences.set(1, currentSeq + 1);
    const creditNumber = `CN-${currentSeq}`;
    const id = memoryDb.creditNoteRowSeq++;
    const row: import('./types').CreditNoteRow = {
      id,
      credit_number: creditNumber,
      invoice_id: invoice.id,
      order_id: order.id,
      customer_id: order.customer_id,
      subtotal: invoice.subtotal,
      vat: invoice.vat,
      total: invoice.total,
      reason: reason.trim(),
      created_by: actorId,
      created_at: now,
    };
    memoryDb.saveCreditNote(row);
    invoice.status = 'CREDITED';
    memoryDb.saveInvoice(invoice);
    memoryDb.insertAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'CREDIT_ISSUED',
      entity_type: 'credit_notes',
      entity_id: String(id),
      before_hash: invoice.invoice_number,
      after_hash: creditNumber,
      ip: clientIp,
    });
    return { ...row };
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [invRows] = await conn.execute<RowDataPacket[]>('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [invoiceId]);
    if (invRows.length === 0) {
      throw new Error(`INVOICE_NOT_FOUND: Invoice #${invoiceId} does not exist`);
    }
    const invoice = invRows[0] as import('./types').InvoiceRow;
    if (invoice.status === 'CREDITED') {
      throw new Error(`CREDIT_ALREADY_ISSUED: Invoice ${invoice.invoice_number} already credited`);
    }
    const [cnRows] = await conn.execute<RowDataPacket[]>('SELECT id FROM credit_notes WHERE invoice_id = ? LIMIT 1', [invoiceId]);
    if (cnRows.length > 0) {
      throw new Error(`CREDIT_ALREADY_ISSUED: Invoice ${invoice.invoice_number} already credited`);
    }
    const [orderRows] = await conn.execute<RowDataPacket[]>('SELECT * FROM sales_orders WHERE id = ?', [invoice.order_id]);
    if (orderRows.length === 0) {
      throw new Error(`ORDER_NOT_FOUND: Order #${invoice.order_id} not found`);
    }
    const order = orderRows[0] as import('./types').SalesOrderRow;
    const [lineRows] = await conn.execute<RowDataPacket[]>('SELECT sku, qty FROM sales_order_lines WHERE order_id = ?', [order.id]);
    for (const line of lineRows) {
      await conn.execute('UPDATE stock_balances SET qty = qty + ?, updated_at = UTC_TIMESTAMP() WHERE sku = ?', [
        Number(line.qty),
        String(line.sku),
      ]);
      await conn.execute(
        `INSERT INTO stock_movements (sku, delta, reason, ref_type, ref_id, actor, created_at) VALUES (?, ?, 'REFUND', 'CREDIT_NOTE', ?, ?, UTC_TIMESTAMP())`,
        [String(line.sku), Number(line.qty), invoice.invoice_number, actorId]
      );
    }
    const [seqRows] = await conn.execute<RowDataPacket[]>('SELECT next_value FROM credit_note_sequences WHERE id = 1 FOR UPDATE');
    let currentSeq = 50001;
    if (seqRows.length > 0) {
      currentSeq = Number(seqRows[0].next_value);
    } else {
      await conn.execute('INSERT INTO credit_note_sequences (id, next_value) VALUES (1, 50001)');
    }
    const creditNumber = `CN-${currentSeq}`;
    await conn.execute('UPDATE credit_note_sequences SET next_value = next_value + 1 WHERE id = 1');
    const [cnRes] = await conn.execute<ResultSetHeader>(
      `INSERT INTO credit_notes (credit_number, invoice_id, order_id, customer_id, subtotal, vat, total, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [creditNumber, invoice.id, order.id, order.customer_id, invoice.subtotal, invoice.vat, invoice.total, reason.trim(), actorId]
    );
    await conn.execute(`UPDATE invoices SET status = 'CREDITED' WHERE id = ?`, [invoice.id]);
    await conn.execute(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at) VALUES (?, ?, 'CREDIT_ISSUED', 'credit_notes', ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [actorId, actorRole, String(cnRes.insertId), invoice.invoice_number, creditNumber, clientIp]
    );
    await conn.commit();
    return {
      id: cnRes.insertId,
      credit_number: creditNumber,
      invoice_id: invoice.id,
      order_id: order.id,
      customer_id: order.customer_id,
      subtotal: invoice.subtotal,
      vat: invoice.vat,
      total: invoice.total,
      reason: reason.trim(),
      created_by: actorId,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listCreditNotesByCustomer(customerId: number): Promise<import('./types').CreditNoteRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const out: import('./types').CreditNoteRow[] = [];
    for (const cn of memoryDb.creditNotes.values()) {
      if (cn.customer_id === customerId) out.push({ ...cn });
    }
    return out.sort((a, b) => b.id - a.id);
  }
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM credit_notes WHERE customer_id = ? ORDER BY id DESC', [customerId]);
  return rows as import('./types').CreditNoteRow[];
}

export async function listAllCreditNotes(limit = 100): Promise<import('./types').CreditNoteRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    return Array.from(memoryDb.creditNotes.values()).sort((a, b) => b.id - a.id).slice(0, limit);
  }
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM credit_notes ORDER BY id DESC LIMIT ?', [limit]);
  return rows as import('./types').CreditNoteRow[];
}

  export async function createAuditLog(
  entry: Omit<AuditLogRow, 'id' | 'created_at'>
): Promise<AuditLogRow> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    return memoryDb.insertAuditLog(entry);
  }

  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
    [
      entry.actor_id,
      entry.actor_role,
      entry.action,
      entry.entity_type,
      entry.entity_id,
      entry.before_hash,
      entry.after_hash,
      entry.ip,
    ]
  );

  return {
    id: result.insertId,
    actor_id: entry.actor_id,
    actor_role: entry.actor_role,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    before_hash: entry.before_hash,
    after_hash: entry.after_hash,
    ip: entry.ip,
    created_at: new Date().toISOString(),
  };
}

function isPriceTierRow(item: unknown): item is PriceTierRow {
  if (typeof item !== 'object' || item === null) return false;
  const r = item as Record<string, unknown>;
  return typeof r.id === 'number' && typeof r.code === 'string' && typeof r.basis === 'string';
}

export async function getPriceTierById(id: number): Promise<PriceTierRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const tier = memoryDb.priceTiers.get(id);
    return tier ? { ...tier } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, code, name, basis, active FROM price_tiers WHERE id = ? LIMIT 1',
    [id]
  );
  const row = rows[0];
  return isPriceTierRow(row) ? row : null;
}

export async function getPriceTierByCode(code: string): Promise<PriceTierRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    for (const tier of memoryDb.priceTiers.values()) {
      if (tier.code === code) return { ...tier };
    }
    return null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, code, name, basis, active FROM price_tiers WHERE code = ? LIMIT 1',
    [code]
  );
  const row = rows[0];
  return isPriceTierRow(row) ? row : null;
}

export async function getCustomerTier(customerId: number): Promise<PriceTierRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const assignment = memoryDb.customerTierAssignments.get(customerId);
    if (assignment) {
      const tier = memoryDb.priceTiers.get(assignment.tier_id);
      if (tier && tier.active) return { ...tier };
    }

    const defaultTier = memoryDb.priceTiers.get(1);
    return defaultTier && defaultTier.active ? { ...defaultTier } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT pt.id, pt.code, pt.name, pt.basis, pt.active 
     FROM customer_tier_assignments cta 
     JOIN price_tiers pt ON cta.tier_id = pt.id 
     WHERE cta.customer_id = ? AND pt.active = 1 
     ORDER BY cta.assigned_at DESC
     LIMIT 1`,
    [customerId]
  );

  const row = rows[0];
  if (isPriceTierRow(row)) {
    return row;
  }

  const [defaultRows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, code, name, basis, active FROM price_tiers WHERE code = ? AND active = 1 LIMIT 1',
    ['TIER_1']
  );
  const defaultRow = defaultRows[0];
  return isPriceTierRow(defaultRow) ? defaultRow : null;
}

export async function assignCustomerTier(
  customerId: number,
  tierId: number,
  assignedBy: number
): Promise<void> {
  const pool = getMySqlPool();
  const now = new Date().toISOString();

  if (!pool) {
    await memoryDb.ensureHydrated();
    memoryDb.saveCustomerTierAssignment({
      customer_id: customerId,
      tier_id: tierId,
      assigned_by: assignedBy,
      assigned_at: now,
    });
    return;
  }

  await pool.execute('DELETE FROM customer_tier_assignments WHERE customer_id = ?', [customerId]);
  await pool.execute(
    `INSERT INTO customer_tier_assignments (customer_id, tier_id, assigned_by, assigned_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP())`,
    [customerId, tierId, assignedBy]
  );
}

function customPriceKey(customerId: number, sku: string): string {
  return `${customerId}:${sku.trim().toUpperCase()}`;
}

export async function getCustomPrice(customerId: number, sku: string): Promise<string | null> {
  const normSku = sku.trim().toUpperCase();
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    return memoryDb.customProductPrices.get(customPriceKey(customerId, normSku))?.unit_price || null;
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT unit_price FROM customer_product_prices WHERE customer_id = ? AND sku = ? LIMIT 1',
    [customerId, normSku]
  );
  if (rows.length === 0) return null;
  const raw = rows[0].unit_price;
  return typeof raw === 'string' ? raw : String(raw);
}

export async function listCustomPrices(customerId: number): Promise<import('./types').CustomerProductPriceRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const out: import('./types').CustomerProductPriceRow[] = [];
    for (const row of memoryDb.customProductPrices.values()) {
      if (row.customer_id === customerId) out.push({ ...row });
    }
    return out.sort((a, b) => a.sku.localeCompare(b.sku));
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT customer_id, sku, unit_price, updated_by, updated_at FROM customer_product_prices WHERE customer_id = ? ORDER BY sku ASC',
    [customerId]
  );
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    customer_id: r.customer_id as number,
    sku: r.sku as string,
    unit_price: typeof r.unit_price === 'string' ? r.unit_price : String(r.unit_price),
    updated_by: r.updated_by as number,
    updated_at: r.updated_at as string,
  }));
}

export async function setCustomPrice(params: {
  customerId: number;
  sku: string;
  unitPrice: string;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<import('./types').CustomerProductPriceRow> {
  const { customerId, sku, unitPrice, actorId, actorRole, clientIp = '127.0.0.1' } = params;
  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can set custom prices');
  }
  const normSku = sku.trim().toUpperCase();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(normSku)) {
    throw new Error('VALIDATION_ERROR: Invalid SKU format');
  }
  parseCents(unitPrice);
  if (parseCents(unitPrice) < BigInt(0)) {
    throw new Error('VALIDATION_ERROR: Custom price cannot be negative');
  }
  const now = new Date().toISOString();
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const row: import('./types').CustomerProductPriceRow = {
      customer_id: customerId,
      sku: normSku,
      unit_price: formatCents(parseCents(unitPrice)),
      updated_by: actorId,
      updated_at: now,
    };
    memoryDb.saveCustomerProductPrice(row);
    memoryDb.insertAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'CUSTOM_PRICE_SET',
      entity_type: 'customer_product_prices',
      entity_id: `${customerId}:${normSku}`,
      before_hash: null,
      after_hash: row.unit_price,
      ip: clientIp,
    });
    return { ...row };
  }
  const normalized = formatCents(parseCents(unitPrice));
  await pool.execute(
    `INSERT INTO customer_product_prices (customer_id, sku, unit_price, updated_by, updated_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE unit_price = VALUES(unit_price), updated_by = VALUES(updated_by), updated_at = UTC_TIMESTAMP()`,
    [customerId, normSku, normalized, actorId]
  );
  await pool.execute(
    `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
     VALUES (?, ?, 'CUSTOM_PRICE_SET', 'customer_product_prices', ?, NULL, ?, ?, UTC_TIMESTAMP())`,
    [actorId, actorRole, `${customerId}:${normSku}`, normalized, clientIp]
  );
  return { customer_id: customerId, sku: normSku, unit_price: normalized, updated_by: actorId, updated_at: now };
}

export async function deleteCustomPrice(params: {
  customerId: number;
  sku: string;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<void> {
  const { customerId, sku, actorId, actorRole, clientIp = '127.0.0.1' } = params;
  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can remove custom prices');
  }
  const normSku = sku.trim().toUpperCase();
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    memoryDb.deleteCustomerProductPrice(customerId, normSku);
    memoryDb.insertAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'CUSTOM_PRICE_REMOVED',
      entity_type: 'customer_product_prices',
      entity_id: `${customerId}:${normSku}`,
      before_hash: null,
      after_hash: null,
      ip: clientIp,
    });
    return;
  }
  await pool.execute('DELETE FROM customer_product_prices WHERE customer_id = ? AND sku = ?', [customerId, normSku]);
  await pool.execute(
    `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
     VALUES (?, ?, 'CUSTOM_PRICE_REMOVED', 'customer_product_prices', ?, NULL, NULL, ?, UTC_TIMESTAMP())`,
    [actorId, actorRole, `${customerId}:${normSku}`, clientIp]
  );
}

export async function listPriceTiers(): Promise<PriceTierRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    return Array.from(memoryDb.priceTiers.values());
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, code, name, basis, active FROM price_tiers ORDER BY id ASC'
  );
  const result: PriceTierRow[] = [];
  for (const r of rows) {
    if (isPriceTierRow(r)) result.push(r);
  }
  return result;
}

export async function createPriceTier(params: {
  code: string;
  name: string;
  basis: string;
  active: boolean;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<PriceTierRow> {
  const { code, name, basis, active, actorId, actorRole, clientIp = '127.0.0.1' } = params;

  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can manage price tiers');
  }

  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    for (const t of memoryDb.priceTiers.values()) {
      if (t.code === code) {
        throw new Error(`TIER_CODE_EXISTS: Price tier code '${code}' already exists`);
      }
    }
    const ids = Array.from(memoryDb.priceTiers.keys());
    const id = ids.length > 0 ? Math.max(...ids) + 1 : 1;
    const row: PriceTierRow = { id, code, name, basis, active };
    memoryDb.savePriceTier(row);
    memoryDb.insertAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'TIER_CREATED',
      entity_type: 'price_tiers',
      entity_id: String(id),
      before_hash: null,
      after_hash: code,
      ip: clientIp,
    });
    return { ...row };
  }

  const existing = await getPriceTierByCode(code);
  if (existing) {
    throw new Error(`TIER_CODE_EXISTS: Price tier code '${code}' already exists`);
  }

  const [res] = await pool.execute<ResultSetHeader>(
    'INSERT INTO price_tiers (code, name, basis, active) VALUES (?, ?, ?, ?)',
    [code, name, basis, active ? 1 : 0]
  );
  const created = await getPriceTierById(res.insertId);
  if (!created) {
    throw new Error('TIER_CREATE_FAILED: Unable to read back created price tier');
  }
  await pool.execute(
    `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
     VALUES (?, ?, 'TIER_CREATED', 'price_tiers', ?, NULL, ?, ?, UTC_TIMESTAMP())`,
    [actorId, actorRole, String(created.id), code, clientIp]
  );
  return created;
}

export async function updatePriceTier(params: {
  id: number;
  code?: string;
  name?: string;
  basis?: string;
  active?: boolean;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<PriceTierRow> {
  const { id, code, name, basis, active, actorId, actorRole, clientIp = '127.0.0.1' } = params;

  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can manage price tiers');
  }

  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const tier = memoryDb.priceTiers.get(id);
    if (!tier) {
      throw new Error(`TIER_NOT_FOUND: Price tier #${id} does not exist`);
    }
    if (code !== undefined && code !== tier.code) {
      for (const t of memoryDb.priceTiers.values()) {
        if (t.id !== id && t.code === code) {
          throw new Error(`TIER_CODE_EXISTS: Price tier code '${code}' already exists`);
        }
      }
      tier.code = code;
    }
    if (name !== undefined) tier.name = name;
    if (basis !== undefined) tier.basis = basis;
    if (active !== undefined) tier.active = active;
    memoryDb.savePriceTier(tier);
    memoryDb.insertAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'TIER_UPDATED',
      entity_type: 'price_tiers',
      entity_id: String(id),
      before_hash: null,
      after_hash: tier.code,
      ip: clientIp,
    });
    return { ...tier };
  }

  const current = await getPriceTierById(id);
  if (!current) {
    throw new Error(`TIER_NOT_FOUND: Price tier #${id} does not exist`);
  }
  if (code !== undefined && code !== current.code) {
    const clash = await getPriceTierByCode(code);
    if (clash) {
      throw new Error(`TIER_CODE_EXISTS: Price tier code '${code}' already exists`);
    }
  }

  const sets: string[] = [];
  const vals: Array<string | number> = [];
  if (code !== undefined) {
    sets.push('code = ?');
    vals.push(code);
  }
  if (name !== undefined) {
    sets.push('name = ?');
    vals.push(name);
  }
  if (basis !== undefined) {
    sets.push('basis = ?');
    vals.push(basis);
  }
  if (active !== undefined) {
    sets.push('active = ?');
    vals.push(active ? 1 : 0);
  }
  if (sets.length === 0) {
    throw new Error('VALIDATION_ERROR: No tier fields supplied to update');
  }
  vals.push(id);
  await pool.execute(`UPDATE price_tiers SET ${sets.join(', ')} WHERE id = ?`, vals);

  const updated = await getPriceTierById(id);
  if (!updated) {
    throw new Error('TIER_UPDATE_FAILED: Unable to read back updated price tier');
  }
  await pool.execute(
    `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
     VALUES (?, ?, 'TIER_UPDATED', 'price_tiers', ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [actorId, actorRole, String(id), current.code, updated.code, clientIp]
  );
  return updated;
}

export async function eraseCustomerPii(params: {
  customerId: number;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<{ customerId: number; erasedEmail: string }> {
  const { customerId, actorId, actorRole, clientIp = '127.0.0.1' } = params;

  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can erase customer PII');
  }

  const erasedEmail = `erased-${customerId}@erased.local`;
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const cust = memoryDb.customers.get(customerId);
    if (!cust) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer #${customerId} does not exist`);
    }
    cust.company_name = `ERASED CUSTOMER ${customerId}`;
    cust.contact_name = 'Erased';
    cust.email = erasedEmail;
    cust.phone = '0000000000';
    cust.address_json = '{}';
    cust.status = 'SUSPENDED';
    memoryDb.saveCustomer(cust);
    for (const u of memoryDb.users.values()) {
      if (u.customer_id === customerId) {
        u.email = `erased-user-${u.id}@erased.local`;
        u.password_hash = 'UNUSABLE';
        u.totp_secret_encrypted = 'ERASED';
        u.status = 'SUSPENDED';
        u.failed_login_count = 0;
        u.locked_until = '2999-01-01T00:00:00.000Z';
        u.updated_at = new Date().toISOString();
        memoryDb.saveUser(u);
      }
    }
    memoryDb.insertAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'POPIA_ERASURE',
      entity_type: 'customers',
      entity_id: String(customerId),
      before_hash: null,
      after_hash: erasedEmail,
      ip: clientIp,
    });
    return { customerId, erasedEmail };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [custRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM customers WHERE id = ? FOR UPDATE',
      [customerId]
    );
    if (custRows.length === 0) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer #${customerId} does not exist`);
    }

    await conn.execute(
      `UPDATE customers SET company_name = ?, contact_name = 'Erased', email = ?, phone = '0000000000', address_json = '{}', status = 'SUSPENDED' WHERE id = ?`,
      [`ERASED CUSTOMER ${customerId}`, erasedEmail, customerId]
    );
    await conn.execute(
      `UPDATE users SET email = CONCAT('erased-user-', id, '@erased.local'), password_hash = 'UNUSABLE', totp_secret_encrypted = 'ERASED',
        status = 'SUSPENDED', failed_login_count = 0, locked_until = '2999-01-01 00:00:00', updated_at = UTC_TIMESTAMP()
       WHERE customer_id = ?`,
      [customerId]
    );
    await conn.execute(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
       VALUES (?, ?, 'POPIA_ERASURE', 'customers', ?, NULL, ?, ?, UTC_TIMESTAMP())`,
      [actorId, actorRole, String(customerId), erasedEmail, clientIp]
    );
    await conn.commit();
    return { customerId, erasedEmail };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getAuditLogs(limit = 100): Promise<AuditLogRow[]> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    return [...memoryDb.auditLogs].reverse().slice(0, limit);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at FROM audit_log ORDER BY id DESC LIMIT ?',
    [limit]
  );

  const result: AuditLogRow[] = [];
  for (const r of rows) {
    if (isAuditLogRow(r)) {
      result.push(r);
    }
  }
  return result;
}

export async function upsertDraftOrder(customerId: number, payloadJson: string): Promise<DraftOrderRow> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    return memoryDb.upsertDraftOrder(customerId, payloadJson);
  }

  await pool.execute(
    `INSERT INTO draft_orders (customer_id, payload_json, updated_at)
     VALUES (?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), updated_at = UTC_TIMESTAMP()`,
    [customerId, payloadJson]
  );

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, customer_id, payload_json, updated_at FROM draft_orders WHERE customer_id = ?',
    [customerId]
  );
  return rows[0] as DraftOrderRow;
}

export async function getDraftOrder(customerId: number): Promise<DraftOrderRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const row = memoryDb.draftOrders.get(customerId);
    return row ? { ...row } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, customer_id, payload_json, updated_at FROM draft_orders WHERE customer_id = ?',
    [customerId]
  );
  return (rows[0] as DraftOrderRow) || null;
}

export async function deleteDraftOrder(customerId: number): Promise<void> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    memoryDb.deleteDraftOrder(customerId);
    return;
  }

  await pool.execute('DELETE FROM draft_orders WHERE customer_id = ?', [customerId]);
}

export async function getStockBalance(sku: string): Promise<StockBalanceRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const row = memoryDb.stockBalances.get(sku);
    return row ? { ...row } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT sku, qty, reserved, updated_at FROM stock_balances WHERE sku = ?',
    [sku]
  );
  return (rows[0] as StockBalanceRow) || null;
}

export async function setStockBalance(sku: string, qty: number, reserved = 0): Promise<void> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const stock: StockBalanceRow = {
      sku,
      qty,
      reserved,
      updated_at: new Date().toISOString(),
    };
    memoryDb.saveStockBalance(stock);
    return;
  }

  await pool.execute(
    `INSERT INTO stock_balances (sku, qty, reserved, updated_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE qty = VALUES(qty), reserved = VALUES(reserved), updated_at = UTC_TIMESTAMP()`,
    [sku, qty, reserved]
  );
}

export async function getStockMovementsBySku(sku: string): Promise<StockMovementRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    return memoryDb.stockMovements.filter((m) => m.sku === sku);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, sku, delta, reason, ref_type, ref_id, actor, created_at FROM stock_movements WHERE sku = ? ORDER BY id DESC',
    [sku]
  );
  return rows as StockMovementRow[];
}

export async function findSalesOrderById(orderId: number): Promise<SalesOrderRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const order = memoryDb.salesOrders.get(orderId);
    return order ? { ...order } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, order_number, customer_id, status, subtotal, vat, total, cancel_reason, created_by, created_at, updated_at FROM sales_orders WHERE id = ?',
    [orderId]
  );
  return (rows[0] as SalesOrderRow) || null;
}

export async function findSalesOrderByNumber(orderNumber: string): Promise<SalesOrderRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    for (const order of memoryDb.salesOrders.values()) {
      if (order.order_number === orderNumber) {
        return { ...order };
      }
    }
    return null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, order_number, customer_id, status, subtotal, vat, total, cancel_reason, created_by, created_at, updated_at FROM sales_orders WHERE order_number = ?',
    [orderNumber]
  );
  return (rows[0] as SalesOrderRow) || null;
}

export async function getSalesOrderLines(orderId: number): Promise<SalesOrderLineRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const lines = memoryDb.salesOrderLines.get(orderId);
    return lines ? [...lines] : [];
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, order_id, sku, description_snapshot, qty, unit_price, tier_code, vat_rate, line_total FROM sales_order_lines WHERE order_id = ? ORDER BY id ASC',
    [orderId]
  );
  return rows as SalesOrderLineRow[];
}

export async function listSalesOrdersByCustomer(customerId: number): Promise<SalesOrderRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const results: SalesOrderRow[] = [];
    for (const order of memoryDb.salesOrders.values()) {
      if (order.customer_id === customerId) {
        results.push({ ...order });
      }
    }
    return results.sort((a, b) => b.id - a.id);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, order_number, customer_id, status, subtotal, vat, total, cancel_reason, created_by, created_at, updated_at FROM sales_orders WHERE customer_id = ? ORDER BY id DESC',
    [customerId]
  );
  return rows as SalesOrderRow[];
}

export interface CheckoutLineInput {
  sku: string;
  description: string;
  qty: number;
  unit_price: string;
  tier_code: string;
  vat_rate: string;
  line_total: string;
}

export interface CheckoutResult {
  order: SalesOrderRow;
  lines: SalesOrderLineRow[];
}

export async function executeCheckoutTransaction(params: {
  customerId: number;
  createdBy: number;
  lines: CheckoutLineInput[];
  clientIp: string;
}): Promise<CheckoutResult> {
  const { customerId, createdBy, lines, clientIp } = params;
  if (lines.length === 0) {
    throw new Error('Cannot checkout an empty cart');
  }

  const sortedLines = [...lines]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((line) => ({
      ...line,
      line_total: formatCents(parseCents(line.unit_price) * BigInt(line.qty)),
    }));

  let subtotalCents = BigInt(0);
  for (const line of sortedLines) {
    subtotalCents += parseCents(line.line_total);
  }

  const vatCents = (subtotalCents * BigInt(15) + BigInt(50)) / BigInt(100);
  const totalCents = subtotalCents + vatCents;

  const maxLedgerCents = BigInt('999999999999');
  if (subtotalCents > maxLedgerCents || vatCents > maxLedgerCents || totalCents > maxLedgerCents) {
    throw new Error('ORDER_TOTAL_EXCEEDS_LEDGER_PRECISION: Order total exceeds DECIMAL(12,2) ledger capacity');
  }

  const subtotalStr = formatCents(subtotalCents);
  const vatStr = formatCents(vatCents);
  const totalStr = formatCents(totalCents);

  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const unlock = await memoryDb.acquireRowLocks(sortedLines.map((l) => l.sku));
    try {

      for (const line of sortedLines) {
        const stock = memoryDb.stockBalances.get(line.sku);
        const available = stock ? stock.qty - stock.reserved : 0;
        if (!stock || available < line.qty) {
          throw new Error(
            `INSUFFICIENT_STOCK: SKU ${line.sku} has only ${available} available, requested ${line.qty}`
          );
        }
      }

      const now = new Date().toISOString();
      for (const line of sortedLines) {
        const stock = memoryDb.stockBalances.get(line.sku)!;
        stock.qty -= line.qty;
        stock.updated_at = now;
        memoryDb.saveStockBalance(stock);
      }

      const orderId = memoryDb.salesOrderSeq++;
      const orderNumber = `SO-${orderId}`;
      const orderRow: SalesOrderRow = {
        id: orderId,
        order_number: orderNumber,
        customer_id: customerId,
        status: 'PENDING_SALES_REVIEW',
        subtotal: subtotalStr,
        vat: vatStr,
        total: totalStr,
        cancel_reason: null,
        created_by: createdBy,
        created_at: now,
        updated_at: now,
      };
      memoryDb.saveSalesOrder(orderRow);

      const lineRows: SalesOrderLineRow[] = [];
      let lineSeq = 1;
      for (const line of sortedLines) {
        const lineRow: SalesOrderLineRow = {
          id: orderId * 100 + lineSeq++,
          order_id: orderId,
          sku: line.sku,
          description_snapshot: line.description,
          qty: line.qty,
          unit_price: line.unit_price,
          tier_code: line.tier_code,
          vat_rate: line.vat_rate,
          line_total: line.line_total,
        };
        lineRows.push(lineRow);
      }
      memoryDb.saveSalesOrderLines(orderId, lineRows);

      for (const line of sortedLines) {
        const movement: StockMovementRow = {
          id: memoryDb.stockMovements.length + 1,
          sku: line.sku,
          delta: -line.qty,
          reason: 'ORDER',
          ref_type: 'SALES_ORDER',
          ref_id: orderNumber,
          actor: createdBy,
          created_at: now,
        };
        memoryDb.saveStockMovement(movement);
      }

      memoryDb.insertAuditLog({
        actor_id: createdBy,
        actor_role: 'CUSTOMER',
        action: 'ORDER_CREATED',
        entity_type: 'sales_orders',
        entity_id: String(orderId),
        before_hash: null,
        after_hash: orderNumber,
        ip: clientIp,
      });

      return { order: orderRow, lines: lineRows };
    } finally {
      unlock();
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const line of sortedLines) {
      const [rows] = await conn.execute<RowDataPacket[]>(
        'SELECT sku, qty, reserved FROM stock_balances WHERE sku = ? FOR UPDATE',
        [line.sku]
      );
      if (rows.length === 0) {
        throw new Error(`INSUFFICIENT_STOCK: SKU ${line.sku} not found in inventory`);
      }
      const stock = rows[0] as StockBalanceRow;
      const available = stock.qty - stock.reserved;
      if (available < line.qty) {
        throw new Error(
          `INSUFFICIENT_STOCK: SKU ${line.sku} has only ${available} available, requested ${line.qty}`
        );
      }
    }

    for (const line of sortedLines) {
      await conn.execute(
        'UPDATE stock_balances SET qty = qty - ?, updated_at = UTC_TIMESTAMP() WHERE sku = ?',
        [line.qty, line.sku]
      );
    }

    const nowEpoch = Date.now();
    const [orderResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO sales_orders (order_number, customer_id, status, subtotal, vat, total, cancel_reason, created_by, created_at, updated_at)
       VALUES (?, ?, 'PENDING_SALES_REVIEW', ?, ?, ?, NULL, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [`SO-${nowEpoch}`, customerId, subtotalStr, vatStr, totalStr, createdBy]
    );
    const orderId = orderResult.insertId;
    const finalOrderNumber = `SO-${orderId}`;
    await conn.execute('UPDATE sales_orders SET order_number = ? WHERE id = ?', [finalOrderNumber, orderId]);

    const createdLines: SalesOrderLineRow[] = [];
    for (const line of sortedLines) {
      const [lineRes] = await conn.execute<ResultSetHeader>(
        `INSERT INTO sales_order_lines (order_id, sku, description_snapshot, qty, unit_price, tier_code, vat_rate, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, line.sku, line.description, line.qty, line.unit_price, line.tier_code, line.vat_rate, line.line_total]
      );
      createdLines.push({
        id: lineRes.insertId,
        order_id: orderId,
        sku: line.sku,
        description_snapshot: line.description,
        qty: line.qty,
        unit_price: line.unit_price,
        tier_code: line.tier_code,
        vat_rate: line.vat_rate,
        line_total: line.line_total,
      });
    }

    for (const line of sortedLines) {
      await conn.execute(
        `INSERT INTO stock_movements (sku, delta, reason, ref_type, ref_id, actor, created_at)
         VALUES (?, ?, 'ORDER', 'SALES_ORDER', ?, ?, UTC_TIMESTAMP())`,
        [line.sku, -line.qty, finalOrderNumber, createdBy]
      );
    }

    await conn.execute(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
       VALUES (?, 'CUSTOMER', 'ORDER_CREATED', 'sales_orders', ?, NULL, ?, ?, UTC_TIMESTAMP())`,
      [createdBy, String(orderId), finalOrderNumber, clientIp]
    );

    await conn.commit();

    const [orderRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id, order_number, customer_id, status, subtotal, vat, total, cancel_reason, created_by, created_at, updated_at FROM sales_orders WHERE id = ?',
      [orderId]
    );

    return {
      order: orderRows[0] as SalesOrderRow,
      lines: createdLines,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface StaffQueueOrder extends SalesOrderRow {
  customer: CustomerRow | null;
  lines: SalesOrderLineRow[];
  invoice: InvoiceRow | null;
  proofs: PaymentProofRow[];
}

export async function listStaffOrders(options?: {
  status?: OrderStatus | 'ALL';
  limit?: number;
  offset?: number;
}): Promise<StaffQueueOrder[]> {
  const statusFilter = options?.status && options.status !== 'ALL' ? options.status : null;
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const orders = Array.from(memoryDb.salesOrders.values());
    const filtered = statusFilter
      ? orders.filter((o) => o.status === statusFilter)
      : orders;
    filtered.sort((a, b) => b.id - a.id);
    const paginated = filtered.slice(offset, offset + limit);

    return paginated.map((order) => {
      const customer = memoryDb.customers.get(order.customer_id) || null;
      const lines = memoryDb.salesOrderLines.get(order.id) || [];
      let invoice: InvoiceRow | null = null;
      for (const inv of memoryDb.invoices.values()) {
        if (inv.order_id === order.id) {
          invoice = { ...inv };
          break;
        }
      }
      const proofs = memoryDb.paymentProofs
        .filter((p) => p.order_id === order.id)
        .map((p) => ({ ...p }));
      return {
        ...order,
        customer: customer ? { ...customer } : null,
        lines: [...lines],
        invoice,
        proofs,
      };
    });
  }

  let query = `
    SELECT 
      so.id, so.order_number, so.customer_id, so.status, so.subtotal, so.vat, so.total, so.cancel_reason, so.created_by, so.created_at, so.updated_at,
      c.company_name, c.contact_name, c.email as customer_email, c.phone as customer_phone, c.address_json, c.status as customer_status, c.public_id as customer_public_id, c.is_new_prospect as customer_is_prospect, c.created_at as customer_created_at
    FROM sales_orders so
    LEFT JOIN customers c ON so.customer_id = c.id
  `;
  const params: (string | number)[] = [];

  if (statusFilter) {
    query += ' WHERE so.status = ?';
    params.push(statusFilter);
  }

  query += ' ORDER BY so.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [orderRows] = await pool.execute<RowDataPacket[]>(query, params);

  const results: StaffQueueOrder[] = [];
  for (const row of orderRows) {
    const orderId = row.id as number;
    const lines = await getSalesOrderLines(orderId);
    const invoice = await getInvoiceByOrderId(orderId);

    const customer: CustomerRow | null = row.customer_id
      ? {
          id: row.customer_id as number,
          company_name: (row.company_name as string) || '',
          contact_name: (row.contact_name as string) || '',
          email: (row.customer_email as string) || '',
          phone: (row.customer_phone as string) || '',
          address_json: (row.address_json as string) || '{}',
          status: (row.customer_status as 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED') || 'APPROVED',
          public_id: (row.customer_public_id as string) || '',
          is_new_prospect: Boolean(row.customer_is_prospect ?? false),
          created_at: (row.customer_created_at as string) || '',
        }
      : null;

    results.push({
      id: row.id as number,
      order_number: row.order_number as string,
      customer_id: row.customer_id as number,
      status: row.status as OrderStatus,
      subtotal: row.subtotal as string,
      vat: row.vat as string,
      total: row.total as string,
      cancel_reason: (row.cancel_reason as string | null) || null,
      created_by: row.created_by as number,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      customer,
      lines,
      invoice,
      proofs: await listPaymentProofsByOrderId(orderId),
    });
  }

  return results;
}

export async function getInvoiceByOrderId(orderId: number): Promise<InvoiceRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    for (const inv of memoryDb.invoices.values()) {
      if (inv.order_id === orderId) {
        return { ...inv };
      }
    }
    return null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, invoice_number, order_id, issued_by, issued_at, subtotal, vat, total, status FROM invoices WHERE order_id = ? LIMIT 1',
    [orderId]
  );
  if (rows.length === 0) return null;
  return rows[0] as InvoiceRow;
}

export async function getInvoiceById(id: number): Promise<InvoiceRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const inv = memoryDb.invoices.get(id);
    return inv ? { ...inv } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, invoice_number, order_id, issued_by, issued_at, subtotal, vat, total, status FROM invoices WHERE id = ? LIMIT 1',
    [id]
  );
  if (rows.length === 0) return null;
  return rows[0] as InvoiceRow;
}

export async function getCreditNoteById(id: number): Promise<import('./types').CreditNoteRow | null> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const cn = memoryDb.creditNotes.get(id);
    return cn ? { ...cn } : null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, credit_number, invoice_id, order_id, customer_id, subtotal, vat, total, reason, created_by, created_at FROM credit_notes WHERE id = ? LIMIT 1',
    [id]
  );
  if (rows.length === 0) return null;
  return rows[0] as import('./types').CreditNoteRow;
}

export async function listInvoicesByCustomerId(customerId: number): Promise<InvoiceRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    const results: InvoiceRow[] = [];
    for (const inv of memoryDb.invoices.values()) {
      const order = memoryDb.salesOrders.get(inv.order_id);
      if (order && order.customer_id === customerId) {
        results.push({ ...inv });
      }
    }
    return results.sort((a, b) => b.id - a.id);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT i.id, i.invoice_number, i.order_id, i.issued_by, i.issued_at, i.subtotal, i.vat, i.total, i.status 
     FROM invoices i
     JOIN sales_orders so ON i.order_id = so.id
     WHERE so.customer_id = ?
     ORDER BY i.id DESC`,
    [customerId]
  );
  return rows as InvoiceRow[];
}

export type OrderTransitionAction = 'APPROVE' | 'INVOICE' | 'FULFIL' | 'CANCEL';

export interface TransitionOrderResult {
  order: SalesOrderRow;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  invoice?: InvoiceRow;
}

export async function transitionOrderStatus(params: {
  orderId: number;
  action: OrderTransitionAction;
  actorId: number;
  actorRole: UserRole;
  cancelReason?: string;
  clientIp?: string;
}): Promise<TransitionOrderResult> {
  const { orderId, action, actorId, actorRole, cancelReason, clientIp = '127.0.0.1' } = params;

  if (actorRole !== 'SALES_STAFF' && actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Insufficient privileges to transition orders');
  }

  if (action === 'CANCEL' && actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can cancel orders and approve refunds');
  }

  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const order = memoryDb.salesOrders.get(orderId);
    if (!order) {
      throw new Error(`ORDER_NOT_FOUND: Sales order #${orderId} does not exist`);
    }

    const prevStatus = order.status;
    let targetStatus: OrderStatus;

    if (action === 'APPROVE') {
      if (prevStatus !== 'PENDING_SALES_REVIEW') {
        throw new Error(
          `INVALID_TRANSITION: Cannot APPROVE order #${orderId} from current status '${prevStatus}'. Only PENDING_SALES_REVIEW orders can be approved.`
        );
      }
      targetStatus = 'APPROVED';
      order.status = targetStatus;
      order.updated_at = new Date().toISOString();
      memoryDb.saveSalesOrder(order);

      memoryDb.insertAuditLog({
        actor_id: actorId,
        actor_role: actorRole,
        action: 'ORDER_STATE_TRANSITION',
        entity_type: 'sales_orders',
        entity_id: String(orderId),
        before_hash: prevStatus,
        after_hash: targetStatus,
        ip: clientIp,
      });

      return { order: { ...order }, previousStatus: prevStatus, newStatus: targetStatus };
    }

    if (action === 'INVOICE') {
      if (prevStatus !== 'APPROVED') {
        throw new Error(
          `INVALID_TRANSITION: Cannot INVOICE order #${orderId} from current status '${prevStatus}'. Order must be in APPROVED status first.`
        );
      }

      for (const inv of memoryDb.invoices.values()) {
        if (inv.order_id === orderId) {
          throw new Error(`INVOICE_ALREADY_EXISTS: Order #${orderId} already has invoice ${inv.invoice_number}`);
        }
      }

      const currentSeq = memoryDb.invoiceSequences.get(1) || 10001;
      const nextSeq = currentSeq + 1;
      memoryDb.invoiceSequences.set(1, nextSeq);

      const invoiceNumber = `INV-${currentSeq}`;
      const now = new Date().toISOString();
      const invoiceId = memoryDb.invoiceRowSeq++;

      const invoiceRow: InvoiceRow = {
        id: invoiceId,
        invoice_number: invoiceNumber,
        order_id: orderId,
        issued_by: actorId,
        issued_at: now,
        subtotal: order.subtotal,
        vat: order.vat,
        total: order.total,
        status: 'ISSUED',
      };
      memoryDb.saveInvoice(invoiceRow);

      targetStatus = 'INVOICED';
      order.status = targetStatus;
      order.updated_at = now;
      memoryDb.saveSalesOrder(order);

      memoryDb.insertAuditLog({
        actor_id: actorId,
        actor_role: actorRole,
        action: 'ORDER_STATE_TRANSITION',
        entity_type: 'sales_orders',
        entity_id: String(orderId),
        before_hash: prevStatus,
        after_hash: targetStatus,
        ip: clientIp,
      });

      memoryDb.insertAuditLog({
        actor_id: actorId,
        actor_role: actorRole,
        action: 'INVOICE_ISSUED',
        entity_type: 'invoices',
        entity_id: String(invoiceId),
        before_hash: null,
        after_hash: invoiceNumber,
        ip: clientIp,
      });

      return {
        order: { ...order },
        previousStatus: prevStatus,
        newStatus: targetStatus,
        invoice: { ...invoiceRow },
      };
    }

    if (action === 'FULFIL') {
      if (prevStatus !== 'INVOICED') {
        throw new Error(
          `INVALID_TRANSITION: Cannot FULFIL order #${orderId} from current status '${prevStatus}'. Order must be INVOICED first.`
        );
      }
      targetStatus = 'FULFILLED';
      order.status = targetStatus;
      order.updated_at = new Date().toISOString();
      memoryDb.saveSalesOrder(order);

      memoryDb.insertAuditLog({
        actor_id: actorId,
        actor_role: actorRole,
        action: 'ORDER_STATE_TRANSITION',
        entity_type: 'sales_orders',
        entity_id: String(orderId),
        before_hash: prevStatus,
        after_hash: targetStatus,
        ip: clientIp,
      });

      return { order: { ...order }, previousStatus: prevStatus, newStatus: targetStatus };
    }

    if (action === 'CANCEL') {
      if (prevStatus !== 'PENDING_SALES_REVIEW' && prevStatus !== 'APPROVED') {
        throw new Error(
          `INVALID_TRANSITION: Cannot CANCEL order #${orderId} from current status '${prevStatus}'. Only PENDING_SALES_REVIEW or APPROVED orders can be cancelled.`
        );
      }
      if (!cancelReason || cancelReason.trim().length === 0) {
        throw new Error('VALIDATION_ERROR: Cancellation reason is required');
      }

      const lines = memoryDb.salesOrderLines.get(orderId) || [];
      const now = new Date().toISOString();
      for (const line of lines) {
        const stock = memoryDb.stockBalances.get(line.sku);
        if (stock) {
          stock.qty += line.qty;
          stock.updated_at = now;
          memoryDb.saveStockBalance(stock);
        }
        const movement: StockMovementRow = {
          id: memoryDb.stockMovements.length + 1,
          sku: line.sku,
          delta: line.qty,
          reason: 'REFUND',
          ref_type: 'SALES_ORDER',
          ref_id: order.order_number,
          actor: actorId,
          created_at: now,
        };
        memoryDb.saveStockMovement(movement);
      }

      targetStatus = 'CANCELLED';
      order.status = targetStatus;
      order.cancel_reason = cancelReason.trim();
      order.updated_at = now;
      memoryDb.saveSalesOrder(order);

      memoryDb.insertAuditLog({
        actor_id: actorId,
        actor_role: actorRole,
        action: 'ORDER_STATE_TRANSITION',
        entity_type: 'sales_orders',
        entity_id: String(orderId),
        before_hash: prevStatus,
        after_hash: targetStatus,
        ip: clientIp,
      });

      return { order: { ...order }, previousStatus: prevStatus, newStatus: targetStatus };
    }

    throw new Error(`UNSUPPORTED_ACTION: Unknown transition action '${action}'`);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id, order_number, customer_id, status, subtotal, vat, total, cancel_reason, created_by, created_at, updated_at FROM sales_orders WHERE id = ? FOR UPDATE',
      [orderId]
    );

    if (orderRows.length === 0) {
      throw new Error(`ORDER_NOT_FOUND: Sales order #${orderId} does not exist`);
    }

    const order = orderRows[0] as SalesOrderRow;
    const prevStatus = order.status;
    let targetStatus: OrderStatus;
    let createdInvoice: InvoiceRow | undefined;

    if (action === 'APPROVE') {
      if (prevStatus !== 'PENDING_SALES_REVIEW') {
        throw new Error(
          `INVALID_TRANSITION: Cannot APPROVE order #${orderId} from current status '${prevStatus}'. Only PENDING_SALES_REVIEW orders can be approved.`
        );
      }
      targetStatus = 'APPROVED';

      await conn.execute(
        'UPDATE sales_orders SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
        [targetStatus, orderId]
      );

      await conn.execute(
        `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
         VALUES (?, ?, 'ORDER_STATE_TRANSITION', 'sales_orders', ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [actorId, actorRole, String(orderId), prevStatus, targetStatus, clientIp]
      );
    } else if (action === 'INVOICE') {
      if (prevStatus !== 'APPROVED') {
        throw new Error(
          `INVALID_TRANSITION: Cannot INVOICE order #${orderId} from current status '${prevStatus}'. Order must be in APPROVED status first.`
        );
      }

      const [existingInv] = await conn.execute<RowDataPacket[]>(
        'SELECT id FROM invoices WHERE order_id = ? LIMIT 1',
        [orderId]
      );
      if (existingInv.length > 0) {
        throw new Error(`INVOICE_ALREADY_EXISTS: Order #${orderId} already has an invoice`);
      }

      const [seqRows] = await conn.execute<RowDataPacket[]>(
        'SELECT next_value FROM invoice_sequences WHERE id = 1 FOR UPDATE'
      );

      let currentSeq = 10001;
      if (seqRows.length > 0) {
        currentSeq = Number(seqRows[0].next_value);
      } else {
        await conn.execute('INSERT INTO invoice_sequences (id, next_value) VALUES (1, 10001)');
      }

      const invoiceNumber = `INV-${currentSeq}`;

      await conn.execute(
        'UPDATE invoice_sequences SET next_value = next_value + 1 WHERE id = 1'
      );

      const [invRes] = await conn.execute<ResultSetHeader>(
        `INSERT INTO invoices (invoice_number, order_id, issued_by, issued_at, subtotal, vat, total, status)
         VALUES (?, ?, ?, UTC_TIMESTAMP(), ?, ?, ?, 'ISSUED')`,
        [invoiceNumber, orderId, actorId, order.subtotal, order.vat, order.total]
      );

      const invoiceId = invRes.insertId;

      targetStatus = 'INVOICED';
      await conn.execute(
        'UPDATE sales_orders SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
        [targetStatus, orderId]
      );

      await conn.execute(
        `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
         VALUES (?, ?, 'ORDER_STATE_TRANSITION', 'sales_orders', ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [actorId, actorRole, String(orderId), prevStatus, targetStatus, clientIp]
      );

      await conn.execute(
        `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
         VALUES (?, ?, 'INVOICE_ISSUED', 'invoices', ?, NULL, ?, ?, UTC_TIMESTAMP())`,
        [actorId, actorRole, String(invoiceId), invoiceNumber, clientIp]
      );

      const [invDetails] = await conn.execute<RowDataPacket[]>(
        'SELECT id, invoice_number, order_id, issued_by, issued_at, subtotal, vat, total, status FROM invoices WHERE id = ?',
        [invoiceId]
      );
      createdInvoice = invDetails[0] as InvoiceRow;
    } else if (action === 'FULFIL') {
      if (prevStatus !== 'INVOICED') {
        throw new Error(
          `INVALID_TRANSITION: Cannot FULFIL order #${orderId} from current status '${prevStatus}'. Order must be INVOICED first.`
        );
      }
      targetStatus = 'FULFILLED';

      await conn.execute(
        'UPDATE sales_orders SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
        [targetStatus, orderId]
      );

      await conn.execute(
        `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
         VALUES (?, ?, 'ORDER_STATE_TRANSITION', 'sales_orders', ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [actorId, actorRole, String(orderId), prevStatus, targetStatus, clientIp]
      );
    } else if (action === 'CANCEL') {
      if (prevStatus !== 'PENDING_SALES_REVIEW' && prevStatus !== 'APPROVED') {
        throw new Error(
          `INVALID_TRANSITION: Cannot CANCEL order #${orderId} from current status '${prevStatus}'. Only PENDING_SALES_REVIEW or APPROVED orders can be cancelled.`
        );
      }
      if (!cancelReason || cancelReason.trim().length === 0) {
        throw new Error('VALIDATION_ERROR: Cancellation reason is required');
      }

      targetStatus = 'CANCELLED';

      const [lineRows] = await conn.execute<RowDataPacket[]>(
        'SELECT sku, qty FROM sales_order_lines WHERE order_id = ? ORDER BY sku ASC',
        [orderId]
      );

      for (const line of lineRows) {
        const sku = line.sku as string;
        const qty = Number(line.qty);

        await conn.execute(
          'SELECT qty FROM stock_balances WHERE sku = ? FOR UPDATE',
          [sku]
        );

        await conn.execute(
          'UPDATE stock_balances SET qty = qty + ?, updated_at = UTC_TIMESTAMP() WHERE sku = ?',
          [qty, sku]
        );

        await conn.execute(
          `INSERT INTO stock_movements (sku, delta, reason, ref_type, ref_id, actor, created_at)
           VALUES (?, ?, 'REFUND', 'SALES_ORDER', ?, ?, UTC_TIMESTAMP())`,
          [sku, qty, order.order_number, actorId]
        );
      }

      await conn.execute(
        'UPDATE sales_orders SET status = ?, cancel_reason = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
        [targetStatus, cancelReason.trim(), orderId]
      );

      await conn.execute(
        `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
         VALUES (?, ?, 'ORDER_STATE_TRANSITION', 'sales_orders', ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [actorId, actorRole, String(orderId), prevStatus, targetStatus, clientIp]
      );
    } else {
      throw new Error(`UNSUPPORTED_ACTION: Unknown transition action '${action}'`);
    }

    await conn.commit();

    const [updatedOrderRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id, order_number, customer_id, status, subtotal, vat, total, cancel_reason, created_by, created_at, updated_at FROM sales_orders WHERE id = ?',
      [orderId]
    );

    return {
      order: updatedOrderRows[0] as SalesOrderRow,
      previousStatus: prevStatus,
      newStatus: targetStatus,
      invoice: createdInvoice,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface CustomerWithTierInfo extends CustomerRow {
  assigned_tier_id?: number;
  assigned_tier_code?: string;
  assigned_tier_name?: string;
  user_id?: number;
  user_status?: UserStatus;
  locked_until?: string | null;
}

export async function listAllCustomers(filter?: {
  status?: UserStatus;
  search?: string;
}): Promise<CustomerWithTierInfo[]> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const list: CustomerWithTierInfo[] = [];
    for (const cust of memoryDb.customers.values()) {
      if (filter?.status && cust.status !== filter.status) {
        continue;
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        const matches =
          cust.company_name.toLowerCase().includes(q) ||
          cust.contact_name.toLowerCase().includes(q) ||
          cust.email.toLowerCase().includes(q);
        if (!matches) continue;
      }

      const assign = memoryDb.customerTierAssignments.get(cust.id);
      let tier: PriceTierRow | null = null;
      if (assign) {
        tier = memoryDb.priceTiers.get(assign.tier_id) || null;
      } else {
        tier = memoryDb.priceTiers.get(1) || null;
      }

      let user: UserRow | null = null;
      for (const u of memoryDb.users.values()) {
        if (u.customer_id === cust.id) {
          user = u;
          break;
        }
      }

      list.push({
        ...normalizeCustomerRow(cust),
        assigned_tier_id: tier?.id,
        assigned_tier_code: tier?.code,
        assigned_tier_name: tier?.name,
        user_id: user?.id,
        user_status: user?.status,
        locked_until: user?.locked_until,
      });
    }
    return list.sort((a, b) => b.id - a.id);
  }

  let query = `
    SELECT
      c.id, c.company_name, c.contact_name, c.email, c.phone, c.address_json, c.status, c.is_new_prospect, c.created_at,
      c.business_type, c.vat_number, c.credit_limit, c.payment_terms, c.logo_url,
      (SELECT pt.id FROM customer_tier_assignments cta JOIN price_tiers pt ON pt.id = cta.tier_id WHERE cta.customer_id = c.id ORDER BY cta.assigned_at DESC, cta.tier_id DESC LIMIT 1) as assigned_tier_id,
      (SELECT pt.code FROM customer_tier_assignments cta JOIN price_tiers pt ON pt.id = cta.tier_id WHERE cta.customer_id = c.id ORDER BY cta.assigned_at DESC, cta.tier_id DESC LIMIT 1) as assigned_tier_code,
      (SELECT pt.name FROM customer_tier_assignments cta JOIN price_tiers pt ON pt.id = cta.tier_id WHERE cta.customer_id = c.id ORDER BY cta.assigned_at DESC, cta.tier_id DESC LIMIT 1) as assigned_tier_name,
      (SELECT u.id FROM users u WHERE u.customer_id = c.id ORDER BY u.id ASC LIMIT 1) as user_id,
      (SELECT u.status FROM users u WHERE u.customer_id = c.id ORDER BY u.id ASC LIMIT 1) as user_status,
      (SELECT u.locked_until FROM users u WHERE u.customer_id = c.id ORDER BY u.id ASC LIMIT 1) as locked_until
    FROM customers c
  `;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter?.status) {
    conditions.push('c.status = ?');
    params.push(filter.status);
  }

  if (filter?.search) {
    conditions.push('(c.company_name LIKE ? OR c.contact_name LIKE ? OR c.email LIKE ?)');
    const term = `%${filter.search.trim()}%`;
    params.push(term, term, term);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY c.id DESC';

  const [rows] = await pool.execute<RowDataPacket[]>(query, params);

  const deduped = new Map<number, CustomerWithTierInfo>();
  for (const r of rows) {
    const id = r.id as number;
    if (deduped.has(id)) continue;
    deduped.set(id, {
      id,
      public_id: (r.public_id as string) || '',
      company_name: r.company_name as string,
      contact_name: r.contact_name as string,
      email: r.email as string,
      phone: r.phone as string,
      address_json: typeof r.address_json === 'string' ? r.address_json : JSON.stringify(r.address_json),
      status: r.status as UserStatus,
      is_new_prospect: Boolean(r.is_new_prospect ?? false),
      created_at: r.created_at as string,
      business_type: (r.business_type as string | null) ?? null,
      vat_number: (r.vat_number as string | null) ?? null,
      credit_limit: r.credit_limit === null || r.credit_limit === undefined ? null : String(r.credit_limit),
      payment_terms: (r.payment_terms as string | null) ?? null,
      logo_url: (r.logo_url as string | null) ?? null,
      assigned_tier_id: (r.assigned_tier_id as number) || undefined,
      assigned_tier_code: (r.assigned_tier_code as string) || undefined,
      assigned_tier_name: (r.assigned_tier_name as string) || undefined,
      user_id: (r.user_id as number) || undefined,
      user_status: (r.user_status as UserStatus) || undefined,
      locked_until: (r.locked_until as string | null) || null,
    });
  }
  return [...deduped.values()];
}

export async function updateCustomerStatusAndTier(params: {
  customerId: number;
  status?: UserStatus;
  tierId?: number;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<CustomerWithTierInfo> {
  const { customerId, status, tierId, actorId, actorRole, clientIp = '127.0.0.1' } = params;

  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can manage customer accounts');
  }

  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const cust = memoryDb.customers.get(customerId);
    if (!cust) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer #${customerId} does not exist`);
    }

    const prevStatus = cust.status;
    if (status && status !== prevStatus) {
      cust.status = status;
      memoryDb.saveCustomer(cust);

      for (const u of memoryDb.users.values()) {
        if (u.customer_id === customerId) {
          u.status = status;
          if (status === 'APPROVED') {
            u.locked_until = null;
            u.failed_login_count = 0;
          }
          u.updated_at = new Date().toISOString();
          memoryDb.saveUser(u);
        }
      }

      memoryDb.insertAuditLog({
        actor_id: actorId,
        actor_role: actorRole,
        action: 'CUSTOMER_STATUS_UPDATED',
        entity_type: 'customers',
        entity_id: String(customerId),
        before_hash: prevStatus,
        after_hash: status,
        ip: clientIp,
      });
    }

    let assignedTier: PriceTierRow | null = null;
    if (tierId !== undefined) {
      const tier = memoryDb.priceTiers.get(tierId);
      if (!tier) {
        throw new Error(`TIER_NOT_FOUND: Price tier #${tierId} does not exist`);
      }
      assignedTier = tier;
      const prevAssign = memoryDb.customerTierAssignments.get(customerId);
      const prevTierId = prevAssign?.tier_id;

      memoryDb.saveCustomerTierAssignment({
        customer_id: customerId,
        tier_id: tierId,
        assigned_by: actorId,
        assigned_at: new Date().toISOString(),
      });

      memoryDb.insertAuditLog({
        actor_id: actorId,
        actor_role: actorRole,
        action: 'CUSTOMER_TIER_ASSIGNED',
        entity_type: 'customer_tier_assignments',
        entity_id: String(customerId),
        before_hash: prevTierId ? String(prevTierId) : null,
        after_hash: String(tierId),
        ip: clientIp,
      });
    } else {
      const assign = memoryDb.customerTierAssignments.get(customerId);
      if (assign) {
        assignedTier = memoryDb.priceTiers.get(assign.tier_id) || null;
      }
    }

    let user: UserRow | null = null;
    for (const u of memoryDb.users.values()) {
      if (u.customer_id === customerId) {
        user = u;
        break;
      }
    }

    return {
      ...cust,
      assigned_tier_id: assignedTier?.id,
      assigned_tier_code: assignedTier?.code,
      assigned_tier_name: assignedTier?.name,
      user_id: user?.id,
      user_status: user?.status,
      locked_until: user?.locked_until,
    };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [custRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id, company_name, contact_name, email, phone, address_json, status, is_new_prospect, business_type, vat_number, credit_limit, payment_terms, logo_url, created_at FROM customers WHERE id = ? FOR UPDATE',
      [customerId]
    );

    if (custRows.length === 0) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer #${customerId} does not exist`);
    }

    const currentCustomer = custRows[0] as CustomerRow;
    const prevStatus = currentCustomer.status;

    if (status && status !== prevStatus) {
      await conn.execute('UPDATE customers SET status = ? WHERE id = ?', [status, customerId]);

      if (status === 'APPROVED') {
        await conn.execute(
          'UPDATE users SET status = ?, locked_until = NULL, failed_login_count = 0, updated_at = UTC_TIMESTAMP() WHERE customer_id = ?',
          [status, customerId]
        );
      } else {
        await conn.execute(
          'UPDATE users SET status = ?, updated_at = UTC_TIMESTAMP() WHERE customer_id = ?',
          [status, customerId]
        );
      }

      await conn.execute(
        `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
         VALUES (?, ?, 'CUSTOMER_STATUS_UPDATED', 'customers', ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [actorId, actorRole, String(customerId), prevStatus, status, clientIp]
      );
    }

    if (tierId !== undefined) {
      const [tierRows] = await conn.execute<RowDataPacket[]>(
        'SELECT id, code, name FROM price_tiers WHERE id = ?',
        [tierId]
      );
      if (tierRows.length === 0) {
        throw new Error(`TIER_NOT_FOUND: Price tier #${tierId} does not exist`);
      }

      const [prevAssignRows] = await conn.execute<RowDataPacket[]>(
        'SELECT tier_id FROM customer_tier_assignments WHERE customer_id = ?',
        [customerId]
      );
      const prevTierId = prevAssignRows.length > 0 ? prevAssignRows[0].tier_id : null;

      await conn.execute(
        `INSERT INTO customer_tier_assignments (customer_id, tier_id, assigned_by, assigned_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE tier_id = VALUES(tier_id), assigned_by = VALUES(assigned_by), assigned_at = UTC_TIMESTAMP()`,
        [customerId, tierId, actorId]
      );

      await conn.execute(
        `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
         VALUES (?, ?, 'CUSTOMER_TIER_ASSIGNED', 'customer_tier_assignments', ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [actorId, actorRole, String(customerId), prevTierId ? String(prevTierId) : null, String(tierId), clientIp]
      );
    }

    await conn.commit();

    const [updatedList] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        c.id, c.public_id, c.company_name, c.contact_name, c.email, c.phone, c.address_json, c.status, c.is_new_prospect, c.created_at,
        c.business_type, c.vat_number, c.credit_limit, c.payment_terms, c.logo_url,
        pt.id as assigned_tier_id, pt.code as assigned_tier_code, pt.name as assigned_tier_name,
        u.id as user_id, u.status as user_status, u.locked_until
      FROM customers c
      LEFT JOIN customer_tier_assignments cta ON c.id = cta.customer_id
      LEFT JOIN price_tiers pt ON cta.tier_id = pt.id
      LEFT JOIN users u ON u.customer_id = c.id
      WHERE c.id = ? LIMIT 1`,
      [customerId]
    );

    const r = updatedList[0];
    return {
      id: r.id as number,
      public_id: (r.public_id as string) || '',
      company_name: r.company_name as string,
      contact_name: r.contact_name as string,
      email: r.email as string,
      phone: r.phone as string,
      address_json: typeof r.address_json === 'string' ? r.address_json : JSON.stringify(r.address_json),
      status: r.status as UserStatus,
      is_new_prospect: Boolean(r.is_new_prospect ?? false),
      created_at: r.created_at as string,
      business_type: (r.business_type as string | null) ?? null,
      vat_number: (r.vat_number as string | null) ?? null,
      credit_limit: r.credit_limit === null || r.credit_limit === undefined ? null : String(r.credit_limit),
      payment_terms: (r.payment_terms as string | null) ?? null,
      logo_url: (r.logo_url as string | null) ?? null,
      assigned_tier_id: (r.assigned_tier_id as number) || undefined,
      assigned_tier_code: (r.assigned_tier_code as string) || undefined,
      assigned_tier_name: (r.assigned_tier_name as string) || undefined,
      user_id: (r.user_id as number) || undefined,
      user_status: (r.user_status as UserStatus) || undefined,
      locked_until: (r.locked_until as string | null) || null,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateCustomerBusinessProfile(params: {
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
  const {
    customerId,
    businessType,
    vatNumber,
    creditLimit,
    paymentTerms,
    logoUrl,
    actorId,
    actorRole,
    clientIp = '127.0.0.1',
  } = params;

  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can manage customer business profiles');
  }

  type BusinessFingerprint = Pick<
    CustomerRow,
    'business_type' | 'vat_number' | 'credit_limit' | 'payment_terms' | 'logo_url'
  >;
  const fingerprint = (row: BusinessFingerprint): string =>
    [row.business_type ?? '', row.vat_number ?? '', row.credit_limit ?? '', row.payment_terms ?? '', row.logo_url ?? ''].join(
      '|'
    );

  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const cust = memoryDb.customers.get(customerId);
    if (!cust) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer #${customerId} does not exist`);
    }

    const beforeHash = fingerprint(cust);
    cust.business_type = businessType;
    cust.vat_number = vatNumber;
    cust.credit_limit = creditLimit;
    cust.payment_terms = paymentTerms;
    cust.logo_url = logoUrl;
    memoryDb.saveCustomer(cust);
    const afterHash = fingerprint(cust);

    memoryDb.insertAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'CUSTOMER_BUSINESS_UPDATED',
      entity_type: 'customers',
      entity_id: String(customerId),
      before_hash: beforeHash,
      after_hash: afterHash,
      ip: clientIp,
    });

    let user: UserRow | null = null;
    for (const u of memoryDb.users.values()) {
      if (u.customer_id === customerId) {
        user = u;
        break;
      }
    }

    const assign = memoryDb.customerTierAssignments.get(customerId);
    const tier = assign ? memoryDb.priceTiers.get(assign.tier_id) || null : null;

    return {
      ...normalizeCustomerRow(cust),
      assigned_tier_id: tier?.id,
      assigned_tier_code: tier?.code,
      assigned_tier_name: tier?.name,
      user_id: user?.id,
      user_status: user?.status,
      locked_until: user?.locked_until,
    };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [custRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id, business_type, vat_number, credit_limit, payment_terms, logo_url FROM customers WHERE id = ? FOR UPDATE',
      [customerId]
    );

    if (custRows.length === 0) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer #${customerId} does not exist`);
    }

    const beforeHash = fingerprint(custRows[0] as CustomerRow);

    await conn.execute(
      'UPDATE customers SET business_type = ?, vat_number = ?, credit_limit = ?, payment_terms = ?, logo_url = ? WHERE id = ?',
      [businessType, vatNumber, creditLimit, paymentTerms, logoUrl, customerId]
    );

    await conn.execute(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
       VALUES (?, ?, 'CUSTOMER_BUSINESS_UPDATED', 'customers', ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        actorId,
        actorRole,
        String(customerId),
        beforeHash,
        fingerprint({ business_type: businessType, vat_number: vatNumber, credit_limit: creditLimit, payment_terms: paymentTerms, logo_url: logoUrl }),
        clientIp,
      ]
    );

    await conn.commit();

    const [updatedList] = await pool.execute<RowDataPacket[]>(
      `SELECT
        c.id, c.public_id, c.company_name, c.contact_name, c.email, c.phone, c.address_json, c.status, c.is_new_prospect, c.created_at,
        c.business_type, c.vat_number, c.credit_limit, c.payment_terms, c.logo_url,
        pt.id as assigned_tier_id, pt.code as assigned_tier_code, pt.name as assigned_tier_name,
        u.id as user_id, u.status as user_status, u.locked_until
      FROM customers c
      LEFT JOIN customer_tier_assignments cta ON c.id = cta.customer_id
      LEFT JOIN price_tiers pt ON cta.tier_id = pt.id
      LEFT JOIN users u ON u.customer_id = c.id
      WHERE c.id = ? LIMIT 1`,
      [customerId]
    );

    const r = updatedList[0];
    return {
      id: r.id as number,
      public_id: (r.public_id as string) || '',
      company_name: r.company_name as string,
      contact_name: r.contact_name as string,
      email: r.email as string,
      phone: r.phone as string,
      address_json: typeof r.address_json === 'string' ? r.address_json : JSON.stringify(r.address_json),
      status: r.status as UserStatus,
      is_new_prospect: Boolean(r.is_new_prospect ?? false),
      created_at: r.created_at as string,
      business_type: (r.business_type as string | null) ?? null,
      vat_number: (r.vat_number as string | null) ?? null,
      credit_limit: r.credit_limit === null || r.credit_limit === undefined ? null : String(r.credit_limit),
      payment_terms: (r.payment_terms as string | null) ?? null,
      logo_url: (r.logo_url as string | null) ?? null,
      assigned_tier_id: (r.assigned_tier_id as number) || undefined,
      assigned_tier_code: (r.assigned_tier_code as string) || undefined,
      assigned_tier_name: (r.assigned_tier_name as string) || undefined,
      user_id: (r.user_id as number) || undefined,
      user_status: (r.user_status as UserStatus) || undefined,
      locked_until: (r.locked_until as string | null) || null,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listAllStockBalances(): Promise<StockBalanceRow[]> {
  const pool = getMySqlPool();
  if (!pool) {
    await memoryDb.ensureHydrated();
    return Array.from(memoryDb.stockBalances.values()).sort((a, b) => a.sku.localeCompare(b.sku));
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT sku, qty, reserved, updated_at FROM stock_balances ORDER BY sku ASC'
  );
  return rows as StockBalanceRow[];
}

export async function adjustStockBalance(params: {
  sku: string;
  delta: number;
  reason: 'ADJUSTMENT' | 'IMPORT' | 'REFUND';
  refId: string;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<{ stock: StockBalanceRow; movement: StockMovementRow }> {
  const { sku, delta, reason, refId, actorId, actorRole, clientIp = '127.0.0.1' } = params;

  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can adjust inventory balances');
  }

  if (delta === 0) {
    throw new Error('VALIDATION_ERROR: Stock delta must be non-zero');
  }

  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const stock = memoryDb.stockBalances.get(sku);
    const currentQty = stock ? stock.qty : 0;
    const reserved = stock ? stock.reserved : 0;
    const newQty = currentQty + delta;

    if (newQty < 0) {
      throw new Error(
        `NEGATIVE_STOCK_PREVENTED: Cannot adjust SKU ${sku} by ${delta}. Resulting stock (${newQty}) would be negative.`
      );
    }

    const now = new Date().toISOString();
    const updatedStock: StockBalanceRow = {
      sku,
      qty: newQty,
      reserved,
      updated_at: now,
    };
    memoryDb.saveStockBalance(updatedStock);

    const movementId = memoryDb.stockMovements.length + 1;
    const movement: StockMovementRow = {
      id: movementId,
      sku,
      delta,
      reason,
      ref_type: 'MANUAL_ADJUSTMENT',
      ref_id: refId.trim() || `ADJ-${Date.now()}`,
      actor: actorId,
      created_at: now,
    };
    memoryDb.saveStockMovement(movement);

    memoryDb.insertAuditLog({
      actor_id: actorId,
      actor_role: actorRole,
      action: 'STOCK_ADJUSTED',
      entity_type: 'stock_balances',
      entity_id: sku,
      before_hash: String(currentQty),
      after_hash: String(newQty),
      ip: clientIp,
    });

    return { stock: updatedStock, movement };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT sku, qty, reserved FROM stock_balances WHERE sku = ? FOR UPDATE',
      [sku]
    );

    let currentQty = 0;
    let currentReserved = 0;

    if (rows.length > 0) {
      currentQty = Number(rows[0].qty);
      currentReserved = Number(rows[0].reserved);
    }

    const newQty = currentQty + delta;
    if (newQty < 0) {
      throw new Error(
        `NEGATIVE_STOCK_PREVENTED: Cannot adjust SKU ${sku} by ${delta}. Resulting stock (${newQty}) would be negative.`
      );
    }

    await conn.execute(
      `INSERT INTO stock_balances (sku, qty, reserved, updated_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE qty = VALUES(qty), reserved = VALUES(reserved), updated_at = UTC_TIMESTAMP()`,
      [sku, newQty, currentReserved]
    );

    const effectiveRef = refId.trim() || `ADJ-${Date.now()}`;
    const [movResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO stock_movements (sku, delta, reason, ref_type, ref_id, actor, created_at)
       VALUES (?, ?, ?, 'MANUAL_ADJUSTMENT', ?, ?, UTC_TIMESTAMP())`,
      [sku, delta, reason, effectiveRef, actorId]
    );

    await conn.execute(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at)
       VALUES (?, ?, 'STOCK_ADJUSTED', 'stock_balances', ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [actorId, actorRole, sku, String(currentQty), String(newQty), clientIp]
    );

    await conn.commit();

    const [updatedRows] = await conn.execute<RowDataPacket[]>(
      'SELECT sku, qty, reserved, updated_at FROM stock_balances WHERE sku = ?',
      [sku]
    );
    const updatedStock = updatedRows[0] as StockBalanceRow;

    const [movRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id, sku, delta, reason, ref_type, ref_id, actor, created_at FROM stock_movements WHERE id = ?',
      [movResult.insertId]
    );

    return {
      stock: updatedStock,
      movement: movRows[0] as StockMovementRow,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listStockMovements(params?: {
  sku?: string;
  limit?: number;
}): Promise<StockMovementRow[]> {
  const limit = params?.limit ?? 100;
  const sku = params?.sku;

  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    let list = [...memoryDb.stockMovements];
    if (sku) {
      list = list.filter((m) => m.sku === sku);
    }
    return list.reverse().slice(0, limit);
  }

  let query = 'SELECT id, sku, delta, reason, ref_type, ref_id, actor, created_at FROM stock_movements';
  const queryParams: (string | number)[] = [];

  if (sku) {
    query += ' WHERE sku = ?';
    queryParams.push(sku);
  }

  query += ' ORDER BY id DESC LIMIT ?';
  queryParams.push(limit);

  const [rows] = await pool.execute<RowDataPacket[]>(query, queryParams);
  return rows as StockMovementRow[];
}

export interface TaxReportSummary {
  totalInvoicesCount: number;
  taxableSubtotalCents: string;
  vatCents: string;
  totalGrossCents: string;
  invoices: Array<InvoiceRow & { company_name?: string; order_number?: string }>;
}

export async function getTaxReportSummary(params?: {
  fromDate?: string;
  toDate?: string;
}): Promise<TaxReportSummary> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    let invoices = Array.from(memoryDb.invoices.values());
    if (params?.fromDate) {
      const from = new Date(params.fromDate).getTime();
      invoices = invoices.filter((i) => new Date(i.issued_at).getTime() >= from);
    }
    if (params?.toDate) {
      const to = new Date(params.toDate).getTime();
      invoices = invoices.filter((i) => new Date(i.issued_at).getTime() <= to);
    }

    let subtotalCents = BigInt(0);
    let vatCents = BigInt(0);
    let totalGrossCents = BigInt(0);

    const enrichedInvoices = invoices.map((inv) => {
      subtotalCents += parseCents(inv.subtotal);
      vatCents += parseCents(inv.vat);
      totalGrossCents += parseCents(inv.total);

      const order = memoryDb.salesOrders.get(inv.order_id);
      const customer = order ? memoryDb.customers.get(order.customer_id) : null;

      return {
        ...inv,
        company_name: customer?.company_name || 'Direct Wholesale Client',
        order_number: order?.order_number || `SO-${inv.order_id}`,
      };
    });

    enrichedInvoices.sort((a, b) => b.id - a.id);

    return {
      totalInvoicesCount: invoices.length,
      taxableSubtotalCents: formatCents(subtotalCents),
      vatCents: formatCents(vatCents),
      totalGrossCents: formatCents(totalGrossCents),
      invoices: enrichedInvoices,
    };
  }

  let query = `
    SELECT 
      i.id, i.invoice_number, i.order_id, i.issued_by, i.issued_at, i.subtotal, i.vat, i.total, i.status,
      c.company_name, so.order_number
    FROM invoices i
    JOIN sales_orders so ON i.order_id = so.id
    LEFT JOIN customers c ON so.customer_id = c.id
  `;
  const conditions: string[] = [];
  const queryParams: string[] = [];

  if (params?.fromDate) {
    conditions.push('i.issued_at >= ?');
    queryParams.push(params.fromDate);
  }
  if (params?.toDate) {
    conditions.push('i.issued_at <= ?');
    queryParams.push(params.toDate);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY i.id DESC';

  const [rows] = await pool.execute<RowDataPacket[]>(query, queryParams);

  let subtotalCents = BigInt(0);
  let vatCents = BigInt(0);
  let totalGrossCents = BigInt(0);

  const enrichedInvoices = rows.map((r: Record<string, unknown>) => {
    const sub = r.subtotal as string;
    const v = r.vat as string;
    const tot = r.total as string;

    subtotalCents += parseCents(sub);
    vatCents += parseCents(v);
    totalGrossCents += parseCents(tot);

    return {
      id: r.id as number,
      invoice_number: r.invoice_number as string,
      order_id: r.order_id as number,
      issued_by: r.issued_by as number,
      issued_at: r.issued_at as string,
      subtotal: sub,
      vat: v,
      total: tot,
      status: r.status as 'ISSUED' | 'CREDITED',
      company_name: (r.company_name as string) || 'Wholesale Client',
      order_number: (r.order_number as string) || `SO-${r.order_id}`,
    };
  });

  return {
    totalInvoicesCount: enrichedInvoices.length,
    taxableSubtotalCents: formatCents(subtotalCents),
    vatCents: formatCents(vatCents),
    totalGrossCents: formatCents(totalGrossCents),
    invoices: enrichedInvoices,
  };
}

export async function listAuditLogsFiltered(params?: {
  action?: string;
  entityType?: string;
  actorRole?: string;
  limit?: number;
}): Promise<AuditLogRow[]> {
  const limit = params?.limit ?? 100;
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    let list = [...memoryDb.auditLogs];
    if (params?.action) {
      list = list.filter((a) => a.action === params.action);
    }
    if (params?.entityType) {
      list = list.filter((a) => a.entity_type === params.entityType);
    }
    if (params?.actorRole) {
      list = list.filter((a) => a.actor_role === params.actorRole);
    }
    return list.reverse().slice(0, limit);
  }

  let query = 'SELECT id, actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at FROM audit_log';
  const conditions: string[] = [];
  const queryParams: (string | number)[] = [];

  if (params?.action) {
    conditions.push('action = ?');
    queryParams.push(params.action);
  }
  if (params?.entityType) {
    conditions.push('entity_type = ?');
    queryParams.push(params.entityType);
  }
  if (params?.actorRole) {
    conditions.push('actor_role = ?');
    queryParams.push(params.actorRole);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY id DESC LIMIT ?';
  queryParams.push(limit);

  const [rows] = await pool.execute<RowDataPacket[]>(query, queryParams);
  return rows as AuditLogRow[];
}

export async function createRequisitionTemplate(data: {
  customer_id: number;
  name: string;
  description?: string | null;
  items_json: string;
}): Promise<RequisitionTemplateRow> {
  const pool = getMySqlPool();
  const now = new Date().toISOString();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const id = memoryDb.requisitionTemplateSeq++;
    const row: RequisitionTemplateRow = {
      id,
      customer_id: data.customer_id,
      name: data.name,
      description: data.description || null,
      items_json: data.items_json,
      created_at: now,
      updated_at: now,
    };
    memoryDb.saveRequisitionTemplate(row);
    return { ...row };
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO requisition_templates (customer_id, name, description, items_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [data.customer_id, data.name, data.description || null, data.items_json]
  );

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, customer_id, name, description, items_json, created_at, updated_at FROM requisition_templates WHERE id = ?',
    [result.insertId]
  );
  return rows[0] as RequisitionTemplateRow;
}

export async function getRequisitionTemplateById(
  id: number,
  customerId?: number
): Promise<RequisitionTemplateRow | null> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const tpl = memoryDb.requisitionTemplates.get(id);
    if (!tpl) return null;
    if (customerId !== undefined && tpl.customer_id !== customerId) return null;
    return { ...tpl };
  }

  let query = 'SELECT id, customer_id, name, description, items_json, created_at, updated_at FROM requisition_templates WHERE id = ?';
  const params: (number | string)[] = [id];

  if (customerId !== undefined) {
    query += ' AND customer_id = ?';
    params.push(customerId);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(query, params);
  if (rows.length === 0) return null;
  return rows[0] as RequisitionTemplateRow;
}

export async function listRequisitionTemplatesByCustomer(
  customerId: number
): Promise<RequisitionTemplateRow[]> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const list: RequisitionTemplateRow[] = [];
    for (const tpl of memoryDb.requisitionTemplates.values()) {
      if (tpl.customer_id === customerId) {
        list.push({ ...tpl });
      }
    }
    return list.sort((a, b) => b.id - a.id);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, customer_id, name, description, items_json, created_at, updated_at FROM requisition_templates WHERE customer_id = ? ORDER BY id DESC',
    [customerId]
  );
  return rows as RequisitionTemplateRow[];
}

export async function updateRequisitionTemplate(
  id: number,
  customerId: number,
  data: {
    name?: string;
    description?: string | null;
    items_json?: string;
  }
): Promise<RequisitionTemplateRow | null> {
  const pool = getMySqlPool();
  const now = new Date().toISOString();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const tpl = memoryDb.requisitionTemplates.get(id);
    if (!tpl || tpl.customer_id !== customerId) {
      return null;
    }
    if (data.name !== undefined) tpl.name = data.name;
    if (data.description !== undefined) tpl.description = data.description;
    if (data.items_json !== undefined) tpl.items_json = data.items_json;
    tpl.updated_at = now;
    memoryDb.saveRequisitionTemplate(tpl);
    return { ...tpl };
  }

  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    params.push(data.description);
  }
  if (data.items_json !== undefined) {
    fields.push('items_json = ?');
    params.push(data.items_json);
  }

  if (fields.length === 0) {
    return getRequisitionTemplateById(id, customerId);
  }

  fields.push('updated_at = UTC_TIMESTAMP()');
  const query = `UPDATE requisition_templates SET ${fields.join(', ')} WHERE id = ? AND customer_id = ?`;
  params.push(id, customerId);

  await pool.execute(query, params);
  return getRequisitionTemplateById(id, customerId);
}

export async function deleteRequisitionTemplate(
  id: number,
  customerId: number
): Promise<boolean> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const tpl = memoryDb.requisitionTemplates.get(id);
    if (!tpl || tpl.customer_id !== customerId) {
      return false;
    }
    memoryDb.deleteRequisitionTemplate(id);
    return true;
  }

  const [result] = await pool.execute<ResultSetHeader>(
    'DELETE FROM requisition_templates WHERE id = ? AND customer_id = ?',
    [id, customerId]
  );
  return (result.affectedRows || 0) > 0;
}


// ---------------------------------------------------------------------------
// Payment proofs (checkout proof-of-payment uploads)
// ---------------------------------------------------------------------------

/** MySQL2 returns DATETIME as Date; tests seed ISO strings. Normalise to ISO. */
function proofIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

const PROOF_DIR = 'uploads/payment-proofs';

function proofFilePath(filename: string): string {
  return path.join(process.cwd(), PROOF_DIR, filename);
}

export async function createPaymentProof(data: {
  order_id: number;
  customer_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by: number;
}): Promise<PaymentProofRow> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    const row: PaymentProofRow = {
      id: memoryDb.paymentProofSeq++,
      order_id: data.order_id,
      customer_id: data.customer_id,
      filename: data.filename,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      sha256: data.sha256,
      uploaded_by: data.uploaded_by,
      created_at: new Date().toISOString(),
    };
    memoryDb.savePaymentProof(row);
    return { ...row };
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO payment_proofs (order_id, customer_id, filename, mime_type, size_bytes, sha256, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [data.order_id, data.customer_id, data.filename, data.mime_type, data.size_bytes, data.sha256, data.uploaded_by]
  );
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM payment_proofs WHERE id = ?',
    [result.insertId]
  );
  const row = rows[0] as unknown as PaymentProofRow;
  return {
    ...row,
    created_at: proofIso(row.created_at),
  };
}

export async function listPaymentProofsByOrderId(orderId: number): Promise<PaymentProofRow[]> {
  const pool = getMySqlPool();

  if (!pool) {
    await memoryDb.ensureHydrated();
    return memoryDb.paymentProofs
      .filter((p) => p.order_id === orderId)
      .map((p) => ({ ...p }));
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM payment_proofs WHERE order_id = ? ORDER BY created_at ASC, id ASC',
    [orderId]
  );
  return (rows as unknown as PaymentProofRow[]).map((row) => ({
    ...row,
    created_at: proofIso(row.created_at),
  }));
}

export async function getPaymentProofFile(proofId: number): Promise<{ proof: PaymentProofRow; bytes: Buffer } | null> {
  const pool = getMySqlPool();
  let proof: PaymentProofRow | null = null;

  if (!pool) {
    await memoryDb.ensureHydrated();
    proof = memoryDb.paymentProofs.find((p) => p.id === proofId) ?? null;
    if (proof) proof = { ...proof };
  } else {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM payment_proofs WHERE id = ?',
      [proofId]
    );
    if (rows.length > 0) {
      const row = rows[0] as unknown as PaymentProofRow;
      proof = {
        ...row,
        created_at: proofIso(row.created_at),
      };
    }
  }

  if (!proof) return null;
  try {
    const bytes = await fs.promises.readFile(proofFilePath(proof.filename));
    return { proof, bytes };
  } catch {
    return null;
  }
}
