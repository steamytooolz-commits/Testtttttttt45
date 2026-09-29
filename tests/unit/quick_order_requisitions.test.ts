import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { QuickOrderService } from '@/lib/services/quick_order';
import { RequisitionService } from '@/lib/services/requisition';
import {
  createCustomerAndUser,
  updateUserStatus,
  setCustomPrice,
  setStockBalance,
} from '@/lib/repo/mysql';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { POST as bulkValidateRoute } from '@/app/api/cart/bulk/validate/route';
import { POST as bulkAddRoute } from '@/app/api/cart/bulk/route';
import { POST as bulkCsvRoute } from '@/app/api/cart/bulk/csv/route';
import { GET as getTemplateRoute } from '@/app/api/cart/bulk/template/route';
import { GET as listRequisitionsRoute, POST as createRequisitionRoute } from '@/app/api/requisitions/route';
import {
  GET as getSingleRequisitionRoute,
  PUT as updateRequisitionRoute,
  DELETE as deleteRequisitionRoute,
} from '@/app/api/requisitions/[id]/route';
import { POST as loadRequisitionToCartRoute } from '@/app/api/requisitions/[id]/load-to-cart/route';

describe('Module 7: Bulk Quick Ordering & Requisition Templates', () => {
  let customerId: number;
  let userId: number;
  let approvedToken: string;
  let csrfToken: string;

  beforeEach(async () => {
    const uniqueEmail = `procurement_${Date.now()}_${Math.random().toString(36).substring(7)}@stationerycorp.co.za`;
    const { customer, user } = await createCustomerAndUser(
      {
        company_name: 'Metro Stationery Procurement',
        contact_name: 'Sarah Connor',
        email: uniqueEmail,
        phone: '+27 11 555 9999',
        address_json: JSON.stringify({ street: '100 Rivonia Rd', city: 'Sandton', province: 'GP', postal_code: '2196' }),
      },
      {
        password_hash: 'test-hash-pass',
        totp_secret_encrypted: 'totp-secret-123',
      }
    );

    customerId = customer.id;
    userId = user.id;

    await updateUserStatus(userId, 'APPROVED');
    await setCustomPrice({ customerId, sku: 'SKU-PPR-A4-80G', unitPrice: '85.00', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-PEN-BLU-05', unitPrice: '110.00', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-PEN-RED-05', unitPrice: '110.00', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-FIL-LVR-BLK', unitPrice: '42.00', actorId: userId, actorRole: 'ADMIN' });

    await setStockBalance('SKU-PPR-A4-80G', 1000, 0);
    await setStockBalance('SKU-PEN-BLU-05', 500, 0);
    await setStockBalance('SKU-FIL-LVR-BLK', 250, 0);

    const session = await createSession({
      userId,
      customerId,
      email: uniqueEmail,
      role: 'CUSTOMER',
      status: 'APPROVED',
    });

    approvedToken = session.token;
    csrfToken = session.csrfToken;
  });

  describe('1. QuickOrderService CSV Parser', () => {
    it('parses standard CSV with header and trims whitespace', () => {
      const csv = `SKU,Quantity,Notes\nSKU-PPR-A4-80G,50,Main Batch\nSKU-PEN-BLU-05,20,Office Pens`;
      const result = QuickOrderService.parseCsvContent(csv);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        sku: 'SKU-PPR-A4-80G',
        qty: 50,
        notes: 'Main Batch',
      });
      expect(result[1]).toEqual({
        sku: 'SKU-PEN-BLU-05',
        qty: 20,
        notes: 'Office Pens',
      });
    });

    it('parses tab-delimited and semicolon-delimited text', () => {
      const tsv = `SKU\tQuantity\tNotes\nSKU-FIL-LVR-BLK\t15\tArchiving`;
      const tsvResult = QuickOrderService.parseCsvContent(tsv);
      expect(tsvResult).toHaveLength(1);
      expect(tsvResult[0].sku).toBe('SKU-FIL-LVR-BLK');
      expect(tsvResult[0].qty).toBe(15);

      const semicolonCsv = `SKU;Quantity;Notes\nSKU-PPR-A4-80G;100;Urgent Print`;
      const semiResult = QuickOrderService.parseCsvContent(semicolonCsv);
      expect(semiResult).toHaveLength(1);
      expect(semiResult[0].sku).toBe('SKU-PPR-A4-80G');
      expect(semiResult[0].qty).toBe(100);
    });

    it('skips comments and blank lines', () => {
      const csv = `# Bulk order file\n// Prepared by procurement\n\nSKU-PPR-A4-80G,10\n\nSKU-PEN-BLU-05,5\n`;
      const result = QuickOrderService.parseCsvContent(csv);
      expect(result).toHaveLength(2);
      expect(result[0].sku).toBe('SKU-PPR-A4-80G');
      expect(result[1].sku).toBe('SKU-PEN-BLU-05');
    });

    it('generates a valid downloadable sample CSV template', () => {
      const template = QuickOrderService.generateSampleCsvTemplate();
      expect(template).toContain('SKU,Quantity,Notes');
      expect(template).toContain('SKU-PPR-A4-80G');
    });
  });

  describe('2. QuickOrderService Validation & Live Calculations', () => {
    it('validates active SKUs with live stock and tier pricing in BigInt cents', async () => {
      const items = [
        { sku: 'SKU-PPR-A4-80G', qty: 10 },
        { sku: 'SKU-PEN-BLU-05', qty: 5 },
      ];

      const validation = await QuickOrderService.validateBulkItems(customerId, items);

      expect(validation.valid_count).toBe(2);
      expect(validation.error_count).toBe(0);
      expect(validation.total_units).toBe(15);

      expect(validation.subtotal).toBe('1400.00');
      expect(validation.vat).toBe('210.00');
      expect(validation.total).toBe('1610.00');

      expect(validation.lines[0].valid).toBe(true);
      expect(validation.lines[0].unit_price).toBe('85.00');
      expect(validation.lines[0].line_total).toBe('850.00');
      expect(validation.lines[0].in_stock).toBe(true);
    });

    it('flags invalid SKUs and negative/zero quantities gracefully', async () => {
      const items = [
        { sku: 'INVALID-SKU-999', qty: 10 },
        { sku: 'SKU-PPR-A4-80G', qty: 0 },
        { sku: 'SKU-PEN-BLU-05', qty: 5 },
      ];

      const validation = await QuickOrderService.validateBulkItems(customerId, items);
      expect(validation.valid_count).toBe(1);
      expect(validation.error_count).toBe(2);

      const invalidSkuLine = validation.lines.find((l) => l.sku === 'INVALID-SKU-999');
      expect(invalidSkuLine?.valid).toBe(false);
      expect(invalidSkuLine?.error).toContain('not found or inactive');

      const zeroQtyLine = validation.lines.find((l) => l.sku === 'SKU-PPR-A4-80G');
      expect(zeroQtyLine?.valid).toBe(false);
      expect(zeroQtyLine?.error).toContain('positive integer');
    });

    it('batch adds valid items to customer cart in Redis', async () => {
      const items = [
        { sku: 'SKU-PPR-A4-80G', qty: 25 },
        { sku: 'SKU-FIL-LVR-BLK', qty: 10 },
      ];

      const result = await QuickOrderService.addBulkItemsToCart(customerId, items);
      expect(result.added_count).toBe(2);
      expect(result.skipped_count).toBe(0);
      expect(result.cart.items).toHaveLength(2);
      expect(result.cart.items.find((i) => i.sku === 'SKU-PPR-A4-80G')?.qty).toBe(25);
    });
  });

  describe('3. Requisition Templates Service & CRUD', () => {
    it('creates, lists, gets, updates, and deletes requisition templates', async () => {

      const template = await RequisitionService.createTemplate(
        customerId,
        'Head Office Monthly Requisition',
        'Standard paper, pens, and lever arch files',
        [
          { sku: 'SKU-PPR-A4-80G', qty: 40 },
          { sku: 'SKU-PEN-BLU-05', qty: 20 },
        ]
      );

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Head Office Monthly Requisition');
      expect(template.items).toHaveLength(2);

      const list = await RequisitionService.listTemplates(customerId);
      expect(list.some((t) => t.id === template.id)).toBe(true);

      const retrieved = await RequisitionService.getTemplate(customerId, template.id);
      expect(retrieved?.name).toBe('Head Office Monthly Requisition');

      const updated = await RequisitionService.updateTemplate(customerId, template.id, {
        name: 'Head Office Q1 Supplies',
        description: 'Updated quarterly pack',
      });
      expect(updated?.name).toBe('Head Office Q1 Supplies');

      const cartResult = await RequisitionService.loadTemplateToCart(customerId, template.id);
      expect(cartResult.added_count).toBe(2);

      const deleted = await RequisitionService.deleteTemplate(customerId, template.id);
      expect(deleted).toBe(true);

      const notFound = await RequisitionService.getTemplate(customerId, template.id);
      expect(notFound).toBeNull();
    });
  });

  describe('4. Quick Order & Requisition API Routes', () => {
    it('POST /api/cart/bulk/validate validates matrix payload', async () => {
      const req = new NextRequest('http://localhost:3000/api/cart/bulk/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${approvedToken}`,
        },
        body: JSON.stringify({
          items: [
            { sku: 'SKU-PPR-A4-80G', qty: 12 },
            { sku: 'SKU-PEN-BLU-05', qty: 6 },
          ],
        }),
      });

      const res = await bulkValidateRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.valid_count).toBe(2);
      expect(json.subtotal).toBeDefined();
    });

    it('POST /api/cart/bulk/csv parses and validates CSV payload', async () => {
      const csvData = `SKU,Quantity,Notes\nSKU-PPR-A4-80G,15,Branch Stock\nSKU-FIL-LVR-BLK,5,Files`;
      const req = new NextRequest('http://localhost:3000/api/cart/bulk/csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${approvedToken}`,
        },
        body: JSON.stringify({ csv: csvData }),
      });

      const res = await bulkCsvRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.parsed_count).toBe(2);
      expect(json.validation.valid_count).toBe(2);
    });

    it('GET /api/cart/bulk/template serves CSV download', async () => {
      const res = await getTemplateRoute();
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      const text = await res.text();
      expect(text).toContain('SKU,Quantity');
    });

    it('POST & GET /api/requisitions manages templates over REST', async () => {

      const createReq = new NextRequest('http://localhost:3000/api/requisitions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          Cookie: `${SESSION_COOKIE_NAME}=${approvedToken}`,
        },
        body: JSON.stringify({
          name: 'Executive Boardroom Supplies',
          description: 'Premium notebooks and red/blue pens',
          items: [
            { sku: 'SKU-PEN-BLU-05', qty: 10 },
            { sku: 'SKU-PEN-RED-05', qty: 10 },
          ],
        }),
      });

      const createRes = await createRequisitionRoute(createReq);
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      const templateId = createJson.template.id;

      const listReq = new NextRequest('http://localhost:3000/api/requisitions', {
        method: 'GET',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${approvedToken}`,
        },
      });
      const listRes = await listRequisitionsRoute(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.templates.length).toBeGreaterThanOrEqual(1);

      const loadReq = new NextRequest(`http://localhost:3000/api/requisitions/${templateId}/load-to-cart`, {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken,
          Cookie: `${SESSION_COOKIE_NAME}=${approvedToken}`,
        },
      });
      const loadRes = await loadRequisitionToCartRoute(loadReq, { params: Promise.resolve({ id: String(templateId) }) });
      expect(loadRes.status).toBe(200);
      const loadJson = await loadRes.json();
      expect(loadJson.added_count).toBe(2);
    });
  });
});
