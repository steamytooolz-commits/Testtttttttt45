import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { Document, Font, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer';
import {
  findSalesOrderById,
  getSalesOrderLines,
  listInvoicesByCustomerId,
  listCreditNotesByCustomer,
  findCustomerById,
  getInvoiceById,
  getCreditNoteById,
  type UserRole,
} from '@/lib/repo/mysql';
import { formatCents, parseCents } from '@/lib/repo/mysql';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
let fontsRegistered = false;

function ensureFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  Font.register({
    family: 'Roboto',
    fonts: [
      { src: path.join(FONT_DIR, 'Roboto-Regular.ttf') },
      { src: path.join(FONT_DIR, 'Roboto-Medium.ttf'), fontWeight: 700 },
      { src: path.join(FONT_DIR, 'Roboto-Italic.ttf'), fontStyle: 'italic' },
      { src: path.join(FONT_DIR, 'Roboto-MediumItalic.ttf'), fontWeight: 700, fontStyle: 'italic' },
    ],
  });
}

async function renderPdf(docTitle: string, children: ReactNode): Promise<Buffer> {
  ensureFonts();
  const doc = (
    <Document title={docTitle} author={COMPANY.name} creator="Stationery Depot Core">
      {children}
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}

function DocPage({ footerLabel, children }: { footerLabel: string; children: ReactNode }): ReactNode {
  const generated = new Date().toISOString().slice(0, 10);
  return (
    <Page size="A4" style={styles.page}>
      {children}
      <View style={styles.footer} fixed wrap={false}>
        <View style={styles.footerDivider} />
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>
            {COMPANY.name}  •  {COMPANY.address}  •  VAT {COMPANY.vat}  •  {footerLabel}
          </Text>
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
        <Text style={styles.footerSmall}>Generated {generated}  •  {COMPANY.email}  •  {COMPANY.web}</Text>
      </View>
    </Page>
  );
}

const INK = '#0B1D3A';
const COBALT = '#0455D8';
const COBALT_DARK = '#003B9A';
const SKY = '#EFF5FF';
const SKY_BORDER = '#D6E4FF';
const SLATE_50 = '#F8FAFC';
const SLATE_100 = '#F1F5F9';
const SLATE_200 = '#E2E8F0';
const SLATE_300 = '#CBD5E1';
const SLATE_400 = '#94A3B8';
const SLATE_500 = '#64748B';
const SLATE_600 = '#475569';
const SLATE_700 = '#334155';
const SLATE_900 = '#0F172A';
const EMERALD = '#047857';
const EMERALD_BG = '#ECFDF5';
const ROSE = '#BE123C';
const ROSE_BG = '#FFF1F2';
const ROSE_BORDER = '#FECDD3';

const COMPANY = {
  name: 'STATIONERY DEPOT (PTY) LTD',
  tagline: 'Wholesale Stationery  •  Since 2016',
  address: '14 Apex Commerce Park, Midrand, Gauteng 1685',
  phone: '+27 11 888 4000',
  email: 'accounts@stationerydepot.co.za',
  web: 'thestationerydepot.co.za',
  vat: '4920184729',
  reg: '2016/214905/07',
  bank: 'First National Bank',
  bankAccount: '62819284719',
  bankBranch: '250655',
};

let logoDataUri: string | null | undefined;
function getLogoUri(): string | null {
  if (logoDataUri !== undefined) return logoDataUri;
  try {
    const p = path.join(process.cwd(), 'public', 'brand-logo.png');
    const buf = fs.readFileSync(p);
    logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    logoDataUri = null;
  }
  return logoDataUri;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    paddingTop: 28,
    paddingBottom: 56,
    paddingHorizontal: 32,
    fontFamily: 'Roboto',
    fontSize: 9,
    lineHeight: 1.35,
    color: SLATE_700,
  },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32 },
  footerDivider: { height: 1, backgroundColor: SLATE_200, marginBottom: 6 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 6.5, color: SLATE_500, letterSpacing: 0.2 },
  footerPage: { fontSize: 6.5, fontWeight: 700, color: SLATE_600 },
  footerSmall: { fontSize: 6, color: SLATE_400, marginTop: 2 },

  badgeBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  badgeBarPill: {
    backgroundColor: COBALT,
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  badgeBarText: { fontSize: 6, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.7 },
  badgeBarNumber: { fontSize: 7, fontWeight: 700, color: COBALT, fontFamily: 'Roboto' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 10,
  },
  headerRule: { height: 2.5, backgroundColor: COBALT, borderRadius: 2, marginTop: 8 },
  headerMetaLine: { marginTop: 6, flexDirection: 'row', justifyContent: 'flex-end' },
  headerMetaText: { fontSize: 6, color: SLATE_500, letterSpacing: 0.2 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: 48, height: 48, borderRadius: 24, objectFit: 'cover' },
  companyName: { fontSize: 9.5, fontWeight: 700, color: INK, letterSpacing: 0.8 },
  companyTagline: { fontSize: 6.5, color: SLATE_500, letterSpacing: 0.4, marginTop: 1 },
  companyMeta: { fontSize: 6, color: SLATE_500, marginTop: 4, lineHeight: 1.4 },
  headerRight: { alignItems: 'flex-end', width: 210 },
  docTitle: { fontSize: 15, fontWeight: 700, color: INK, letterSpacing: 1.2, textAlign: 'right' },
  docSubtitle: { fontSize: 6.5, color: SLATE_500, marginTop: 1, textAlign: 'right' },
  docNumberLabel: { fontSize: 6, fontWeight: 700, color: SLATE_500, letterSpacing: 0.8, textAlign: 'right', marginTop: 8 },
  docNumberValue: { fontSize: 11, fontWeight: 700, color: COBALT, marginTop: 1, textAlign: 'right' },
  metaSmall: { fontSize: 6.5, color: SLATE_600, marginTop: 2, textAlign: 'right' },
  netPill: {
    marginTop: 5,
    backgroundColor: EMERALD_BG,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 7,
    alignSelf: 'flex-end',
  },
  netPillText: { fontSize: 6, fontWeight: 700, color: EMERALD, letterSpacing: 0.5 },
  statusText: { fontSize: 6.5, fontWeight: 700, letterSpacing: 0.6, textAlign: 'right' },

  sectionGap: { marginTop: 16 },
  kicker: { fontSize: 6.5, fontWeight: 700, color: COBALT, letterSpacing: 0.9 },
  h1: { fontSize: 13, fontWeight: 700, color: INK, marginTop: 3 },
  body: { fontSize: 8.5, color: SLATE_700, lineHeight: 1.4 },
  small: { fontSize: 7.5, color: SLATE_600, lineHeight: 1.4 },
  tiny: { fontSize: 6.5, color: SLATE_500 },
  tinyBold: { fontSize: 6.5, fontWeight: 700, color: SLATE_600 },

  card: {
    borderWidth: 1,
    borderColor: SLATE_200,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cardHeader: {
    backgroundColor: SLATE_50,
    borderBottomWidth: 1,
    borderBottomColor: SLATE_200,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  cardHeaderText: { fontSize: 6.5, fontWeight: 700, color: SLATE_600, letterSpacing: 0.7 },
  cardBody: { padding: 10 },
  cardAccent: { backgroundColor: SKY, borderColor: SKY_BORDER },

  grid2: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  metaDivider: { borderBottomWidth: 0.5, borderBottomColor: SLATE_100 },
  metaLabel: { fontSize: 6.5, fontWeight: 700, color: SLATE_500, letterSpacing: 0.5 },
  metaValue: { fontSize: 8, color: SLATE_700, textAlign: 'right' },
  metaValueStrong: { fontSize: 9, fontWeight: 700, color: INK, textAlign: 'right' },

  tableWrap: { borderWidth: 1, borderColor: SLATE_200, borderRadius: 8, overflow: 'hidden' },
  thRow: { flexDirection: 'row', backgroundColor: INK, paddingVertical: 6 },
  th: { fontSize: 6, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.6, paddingHorizontal: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: SLATE_100, paddingVertical: 6, alignItems: 'flex-start' },
  trAlt: { backgroundColor: SLATE_50 },
  td: { fontSize: 7.5, color: SLATE_700, paddingHorizontal: 6, lineHeight: 1.3 },
  tdBold: { fontSize: 7.5, fontWeight: 700, color: SLATE_900, paddingHorizontal: 6 },
  skuPill: {
    backgroundColor: SKY,
    borderWidth: 0.5,
    borderColor: SKY_BORDER,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 5,
    alignSelf: 'flex-start',
  },
  skuText: { fontSize: 6.5, fontWeight: 700, color: COBALT_DARK },

  totalsWrap: { width: 260, alignSelf: 'flex-end' },
  totalsCard: { borderWidth: 1, borderColor: SLATE_200, borderRadius: 8, overflow: 'hidden' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: SLATE_100 },
  totalsLabel: { fontSize: 7.5, color: SLATE_600 },
  totalsValue: { fontSize: 7.5, fontWeight: 700, color: SLATE_900, textAlign: 'right' },
  totalsGrand: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COBALT, paddingVertical: 10, paddingHorizontal: 10 },
  totalsGrandLabel: { fontSize: 8, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.6 },
  totalsGrandValue: { fontSize: 13, fontWeight: 700, color: '#FFFFFF', textAlign: 'right' },
  vatNote: { fontSize: 6, color: SLATE_400, textAlign: 'right', marginTop: 4 },

  infoGrid: { flexDirection: 'row', gap: 10 },
  infoCard: { flex: 1, borderWidth: 1, borderColor: SLATE_200, borderRadius: 8, padding: 10, backgroundColor: SLATE_50 },
  infoCardAccent: { backgroundColor: SKY, borderColor: SKY_BORDER },
  infoTitle: { fontSize: 6.5, fontWeight: 700, color: INK, letterSpacing: 0.6 },
  infoText: { fontSize: 7.5, color: SLATE_700, marginTop: 4, lineHeight: 1.4 },
  infoTextSmall: { fontSize: 6.5, color: SLATE_600, marginTop: 3 },

  badge: { borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6 },
  badgeCobalt: { backgroundColor: COBALT },
  badgeText: { fontSize: 6, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.5 },
});

type DocumentLine = {
  sku: string;
  description_snapshot: string;
  qty: number;
  unit_price: string;
  line_total: string;
};

function money(value: string): string {
  try {
    return formatCents(parseCents(value));
  } catch {
    return value;
  }
}

function ledger(value: string): string {
  return value === '0.00' ? '—' : money(value);
}

function saDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function pdfStatus(status: string): string {
  switch (status) {
    case 'ISSUED':
      return 'PAYABLE ON TERMS';
    case 'CREDITED':
      return 'CREDITED IN FULL';
    default:
      return status.toUpperCase();
  }
}

function InvoiceHeader(opts: { invoiceNumber: string; issuedAt: string; orderNumber: string }): ReactNode {
  const logoUri = getLogoUri();
  const dueDate = new Date(new Date(opts.issuedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return (
    <View wrap={false}>
      <View style={styles.badgeBar}>
        <View style={styles.badgeBarPill}>
          <Text style={styles.badgeBarText}>OFFICIAL SALES INVOICE</Text>
        </View>
        <Text style={styles.badgeBarNumber}>{opts.invoiceNumber}</Text>
      </View>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoWrap}>
            {logoUri ? <Image src={logoUri} style={styles.logoImage} /> : <Text style={{ fontSize: 9, fontWeight: 700, color: '#FFFFFF' }}>SD</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>STATIONERY DEPOT (PTY) LTD</Text>
            <Text style={styles.companyTagline}>Wholesale Office & Commercial Supplies</Text>
            <Text style={styles.companyMeta}>
              VAT Registration No: {COMPANY.vat}  •  Reg {COMPANY.reg}{'\n'}
              {COMPANY.address}{'\n'}
              Tel: {COMPANY.phone}  •  {COMPANY.email}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.docTitle}>SALES INVOICE</Text>
          <Text style={styles.docSubtitle}>Original document for the recipient</Text>
          <Text style={styles.docNumberValue}>{opts.invoiceNumber}</Text>
          <Text style={styles.metaSmall}>Date Issued: {saDate(opts.issuedAt)}</Text>
          <Text style={styles.metaSmall}>Due Date: {saDate(dueDate)}</Text>
          <Text style={styles.metaSmall}>Order Ref: {opts.orderNumber}</Text>
          <View style={styles.netPill}>
            <Text style={styles.netPillText}>NET 30 DAYS TRADE</Text>
          </View>
        </View>
      </View>
      <View style={styles.headerRule} />
    </View>
  );
}

function HeaderBar(opts: { title: string; subtitle: string; numberLabel: string; numberValue: string; status?: string; statusTone?: 'payable' | 'credited' }): ReactNode {
  const logoUri = getLogoUri();
  return (
    <View wrap={false}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoWrap}>
            {logoUri ? <Image src={logoUri} style={styles.logoImage} /> : <Text style={{ fontSize: 9, fontWeight: 700, color: '#FFFFFF' }}>SD</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>STATIONERY DEPOT</Text>
            <Text style={styles.companyTagline}>The Stationery Depot  •  Wholesale</Text>
            <Text style={styles.companyMeta}>
              {COMPANY.address}{'\n'}
              {COMPANY.phone}  •  {COMPANY.email}  •  {COMPANY.web}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.docTitle}>{opts.title}</Text>
          <Text style={styles.docSubtitle}>{opts.subtitle}</Text>
          <Text style={styles.docNumberLabel}>{opts.numberLabel}</Text>
          <Text style={styles.docNumberValue}>{opts.numberValue}</Text>
          {opts.status ? <Text style={[styles.statusText, { color: opts.statusTone === 'credited' ? ROSE : EMERALD, marginTop: 6, textAlign: 'right' }]}>{opts.status}</Text> : null}
        </View>
      </View>
      <View style={styles.headerRule} />
      <View style={styles.headerMetaLine}>
        <Text style={styles.headerMetaText}>VAT Reg {COMPANY.vat}  •  Company Reg {COMPANY.reg}  •  {COMPANY.bank} Acc {COMPANY.bankAccount}</Text>
      </View>
    </View>
  );
}

export interface StatementLine {
  date: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
}

export async function getInvoiceDocumentData(invoiceId: number, actorRole: UserRole, actorCustomerId?: number | null) {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new Error(`INVOICE_NOT_FOUND: Invoice #${invoiceId} not found`);
  const order = await findSalesOrderById(invoice.order_id);
  if (!order) throw new Error(`ORDER_NOT_FOUND: Order #${invoice.order_id} not found`);
  if (actorRole === 'CUSTOMER' && order.customer_id !== actorCustomerId) {
    throw new Error('FORBIDDEN: No access to this invoice');
  }
  const [lines, customer] = await Promise.all([getSalesOrderLines(order.id), findCustomerById(order.customer_id)]);
  return { invoice, order, lines, customer };
}

export async function getCreditNoteDocumentData(creditNoteId: number) {
  const creditNote = await getCreditNoteById(creditNoteId);
  if (!creditNote) throw new Error(`CREDIT_NOTE_NOT_FOUND: Credit note #${creditNoteId} not found`);
  const invoice = await getInvoiceById(creditNote.invoice_id);
  const order = await findSalesOrderById(creditNote.order_id);
  if (!order) throw new Error(`ORDER_NOT_FOUND: Order #${creditNote.order_id} not found`);
  const [lines, customer] = await Promise.all([getSalesOrderLines(order.id), findCustomerById(order.customer_id)]);
  return { creditNote, invoice, order, lines, customer };
}

export async function getStatementData(customerId: number): Promise<{ customerId: number; lines: StatementLine[]; balance: string }> {
  const invoices = await listInvoicesByCustomerId(customerId);
  const credits = await listCreditNotesByCustomer(customerId);
  const lines: StatementLine[] = [];
  for (const inv of invoices) {
    const issued = toIso(inv.issued_at);
    lines.push({
      date: issued,
      reference: inv.invoice_number,
      description: `Sales invoice ${inv.invoice_number} (Order SO-${inv.order_id})`,
      debit: inv.total,
      credit: '0.00',
    });
  }
  for (const cn of credits) {
    const credited = await getInvoiceById(cn.invoice_id);
    lines.push({
      date: toIso(cn.created_at),
      reference: cn.credit_number,
      description: credited
        ? `Credit note ${cn.credit_number} against sales invoice ${credited.invoice_number}`
        : `Credit note ${cn.credit_number}`,
      debit: '0.00',
      credit: cn.total,
    });
  }
  lines.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let balanceCents = BigInt(0);
  for (const l of lines) {
    balanceCents += parseCents(l.debit) - parseCents(l.credit);
  }
  return { customerId, lines, balance: formatCents(balanceCents) };
}

function Card({ title, children, accent }: { title: string; children: ReactNode; accent?: boolean }): ReactNode {
  return (
    <View style={[styles.card, accent ? styles.cardAccent : undefined]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardHeaderText}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function MetaRows({ rows }: { rows: Array<[string, string, boolean?]> }): ReactNode {
  return (
    <View>
      {rows.map(([label, value, strong], i) => (
        <View key={label} style={[styles.metaRow, i < rows.length - 1 ? styles.metaDivider : undefined]}>
          <Text style={styles.metaLabel}>{label}</Text>
          <Text style={strong ? styles.metaValueStrong : styles.metaValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function LineItems({ lines }: { lines: DocumentLine[] }): ReactNode {
  return (
    <View style={styles.tableWrap} wrap={false}>
      <View style={styles.thRow}>
        <Text style={[styles.th, { width: 78 }]}>SKU</Text>
        <Text style={[styles.th, { flex: 1 }]}>DESCRIPTION</Text>
        <Text style={[styles.th, { width: 46, textAlign: 'center' }]}>TIER</Text>
        <Text style={[styles.th, { width: 38, textAlign: 'center' }]}>QTY</Text>
        <Text style={[styles.th, { width: 78, textAlign: 'right' }]}>UNIT (EXCL VAT)</Text>
        <Text style={[styles.th, { width: 78, textAlign: 'right' }]}>TOTAL (EXCL VAT)</Text>
      </View>
      {lines.map((l, i) => (
        <View key={`${l.sku}-${i}`} style={[styles.tr, i % 2 === 1 ? styles.trAlt : undefined]}>
          <View style={{ width: 78, paddingHorizontal: 6 }}>
            <View style={styles.skuPill}>
              <Text style={styles.skuText}>{l.sku}</Text>
            </View>
          </View>
          <Text style={[styles.td, { flex: 1 }]}>{l.description_snapshot}</Text>
          <View style={{ width: 46, alignItems: 'center', paddingHorizontal: 6 }}>
            <View style={{ backgroundColor: SLATE_100, borderWidth: 0.5, borderColor: SLATE_200, borderRadius: 3, paddingVertical: 1, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 6, fontWeight: 700, color: SLATE_600 }}>{(l as { tier_code?: string }).tier_code || '—'}</Text>
            </View>
          </View>
          <Text style={[styles.tdBold, { width: 38, textAlign: 'center' }]}>{String(l.qty)}</Text>
          <Text style={[styles.td, { width: 78, textAlign: 'right' }]}>R {money(l.unit_price)}</Text>
          <Text style={[styles.tdBold, { width: 78, textAlign: 'right' }]}>R {money(l.line_total)}</Text>
        </View>
      ))}
    </View>
  );
}

export async function buildInvoicePdfBuffer(data: Awaited<ReturnType<typeof getInvoiceDocumentData>>): Promise<Buffer> {
  const { invoice, order, lines, customer } = data;

  const addressJson: { street?: string; city?: string; province?: string; postal_code?: string } = (() => {
    try {
      const parsed = JSON.parse(customer?.address_json || '{}');
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as never;
      return {};
    } catch {
      return {};
    }
  })();

  return renderPdf(
    `Sales Invoice ${invoice.invoice_number}`,
    <DocPage footerLabel={`Sales Invoice ${invoice.invoice_number}`}>
      {InvoiceHeader({ invoiceNumber: invoice.invoice_number, issuedAt: invoice.issued_at, orderNumber: order.order_number })}

      <View style={[styles.grid2, styles.sectionGap]}>
        <View style={styles.col}>
          <Card title="BILLED TO  —  COMMERCIAL ACCOUNT">
            <Text style={{ fontSize: 9, fontWeight: 700, color: INK }}>{customer?.company_name || 'Commercial Customer'}</Text>
            <Text style={[styles.small, { marginTop: 2 }]}>Attn: {customer?.contact_name || '—'}</Text>
            <Text style={[styles.tiny, { marginTop: 4, color: SLATE_600 }]}>{customer?.email || ''}</Text>
            {customer?.phone ? <Text style={[styles.tiny, { color: SLATE_600 }]}>{customer.phone}</Text> : null}
          </Card>
        </View>
        <View style={styles.col}>
          <Card title="DELIVERY ADDRESS">
            {addressJson.street || addressJson.city ? (
              <View>
                {addressJson.street ? <Text style={styles.small}>{addressJson.street}</Text> : null}
                <Text style={styles.small}>
                  {[addressJson.city, addressJson.province].filter(Boolean).join(', ')} {addressJson.postal_code || ''}
                </Text>
                <Text style={[styles.small, { fontWeight: 700 }]}>South Africa</Text>
              </View>
            ) : (
              <Text style={styles.small}>Commercial Delivery Address on File</Text>
            )}
          </Card>
        </View>
      </View>

      <View style={styles.sectionGap}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={styles.kicker}>ORDER LINE ITEMS</Text>
          <Text style={styles.tiny}>{lines.length} item{lines.length === 1 ? '' : 's'}</Text>
        </View>
        {LineItems({ lines: lines as unknown as DocumentLine[] })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
        <View style={styles.totalsWrap}>
          <View style={styles.totalsCard}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Taxable Subtotal (excl. VAT):</Text>
              <Text style={styles.totalsValue}>R {money(invoice.subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Standard VAT @ 15.00%:</Text>
              <Text style={styles.totalsValue}>R {money(invoice.vat)}</Text>
            </View>
            <View style={styles.totalsGrand}>
              <Text style={styles.totalsGrandLabel}>TOTAL AMOUNT DUE (ZAR)</Text>
              <Text style={styles.totalsGrandValue}>R {money(invoice.total)}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: SLATE_200, paddingTop: 8 }}>
        <Text style={[styles.small, { fontWeight: 700, color: SLATE_700 }]}>
          Banking Details: {COMPANY.bank}  •  Account {COMPANY.bankAccount}  •  Branch {COMPANY.bankBranch}  •  Reference {invoice.invoice_number}
        </Text>
        <Text style={[styles.tiny, { marginTop: 3, color: SLATE_500 }]}>This is a computer-generated sales invoice issued from a strictly sequential invoice register. Sequential numbering verified.</Text>
      </View>
    </DocPage>
  );
}

export async function buildStatementPdfBuffer(
  customerId: number,
  companyName: string,
  data: { lines: StatementLine[]; balance: string }
): Promise<Buffer> {
  let runningCents = BigInt(0);
  const today = new Date().toISOString().slice(0, 10);
  const totalDebits = data.lines.reduce((acc, l) => acc + Number(parseCents(l.debit)), 0);
  const totalCredits = data.lines.reduce((acc, l) => acc + Number(parseCents(l.credit)), 0);

  return renderPdf(
    `Statement — ${companyName}`,
    <DocPage footerLabel={`Statement — ${companyName}`}>
      {HeaderBar({
        title: 'STATEMENT',
        subtitle: `Trade account statement  •  As at ${today}`,
        numberLabel: 'ACCOUNT',
        numberValue: `#${String(customerId).padStart(6, '0')}`,
      })}

      <View style={[styles.grid2, styles.sectionGap]}>
        <View style={styles.col}>
          <Card title="ACCOUNT HOLDER">
            <Text style={{ fontSize: 10, fontWeight: 700, color: INK }}>{companyName}</Text>
            <Text style={[styles.small, { marginTop: 2 }]}>Customer #{String(customerId).padStart(6, '0')}</Text>
            <Text style={[styles.tiny, { marginTop: 6 }]}>Period ending {today}  •  All amounts in ZAR</Text>
            <Text style={[styles.tiny, { marginTop: 2 }]}>{data.lines.length} transaction{data.lines.length === 1 ? '' : 's'} in period</Text>
          </Card>
        </View>
        <View style={{ width: 220 }}>
          <View style={{ backgroundColor: INK, borderRadius: 8, padding: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 6, fontWeight: 700, color: '#93BBFF', letterSpacing: 0.8 }}>AMOUNT DUE</Text>
            <Text style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', marginTop: 4 }}>R {money(data.balance)}</Text>
            <Text style={{ fontSize: 6, color: '#93BBFF', marginTop: 3 }}>Net 30 Days  •  VAT inclusive where applicable</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <View style={{ flex: 1, backgroundColor: SLATE_50, borderWidth: 1, borderColor: SLATE_200, borderRadius: 6, padding: 6, alignItems: 'center' }}>
              <Text style={styles.tinyBold}>DEBITS</Text>
              <Text style={[styles.small, { fontWeight: 700, color: SLATE_900 }]}>R {formatCents(BigInt(totalDebits))}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: SLATE_50, borderWidth: 1, borderColor: SLATE_200, borderRadius: 6, padding: 6, alignItems: 'center' }}>
              <Text style={styles.tinyBold}>CREDITS</Text>
              <Text style={[styles.small, { fontWeight: 700, color: EMERALD }]}>R {formatCents(BigInt(totalCredits))}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sectionGap}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={styles.kicker}>LEDGER</Text>
          <Text style={styles.tiny}>Running balance shown per line  •  Debit / Credit</Text>
        </View>
        {data.lines.length === 0 ? (
          <View style={[styles.card, { padding: 14, alignItems: 'center', backgroundColor: SLATE_50 }]}>
            <Text style={styles.small}>No activity in this period — opening and closing balance is R 0.00.</Text>
          </View>
        ) : (
          <View style={styles.tableWrap}>
            <View style={[styles.thRow, { flexWrap: 'nowrap' }]}>
              <Text style={[styles.th, { width: 52 }]}>DATE</Text>
              <Text style={[styles.th, { width: 68 }]}>REF</Text>
              <Text style={[styles.th, { flex: 1, flexShrink: 1 }]}>DESCRIPTION</Text>
              <Text style={[styles.th, { width: 62, textAlign: 'right' }]}>DEBIT</Text>
              <Text style={[styles.th, { width: 62, textAlign: 'right' }]}>CREDIT</Text>
              <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>BALANCE</Text>
            </View>
            {data.lines.map((l, i) => {
              runningCents += parseCents(l.debit) - parseCents(l.credit);
              const isCredit = l.credit !== '0.00';
              return (
                <View key={`${l.reference}-${i}`} wrap={false} style={[styles.tr, i % 2 === 1 ? styles.trAlt : undefined, { flexWrap: 'nowrap' }]}>
                  <Text style={[styles.td, { width: 52, fontSize: 7, flexShrink: 0 }]}>{saDate(l.date)}</Text>
                  <View style={{ width: 68, paddingHorizontal: 4, flexShrink: 0 }}>
                    <View style={[styles.badge, { backgroundColor: isCredit ? ROSE : INK, alignSelf: 'flex-start', maxWidth: 60 }]}>
                      <Text style={[styles.badgeText, { fontSize: 5.5 }]}>{l.reference}</Text>
                    </View>
                  </View>
                  <Text style={[styles.td, { flex: 1, fontSize: 6.5, flexShrink: 1 }]}>{l.description.length > 42 ? `${l.description.slice(0, 40)}…` : l.description}</Text>
                  <Text style={[styles.td, { width: 62, textAlign: 'right', color: l.debit === '0.00' ? SLATE_400 : SLATE_900, flexShrink: 0 }]}>{ledger(l.debit)}</Text>
                  <Text style={[styles.td, { width: 62, textAlign: 'right', color: isCredit ? ROSE : SLATE_400, flexShrink: 0 }]}>{ledger(l.credit)}</Text>
                  <Text style={[styles.tdBold, { width: 70, textAlign: 'right', flexShrink: 0 }]}>R {formatCents(runningCents)}</Text>
                </View>
              );
            })}
            <View style={[styles.tr, { backgroundColor: SLATE_900, borderBottomWidth: 0 }]}>
              <Text style={[styles.td, { flex: 1, color: '#FFFFFF', fontWeight: 700 }]}>Closing balance</Text>
              <Text style={[styles.tdBold, { width: 74, textAlign: 'right', color: '#FFFFFF' }]}>R {money(data.balance)}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.infoGrid, { marginTop: 14 }]}>
        <View style={[styles.infoCard, styles.infoCardAccent]}>
          <Text style={styles.infoTitle}>PAYMENT</Text>
          <Text style={styles.infoText}>
            {COMPANY.bank}  •  Acc {COMPANY.bankAccount}  •  Branch {COMPANY.bankBranch}
          </Text>
          <Text style={[styles.infoTextSmall, { fontWeight: 700, color: INK }]}>Ref: Account #{String(customerId).padStart(6, '0')}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ABOUT THIS STATEMENT</Text>
          <Text style={styles.infoTextSmall}>This statement consolidates tax invoices and credit notes from the sequential registers. It is not a tax invoice — individual invoices are issued per order and remain payable per their terms.</Text>
        </View>
      </View>
    </DocPage>
  );
}

export async function buildCreditNotePdfBuffer(data: Awaited<ReturnType<typeof getCreditNoteDocumentData>>): Promise<Buffer> {
  const { creditNote, invoice, order, lines, customer } = data;

  return renderPdf(
    `Credit Note ${creditNote.credit_number}`,
    <DocPage footerLabel={`Credit Note ${creditNote.credit_number}`}>
      {HeaderBar({
        title: 'CREDIT NOTE',
        subtitle: 'Adjustment  •  Not a tax invoice',
        numberLabel: 'CREDIT NUMBER',
        numberValue: creditNote.credit_number,
        status: `RE: ${invoice?.invoice_number || '—'}`,
        statusTone: 'credited',
      })}

      <View style={[styles.grid2, styles.sectionGap]}>
        <View style={styles.col}>
          <Card title="CREDIT TO">
            <Text style={{ fontSize: 10, fontWeight: 700, color: INK }}>{customer?.company_name || 'Commercial Customer'}</Text>
            {customer?.contact_name ? <Text style={[styles.small, { marginTop: 2 }]}>Attn: {customer.contact_name}</Text> : null}
            {customer?.email ? <Text style={[styles.tiny, { marginTop: 4 }]}>{customer.email}</Text> : null}
          </Card>
        </View>
        <View style={[styles.col, { maxWidth: 220 }]}>
          <Card title="CREDIT DETAILS">
            <MetaRows
              rows={[
                ['Credit No', creditNote.credit_number, true],
                ['Date', saDate(creditNote.created_at)],
                ['Against Invoice', invoice?.invoice_number || '—'],
                ['Order', order.order_number],
                ['Reason', 'See below'],
              ]}
            />
          </Card>
        </View>
      </View>

      <View style={styles.sectionGap}>
        <Text style={[styles.kicker, { marginBottom: 6 }]}>CREDITED ITEMS</Text>
        {LineItems({ lines })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
        <View style={styles.totalsWrap}>
          <View style={styles.totalsCard}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal (excl. VAT)</Text>
              <Text style={styles.totalsValue}>R {money(creditNote.subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>VAT @ 15%</Text>
              <Text style={styles.totalsValue}>R {money(creditNote.vat)}</Text>
            </View>
            <View style={[styles.totalsGrand, { backgroundColor: ROSE }]}>
              <Text style={styles.totalsGrandLabel}>TOTAL CREDIT</Text>
              <Text style={styles.totalsGrandValue}>R {money(creditNote.total)}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.card, { marginTop: 14, backgroundColor: ROSE_BG, borderColor: ROSE_BORDER }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardHeaderText, { color: ROSE }]}>REASON FOR CREDIT</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.body, { lineHeight: 1.5 }]}>{creditNote.reason}</Text>
        </View>
      </View>

      <View style={[styles.infoCard, { marginTop: 10 }]}>
        <Text style={styles.infoTitle}>EFFECT</Text>
        <Text style={styles.infoTextSmall}>Quantities credited have been returned to stock and the referenced invoice is marked as credited. This credit note is recorded in the sequential credit register.</Text>
      </View>
    </DocPage>
  );
}

export async function buildTierCataloguePdfBuffer(
  tier: { code: string; name: string; basis: string },
  products: Array<{ sku: string; name: string; categoryRef: string; description: string }>
): Promise<Buffer> {
  let basis: Record<string, string> = {};
  try {
    const parsed = JSON.parse(tier.basis);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) basis = parsed as Record<string, string>;
  } catch {
    basis = {};
  }

  return renderPdf(
    `Catalogue — ${tier.name}`,
    <DocPage footerLabel={`Catalogue — ${tier.name}`}>
      {HeaderBar({
        title: 'CATALOGUE',
        subtitle: `Contract rates  •  ${products.length} products  •  Prices excl. VAT`,
        numberLabel: 'TIER',
        numberValue: tier.code,
      })}

      <View style={styles.sectionGap}>
        <Card title={`${tier.name.toUpperCase()}  •  ${tier.code}`}>
          <Text style={styles.small}>
            Rates in this schedule are maintained by Stationery Depot and apply to the tier holder. Quoted client-specific prices, where set, override these rates.
          </Text>
        </Card>
      </View>

      <View style={[styles.tableWrap, { marginTop: 12 }]}>
        <View style={styles.thRow}>
          <Text style={[styles.th, { width: 78 }]}>SKU</Text>
          <Text style={[styles.th, { flex: 1 }]}>PRODUCT</Text>
          <Text style={[styles.th, { width: 84 }]}>CATEGORY</Text>
          <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>PRICE</Text>
        </View>
        {products.map((p, i) => (
          <View key={`${p.sku}-${i}`} style={[styles.tr, i % 2 === 1 ? styles.trAlt : undefined]}>
            <View style={{ width: 78, paddingHorizontal: 6 }}>
              <View style={styles.skuPill}>
                <Text style={styles.skuText}>{p.sku}</Text>
              </View>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 6 }}>
              <Text style={[styles.tdBold, { paddingHorizontal: 0 }]}>{p.name}</Text>
              <Text style={[styles.tiny, { paddingHorizontal: 0 }]}>{p.description.slice(0, 90)}</Text>
            </View>
            <Text style={[styles.td, { width: 84 }]}>{p.categoryRef.replace('cat-', '')}</Text>
            <Text style={[styles.tdBold, { width: 80, textAlign: 'right' }]}>{basis[p.sku] ? `R ${basis[p.sku]}` : '—'}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.tiny, { marginTop: 8 }]}>Generated {new Date().toISOString().slice(0, 10)}  •  Prices subject to update by sales administration.</Text>
    </DocPage>
  );
}
