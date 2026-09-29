import 'server-only';
import { findProductBySku } from '@/lib/repo/mongo';
import { getStockBalance, parseCents, formatCents } from '@/lib/repo/mysql';
import { CatalogService } from './catalog';
import { CartService } from './cart';
import type { CartData } from '@/lib/repo/redis';

export interface BulkOrderValidationLine {
  sku: string;
  qty: number;
  valid: boolean;
  name?: string;
  unit_price?: string;
  tier_code?: string;
  available_stock: number;
  in_stock: boolean;
  line_total?: string;
  notes?: string;
  error?: string;
}

export interface BulkOrderValidationResult {
  valid_count: number;
  error_count: number;
  total_units: number;
  subtotal: string;
  vat: string;
  total: string;
  lines: BulkOrderValidationLine[];
}

export interface BulkAddResult {
  cart: CartData;
  added_count: number;
  skipped_count: number;
  errors: string[];
}

export class QuickOrderService {
 
  static async validateBulkItems(
    customerId: number,
    items: Array<{ sku: string; qty: number; notes?: string }>
  ): Promise<BulkOrderValidationResult> {
    const lines: BulkOrderValidationLine[] = [];
    let validCount = 0;
    let errorCount = 0;
    let totalUnits = 0;
    let subtotalCents = BigInt(0);

    for (const rawItem of items) {
      const sku = (rawItem.sku || '').trim().toUpperCase();
      const qty = Number(rawItem.qty);
      const notes = rawItem.notes?.trim() || undefined;

      if (!sku) {
        continue;
      }

      if (!Number.isInteger(qty) || qty <= 0 || qty > 100000) {
        lines.push({
          sku,
          qty: isNaN(qty) ? 0 : qty,
          valid: false,
          available_stock: 0,
          in_stock: false,
          notes,
          error: 'Quantity must be a positive integer (1-100000)',
        });
        errorCount++;
        continue;
      }

      const product = await findProductBySku(sku);
      if (!product || !product.active) {
        lines.push({
          sku,
          qty,
          valid: false,
          available_stock: 0,
          in_stock: false,
          notes,
          error: `SKU '${sku}' not found or inactive in catalog`,
        });
        errorCount++;
        continue;
      }

      const stock = await getStockBalance(sku);
      const availableStock = stock ? Math.max(0, stock.qty - stock.reserved) : 0;
      const inStock = availableStock >= qty;

      const tierPrice = await CatalogService.getCustomerTierPrice(customerId, sku);
      if (!tierPrice) {
        lines.push({
          sku,
          name: product.name,
          qty,
          valid: false,
          available_stock: availableStock,
          in_stock: inStock,
          notes,
          error: `No quoted price for SKU '${sku}' — contact sales to have it quoted`,
        });
        errorCount++;
        continue;
      }

      const unitPriceCents = parseCents(tierPrice.unitPrice);
      const lineTotalCents = unitPriceCents * BigInt(qty);

      lines.push({
        sku,
        name: product.name,
        qty,
        valid: true,
        unit_price: tierPrice.unitPrice,
        tier_code: tierPrice.tierCode,
        available_stock: availableStock,
        in_stock: inStock,
        line_total: formatCents(lineTotalCents),
        notes,
        error: !inStock ? `Low stock: Only ${availableStock} available in warehouse` : undefined,
      });

      validCount++;
      totalUnits += qty;
      subtotalCents += lineTotalCents;
    }

    const vatCents = (subtotalCents * BigInt(15) + BigInt(50)) / BigInt(100);
    const totalCents = subtotalCents + vatCents;

    return {
      valid_count: validCount,
      error_count: errorCount,
      total_units: totalUnits,
      subtotal: formatCents(subtotalCents),
      vat: formatCents(vatCents),
      total: formatCents(totalCents),
      lines,
    };
  }

   static async addBulkItemsToCart(
    customerId: number,
    items: Array<{ sku: string; qty: number; notes?: string }>
  ): Promise<BulkAddResult> {
    const validation = await this.validateBulkItems(customerId, items);
    const validLines = validation.lines.filter((l) => l.valid);

    const errors: string[] = [];
    for (const l of validation.lines) {
      if (!l.valid && l.error) {
        errors.push(`${l.sku}: ${l.error}`);
      }
    }

    if (validLines.length === 0) {
      const currentCart = await CartService.getCart(customerId);
      return {
        cart: currentCart,
        added_count: 0,
        skipped_count: items.length,
        errors,
      };
    }

    let updatedCart: CartData | null = null;
    for (const item of validLines) {
      updatedCart = await CartService.addItem(customerId, item.sku, item.qty);
    }

    return {
      cart: updatedCart || (await CartService.getCart(customerId)),
      added_count: validLines.length,
      skipped_count: validation.error_count,
      errors,
    };
  }

   static parseCsvContent(csvContent: string): Array<{ sku: string; qty: number; notes?: string }> {
    if (!csvContent || typeof csvContent !== 'string') {
      return [];
    }
    if (csvContent.length > 262144) {
      throw new Error('CSV_TOO_LARGE: CSV payload exceeds the 256 KB limit');
    }

    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

    if (lines.length > 2000) {
      throw new Error('CSV_TOO_MANY_ROWS: CSV exceeds the 2000 row limit');
    }

    if (lines.length === 0) {
      return [];
    }

    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

    const parseLine = (line: string): string[] => {
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
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const parsedRows = lines.map(parseLine);
    let startIndex = 0;

    const firstRowCols = parsedRows[0];
    const isFirstRowHeader =
      firstRowCols.length > 0 &&
      (firstRowCols[0].toLowerCase() === 'sku' ||
        firstRowCols[0].toLowerCase() === 'product' ||
        firstRowCols[0].toLowerCase() === 'item' ||
        firstRowCols[0].toLowerCase() === 'item code' ||
        firstRowCols[0].toLowerCase() === 'sku code' ||
        (firstRowCols.length > 1 &&
          isNaN(Number(firstRowCols[1])) &&
          ['qty', 'quantity', 'units', 'count', 'amount'].includes(firstRowCols[1].toLowerCase())));

    if (isFirstRowHeader) {
      startIndex = 1;
    }

    const results: Array<{ sku: string; qty: number; notes?: string }> = [];

    for (let i = startIndex; i < parsedRows.length; i++) {
      const cols = parsedRows[i];
      if (cols.length === 0) continue;

      const sku = (cols[0] || '').trim().toUpperCase();
      const rawQty = (cols[1] || '').trim();
      const notes = cols.length > 2 ? cols.slice(2).join(' ').trim() : undefined;

      if (!sku) continue;

      const qty = parseInt(rawQty, 10);
      results.push({
        sku,
        qty: isNaN(qty) ? 0 : qty,
        notes: notes || undefined,
      });
    }

    return results;
  }

   static generateSampleCsvTemplate(): string {
    return `SKU,Quantity,Notes
SKU-PPR-A4-80G,50,Main Office Ream Batch
SKU-PEN-BLU-05,20,Accounts Dept Pens
SKU-FIL-LVR-BLK,10,Archive Lever Arch Files
SKU-PPR-A4-75G,25,Draft Printing Paper
SKU-PEN-RED-05,15,Auditing Pens
SKU-FIL-LVR-BLU,10,HR Records Folders
`;
  }
}
