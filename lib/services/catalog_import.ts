import 'server-only';
import { ensureCategory, upsertProduct } from '@/lib/repo/mongo';
import { setStockBalance, getStockBalance, createAuditLog, type UserRole } from '@/lib/repo/mysql';
import { invalidateCatalogCache } from '@/lib/repo/redis';

export interface CatalogImportRowError {
  row: number;
  sku: string;
  reason: string;
}

export interface CatalogImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: CatalogImportRowError[];
}

export type CatalogImportRow = Record<string, string>;

export const CATALOG_CANONICAL_FIELDS = ['sku', 'name', 'description', 'category', 'paperweight', 'packcount', 'colour', 'image', 'active'] as const;

export type CatalogField = (typeof CATALOG_CANONICAL_FIELDS)[number];

export function suggestCatalogMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const field of CATALOG_CANONICAL_FIELDS) {
    const match = headers.find((h) => !used.has(h) && headerAlias(normalizeHeader(h)) === field);
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

export function applyCatalogMapping(
  rawRows: Array<Record<string, string>>,
  mapping: Record<string, string>
): CatalogImportRow[] {
  return rawRows.map((raw) => {
    const row: CatalogImportRow = {};
    for (const field of CATALOG_CANONICAL_FIELDS) {
      const source = mapping[field];
      row[field] = source ? (raw[source] || '').trim() : '';
    }
    return row;
  });
}

export function parseCsvRaw(csv: string): { headers: string[]; rows: Array<Record<string, string>> } {
  if (!csv || csv.length > 262144) {
    throw new Error('CSV_TOO_LARGE: CSV payload exceeds the 256 KB limit');
  }
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  if (lines.length > MAX_ROWS + 1) {
    throw new Error('CSV_TOO_MANY_ROWS: CSV exceeds the 2000 row limit');
  }
  const headers = splitCsvLine(lines[0]);
  if (headers.length === 0 || headers.every((h) => !h)) {
    throw new Error('CSV_BAD_HEADER: No columns detected');
  }
  const rows = lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = (cols[c] || '').trim();
    }
    return row;
  });
  return { headers, rows };
}

export async function parseExcelRaw(buffer: Buffer): Promise<{ headers: string[]; rows: Array<Record<string, string>> }> {
  if (!buffer || buffer.length === 0) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('CSV_TOO_LARGE: Excel payload exceeds the 5 MB limit');
  }
  const XLSX = await import('xlsx');
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error('CSV_PARSE_FAILED: Unable to parse Excel workbook');
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
  if (json.length === 0) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  if (json.length > MAX_ROWS) {
    throw new Error('CSV_TOO_MANY_ROWS: Price file exceeds the 2000 row limit');
  }
  const headers = Object.keys(json[0]);
  const rows = json.map((record) => {
    const row: Record<string, string> = {};
    for (const header of headers) {
      const value = record[header];
      row[header] = value === null || value === undefined ? '' : String(value).trim();
    }
    return row;
  });
  return { headers, rows };
}

const EXPECTED_HEADERS = ['sku', 'name', 'description', 'category', 'paperweight', 'packcount', 'colour', 'image', 'active'];

const MAX_ROWS = 2000;

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '');
}

function headerAlias(normalized: string): string {
  if (normalized === 'sku' || normalized === 'skucode' || normalized === 'itemcode' || normalized === 'item') return 'sku';
  if (normalized === 'name' || normalized === 'product' || normalized === 'productname') return 'name';
  if (normalized === 'description' || normalized === 'desc') return 'description';
  if (normalized === 'category' || normalized === 'cat' || normalized === 'categoryref') return 'category';
  if (normalized === 'paperweight' || normalized === 'weight' || normalized === 'gsm') return 'paperweight';
  if (normalized === 'packcount' || normalized === 'pack' || normalized === 'qty' || normalized === 'quantity' || normalized === 'packsize') return 'packcount';
  if (normalized === 'colour' || normalized === 'color') return 'colour';
  if (normalized === 'image' || normalized === 'imageurl' || normalized === 'picture' || normalized === 'photo') return 'image';
  if (normalized === 'active' || normalized === 'enabled' || normalized === 'status') return 'active';
  return normalized;
}

export function normalizeImportRows(rawRows: Array<Record<string, unknown>>): CatalogImportRow[] {
  return rawRows.map((row) => {
    const out: CatalogImportRow = {};
    for (const [key, value] of Object.entries(row)) {
      const alias = headerAlias(normalizeHeader(key));
      out[alias] = value === null || value === undefined ? '' : String(value).trim();
    }
    return out;
  });
}

export function validateImageUrl(value: string): string | undefined {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 500) {
    throw new Error('Image URL exceeds the 500 character limit');
  }
  if (!/^https?:\/\/.+\..+/.test(trimmed) && !trimmed.startsWith('/product-images/')) {
    throw new Error('Image must be an http(s) URL or an uploaded /product-images/ path');
  }
  return trimmed;
}

export async function importCatalogRows(params: {
  rows: CatalogImportRow[];
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
  source?: string;
}): Promise<CatalogImportResult> {
  const { rows, actorId, actorRole, clientIp = '127.0.0.1', source = 'csv' } = params;
  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can import catalogues');
  }
  if (rows.length === 0) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  if (rows.length > MAX_ROWS) {
    throw new Error('CSV_TOO_MANY_ROWS: CSV exceeds the 2000 row limit');
  }
  const errors: CatalogImportRowError[] = [];
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = (row.sku || '').toUpperCase();
    const name = row.name || '';
    if (!sku || !/^[A-Za-z0-9_-]{3,64}$/.test(sku)) {
      skipped += 1;
      errors.push({ row: i + 2, sku: sku || '(blank)', reason: 'Invalid SKU format' });
      continue;
    }
    if (!name || name.length < 2) {
      skipped += 1;
      errors.push({ row: i + 2, sku, reason: 'Name is required' });
      continue;
    }
    try {
      const category = await ensureCategory(row.category || 'general');
      const packCount = row.packcount ? Number(row.packcount) : undefined;
      if (row.packcount && (!Number.isInteger(packCount) || (packCount as number) <= 0)) {
        throw new Error(`Invalid pack count '${row.packcount}'`);
      }
      const imageUrl = validateImageUrl(row.image || '');
      const activeRaw = (row.active || 'true').toLowerCase();
      await upsertProduct({
        _id: sku,
        name,
        description: row.description || '',
        categoryRef: category._id,
        attributes: {
          ...(row.paperweight ? { paperWeight: row.paperweight } : {}),
          ...(packCount && Number.isInteger(packCount) && packCount > 0 ? { packCount } : {}),
          ...(row.colour ? { colour: row.colour } : {}),
        },
        variants: [],
        mediaRefs: [],
        ...(imageUrl ? { imageUrl } : {}),
        active: activeRaw !== 'false' && activeRaw !== '0' && activeRaw !== 'no' && activeRaw !== 'inactive',
        updatedAt: new Date().toISOString(),
      });
      const existing = await getStockBalance(sku);
      if (!existing) {
        await setStockBalance(sku, 0, 0);
      }
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push({ row: i + 2, sku, reason: err instanceof Error ? err.message : 'Import failed' });
    }
  }
  await invalidateCatalogCache();
  await createAuditLog({
    actor_id: actorId,
    actor_role: actorRole,
    action: 'CATALOG_IMPORT',
    entity_type: 'products',
    entity_id: source,
    before_hash: null,
    after_hash: `${imported}/${skipped}`,
    ip: clientIp,
  });
  return { total: rows.length, imported, skipped, errors: errors.slice(0, 100) };
}

export function parseCsvRows(csv: string): CatalogImportRow[] {
  if (!csv || csv.length > 262144) {
    throw new Error('CSV_TOO_LARGE: CSV payload exceeds the 256 KB limit');
  }
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  if (lines.length > MAX_ROWS + 1) {
    throw new Error('CSV_TOO_MANY_ROWS: CSV exceeds the 2000 row limit');
  }
  const header = splitCsvLine(lines[0]).map((h) => headerAlias(normalizeHeader(h)));
  for (const expected of ['sku', 'name']) {
    if (!header.includes(expected)) {
      throw new Error(`CSV_BAD_HEADER: Missing required column '${expected}'. Expected: ${EXPECTED_HEADERS.join(', ')}`);
    }
  }
  const rows: CatalogImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: CatalogImportRow = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = (cols[c] || '').trim();
    }
    rows.push(row);
  }
  return rows;
}

export async function importCatalogCsv(params: {
  csv: string;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<CatalogImportResult> {
  const rows = parseCsvRows(params.csv);
  return importCatalogRows({ rows, actorId: params.actorId, actorRole: params.actorRole, clientIp: params.clientIp, source: 'csv' });
}

export async function importCatalogExcel(params: {
  buffer: Buffer;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<CatalogImportResult> {
  if (params.actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can import catalogues');
  }
  if (!params.buffer || params.buffer.length === 0) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  if (params.buffer.length > 5 * 1024 * 1024) {
    throw new Error('CSV_TOO_LARGE: Excel payload exceeds the 5 MB limit');
  }
  const XLSX = await import('xlsx');
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(params.buffer, { type: 'buffer' });
  } catch {
    throw new Error('CSV_PARSE_FAILED: Unable to parse Excel workbook');
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
  if (json.length === 0) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  const rows = normalizeImportRows(json);
  const keys = new Set(rows.flatMap((r) => Object.keys(r)));
  for (const expected of ['sku', 'name']) {
    if (!keys.has(expected)) {
      throw new Error(`CSV_BAD_HEADER: Missing required column '${expected}'. Expected: ${EXPECTED_HEADERS.join(', ')}`);
    }
  }
  return importCatalogRows({ rows, actorId: params.actorId, actorRole: params.actorRole, clientIp: params.clientIp, source: 'excel' });
}

export function generateCatalogTemplate(): string {
  return `sku,name,description,category,paperWeight,packCount,colour,image,active\nSKU-PPR-A4-80G,Typek A4 White Copy Paper 80gsm,High performance copy paper,paper,80gsm,500,White,https://example.co.za/images/typek-a4.jpg,true\n`;
}

export async function generateCatalogExcelTemplate(): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const data = [
    {
      sku: 'SKU-PPR-A4-80G',
      name: 'Typek A4 White Copy Paper 80gsm',
      description: 'High performance copy paper',
      category: 'paper',
      paperWeight: '80gsm',
      packCount: 500,
      colour: 'White',
      image: 'https://example.co.za/images/typek-a4.jpg',
      active: 'true',
    },
    {
      sku: 'SKU-PEN-BLU-05',
      name: 'Bic Cristal Ballpoint Pen Blue',
      description: 'Classic ballpoint pen',
      category: 'writing',
      paperWeight: '',
      packCount: 50,
      colour: 'Blue',
      image: '',
      active: 'true',
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Catalogue');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}
