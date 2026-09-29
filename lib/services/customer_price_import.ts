import 'server-only';
import { parsePriceCsv, parsePriceExcel } from './tier_import';

const SKU_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const PRICE_PATTERN = /^\d{1,10}\.\d{2}$/;

function headerKey(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_]+/g, '');
}

function isSkuHeader(header: string): boolean {
  const key = headerKey(header);
  return ['sku', 'skucode', 'itemcode', 'item', 'productcode', 'product', 'code', 'itemno', 'itemnumber'].includes(key);
}

function isPriceHeader(header: string): boolean {
  const key = headerKey(header);
  return ['price', 'unitprice', 'rate', 'amount', 'cost', 'sellprice', 'sellingprice', 'unitcost', 'quotedprice', 'customprice'].includes(key);
}

export interface CustomerPriceRowError {
  row: number;
  sku: string;
  reason: string;
}

export interface CustomerPriceMapping {
  skuCol?: string;
  priceCol?: string;
}

export interface CustomerPricePreview {
  headers: string[];
  skuCol: string;
  priceCol: string;
  total: number;
  valid: number;
  sample: Array<{ sku: string; unitPrice: string }>;
  rowErrors: CustomerPriceRowError[];
}

/**
 * Coerces human-entered money into the DECIMAL(12,2) string the database expects:
 * "R 85" -> "85.00", "85,5" -> "85.50", "1,250.00" -> "1250.00".
 * Returns the input unchanged when it cannot be interpreted, so callers reject it.
 */
export function normalizePrice(raw: string): string {
  let v = raw.trim().replace(/\s+/g, '');
  v = v.replace(/^R\s*/i, '');
  // "1,250.00" uses thousands separators rather than a decimal comma.
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(v)) v = v.replace(/,/g, '');
  v = v.replace(/,/g, '.');
  if (/^\.\d{1,2}$/.test(v)) v = `0${v}`;
  if (/^\d+\.\d$/.test(v)) v = `${v}0`;
  if (/^\d+$/.test(v)) v = `${v}.00`;
  return v;
}

export function suggestCustomerPriceMapping(headers: string[]): CustomerPriceMapping {
  const skuCol = headers.find((h) => isSkuHeader(h));
  const priceCol = headers.find((h) => isPriceHeader(h) && h !== skuCol);
  if (skuCol && priceCol) return { skuCol, priceCol };
  if (headers.length >= 2) {
    if (!skuCol && !priceCol) {
      return { skuCol: headers[0], priceCol: headers[1] };
    }
    if (skuCol && !priceCol) {
      const fallback = headers.find((h) => h !== skuCol);
      return { skuCol, priceCol: fallback };
    }
    if (!skuCol && priceCol) {
      const fallback = headers.find((h) => h !== priceCol);
      return { skuCol: fallback, priceCol };
    }
  }
  return { skuCol, priceCol };
}

export function buildCustomerPriceItems(
  rows: Array<Record<string, string>>,
  mapping: CustomerPriceMapping
): { items: Array<{ sku: string; unitPrice: string }>; rowErrors: CustomerPriceRowError[]; valid: number } {
  if (!mapping.skuCol || !mapping.priceCol) {
    throw new Error('VALIDATION_ERROR: Map both the SKU column and the price column');
  }
  const items: Array<{ sku: string; unitPrice: string }> = [];
  const rowErrors: CustomerPriceRowError[] = [];
  let valid = 0;
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rawSku = (row[mapping.skuCol as string] || '').trim();
    const rawPrice = (row[mapping.priceCol as string] || '').trim();
    if (!rawSku && !rawPrice) return;
    const sku = rawSku.toUpperCase();
    const unitPrice = normalizePrice(rawPrice);
    if (!SKU_PATTERN.test(sku)) {
      rowErrors.push({ row: rowNumber, sku: sku || '(blank)', reason: 'Invalid SKU format' });
      return;
    }
    if (!PRICE_PATTERN.test(unitPrice)) {
      rowErrors.push({ row: rowNumber, sku, reason: `Invalid price '${rawPrice || '(blank)'}': use like 79.99` });
      return;
    }
    items.push({ sku, unitPrice });
    valid += 1;
  });
  return { items, rowErrors, valid };
}

export function previewCustomerPriceFile(params: {
  headers: string[];
  rows: Array<Record<string, string>>;
  mapping?: CustomerPriceMapping;
}): CustomerPricePreview {
  const mapping = params.mapping || suggestCustomerPriceMapping(params.headers);
  if (!mapping.skuCol || !mapping.priceCol) {
    throw new Error('VALIDATION_ERROR: Could not detect SKU and price columns — please select them manually');
  }
  const built = buildCustomerPriceItems(params.rows, mapping);
  return {
    headers: params.headers,
    skuCol: mapping.skuCol,
    priceCol: mapping.priceCol,
    total: params.rows.length,
    valid: built.valid,
    sample: built.items.slice(0, 5),
    rowErrors: built.rowErrors.slice(0, 100),
  };
}

export function parseCustomerPriceFileUpload(params: {
  headers: string[];
  rows: Array<Record<string, string>>;
  mapping?: CustomerPriceMapping;
}): { items: Array<{ sku: string; unitPrice: string }>; rowErrors: CustomerPriceRowError[] } {
  const mapping = params.mapping || suggestCustomerPriceMapping(params.headers);
  return buildCustomerPriceItems(params.rows, mapping);
}

export { parsePriceCsv, parsePriceExcel };

export function generateCustomerPriceCsvTemplate(): string {
  return `SKU,Price\nSKU-PPR-A4-80G,79.99\nSKU-PEN-BLU-05,95.50\nSKU-FIL-LVR-BLK,42.00\n`;
}

export async function generateCustomerPriceExcelTemplate(): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet([
    { SKU: 'SKU-PPR-A4-80G', Price: '79.99' },
    { SKU: 'SKU-PEN-BLU-05', Price: '95.50' },
    { SKU: 'SKU-FIL-LVR-BLK', Price: '42.00' },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Prices');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
