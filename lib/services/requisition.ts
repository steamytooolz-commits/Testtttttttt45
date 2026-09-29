import 'server-only';
import {
  createRequisitionTemplate,
  getRequisitionTemplateById,
  listRequisitionTemplatesByCustomer,
  updateRequisitionTemplate,
  deleteRequisitionTemplate,
  type RequisitionTemplateRow,
  type RequisitionItemData,
} from '@/lib/repo/mysql';
import { QuickOrderService, type BulkAddResult } from './quick_order';

export interface FormattedRequisitionTemplate {
  id: number;
  customer_id: number;
  name: string;
  description: string | null;
  items: RequisitionItemData[];
  item_count: number;
  created_at: string;
  updated_at: string;
}

export class RequisitionService {
 
  private static formatTemplate(row: RequisitionTemplateRow): FormattedRequisitionTemplate {
    let items: RequisitionItemData[] = [];
    try {
      items = JSON.parse(row.items_json) as RequisitionItemData[];
    } catch {
      items = [];
    }

    return {
      id: row.id,
      customer_id: row.customer_id,
      name: row.name,
      description: row.description,
      items,
      item_count: items.length,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

   static async listTemplates(customerId: number): Promise<FormattedRequisitionTemplate[]> {
    const rows = await listRequisitionTemplatesByCustomer(customerId);
    return rows.map((r) => this.formatTemplate(r));
  }

   static async getTemplate(
    customerId: number,
    templateId: number
  ): Promise<FormattedRequisitionTemplate | null> {
    const row = await getRequisitionTemplateById(templateId, customerId);
    if (!row) {
      return null;
    }
    return this.formatTemplate(row);
  }

   static async createTemplate(
    customerId: number,
    name: string,
    description: string | undefined,
    items: RequisitionItemData[]
  ): Promise<FormattedRequisitionTemplate> {
    const cleanItems = items.map((i) => ({
      sku: i.sku.trim().toUpperCase(),
      qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
      notes: i.notes?.trim() || undefined,
    }));

    const row = await createRequisitionTemplate({
      customer_id: customerId,
      name: name.trim(),
      description: description?.trim() || null,
      items_json: JSON.stringify(cleanItems),
    });

    return this.formatTemplate(row);
  }

   static async updateTemplate(
    customerId: number,
    templateId: number,
    data: {
      name?: string;
      description?: string;
      items?: RequisitionItemData[];
    }
  ): Promise<FormattedRequisitionTemplate | null> {
    const updatePayload: {
      name?: string;
      description?: string | null;
      items_json?: string;
    } = {};

    if (data.name !== undefined) {
      updatePayload.name = data.name.trim();
    }
    if (data.description !== undefined) {
      updatePayload.description = data.description.trim() || null;
    }
    if (data.items !== undefined) {
      const cleanItems = data.items.map((i) => ({
        sku: i.sku.trim().toUpperCase(),
        qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
        notes: i.notes?.trim() || undefined,
      }));
      updatePayload.items_json = JSON.stringify(cleanItems);
    }

    const row = await updateRequisitionTemplate(templateId, customerId, updatePayload);
    if (!row) {
      return null;
    }
    return this.formatTemplate(row);
  }

   static async deleteTemplate(customerId: number, templateId: number): Promise<boolean> {
    return await deleteRequisitionTemplate(templateId, customerId);
  }

   static async loadTemplateToCart(customerId: number, templateId: number): Promise<BulkAddResult> {
    const template = await this.getTemplate(customerId, templateId);
    if (!template) {
      throw new Error(`Requisition template #${templateId} not found`);
    }

    if (template.items.length === 0) {
      throw new Error('Requisition template has no line items');
    }

    return await QuickOrderService.addBulkItemsToCart(customerId, template.items);
  }
}
