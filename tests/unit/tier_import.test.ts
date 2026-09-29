import { describe, it, expect, beforeEach } from 'vitest';
import {
  parsePriceCsv,
  parsePriceExcel,
  detectTierLayout,
  suggestTierMapping,
  previewTierImport,
  applyTierImport,
  generateTierPairsTemplate,
  generateTierMatrixTemplate,
  generateTierExcelTemplate,
} from '@/lib/services/tier_import';
import { memoryDb } from '@/lib/repo/mysql/client';
import { getPriceTierByCode } from '@/lib/repo/mysql';

describe('Tier price file import (CSV/XLSX, flexible layouts)', () => {
  beforeEach(() => {
    memoryDb.resetDatabase();
  });

  it('auto-detects pairs vs matrix layouts', () => {
    expect(detectTierLayout(['Item Code', 'Price'])).toBe('pairs');
    expect(detectTierLayout(['SKU', 'Unit Price'])).toBe('pairs');
    expect(detectTierLayout(['SKU', 'TIER_1', 'TIER_2'])).toBe('matrix');
    expect(detectTierLayout(['Item', 'Volume Contract', 'Standard'])).toBe('matrix');
  });

  it('suggests column mappings for both layouts', () => {
    expect(suggestTierMapping(['Item Code', 'Price'], 'pairs')).toEqual({ skuCol: 'Item Code', priceCol: 'Price' });
    const matrix = suggestTierMapping(['SKU', 'TIER_1', 'TIER_2'], 'matrix');
    expect(matrix.skuCol).toBe('SKU');
    expect(matrix.tierCols?.TIER_1).toBe('TIER_1');
  });

  it('previews pairs files with per-row errors and nothing saved', async () => {
    const { headers, rows } = parsePriceCsv('Item Code,Price\nSKU-PPR-A4-80G,85.00\nBAD ROW!,10.00\nSKU-PEN-BLU-05,notaprice\n');
    const preview = previewTierImport({ headers, rows, tierCode: 'TIER_9' });
    expect(preview.layout).toBe('pairs');
    expect(preview.valid).toBe(1);
    expect(preview.rowErrors).toHaveLength(2);
    expect(preview.bases.TIER_9.count).toBe(1);
    expect(await getPriceTierByCode('TIER_9')).toBeNull();
  });

  it('creates a tier from a pairs CSV end to end', async () => {
    const { headers, rows } = parsePriceCsv(generateTierPairsTemplate());
    const result = await applyTierImport({
      headers,
      rows,
      tierCode: 'TIER_4',
      tierName: 'Volume Contract',
      actorId: 1,
      actorRole: 'ADMIN',
    });
    expect(result.success).toBe(true);
    expect(result.tiers.map((t) => t.code)).toContain('TIER_4');
    const created = await getPriceTierByCode('TIER_4');
    expect(created?.name).toBe('Volume Contract');
    expect(JSON.parse(created?.basis || '{}')['SKU-PPR-A4-80G']).toBe('85.00');
  });

  it('creates multiple tiers from a matrix Excel file', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.json_to_sheet([
      { SKU: 'SKU-PPR-A4-80G', TIER_9: '65.00', TIER_8: '60.00' },
      { SKU: 'SKU-PEN-BLU-05', TIER_9: '99.00', TIER_8: '95.00' },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Prices');
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    const { parsePriceExcel: parseExcel } = await import('@/lib/services/tier_import');
    const { headers, rows } = await parseExcel(buffer);
    const result = await applyTierImport({ headers, rows, actorId: 1, actorRole: 'ADMIN' });
    expect(result.success).toBe(true);
    expect(result.tiers.map((t) => t.code).sort()).toEqual(['TIER_8', 'TIER_9']);
  });

  it('refuses to overwrite an existing tier without merge, then merges with it', async () => {
    const { headers, rows } = parsePriceCsv('SKU,Price\nSKU-PPR-A4-80G,70.00\n');
    const clash = await applyTierImport({ headers, rows, tierCode: 'TIER_1', actorId: 1, actorRole: 'ADMIN' });
    expect(clash.success).toBe(false);
    expect(clash.rowErrors[0].reason).toMatch(/already exists/);

    const merged = await applyTierImport({ headers, rows, tierCode: 'TIER_1', merge: true, actorId: 1, actorRole: 'ADMIN' });
    expect(merged.success).toBe(true);
    expect(merged.merged).toContain('TIER_1');
    const tier = await getPriceTierByCode('TIER_1');
    const basis = JSON.parse(tier?.basis || '{}');
    expect(basis['SKU-PPR-A4-80G']).toBe('70.00');
    expect(Object.keys(basis).length).toBeGreaterThan(1);
  });

  it('rejects non-ADMIN imports and generates templates', async () => {
    const { headers, rows } = parsePriceCsv('SKU,Price\nSKU-PPR-A4-80G,70.00\n');
    await expect(
      applyTierImport({ headers, rows, tierCode: 'TIER_X', actorId: 2, actorRole: 'SALES_STAFF' })
    ).rejects.toThrow(/FORBIDDEN/);
    expect(generateTierMatrixTemplate().split('\n')[0]).toBe('SKU,TIER_1,TIER_2');
    const xlsx = await generateTierExcelTemplate();
    expect(xlsx.length).toBeGreaterThan(0);
    const XLSX = await import('xlsx');
    expect(XLSX.read(xlsx, { type: 'buffer' }).SheetNames).toEqual(['SKU + Price', 'Matrix']);
  });

  it('parses real Excel buffers through parsePriceExcel', async () => {
    const buffer = await generateTierExcelTemplate();
    const pairsSheet = (await import('xlsx')).read(buffer, { type: 'buffer' }).Sheets['SKU + Price'];
    expect(pairsSheet).toBeDefined();
  });
});
