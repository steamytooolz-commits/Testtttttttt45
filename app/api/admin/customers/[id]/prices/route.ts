import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { CustomPriceSchema, CustomPriceImportSchema } from '@/lib/validation';
import { listCustomPrices, setCustomPrice, deleteCustomPrice, findCustomerById } from '@/lib/repo/mysql';
import { findProductBySku } from '@/lib/repo/mongo';
import {
  parsePriceCsv,
  parsePriceExcel,
  suggestCustomerPriceMapping,
  buildCustomerPriceItems,
  generateCustomerPriceCsvTemplate,
  generateCustomerPriceExcelTemplate,
  normalizePrice,
} from '@/lib/services/customer_price_import';

function parseCustomerId(raw: string | undefined): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizePriceValue(value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value !== 'string') return value;
  return normalizePrice(value);
}

/**
 * The single-price and bulk JSON payloads arrive straight from a human-typed field,
 * so coerce prices ("R 85", "85,5", "1,250") the same way file imports already do
 * before the strict DECIMAL(12,2) schema sees them.
 */
function normalizePricePayload(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  const record = input as { prices?: unknown } & Record<string, unknown>;
  if (Array.isArray(record.prices)) {
    return {
      ...record,
      prices: record.prices.map((entry) => {
        if (entry === null || typeof entry !== 'object') return entry;
        const item = entry as Record<string, unknown>;
        return { ...item, unitPrice: normalizePriceValue(item.unitPrice) };
      }),
    };
  }
  return { ...record, unitPrice: normalizePriceValue(record.unitPrice) };
}

function validationFailure(fieldErrors: Record<string, string[] | undefined>): NextResponse {
  const message =
    Object.values(fieldErrors)
      .flat()
      .find((entry) => typeof entry === 'string' && entry.length > 0) || 'Invalid price payload';
  return NextResponse.json({ error: 'VALIDATION_ERROR', message, details: fieldErrors }, { status: 400 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const format = new URL(req.url).searchParams.get('format');
  if (format === 'csv') {
    const csv = generateCustomerPriceCsvTemplate();
    return new NextResponse(csv, {
      status: 200,
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="customer_price_template.csv"' },
    });
  }
  if (format === 'xlsx') {
    const buffer = await generateCustomerPriceExcelTemplate();
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="customer_price_template.xlsx"',
      },
    });
  }
  const { id } = await params;
  const customerId = parseCustomerId(id);
  if (!customerId) return NextResponse.json({ error: 'INVALID_CUSTOMER_ID' }, { status: 400 });
  const prices = await listCustomPrices(customerId);
  return NextResponse.json({ customerId, prices }, { status: 200 });
}

function isExcelFile(name: string, contentType: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls') || contentType.includes('spreadsheetml') || contentType.includes('ms-excel');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 });
  }
  const { id } = await params;
  const customerId = parseCustomerId(id);
  if (!customerId) return NextResponse.json({ error: 'INVALID_CUSTOMER_ID' }, { status: 400 });
  const customer = await findCustomerById(customerId);
  if (!customer) return NextResponse.json({ error: 'CUSTOMER_NOT_FOUND' }, { status: 404 });
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const previewOnly = formData.get('preview') === '1';
      const skuColParam = typeof formData.get('skuCol') === 'string' ? String(formData.get('skuCol')) : undefined;
      const priceColParam = typeof formData.get('priceCol') === 'string' ? String(formData.get('priceCol')) : undefined;
      let headers: string[] = [];
      let rows: Array<Record<string, string>> = [];
      const file = formData.get('file');
      const pasted = formData.get('csvText');
      if (typeof pasted === 'string' && pasted.trim()) {
        const parsed = parsePriceCsv(pasted);
        headers = parsed.headers;
        rows = parsed.rows;
      } else if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        const blob = file as Blob & { name?: string; type?: string };
        const buffer = Buffer.from(await blob.arrayBuffer());
        if (isExcelFile(typeof blob.name === 'string' ? blob.name : '', typeof blob.type === 'string' ? blob.type : '')) {
          const parsed = await parsePriceExcel(buffer);
          headers = parsed.headers;
          rows = parsed.rows;
        } else {
          const parsed = parsePriceCsv(buffer.toString('utf8'));
          headers = parsed.headers;
          rows = parsed.rows;
        }
      } else {
        return NextResponse.json({ error: 'CSV_EMPTY', message: 'Upload a CSV/XLSX file or paste CSV text' }, { status: 400 });
      }
      const mapping = {
        skuCol: skuColParam || suggestCustomerPriceMapping(headers).skuCol,
        priceCol: priceColParam || suggestCustomerPriceMapping(headers).priceCol,
      };
      if (!mapping.skuCol || !mapping.priceCol) {
        return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Could not detect SKU and price columns — select them manually' }, { status: 400 });
      }
      const built = buildCustomerPriceItems(rows, mapping);
      if (previewOnly) {
        return NextResponse.json(
          {
            success: true,
            preview: true,
            headers,
            skuCol: mapping.skuCol,
            priceCol: mapping.priceCol,
            total: rows.length,
            valid: built.valid,
            sample: built.items.slice(0, 5),
            rowErrors: built.rowErrors.slice(0, 100),
          },
          { status: 200 }
        );
      }
      if (built.rowErrors.length > 0) {
        return NextResponse.json({ success: false, rowErrors: built.rowErrors.slice(0, 100), valid: built.valid, total: rows.length }, { status: 400 });
      }
      const saved = [];
      const errors: Array<{ sku: string; reason: string }> = [];
      for (const item of built.items) {
        const product = await findProductBySku(item.sku);
        if (!product || !product.active) {
          errors.push({ sku: item.sku, reason: 'SKU not found or inactive' });
          continue;
        }
        saved.push(
          await setCustomPrice({
            customerId,
            sku: item.sku,
            unitPrice: item.unitPrice,
            actorId: session.userId,
            actorRole: session.role,
            clientIp,
          })
        );
      }
      return NextResponse.json({ success: true, saved, errors, rowErrors: built.rowErrors }, { status: 200 });
    } catch (err) {
      const msg = publicErrorMessage(err, 'Custom price file import failed');
      if (msg.startsWith('CSV_')) return NextResponse.json({ error: msg }, { status: 400 });
      if (msg.startsWith('VALIDATION_ERROR')) return NextResponse.json({ error: msg }, { status: 400 });
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
    }
    const record = body as { prices?: unknown } & Record<string, unknown>;
    if (Array.isArray(record.prices)) {
      const parsed = CustomPriceImportSchema.safeParse(normalizePricePayload(body));
      if (!parsed.success) {
        return validationFailure(parsed.error.flatten().fieldErrors);
      }
      const saved = [];
      const errors: Array<{ sku: string; reason: string }> = [];
      for (const item of parsed.data.prices) {
        const product = await findProductBySku(item.sku);
        if (!product || !product.active) {
          errors.push({ sku: item.sku, reason: 'SKU not found or inactive' });
          continue;
        }
        saved.push(
          await setCustomPrice({
            customerId,
            sku: item.sku,
            unitPrice: item.unitPrice,
            actorId: session.userId,
            actorRole: session.role,
            clientIp,
          })
        );
      }
      return NextResponse.json({ success: true, saved, errors }, { status: 200 });
    }
    const parsed = CustomPriceSchema.safeParse(normalizePricePayload(body));
    if (!parsed.success) {
      return validationFailure(parsed.error.flatten().fieldErrors);
    }
    const product = await findProductBySku(parsed.data.sku);
    if (!product || !product.active) {
      return NextResponse.json({ error: 'SKU_NOT_FOUND', message: 'SKU not found or inactive in catalogue' }, { status: 400 });
    }
    const saved = await setCustomPrice({
      customerId,
      sku: parsed.data.sku,
      unitPrice: parsed.data.unitPrice,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });
    return NextResponse.json({ success: true, price: saved }, { status: 200 });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Custom price save failed');
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 });
  }
  const { id } = await params;
  const customerId = parseCustomerId(id);
  if (!customerId) return NextResponse.json({ error: 'INVALID_CUSTOMER_ID' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const sku = searchParams.get('sku') || '';
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(sku.trim())) {
    return NextResponse.json({ error: 'INVALID_SKU' }, { status: 400 });
  }
  try {
    await deleteCustomPrice({ customerId, sku, actorId: session.userId, actorRole: session.role, clientIp });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'Custom price removal failed') }, { status: 400 });
  }
}
