import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import {
  listAllCustomers,
  listStaffOrders,
  createAuditLog,
} from '@/lib/repo/mysql';
import type { UserRole } from '@/lib/repo/mysql/types';

export const PASTEL_ENTITIES = ['customers', 'sales_orders'] as const;
export type PastelEntity = (typeof PASTEL_ENTITIES)[number];

export type PastelColumnKind = 'text' | 'date' | 'amount' | 'code6' | 'code3' | 'blank';

export interface PastelColumn {
  header: string;
  source: string | null;
  kind: PastelColumnKind;
  required?: boolean;
}

export interface PastelMapping {
  entity: string;
  delimiter: string;
  columns: PastelColumn[];
}

export interface PastelRowError {
  row: number;
  field: string;
  reason: string;
}

export interface PastelExportResult {
  entity: PastelEntity;
  filename: string;
  csv: string;
  total: number;
  exported: number;
  skipped: number;
  truncated: boolean;
  errors: PastelRowError[];
}

const COLUMN_KINDS: ReadonlySet<string> = new Set(['text', 'date', 'amount', 'code6', 'code3', 'blank']);
const PROHIBITED_CHARS = /[\r\n",;|]/g;
const DECIMAL_2DP = /^\d{1,10}\.\d{2}$/;
const MAX_REPORT_ERRORS = 100;

function mappingPath(entity: string): string {
  if (!/^[a-z_]+$/.test(entity)) {
    throw new Error(`VALIDATION_ERROR: Unknown export entity '${entity}'`);
  }
  return path.join(process.cwd(), 'config', 'pastel-mappings', `${entity}.json`);
}

export function loadPastelMapping(entity: string): PastelMapping {
  let raw: string;
  try {
    raw = fs.readFileSync(mappingPath(entity), 'utf8');
  } catch {
    throw new Error(`VALIDATION_ERROR: Unknown export entity '${entity}'`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`MAPPING_CORRUPT: Pastel mapping for '${entity}' is not valid JSON`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`MAPPING_CORRUPT: Pastel mapping for '${entity}' must be an object`);
  }
  const record = parsed as { delimiter?: unknown; columns?: unknown };
  if (record.delimiter !== ',' && record.delimiter !== ';') {
    throw new Error(`MAPPING_CORRUPT: Pastel mapping for '${entity}' must declare a delimiter`);
  }
  if (!Array.isArray(record.columns) || record.columns.length === 0) {
    throw new Error(`MAPPING_CORRUPT: Pastel mapping for '${entity}' must declare columns`);
  }

  const columns: PastelColumn[] = record.columns.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`MAPPING_CORRUPT: Column ${index} in '${entity}' mapping must be an object`);
    }
    const col = entry as { header?: unknown; source?: unknown; kind?: unknown; required?: unknown };
    if (typeof col.header !== 'string' || col.header.trim().length === 0) {
      throw new Error(`MAPPING_CORRUPT: Column ${index} in '${entity}' mapping needs a header`);
    }
    if (typeof col.kind !== 'string' || !COLUMN_KINDS.has(col.kind)) {
      throw new Error(`MAPPING_CORRUPT: Column '${col.header}' has an unknown kind`);
    }
    if (col.source !== null && (typeof col.source !== 'string' || col.source.trim().length === 0)) {
      throw new Error(`MAPPING_CORRUPT: Column '${col.header}' needs a source or explicit null`);
    }
    return {
      header: col.header,
      source: col.source,
      kind: col.kind as PastelColumnKind,
      required: col.required === true,
    };
  });

  return { entity, delimiter: record.delimiter, columns };
}

export function formatPastelDate(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '').trim();
  const sqlMatch = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (sqlMatch) {
    const seconds = sqlMatch[6] ?? '00';
    text = `${sqlMatch[1]}-${sqlMatch[2]}-${sqlMatch[3]}T${sqlMatch[4]}:${sqlMatch[5]}:${seconds}Z`;
  }
  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date '${String(value ?? '')}'`);
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(parsed.getUTCDate())}/${pad(parsed.getUTCMonth() + 1)}/${parsed.getUTCFullYear()}`;
}

export function formatPastelAmount(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!DECIMAL_2DP.test(text)) {
    throw new Error(`Invalid amount '${text}': maximum two decimals required`);
  }
  return text;
}

export function formatPastelCode6(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text) || text.length > 6) {
    throw new Error(`Invalid code '${text}': numeric 6-character code required`);
  }
  return text.padStart(6, '0');
}

export function formatPastelCode3(value: unknown): string {
  return formatPastelCode6(value);
}

export function sanitizePastelText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(PROHIBITED_CHARS, ' ').slice(0, 255);
}

function applyColumn(column: PastelColumn, row: Record<string, unknown>): string {
  if (column.kind === 'blank' || column.source === null) return '';
  const raw = row[column.source];
  if (column.required && (raw === null || raw === undefined || String(raw).trim().length === 0)) {
    throw new Error(`Required field '${column.header}' is blank`);
  }
  switch (column.kind) {
    case 'text':
      return sanitizePastelText(raw);
    case 'date':
      return formatPastelDate(raw);
    case 'amount':
      return formatPastelAmount(raw);
    case 'code6':
      return formatPastelCode6(raw);
    case 'code3':
      return formatPastelCode6(raw);
    default:
      return '';
  }
}

function escapeCsvCell(cell: string, delimiter: string): string {
  const guarded = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
  if (guarded.includes(delimiter) || guarded.includes('"') || guarded.includes('\n') || guarded.includes('\r')) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

function parseAddressParts(addressJson: string): { street: string; city: string; province: string; postal_code: string } {
  const blank = { street: '', city: '', province: '', postal_code: '' };
  try {
    const parsed: unknown = JSON.parse(addressJson);
    if (typeof parsed !== 'object' || parsed === null) return blank;
    const record = parsed as Record<string, unknown>;
    const pick = (key: string): string => {
      const value = record[key];
      return typeof value === 'string' ? value : '';
    };
    return { street: pick('street'), city: pick('city'), province: pick('province'), postal_code: pick('postal_code') };
  } catch {
    return blank;
  }
}

async function customerExportRows(): Promise<Record<string, unknown>[]> {
  const customers = await listAllCustomers();
  return customers.map((customer) => {
    const address = parseAddressParts(customer.address_json);
    return {
      account_code: customer.id,
      company_name: customer.company_name,
      contact_name: customer.contact_name,
      email: customer.email,
      phone: customer.phone,
      street: address.street,
      city: address.city,
      province: address.province,
      postal_code: address.postal_code,
      status: customer.status,
      created_at: customer.created_at,
    };
  });
}

async function salesOrderExportRows(): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const orders = await listStaffOrders({ limit: 5001 });
  const truncated = orders.length > 5000;
  const page = truncated ? orders.slice(0, 5000) : orders;
  return {
    truncated,
    rows: page.map((order) => ({
      order_number: order.order_number,
      customer_id: order.customer_id,
      company_name: order.customer?.company_name ?? '',
      status: order.status,
      subtotal: order.subtotal,
      vat: order.vat,
      total: order.total,
      invoice_number: order.invoice?.invoice_number ?? '',
      created_at: order.created_at,
    })),
  };
}

export async function buildPastelExport(params: {
  entity: PastelEntity;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<PastelExportResult> {
  const { entity, actorId, actorRole, clientIp = '127.0.0.1' } = params;

  if (actorRole !== 'SALES_STAFF' && actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Staff or Admin privileges required for Pastel exports');
  }

  const mapping = loadPastelMapping(entity);
  let rows: Record<string, unknown>[] = [];
  let truncated = false;
  if (entity === 'customers') {
    rows = await customerExportRows();
  } else {
    const page = await salesOrderExportRows();
    rows = page.rows;
    truncated = page.truncated;
  }

  const lines: string[] = [mapping.columns.map((column) => escapeCsvCell(column.header, mapping.delimiter)).join(mapping.delimiter)];
  const errors: PastelRowError[] = [];
  let exported = 0;
  let skipped = 0;

  rows.forEach((row, index) => {
    const cells: string[] = [];
    let failed = false;
    for (const column of mapping.columns) {
      try {
        cells.push(escapeCsvCell(applyColumn(column, row), mapping.delimiter));
      } catch (err) {
        if (errors.length < MAX_REPORT_ERRORS) {
          errors.push({
            row: index + 1,
            field: column.header,
            reason: err instanceof Error ? err.message : 'Invalid value',
          });
        }
        failed = true;
        break;
      }
    }
    if (failed) {
      skipped += 1;
    } else {
      lines.push(cells.join(mapping.delimiter));
      exported += 1;
    }
  });

  await createAuditLog({
    actor_id: actorId,
    actor_role: actorRole,
    action: 'DATA_EXPORT',
    entity_type: 'pastel_exports',
    entity_id: entity,
    before_hash: null,
    after_hash: `${exported}/${skipped}`,
    ip: clientIp,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    entity,
    filename: `pastel_${entity}_${stamp}.csv`,
    csv: lines.join('\n'),
    total: rows.length,
    exported,
    skipped,
    truncated,
    errors,
  };
}
