import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { checkDailyQuota } from '@/lib/repo/redis';
import { getClientIp, publicErrorMessage, rateLimitRetryHeaders } from '@/lib/security/request';
import {
  importCatalogCsv,
  importCatalogExcel,
  importCatalogRows,
  parseCsvRaw,
  parseExcelRaw,
  suggestCatalogMapping,
  applyCatalogMapping,
  generateCatalogTemplate,
  generateCatalogExcelTemplate,
} from '@/lib/services/catalog_import';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'SALES_STAFF')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  if (searchParams.get('format') === 'xlsx') {
    const buffer = await generateCatalogExcelTemplate();
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="catalog_template.xlsx"',
      },
    });
  }
  return new NextResponse(generateCatalogTemplate(), {
    status: 200,
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="catalog_template.csv"' },
  });
}

function parseMappingField(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const mapping: Record<string, string> = {};
    for (const [field, header] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof header === 'string' && header) mapping[field] = header;
    }
    return Object.keys(mapping).length > 0 ? mapping : undefined;
  } catch {
    return undefined;
  }
}

function isExcelFile(name: string, contentType: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    contentType.includes('spreadsheetml') ||
    contentType.includes('ms-excel')
  );
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
  const quota = await checkDailyQuota('catalog-import', session.userId, 20);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'QUOTA_EXCEEDED', message: 'Daily catalogue import quota reached. Try again tomorrow.' },
      { status: 429, headers: rateLimitRetryHeaders(86400) }
    );
  }
  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
        return NextResponse.json({ error: 'CSV_EMPTY', message: 'No file uploaded' }, { status: 400 });
      }
      const blob = file as Blob & { name?: string; type?: string };
      const buffer = Buffer.from(await blob.arrayBuffer());
      const fileName = typeof blob.name === 'string' ? blob.name : '';
      const fileType = typeof blob.type === 'string' ? blob.type : contentType;
      const mapping = parseMappingField(formData.get('mapping'));
      const previewOnly = formData.get('preview') === '1';
      if (previewOnly) {
        const raw = isExcelFile(fileName, fileType)
          ? await parseExcelRaw(buffer)
          : parseCsvRaw(buffer.toString('utf8'));
        const suggestedMapping = suggestCatalogMapping(raw.headers);
        const effective = mapping || suggestedMapping;
        return NextResponse.json(
          {
            success: true,
            preview: true,
            format: isExcelFile(fileName, fileType) ? 'excel' : 'csv',
            headers: raw.headers,
            suggestedMapping,
            mapping: effective,
            total: raw.rows.length,
            sample: applyCatalogMapping(raw.rows.slice(0, 8), effective),
          },
          { status: 200 }
        );
      }
      if (mapping) {
        const raw = isExcelFile(fileName, fileType)
          ? await parseExcelRaw(buffer)
          : parseCsvRaw(buffer.toString('utf8'));
        const rows = applyCatalogMapping(raw.rows, mapping);
        const result = await importCatalogRows({
          rows,
          actorId: session.userId,
          actorRole: session.role,
          clientIp,
          source: isExcelFile(fileName, fileType) ? 'excel' : 'csv',
        });
        return NextResponse.json({ success: true, format: isExcelFile(fileName, fileType) ? 'excel' : 'csv', ...result }, { status: 200 });
      }
    }
    if (contentType.includes('application/json')) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: 'INVALID_JSON', message: 'Malformed JSON payload' }, { status: 400 });
      }
      const csv = typeof (body as { csv?: unknown }).csv === 'string' ? (body as { csv: string }).csv : '';
      if (!csv.trim()) return NextResponse.json({ error: 'CSV_EMPTY' }, { status: 400 });
      const result = await importCatalogCsv({ csv, actorId: session.userId, actorRole: session.role, clientIp });
      return NextResponse.json({ success: true, format: 'csv', ...result }, { status: 200 });
    }
    const text = await req.text();
    if (!text.trim()) return NextResponse.json({ error: 'CSV_EMPTY' }, { status: 400 });
    const result = await importCatalogCsv({ csv: text, actorId: session.userId, actorRole: session.role, clientIp });
    return NextResponse.json({ success: true, format: 'csv', ...result }, { status: 200 });
  } catch (err) {
    const msg = publicErrorMessage(err, 'Import failed');
    if (msg.startsWith('CSV_')) return NextResponse.json({ error: msg }, { status: 400 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
