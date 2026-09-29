import 'server-only';
import { AdminService } from './admin';
import { listPriceTiers, type PriceTierRow, type UserRole } from '@/lib/repo/mysql';
import { createAuditLog } from '@/lib/repo/mysql';

export type TierImportLayout = 'pairs' | 'matrix';

export interface TierImportRowError {
  row: number;
  sku: string;
  reason: string;
}

export interface TierImportPreview {
  layout: TierImportLayout;
  headers: string[];
  tierCodes: string[];
  total: number;
  valid: number;
  bases: Record<string, { count: number; sample: Array<{ sku: string; price: string }> }>;
  rowErrors: TierImportRowError[];
}

export interface TierImportResult {
  success: boolean;
  tiers: PriceTierRow[];
  merged: string[];
  total: number;
  imported: number;
  rowErrors: TierImportRowError[];
}

export interface TierColumnMapping {
  skuCol?: string;
  priceCol?: string;
  tierCols?: Record<string, string>;
}

const SKU_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const PRICE_PATTERN = /^\d{1,10}\.\d{2}$/;
const TIER_CODE_PATTERN = /^[A-Z0-9_]{2,20}$/;
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

export function normalizeTierCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

function headerKey(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_]+/g, '');
}

function isSkuHeader(header: string): boolean {
  const key = headerKey(header);
  return ['sku', 'skucode', 'itemcode', 'item', 'productcode', 'product', 'code'].includes(key);
}

function isPriceHeader(header: string): boolean {
  const key = headerKey(header);
  return ['price', 'unitprice', 'rate', 'amount', 'cost', 'sellprice', 'sellingprice'].includes(key);
}

export interface ParsedPriceFile {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export function parsePriceCsv(csv: string): ParsedPriceFile {
  if (!csv || csv.length > 262144) {
    throw new Error('CSV_TOO_LARGE: Price file exceeds the 256 KB limit');
  }
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('CSV_EMPTY: No rows found');
  }
  if (lines.length > MAX_ROWS + 1) {
    throw new Error('CSV_TOO_MANY_ROWS: Price file exceeds the 2000 row limit');
  }
  const headers = splitCsvLine(lines[0]);
  if (headers.length < 2) {
    throw new Error('CSV_BAD_HEADER: Price file needs at least a SKU column and a price column');
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

export async function parsePriceExcel(buffer: Buffer): Promise<ParsedPriceFile> {
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

export function generateTierPairsTemplate(): string {
  return `Item Code,Price\nSKU-PPR-A4-80G,85.00\nSKU-PEN-BLU-05,110.00\nSKU-FIL-LVR-BLK,42.00\n`;
}

export function generateTierMatrixTemplate(): string {
  return `SKU,TIER_1,TIER_2\nSKU-PPR-A4-80G,85.00,78.50\nSKU-PEN-BLU-05,110.00,98.00\nSKU-FIL-LVR-BLK,42.00,38.50\n`;
}

export async function generateTierExcelTemplate(): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const pairs = XLSX.utils.json_to_sheet([
    { 'Item Code': 'SKU-PPR-A4-80G', Price: '85.00' },
    { 'Item Code': 'SKU-PEN-BLU-05', Price: '110.00' },
    { 'Item Code': 'SKU-FIL-LVR-BLK', Price: '42.00' },
  ]);
  const matrix = XLSX.utils.json_to_sheet([
    { SKU: 'SKU-PPR-A4-80G', TIER_1: '85.00', TIER_2: '78.50' },
    { SKU: 'SKU-PEN-BLU-05', TIER_1: '110.00', TIER_2: '98.00' },
    { SKU: 'SKU-FIL-LVR-BLK', TIER_1: '42.00', TIER_2: '38.50' },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, pairs, 'SKU + Price');
  XLSX.utils.book_append_sheet(workbook, matrix, 'Matrix');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

export function detectTierLayout(headers: string[], existingCodes: string[] = []): TierImportLayout {
  const existing = new Set(existingCodes.map((c) => c.toUpperCase()));
  let tierLike = 0;
  for (const header of headers) {
    if (isSkuHeader(header) || isPriceHeader(header)) continue;
    const code = normalizeTierCode(header);
    if (TIER_CODE_PATTERN.test(code) && (existing.has(code) || /^TIER_[A-Z0-9_]+$/.test(code) || code.length <= 12)) {
      tierLike += 1;
    }
  }
  return tierLike >= 1 ? 'matrix' : 'pairs';
}

export function suggestTierMapping(headers: string[], layout: TierImportLayout): TierColumnMapping {
  const skuCol = headers.find((h) => isSkuHeader(h));
  if (layout === 'pairs') {
    const priceCol = headers.find((h) => isPriceHeader(h) && h !== skuCol);
    return { skuCol, priceCol };
  }
  const tierCols: Record<string, string> = {};
  for (const header of headers) {
    if (header === skuCol || isPriceHeader(header)) continue;
    const code = normalizeTierCode(header);
    if (TIER_CODE_PATTERN.test(code)) {
      tierCols[header] = code;
    }
  }
  return { skuCol, tierCols };
}

interface BuiltBases {
  bases: Record<string, Record<string, string>>;
  tierCodes: string[];
  rowErrors: TierImportRowError[];
  valid: number;
}

export function buildTierBases(
  rows: Array<Record<string, string>>,
  layout: TierImportLayout,
  mapping: TierColumnMapping,
  fallbackTierCode?: string
): BuiltBases {
  const bases: Record<string, Record<string, string>> = {};
  const rowErrors: TierImportRowError[] = [];
  let valid = 0;

  const ensureTier = (code: string): Record<string, string> => {
    if (!bases[code]) bases[code] = {};
    return bases[code];
  };

  if (layout === 'pairs') {
    const code = (fallbackTierCode || '').trim().toUpperCase();
    if (!code || !TIER_CODE_PATTERN.test(code)) {
      throw new Error('VALIDATION_ERROR: A valid tier code (e.g. TIER_4) is required for SKU-price files');
    }
    if (!mapping.skuCol || !mapping.priceCol) {
      throw new Error('VALIDATION_ERROR: Map both the SKU column and the price column');
    }
    const basis = ensureTier(code);
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const sku = (row[mapping.skuCol as string] || '').toUpperCase();
      const price = (row[mapping.priceCol as string] || '').trim();
      if (!sku && !price) return;
      if (!SKU_PATTERN.test(sku)) {
        rowErrors.push({ row: rowNumber, sku: sku || '(blank)', reason: 'Invalid SKU format' });
        return;
      }
      if (!PRICE_PATTERN.test(price)) {
        rowErrors.push({ row: rowNumber, sku, reason: `Invalid price '${price || '(blank)'}': use DECIMAL format like 85.00` });
        return;
      }
      basis[sku] = price;
      valid += 1;
    });
    return { bases, tierCodes: [code], rowErrors, valid };
  }

  const tierCols = mapping.tierCols || {};
  const entries = Object.entries(tierCols).filter(([, code]) => code.trim().length > 0);
  if (!mapping.skuCol) {
    throw new Error('VALIDATION_ERROR: Map the SKU column');
  }
  if (entries.length === 0) {
    throw new Error('VALIDATION_ERROR: Map at least one price column to a tier code');
  }
  for (const [, code] of entries) {
    const normalized = normalizeTierCode(code);
    if (!TIER_CODE_PATTERN.test(normalized)) {
      throw new Error(`VALIDATION_ERROR: Invalid tier code '${code}'`);
    }
  }
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const sku = (row[mapping.skuCol as string] || '').toUpperCase();
    const hasAnyPrice = entries.some(([header]) => (row[header] || '').trim().length > 0);
    if (!sku && !hasAnyPrice) return;
    if (!SKU_PATTERN.test(sku)) {
      rowErrors.push({ row: rowNumber, sku: sku || '(blank)', reason: 'Invalid SKU format' });
      return;
    }
    let rowValid = false;
    for (const [header, code] of entries) {
      const rawPrice = (row[header] || '').trim();
      if (!rawPrice) continue;
      if (!PRICE_PATTERN.test(rawPrice)) {
        rowErrors.push({ row: rowNumber, sku, reason: `Invalid price '${rawPrice}' under '${header}': use DECIMAL format like 85.00` });
        continue;
      }
      ensureTier(normalizeTierCode(code))[sku] = rawPrice;
      rowValid = true;
    }
    if (rowValid) valid += 1;
  });
  return { bases, tierCodes: Object.keys(bases), rowErrors, valid };
}

export function previewTierImport(params: {
  headers: string[];
  rows: Array<Record<string, string>>;
  layout?: TierImportLayout;
  mapping?: TierColumnMapping;
  tierCode?: string;
  existingCodes?: string[];
}): TierImportPreview {
  const layout = params.layout || detectTierLayout(params.headers, params.existingCodes || []);
  const mapping = params.mapping || suggestTierMapping(params.headers, layout);
  const built = buildTierBases(params.rows, layout, mapping, params.tierCode);
  const bases: TierImportPreview['bases'] = {};
  for (const [code, basis] of Object.entries(built.bases)) {
    const entries = Object.entries(basis);
    bases[code] = {
      count: entries.length,
      sample: entries.slice(0, 5).map(([sku, price]) => ({ sku, price })),
    };
  }
  return {
    layout,
    headers: params.headers,
    tierCodes: built.tierCodes,
    total: params.rows.length,
    valid: built.valid,
    bases,
    rowErrors: built.rowErrors.slice(0, 100),
  };
}

export async function applyTierImport(params: {
  headers: string[];
  rows: Array<Record<string, string>>;
  layout?: TierImportLayout;
  mapping?: TierColumnMapping;
  tierCode?: string;
  tierName?: string;
  merge?: boolean;
  actorId: number;
  actorRole: UserRole;
  clientIp?: string;
}): Promise<TierImportResult> {
  const { actorId, actorRole, clientIp = '127.0.0.1' } = params;
  if (actorRole !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only administrators can import price tiers');
  }
  const existing = await listPriceTiers();
  const existingByCode = new Map(existing.map((t) => [t.code.toUpperCase(), t]));
  const layout = params.layout || detectTierLayout(params.headers, existing.map((t) => t.code));
  const mapping = params.mapping || suggestTierMapping(params.headers, layout);
  const built = buildTierBases(params.rows, layout, mapping, params.tierCode);
  if (built.rowErrors.length > 0 || built.valid === 0) {
    return { success: false, tiers: [], merged: [], total: params.rows.length, imported: built.valid, rowErrors: built.rowErrors.slice(0, 100) };
  }
  const tiers: PriceTierRow[] = [];
  const merged: string[] = [];
  for (const [code, basis] of Object.entries(built.bases)) {
    const current = existingByCode.get(code.toUpperCase());
    if (current) {
      if (!params.merge) {
        return {
          success: false,
          tiers: [],
          merged: [],
          total: params.rows.length,
          imported: 0,
          rowErrors: [{ row: 0, sku: '', reason: `Tier '${code}' already exists. Enable merge to overlay these prices onto it.` }],
        };
      }
      let currentBasis: Record<string, string> = {};
      try {
        const parsed: unknown = JSON.parse(current.basis);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === 'string') currentBasis[k] = v;
          }
        }
      } catch {
        currentBasis = {};
      }
      const updated = await AdminService.updateTier({
        id: current.id,
        basis: { ...currentBasis, ...basis },
        actorId,
        actorRole,
        clientIp,
      });
      tiers.push(updated);
      merged.push(code);
    } else {
      const name =
        layout === 'pairs' && params.tierName?.trim()
          ? params.tierName.trim()
          : code;
      const created = await AdminService.createTier({
        code,
        name,
        basis,
        active: true,
        actorId,
        actorRole,
        clientIp,
      });
      tiers.push(created);
    }
  }
  await createAuditLog({
    actor_id: actorId,
    actor_role: actorRole,
    action: 'TIER_IMPORT',
    entity_type: 'price_tiers',
    entity_id: tiers.map((t) => t.code).join(','),
    before_hash: null,
    after_hash: `${built.valid}/${built.rowErrors.length}`,
    ip: clientIp,
  });
  return { success: true, tiers, merged, total: params.rows.length, imported: built.valid, rowErrors: [] };
}
