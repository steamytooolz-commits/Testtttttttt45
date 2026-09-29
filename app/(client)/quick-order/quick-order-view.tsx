'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';
import Link from 'next/link';
import type { BulkOrderValidationLine, BulkOrderValidationResult } from '@/lib/services/quick_order';
import type { FormattedRequisitionTemplate } from '@/lib/services/requisition';
import { 
  Grid, 
  FileSpreadsheet, 
  BookmarkCheck, 
  Plus, 
  Trash2, 
  Download, 
  ShoppingCart, 
  Upload, 
  CircleCheckBig, 
  X,
  ArrowRight
} from 'lucide-react';

interface CatalogProductOption {
  sku: string;
  name: string;
}

interface QuickOrderViewProps {
  csrfToken: string;
  initialTemplates: FormattedRequisitionTemplate[];
  availableProducts: CatalogProductOption[];
}

interface MatrixRow {
  id: string;
  sku: string;
  qty: number;
  notes: string;
  status?: 'idle' | 'valid' | 'invalid' | 'warning';
  message?: string;
  name?: string;
  unitPrice?: string;
  lineTotal?: string;
  availableStock?: number;
}

const DEFAULT_ROWS_COUNT = 8;

export function QuickOrderView({
  csrfToken,
  initialTemplates,
  availableProducts,
}: QuickOrderViewProps) {
  const [activeTab, setActiveTab] = useState<'matrix' | 'csv' | 'templates'>('matrix');

  const [rows, setRows] = useState<MatrixRow[]>(() =>
    Array.from({ length: DEFAULT_ROWS_COUNT }).map((_, i) => ({
      id: `row-${i + 1}`,
      sku: '',
      qty: 1,
      notes: '',
      status: 'idle',
    }))
  );
  const [isValidatingMatrix, setIsValidatingMatrix] = useState(false);
  const [matrixSummary, setMatrixSummary] = useState<{
    subtotal: string;
    vat: string;
    total: string;
    validCount: number;
    errorCount: number;
  } | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [matrixFeedback, setMatrixFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const [templates, setTemplates] = useState<FormattedRequisitionTemplate[]>(initialTemplates);
  const [loadingTemplateId, setLoadingTemplateId] = useState<number | null>(null);
  const [templateFeedback, setTemplateFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [csvText, setCsvText] = useState('');
  const [isParsingCsv, setIsParsingCsv] = useState(false);
  const [csvValidation, setCsvValidation] = useState<BulkOrderValidationResult | null>(null);
  const [csvFeedback, setCsvFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const matrixSig = rows
    .map((r) => `${r.sku.trim().toUpperCase()}:${r.qty}:${(r.notes || '').trim()}`)
    .join('|');

  useEffect(() => {
    const filledRows = rows.filter((r) => r.sku.trim().length > 0);

    const timer = setTimeout(async () => {
      if (filledRows.length === 0) {
        setMatrixSummary(null);
        return;
      }

      setIsValidatingMatrix(true);
      try {
        const payload = {
          items: filledRows.map((r) => ({
            sku: r.sku.trim().toUpperCase(),
            qty: r.qty,
            notes: r.notes || undefined,
          })),
        };

        const res = await fetch('/api/cart/bulk/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await readApiData<BulkOrderValidationResult>(res);
          setMatrixSummary({
            subtotal: data.subtotal,
            vat: data.vat,
            total: data.total,
            validCount: data.valid_count,
            errorCount: data.error_count,
          });

          const lineMap = new Map<string, BulkOrderValidationLine>();
          data.lines.forEach((l) => lineMap.set(l.sku.toUpperCase(), l));

          setRows((prev) => {
            let changed = false;
            const next: MatrixRow[] = prev.map((r): MatrixRow => {
              const skuKey = r.sku.trim().toUpperCase();
              if (!skuKey)
                return { ...r, status: 'idle', message: undefined, unitPrice: undefined, lineTotal: undefined, name: undefined };
              const found = lineMap.get(skuKey);
              if (!found) return r;

              const updated: MatrixRow = {
                ...r,
                status: found.valid ? (found.in_stock ? 'valid' : 'warning') : 'invalid',
                message: found.error,
                name: found.name,
                unitPrice: found.unit_price,
                lineTotal: found.line_total,
                availableStock: found.available_stock,
              };
              if (
                updated.status !== r.status ||
                updated.message !== r.message ||
                updated.name !== r.name ||
                updated.unitPrice !== r.unitPrice ||
                updated.lineTotal !== r.lineTotal ||
                updated.availableStock !== r.availableStock
              ) {
                changed = true;
              }
              return updated;
            });
            return changed ? next : prev;
          });
        }
      } catch {

      } finally {
        setIsValidatingMatrix(false);
      }
    }, 400);

    return () => clearTimeout(timer);

  }, [matrixSig]);

  const handleRowChange = (id: string, field: keyof MatrixRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === 'qty') {
          const num = Math.max(1, Math.floor(Number(value) || 1));
          return { ...r, qty: num };
        }
        return { ...r, [field]: value };
      })
    );
  };

  const addRows = (count = 5) => {
    setRows((prev) => {
      const nextId = prev.length + 1;
      const newRows: MatrixRow[] = Array.from({ length: count }).map((_, i) => ({
        id: `row-${nextId + i}`,
        sku: '',
        qty: 1,
        notes: '',
        status: 'idle',
      }));
      return [...prev, ...newRows];
    });
  };

  const clearMatrix = () => {
    setRows(
      Array.from({ length: DEFAULT_ROWS_COUNT }).map((_, i) => ({
        id: `row-${i + 1}`,
        sku: '',
        qty: 1,
        notes: '',
        status: 'idle',
      }))
    );
    setMatrixSummary(null);
    setMatrixFeedback(null);
  };

  const handleAddMatrixToCart = async () => {
    const validRows = rows.filter((r) => r.sku.trim().length > 0 && r.qty > 0);
    if (validRows.length === 0) {
      setMatrixFeedback({ type: 'error', text: 'Please enter at least one valid SKU and quantity' });
      return;
    }

    setIsAddingToCart(true);
    setMatrixFeedback(null);

    try {
      const payload = {
        items: validRows.map((r) => ({
          sku: r.sku.trim().toUpperCase(),
          qty: r.qty,
          notes: r.notes || undefined,
        })),
      };

      const res = await fetch('/api/cart/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(payload),
      });

      const data = await readApiData<ApiResponseBody & { added_count: number }>(res);
      if (!res.ok) {
        setMatrixFeedback({ type: 'error', text: apiMessage(data, 'Failed to add items to cart') });
        return;
      }

      setMatrixFeedback({
        type: 'success',
        text: `Successfully added ${data.added_count} line items into your Wholesale Cart.`,
      });
    } catch (err) {
      setMatrixFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleSaveTemplate = async () => {
    const validRows = rows.filter((r) => r.sku.trim().length > 0 && r.qty > 0);
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }
    if (validRows.length === 0) {
      alert('Matrix must have at least one line item to save');
      return;
    }

    setIsSavingTemplate(true);
    try {
      const res = await fetch('/api/requisitions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDesc.trim() || undefined,
          items: validRows.map((r) => ({
            sku: r.sku.trim().toUpperCase(),
            qty: r.qty,
            notes: r.notes || undefined,
          })),
        }),
      });

      const data = await readApiData<ApiResponseBody & { template: FormattedRequisitionTemplate }>(res);
      if (!res.ok) {
        alert(apiMessage(data, 'Failed to save template'));
        return;
      }

      setTemplates((prev) => [data.template, ...prev]);
      setIsSaveModalOpen(false);
      setTemplateName('');
      setTemplateDesc('');
      setMatrixFeedback({
        type: 'success',
        text: `Requisition template "${data.template.name}" saved successfully.`,
      });
    } catch {
      alert('Network error while saving template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleLoadTemplate = async (template: FormattedRequisitionTemplate) => {
    setLoadingTemplateId(template.id);
    setTemplateFeedback(null);

    try {
      const res = await fetch(`/api/requisitions/${template.id}/load-to-cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
      });

      const data = await readApiData<ApiResponseBody & { added_count: number }>(res);
      if (!res.ok) {
        setTemplateFeedback({
          type: 'error',
          text: apiMessage(data, 'Failed to load template into cart'),
        });
        return;
      }

      setTemplateFeedback({
        type: 'success',
        text: `Loaded ${data.added_count} items from "${template.name}" into your Wholesale Cart.`,
      });
    } catch (err) {
      setTemplateFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error loading template',
      });
    } finally {
      setLoadingTemplateId(null);
    }
  };

  const handleDeleteTemplate = async (templateId: number) => {
    if (!confirm('Are you sure you want to delete this requisition template?')) {
      return;
    }

    try {
      const res = await fetch(`/api/requisitions/${templateId}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrfToken,
        },
      });

      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        setTemplateFeedback({
          type: 'success',
          text: 'Template removed.',
        });
      }
    } catch {
      alert('Error deleting template');
    }
  };

  const handleCsvParse = async (rawCsv: string) => {
    if (!rawCsv.trim()) {
      setCsvFeedback({ type: 'error', text: 'Please paste or upload CSV data' });
      return;
    }

    setIsParsingCsv(true);
    setCsvFeedback(null);

    try {
      const res = await fetch('/api/cart/bulk/csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csv: rawCsv }),
      });

      const data = await readApiData<
        ApiResponseBody & {
          validation: BulkOrderValidationResult;
          parsed_count: number;
        }
      >(res);
      if (!res.ok) {
        setCsvFeedback({ type: 'error', text: apiMessage(data, 'Failed to parse CSV') });
        setCsvValidation(null);
        return;
      }

      setCsvValidation(data.validation);
      setCsvFeedback({
        type: 'success',
        text: `Parsed ${data.parsed_count} lines (${data.validation.valid_count} valid, ${data.validation.error_count} warnings/errors).`,
      });
    } catch (err) {
      setCsvFeedback({ type: 'error', text: err instanceof Error ? err.message : 'CSV parsing failed' });
    } finally {
      setIsParsingCsv(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvText(content);
        handleCsvParse(content);
      }
    };
    reader.readAsText(file);
  };

  const handleAddCsvToCart = async () => {
    if (!csvValidation || csvValidation.valid_count === 0) {
      setCsvFeedback({ type: 'error', text: 'No valid lines to add' });
      return;
    }

    const validLines = csvValidation.lines.filter((l) => l.valid);
    setIsAddingToCart(true);

    try {
      const res = await fetch('/api/cart/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          items: validLines.map((l) => ({
            sku: l.sku,
            qty: l.qty,
            notes: l.notes,
          })),
        }),
      });

      const data = await readApiData<ApiResponseBody & { added_count: number }>(res);
      if (!res.ok) {
        setCsvFeedback({ type: 'error', text: apiMessage(data, 'Failed to import to cart') });
        return;
      }

      setCsvFeedback({
        type: 'success',
        text: `Imported ${data.added_count} items from CSV into your Wholesale Cart!`,
      });
    } catch (err) {
      setCsvFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <div className="space-y-6">
      { }
      <div className="flex flex-wrap gap-2 px-0 pt-1">
        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={activeTab === 'matrix' ? 'tab-pill-active' : 'tab-pill-idle'}
        >
          <Grid className="w-4 h-4" />
          <span>1. Rapid SKU Matrix</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('csv')}
          className={activeTab === 'csv' ? 'tab-pill-active' : 'tab-pill-idle'}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>2. CSV / Spreadsheet Import</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={activeTab === 'templates' ? 'tab-pill-active' : 'tab-pill-idle'}
        >
          <BookmarkCheck className="w-4 h-4" />
          <span>3. Requisition Templates ({templates.length})</span>
        </button>
      </div>

      { }
      {activeTab === 'matrix' && (
        <div className="card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-950 dark:text-slate-100">Direct Wholesale SKU Grid</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
                Type SKUs and quantities directly for high-volume entry. Stock balances &amp; tier rates validate in real time.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => addRows(5)} className="btn-secondary !py-1.5 !text-xs">
                <Plus className="w-3.5 h-3.5" />
                <span>Add 5 Rows</span>
              </button>
              <button
                type="button"
                onClick={clearMatrix}
                className="text-neutral-500 dark:text-slate-400 hover:text-neutral-900 dark:text-slate-200 text-xs font-medium rounded-md px-3 py-1.5 hover:bg-neutral-100 dark:bg-white/[0.08] transition"
              >
                Clear Grid
              </button>
            </div>
          </div>

          {matrixFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between ${
                matrixFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              <span>{matrixFeedback.text}</span>
              {matrixFeedback.type === 'success' && (
                <Link
                  href="/cart"
                  className="ml-4 font-semibold uppercase tracking-wider text-[11px] inline-flex items-center gap-1 text-emerald-950"
                >
                  <span>View Cart</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}

          { }
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-brand-950 text-white uppercase font-mono tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3 w-48">Wholesale SKU</th>
                  <th className="py-2.5 px-3 w-28">Quantity</th>
                  <th className="py-2.5 px-3">Product &amp; Availability</th>
                  <th className="py-2.5 px-3 w-28 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 w-32 text-right">Line Total (excl)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono">
                {rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-neutral-50/80 transition-colors ${
                      row.status === 'invalid'
                        ? 'bg-rose-50/40'
                        : row.status === 'warning'
                        ? 'bg-amber-50/30'
                        : ''
                    }`}
                  >
                    <td className="py-2 px-3 text-center text-neutral-400 font-mono">
                      {index + 1}
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        list="available-skus-list"
                        value={row.sku}
                        onChange={(e) => handleRowChange(row.id, 'sku', e.target.value)}
                        placeholder="e.g. SKU-PPR-A4-80G"
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-white/[0.04] border border-neutral-300 rounded-md text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={row.qty}
                        onChange={(e) => handleRowChange(row.id, 'qty', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-white/[0.04] border border-neutral-300 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600 text-center"
                      />
                    </td>
                    <td className="py-2 px-3">
                      {row.name ? (
                        <div className="font-sans">
                          <span className="font-semibold text-neutral-900 dark:text-slate-200 block text-xs truncate max-w-sm">
                            {row.name}
                          </span>
                          <div className="flex items-center space-x-2 mt-0.5">
                            {row.status === 'valid' && (
                              <span className="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded font-mono font-bold">
                                In Stock ({row.availableStock} available)
                              </span>
                            )}
                            {row.status === 'warning' && (
                              <span className="text-[10px] text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded font-mono font-bold">
                                {row.message || 'Low warehouse stock'}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : row.sku.trim().length > 0 ? (
                        <span className="text-[11px] text-rose-600 font-sans font-medium">
                          {row.message || 'Verifying catalog SKU...'}
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-xs italic font-sans">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {row.unitPrice ? (
                        <span className="text-neutral-900 dark:text-slate-200 font-semibold font-mono">
                          R {row.unitPrice}
                        </span>
                      ) : (
                        <span className="text-neutral-400 font-mono">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {row.lineTotal ? (
                        <span className="text-neutral-950 dark:text-slate-100 font-bold font-mono">
                          R {row.lineTotal}
                        </span>
                      ) : (
                        <span className="text-neutral-400 font-mono">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <datalist id="available-skus-list">
            {availableProducts.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name}
              </option>
            ))}
          </datalist>

          { }
          <div className="pt-4 border-t border-neutral-200 dark:border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-xs text-neutral-600 dark:text-slate-300 space-y-1">
              {isValidatingMatrix ? (
                <span className="text-amber-700 font-semibold">Validating pricing &amp; inventory...</span>
              ) : matrixSummary ? (
                <div className="flex items-center space-x-3">
                  <span className="bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-full font-mono text-[11px] font-bold inline-flex items-center gap-1">
                    <CircleCheckBig className="w-3 h-3 text-emerald-700" />
                    {matrixSummary.validCount} valid lines
                  </span>
                  {matrixSummary.errorCount > 0 && (
                    <span className="bg-rose-100 text-rose-900 px-2.5 py-1 rounded-full font-mono text-[11px] font-bold">
                      {matrixSummary.errorCount} errors
                    </span>
                  )}
                </div>
              ) : (
                <span>Ready for high-volume entry</span>
              )}
            </div>

            {matrixSummary && (
              <div className="flex items-baseline space-x-6 text-right">
                <div>
                  <span className="text-xs text-neutral-500 dark:text-slate-400 block">Subtotal (excl):</span>
                  <span className="font-mono font-bold text-neutral-900 dark:text-slate-200 text-sm">
                    R {matrixSummary.subtotal}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 dark:text-slate-400 block">VAT (15%):</span>
                  <span className="font-mono font-bold text-neutral-900 dark:text-slate-200 text-sm">
                    R {matrixSummary.vat}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 dark:text-slate-400 block">Grand Total:</span>
                  <span className="font-mono font-extrabold text-neutral-950 dark:text-slate-100 text-lg">
                    R {matrixSummary.total}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(true)}
                className="btn-secondary !py-2 !text-xs"
              >
                Save as Requisition List
              </button>
              <button
                type="button"
                disabled={isAddingToCart || !matrixSummary || matrixSummary.validCount === 0}
                onClick={handleAddMatrixToCart}
                className="btn-primary !py-2.5 !text-xs"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>{isAddingToCart ? 'Adding to Cart…' : 'Add All to Wholesale Cart'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      { }
      {activeTab === 'csv' && (
        <div className="card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-950 dark:text-slate-100">Upload CSV or Paste Requisition</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
                Bulk import orders directly from ERP, Excel, or CSV files. Supports comma, semicolon, and tab delimiters.
              </p>
            </div>
            <a
              href="/api/cart/bulk/template"
              download="stationery_order_template.csv"
              className="px-3.5 py-2 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5"
            >
              <Download className="w-3 h-3 text-neutral-700" />
              <span>Download CSV Template</span>
            </a>
          </div>

          {csvFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between ${
                csvFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              <span>{csvFeedback.text}</span>
              {csvFeedback.type === 'success' && (
                <Link
                  href="/cart"
                  className="ml-4 underline font-bold uppercase tracking-wider text-[11px]"
                >
                  Go to Cart →
                </Link>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            { }
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const content = event.target?.result as string;
                    if (content) {
                      setCsvText(content);
                      handleCsvParse(content);
                    }
                  };
                  reader.readAsText(file);
                }
              }}
              className="border-2 border-dashed border-neutral-300 rounded-lg p-8 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/40 transition flex flex-col items-center justify-center space-y-3 bg-neutral-50/50"
            >
              <div className="w-12 h-12 bg-brand-50 text-brand-700 rounded-lg flex items-center justify-center font-bold text-sm">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-900 dark:text-slate-200">
                  Drag and drop CSV file here, or <span className="underline text-brand-700">browse</span>
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-slate-400 mt-1">
                  Supports .csv, .tsv, .txt (SKU, Quantity, Notes)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            { }
            <div className="space-y-2">
              <label className="field-label">Or paste CSV text directly</label>
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`SKU,Quantity,Notes\nSKU-PPR-A4-80G,50,Main Batch\nSKU-PEN-BLU-05,20,Office Pens`}
                className="input-field font-mono text-xs"
              />
              <button
                type="button"
                disabled={isParsingCsv || !csvText.trim()}
                onClick={() => handleCsvParse(csvText)}
                className="btn-primary !py-2 !text-xs"
              >
                {isParsingCsv ? 'Parsing CSV…' : 'Validate & Preview Lines'}
              </button>
            </div>
          </div>

          { }
          {csvValidation && (
            <div className="pt-4 border-t border-neutral-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-slate-200">
                  Import Preview ({csvValidation.valid_count} valid / {csvValidation.error_count} errors)
                </h3>
                <div className="text-xs font-mono">
                  Total: <strong className="text-sm font-bold text-neutral-950 dark:text-slate-100">R {csvValidation.total}</strong> (incl. VAT)
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-neutral-200 max-h-80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-brand-950 text-white uppercase font-mono tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-mono">
                    {csvValidation.lines.map((line, idx) => (
                      <tr
                        key={idx}
                        className={line.valid ? 'hover:bg-neutral-50' : 'bg-rose-50/50'}
                      >
                        <td className="py-2 px-3 font-bold">{line.sku}</td>
                        <td className="py-2 px-3 font-sans">{line.name || '—'}</td>
                        <td className="py-2 px-3 text-center">{line.qty}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {line.unit_price ? `R ${line.unit_price}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {line.line_total ? `R ${line.line_total}` : '—'}
                        </td>
                        <td className="py-2 px-3">
                          {line.valid ? (
                            <span className="text-[10px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-mono font-bold">
                              Valid ({line.available_stock} in stock)
                            </span>
                          ) : (
                            <span className="text-[10px] text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full font-sans font-bold">
                              {line.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isAddingToCart || csvValidation.valid_count === 0}
                  onClick={handleAddCsvToCart}
                  className="btn-primary !py-2.5 !text-xs"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{isAddingToCart ? 'Importing…' : `Import ${csvValidation.valid_count} Items to Cart`}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      { }
      {activeTab === 'templates' && (
        <div className="card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-950 dark:text-slate-100">Saved Requisition Lists</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400 mt-0.5">
                Pre-configured kits and recurring purchase templates. Export official PDF specifications or load directly to cart.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('matrix');
                setIsSaveModalOpen(true);
              }}
              className="btn-primary !py-2 !text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Template</span>
            </button>
          </div>

          {templateFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between ${
                templateFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              <span>{templateFeedback.text}</span>
              {templateFeedback.type === 'success' && (
                <Link
                  href="/cart"
                  className="ml-4 font-semibold uppercase tracking-wider text-[11px] inline-flex items-center gap-1"
                >
                  <span>View Cart</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}

          {templates.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-neutral-300 rounded-xl">
              <p className="text-neutral-800 font-bold text-sm mb-1">No saved requisition templates yet.</p>
              <p className="text-xs text-neutral-500 dark:text-slate-400 mb-4 max-w-sm mx-auto">
                Fill in the SKU matrix and click &quot;Save as Requisition List&quot; to build reusable monthly kits.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className="btn-primary !py-2 !text-xs"
              >
                Go to SKU Matrix
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="card p-5 flex flex-col justify-between hover:shadow-lift hover:border-brand-300 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold text-neutral-950 dark:text-slate-100 text-base">{tpl.name}</h3>
                      <span className="px-2.5 py-0.5 bg-neutral-100 dark:bg-white/[0.08] text-neutral-800 text-xs font-mono font-semibold rounded-full border border-neutral-200 dark:border-white/10">
                        {tpl.item_count} items
                      </span>
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-neutral-600 dark:text-slate-300 mb-3">{tpl.description}</p>
                    )}

                    { }
                    <div className="bg-neutral-50 dark:bg-white/[0.06] p-3 rounded-lg border border-neutral-100 mb-4 max-h-36 overflow-y-auto font-mono text-[11px] space-y-1">
                      {tpl.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-neutral-700">
                          <span className="font-semibold">{it.sku}</span>
                          <span>&times; {it.qty}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="text-xs text-rose-600 hover:text-rose-900 font-semibold p-1"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={loadingTemplateId === tpl.id}
                      onClick={() => handleLoadTemplate(tpl)}
                      className="btn-primary !py-2 !text-xs"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>{loadingTemplateId === tpl.id ? 'Loading…' : 'Load to Cart'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      { }
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="card p-6 max-w-md w-full space-y-4 shadow-lift">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <h3 className="text-base font-bold text-neutral-950 dark:text-slate-100 flex items-center gap-2">
                <BookmarkCheck className="w-5 h-5 text-brand-700" />
                <span>Save Requisition Template</span>
              </h3>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-neutral-400 hover:text-neutral-700" aria-label="Close dialog">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Save your current grid of SKUs and quantities as a reusable template for future one-click ordering.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="tpl-name" className="field-label">Template Name *</label>
                <input
                  id="tpl-name"
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Monthly Head Office Stationery Pack"
                  className="input-field"
                />
              </div>
              <div>
                <label htmlFor="tpl-desc" className="field-label">Description (Optional)</label>
                <input
                  id="tpl-desc"
                  type="text"
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="e.g. Standard 50 reams A4, 20 blue pens, 10 lever files"
                  className="input-field"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-neutral-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 text-neutral-600 dark:text-slate-300 hover:text-neutral-900 dark:text-slate-200 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingTemplate || !templateName.trim()}
                onClick={handleSaveTemplate}
                className="btn-primary !py-2 !text-xs"
              >
                {isSavingTemplate ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
