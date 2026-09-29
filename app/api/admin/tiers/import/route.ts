import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
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
  type TierImportLayout,
  type TierColumnMapping,
} from '@/lib/services/tier_import';
import { listPriceTiers } from '@/lib/repo/mysql';
import { checkDailyQuota } from '@/lib/repo/redis';
import { rateLimitRetryHeaders } from '@/lib/security/request';

function parseLayout(raw: unknown): TierImportLayout | undefined {
  if (raw === 'pairs' || raw === 'matrix') return raw;
  return undefined;
}

function parseMapping(raw: unknown): TierColumnMapping | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    const mapping: TierColumnMapping = {};
    if (typeof record.skuCol === 'string') mapping.skuCol = record.skuCol;
    if (typeof record.priceCol === 'string') mapping.priceCol = record.priceCol;
    if (typeof record.tierCols === 'object' && record.tierCols !== null) {
      mapping.tierCols = {};
      for (const [header, code] of Object.entries(record.tierCols as Record<string, unknown>)) {
        if (typeof code === 'string') mapping.tierCols[header] = code;
      }
    }
    return mapping;
  } catch {
    return undefined;
  }
}

function isExcelFile(name: string, contentType: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls') || contentType.includes('spreadsheetml') || contentType.includes('ms-excel');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'SALES_STAFF')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'pairs';
  if (format === 'xlsx') {
    const buffer = await generateTierExcelTemplate();
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="tier_price_template.xlsx"',
      },
    });
  }
  const csv = format === 'matrix' ? generateTierMatrixTemplate() : generateTierPairsTemplate();
  const filename = format === 'matrix' ? 'tier_price_matrix_template.csv' : 'tier_price_template.csv';
  return new NextResponse(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"` },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const csrfHeader = req.headers.get('x-csrf-token');
  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    return NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 });
  }
  const quota = await checkDailyQuota('tier-import', session.userId, 20);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'QUOTA_EXCEEDED', message: 'Daily tier import quota reached. Try again tomorrow.' },
      { status: 429, headers: rateLimitRetryHeaders(86400) }
    );
  }
  try {
    const contentType = req.headers.get('content-type') || '';
    let headers: string[] = [];
    let rows: Array<Record<string, string>> = [];
    let layout = parseLayout(new URL(req.url).searchParams.get('layout'));
    let mapping = parseMapping(new URL(req.url).searchParams.get('mapping'));
    let tierCode = new URL(req.url).searchParams.get('tierCode') || undefined;
    let tierName = new URL(req.url).searchParams.get('tierName') || undefined;
    let merge = new URL(req.url).searchParams.get('merge') === '1';
    let previewOnly = new URL(req.url).searchParams.get('preview') === '1';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      layout = parseLayout(formData.get('layout')) || layout;
      mapping = parseMapping(formData.get('mapping')) || mapping;
      const codeField = formData.get('tierCode');
      if (typeof codeField === 'string' && codeField.trim()) tierCode = codeField;
      const nameField = formData.get('tierName');
      if (typeof nameField === 'string' && nameField.trim()) tierName = nameField;
      merge = formData.get('merge') === '1' || formData.get('merge') === 'on' || merge;
      previewOnly = formData.get('preview') === '1' || previewOnly;
      const pasted = formData.get('csvText');
      const file = formData.get('file');
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
    } else {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
      }
      const record = body as Record<string, unknown>;
      if (typeof record.csvText === 'string' && record.csvText.trim()) {
        const parsed = parsePriceCsv(record.csvText);
        headers = parsed.headers;
        rows = parsed.rows;
      } else {
        return NextResponse.json({ error: 'CSV_EMPTY', message: 'Provide csvText or upload a file' }, { status: 400 });
      }
      layout = parseLayout(record.layout) || layout;
      if (typeof record.mapping === 'object' && record.mapping !== null) {
        mapping = record.mapping as TierColumnMapping;
      }
      if (typeof record.tierCode === 'string') tierCode = record.tierCode;
      if (typeof record.tierName === 'string') tierName = record.tierName;
      merge = record.merge === true || merge;
      previewOnly = record.preview === true || previewOnly;
    }

    const existingCodes = (await listPriceTiers()).map((t) => t.code);
    const resolvedLayout = layout || detectTierLayout(headers, existingCodes);
    const resolvedMapping = mapping || suggestTierMapping(headers, resolvedLayout);

    if (previewOnly) {
      const preview = previewTierImport({ headers, rows, layout: resolvedLayout, mapping: resolvedMapping, tierCode, existingCodes });
      return NextResponse.json({ success: true, preview: true, ...preview }, { status: 200 });
    }

    const result = await applyTierImport({
      headers,
      rows,
      layout: resolvedLayout,
      mapping: resolvedMapping,
      tierCode,
      tierName,
      merge,
      actorId: session.userId,
      actorRole: session.role,
      clientIp,
    });
    if (!result.success) {
      return NextResponse.json({ ...result }, { status: 400 });
    }
    return NextResponse.json({ ...result }, { status: 201 });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Tier import failed');
    if (msg.startsWith('CSV_')) return NextResponse.json({ error: msg }, { status: 400 });
    if (msg.startsWith('VALIDATION_ERROR')) return NextResponse.json({ error: msg }, { status: 400 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
