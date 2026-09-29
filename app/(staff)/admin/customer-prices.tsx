'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Tag, Plus, Trash2, Upload, TriangleAlert, FileDown, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { apiMessage, readApiData } from '@/lib/api-client';

interface CustomPrice {
  customer_id: number;
  sku: string;
  unit_price: string;
  updated_by: number;
  updated_at: string;
}

interface PreviewData {
  headers: string[];
  skuCol: string;
  priceCol: string;
  total: number;
  valid: number;
  sample: Array<{ sku: string; unitPrice: string }>;
  rowErrors: Array<{ row: number; sku: string; reason: string }>;
}

export function CustomerPricesManager({ customerId, csrfToken }: { customerId: number; csrfToken: string }) {
  const [prices, setPrices] = useState<CustomPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sku, setSku] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filePreview, setFilePreview] = useState<PreviewData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [selectedSkuCol, setSelectedSkuCol] = useState<string>('');
  const [selectedPriceCol, setSelectedPriceCol] = useState<string>('');
  const [importMode, setImportMode] = useState<'paste' | 'file'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPrices = async (): Promise<CustomPrice[]> => {
    const res = await fetch(`/api/admin/customers/${customerId}/prices`);
    const json = await readApiData<{ prices?: CustomPrice[]; message?: string; error?: string }>(res);
    if (!res.ok) {
      throw new Error(apiMessage(json, 'Load failed'));
    }
    return json.prices || [];
  };

  const load = async () => {
    setLoading(true);
    try {
      setPrices(await fetchPrices());
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchPrices()
      .then((rows) => {
        if (!cancelled) setPrices(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ sku: sku.trim().toUpperCase(), unitPrice: unitPrice.trim() }),
      });
      const json = await readApiData<{ price: CustomPrice; message?: string; error?: string }>(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Save failed'));
      }
      setPrices((prev) => {
        const next = prev.filter((p) => p.sku !== json.price.sku);
        return [...next, json.price].sort((a, b) => a.sku.localeCompare(b.sku));
      });
      setSku('');
      setUnitPrice('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetSku: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/prices?sku=${encodeURIComponent(targetSku)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfToken },
      });
      if (!res.ok) {
        const json = await readApiData(res);
        throw new Error(apiMessage(json, 'Removal failed'));
      }
      setPrices((prev) => prev.filter((p) => p.sku !== targetSku));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Removal failed');
    }
  };

  const handleBulk = async () => {
    setError(null);
    setSaving(true);
    try {
      const items = bulk
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
        .map((line) => {
          const parts = line.split(/[,;\t]/).map((p) => p.trim());
          return { sku: (parts[0] || '').toUpperCase(), unitPrice: parts[1] || '' };
        });
      if (items.length === 0) {
        throw new Error('No valid SKU,price rows found');
      }
      const res = await fetch(`/api/admin/customers/${customerId}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ prices: items }),
      });
      const json = await readApiData<{
        errors?: Array<{ sku: string; reason: string }>;
        message?: string;
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Bulk import failed'));
      }
      if (json.errors && json.errors.length > 0) {
        setError(`Skipped ${json.errors.length}: ${json.errors.slice(0, 5).map((e: { sku: string; reason: string }) => `${e.sku} (${e.reason})`).join('; ')}`);
      }
      setBulk('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk import failed');
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setFilePreview(null);
    setFileName(file.name);
    setFileUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('preview', '1');
      const res = await fetch(`/api/admin/customers/${customerId}/prices`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: fd,
      });
      const json = await readApiData<PreviewData & { reason?: string }>(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, json.reason || 'File preview failed'));
      }
      setFilePreview(json);
      setSelectedSkuCol(json.skuCol || '');
      setSelectedPriceCol(json.priceCol || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File preview failed');
      setFilePreview(null);
    } finally {
      setFileUploading(false);
    }
  };

  const handleFileImport = async () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file || !selectedSkuCol || !selectedPriceCol) {
      setError('Select a file and map both SKU and price columns');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('skuCol', selectedSkuCol);
      fd.append('priceCol', selectedPriceCol);
      const res = await fetch(`/api/admin/customers/${customerId}/prices`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: fd,
      });
      const json = await readApiData<{
        errors?: Array<{ sku: string; reason: string }>;
        saved?: CustomPrice[];
        rowErrors?: Array<{ sku: string; reason: string }>;
        message?: string;
        error?: string;
      }>(res);
      if (!res.ok) {
        const detail = json.rowErrors
          ? json.rowErrors.slice(0, 3).map((e) => `${e.sku}: ${e.reason}`).join('; ')
          : apiMessage(json, 'File import failed');
        throw new Error(detail || 'File import failed');
      }
      if (json.errors && json.errors.length > 0) {
        setError(`Imported ${json.saved?.length || 0}, skipped ${json.errors.length}: ${json.errors.slice(0, 5).map((e) => `${e.sku} (${e.reason})`).join('; ')}`);
      } else {
        setError(null);
      }
      setFilePreview(null);
      setFileName(null);
      if (input) input.value = '';
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File import failed');
    } finally {
      setSaving(false);
    }
  };

  const clearFile = () => {
    setFilePreview(null);
    setFileName(null);
    setSelectedSkuCol('');
    setSelectedPriceCol('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadCsvTemplate = () => {
    const csv = `SKU,Price\nSKU-PPR-A4-80G,79.99\nSKU-PEN-BLU-05,95.50\nSKU-FIL-LVR-BLK,42.00\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customer_price_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadXlsxTemplate = async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.json_to_sheet([
      { SKU: 'SKU-PPR-A4-80G', Price: '79.99' },
      { SKU: 'SKU-PEN-BLU-05', Price: '95.50' },
      { SKU: 'SKU-FIL-LVR-BLK', Price: '42.00' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Prices');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customer_price_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRemapPreview = async () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) return;
    if (!selectedSkuCol || !selectedPriceCol) {
      setError('Map both columns first');
      return;
    }
    setFileUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('preview', '1');
      fd.append('skuCol', selectedSkuCol);
      fd.append('priceCol', selectedPriceCol);
      const res = await fetch(`/api/admin/customers/${customerId}/prices`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: fd,
      });
      const json = await readApiData(res);
      if (!res.ok) throw new Error(apiMessage(json, 'Preview failed'));
      setFilePreview(json as unknown as PreviewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setFileUploading(false);
    }
  };

  return (
    <div className="border-t border-neutral-100 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm text-brand-950 flex items-center gap-1.5">
          <Tag className="w-4 h-4 text-brand-700" />
          <span>Custom Quoted Prices ({prices.length})</span>
        </h4>
        <button
          type="button"
          onClick={() => setShowBulk((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-900 hover:underline"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Bulk import</span>
        </button>
      </div>
      <p className="text-[11px] text-neutral-500 dark:text-slate-400 leading-relaxed">
        Per-client overrides. Quoted prices always win over the assigned tier. Remove a row to fall back to tier pricing.
      </p>
      {error && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-900 text-[11px] font-medium rounded-lg flex items-start gap-1.5">
          <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {showBulk && (
        <div className="space-y-3 p-3 bg-brand-50 border border-brand-200 rounded-lg">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportMode('file')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${importMode === 'file' ? 'bg-brand-600 text-white' : 'bg-white border border-neutral-300 text-neutral-700'}`}
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setImportMode('paste')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${importMode === 'paste' ? 'bg-brand-600 text-white' : 'bg-white border border-neutral-300 text-neutral-700'}`}
            >
              Paste list
            </button>
            <span className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={downloadCsvTemplate} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline">
                <FileDown className="w-3.5 h-3.5" /> CSV
              </button>
              <button type="button" onClick={downloadXlsxTemplate} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline">
                <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX
              </button>
            </span>
          </div>

          {importMode === 'file' ? (
            <div className="space-y-2">
              <label className="block text-neutral-700 font-bold uppercase tracking-wider text-[11px]">
                Excel or CSV — any layout. We auto-detect SKU & price columns.
              </label>
              <div className="flex flex-col sm:flex-row gap-2 items-start">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  className="block w-full text-[11px] text-neutral-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white file:text-[11px] file:font-bold hover:file:bg-brand-700 file:cursor-pointer"
                />
                {fileName && (
                  <button type="button" onClick={clearFile} className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-800">
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[11px] text-neutral-500">Accepts .csv, .xlsx, .xls — headers like SKU / Item Code / Product Code and Price / Unit Price / Rate in any order. Extra columns are ignored.</p>

              {fileUploading && <p className="text-[11px] text-brand-700 font-semibold">Reading {fileName}…</p>}

              {filePreview && (
                <div className="space-y-2 p-2.5 bg-white border border-neutral-200 rounded-lg">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="flex-1">
                      <span className="block text-[11px] font-bold text-neutral-700 mb-1">SKU column</span>
                      <select value={selectedSkuCol} onChange={(e) => setSelectedSkuCol(e.target.value)} className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-[11px] bg-white">
                        {filePreview.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex-1">
                      <span className="block text-[11px] font-bold text-neutral-700 mb-1">Price column</span>
                      <select value={selectedPriceCol} onChange={(e) => setSelectedPriceCol(e.target.value)} className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-[11px] bg-white">
                        {filePreview.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onClick={handleRemapPreview} className="self-end px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-[11px] font-bold inline-flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh preview
                    </button>
                  </div>

                  <div className="text-[11px] text-neutral-600">
                    Detected <span className="font-mono font-bold">{filePreview.valid}</span> valid of {filePreview.total} rows {filePreview.rowErrors.length > 0 && <span className="text-amber-700">— {filePreview.rowErrors.length} row{filePreview.rowErrors.length === 1 ? '' : 's'} need attention</span>}
                  </div>

                  {filePreview.sample.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border border-neutral-200 rounded-lg overflow-hidden">
                        <thead className="bg-neutral-50">
                          <tr>
                            <th className="px-2 py-1 text-left font-bold">SKU</th>
                            <th className="px-2 py-1 text-left font-bold">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {filePreview.sample.map((r) => (
                            <tr key={r.sku}>
                              <td className="px-2 py-1 font-mono">{r.sku}</td>
                              <td className="px-2 py-1 font-mono">R {r.unitPrice}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {filePreview.rowErrors.length > 0 && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px]">
                      <p className="font-bold text-amber-900 mb-1">Rows to fix:</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-amber-900">
                        {filePreview.rowErrors.slice(0, 5).map((e) => (
                          <li key={`${e.row}-${e.sku}`}>Row {e.row} — {e.sku}: {e.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleFileImport}
                    disabled={saving || filePreview.rowErrors.length > 0 && filePreview.valid === 0}
                    className="w-full px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[11px] font-bold disabled:opacity-50"
                  >
                    {saving ? 'Importing…' : `Import ${filePreview.valid} price${filePreview.valid === 1 ? '' : 's'} from ${fileName || 'file'}`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-neutral-700 font-bold uppercase tracking-wider text-[11px]">
                Bulk price list — one <span className="font-mono">SKU,price</span> per line
              </label>
              <textarea
                rows={4}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder={'SKU-PPR-A4-80G,79.99\nSKU-PEN-BLU-05,95.50'}
                spellCheck={false}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-[11px] focus:ring-2 focus:ring-brand-700"
              />
              <button
                type="button"
                onClick={handleBulk}
                disabled={saving}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[11px] font-bold disabled:opacity-50"
              >
                {saving ? 'Importing...' : 'Import Price List'}
              </button>
            </div>
          )}
        </div>
      )}
      {loading ? (
        <p className="text-[11px] text-neutral-500 dark:text-slate-400">Loading quoted prices...</p>
      ) : prices.length === 0 ? (
        <p className="text-[11px] text-neutral-500 dark:text-slate-400 italic">No custom prices — tier pricing applies to everything.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 border border-neutral-200 dark:border-white/10 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
          {prices.map((p) => (
            <li key={p.sku} className="flex items-center justify-between px-3 py-1.5 bg-white">
              <span className="font-mono font-bold text-[11px] text-brand-950">{p.sku}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-neutral-900 dark:text-slate-200">R {p.unit_price}</span>
                <button
                  type="button"
                  onClick={() => void handleDelete(p.sku)}
                  title="Remove custom price (fall back to tier)"
                  className="p-1 text-neutral-400 hover:text-rose-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          placeholder="SKU"
          required
          className="flex-1 px-3 py-1.5 border border-neutral-300 rounded-lg font-mono text-[11px] focus:ring-2 focus:ring-brand-700"
        />
        <input
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="0.00"
          required
          inputMode="decimal"
          className="w-full sm:w-28 px-3 py-1.5 border border-neutral-300 rounded-lg font-mono text-[11px] focus:ring-2 focus:ring-brand-700"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1 px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[11px] font-bold disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Set Price'}</span>
        </button>
      </form>
    </div>
  );
}
