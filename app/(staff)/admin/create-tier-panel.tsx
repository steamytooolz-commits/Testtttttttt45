'use client';

import React, { useState } from 'react';
import { apiMessage, readApiData } from '@/lib/api-client';
import { Upload, FileSpreadsheet, TriangleAlert, CircleCheckBig, Eye, X } from 'lucide-react';

interface TierPreview {
  layout: 'pairs' | 'matrix';
  headers: string[];
  tierCodes: string[];
  total: number;
  valid: number;
  bases: Record<string, { count: number; sample: Array<{ sku: string; price: string }> }>;
  rowErrors: Array<{ row: number; sku: string; reason: string }>;
}

export function CreateTierPanel({
  csrfToken,
  existingTierCodes,
  onImported,
}: {
  csrfToken: string;
  existingTierCodes: string[];
  onImported: () => void;
}) {
  const [mode, setMode] = useState<'manual' | 'file'>('file');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [basis, setBasis] = useState('{\n  "SKU-PPR-A4-80G": "85.00"\n}');
  const [active, setActive] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [layout, setLayout] = useState<'auto' | 'pairs' | 'matrix'>('auto');
  const [tierCode, setTierCode] = useState('');
  const [tierName, setTierName] = useState('');
  const [merge, setMerge] = useState(false);
  const [skuCol, setSkuCol] = useState('');
  const [priceCol, setPriceCol] = useState('');
  const [tierCols, setTierCols] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<TierPreview | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetMapping = () => {
    setSkuCol('');
    setPriceCol('');
    setTierCols({});
    setPreview(null);
  };

  const parseBasis = (text: string): Record<string, string> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Basis must be valid JSON mapping SKUs to prices');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Basis must be a JSON object mapping SKUs to prices');
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const sku = String(key).trim();
      if (!/^[A-Za-z0-9_-]+$/.test(sku)) {
        throw new Error(`Invalid SKU key '${key}' in basis`);
      }
      if (typeof value !== 'string' || !/^\d{1,10}\.\d{2}$/.test(String(value).trim())) {
        throw new Error(`Invalid price for '${sku}': use DECIMAL strings like "85.00"`);
      }
      out[sku] = String(value).trim();
    }
    if (Object.keys(out).length === 0) {
      throw new Error('Basis must contain at least one SKU');
    }
    return out;
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const basisObj = parseBasis(basis);
      const res = await fetch('/api/admin/tiers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          basis: basisObj,
          active,
        }),
      });
      const json = await readApiData<{
        message?: string;
        error?: string;
        tier: { code: string; name: string };
      }>(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Failed to create price tier'));
      }
      setSuccess(`Created ${json.tier.code}: ${json.tier.name} (${Object.keys(basisObj).length} prices)`);
      setCode('');
      setName('');
      setBasis('{\n  "SKU-PPR-A4-80G": "85.00"\n}');
      setActive(true);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tier creation failed');
    } finally {
      setLoading(false);
    }
  };

  const buildFileForm = (withPreview: boolean): FormData => {
    const data = new FormData();
    if (file) data.append('file', file);
    if (layout !== 'auto') data.append('layout', layout);
    if (tierCode.trim()) data.append('tierCode', tierCode.trim().toUpperCase());
    if (tierName.trim()) data.append('tierName', tierName.trim());
    if (merge) data.append('merge', '1');
    if (withPreview) data.append('preview', '1');
    const mapping: { skuCol?: string; priceCol?: string; tierCols?: Record<string, string> } = {};
    if (skuCol) mapping.skuCol = skuCol;
    if (priceCol) mapping.priceCol = priceCol;
    if (Object.keys(tierCols).length > 0) mapping.tierCols = tierCols;
    if (Object.keys(mapping).length > 0) data.append('mapping', JSON.stringify(mapping));
    return data;
  };

  const handleFilePreview = async () => {
    if (!file) {
      setError('Choose a CSV or Excel (.xlsx) price file first.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tiers/import', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: buildFileForm(true),
      });
      const json = await readApiData<{
        message?: string;
        error?: string;
        headers?: string[];
      } & TierPreview>(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Preview failed'));
      }
      setPreview(json as TierPreview);
      if (!skuCol && json.headers?.length > 0) {
        const headers = json.headers as string[];
        const findSku = headers.find((h) => /sku|item|product|code/i.test(h));
        if (findSku) setSkuCol(findSku);
        const findPrice = headers.find((h) => /price|rate|amount|cost/i.test(h) && h !== findSku);
        if (findPrice) setPriceCol(findPrice);
        if (json.layout === 'matrix') {
          const next: Record<string, string> = {};
          for (const header of headers) {
            if (header === findSku) continue;
            const code = header.trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '');
            if (/^[A-Z0-9_]{2,20}$/.test(code)) next[header] = code;
          }
          setTierCols(next);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFileCreate = async () => {
    if (!file || !preview) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tiers/import', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: buildFileForm(false),
      });
      const json = await readApiData<{
        message?: string;
        error?: string;
        rowErrors?: Array<{ row: number; sku: string; reason: string }>;
        tiers?: Array<{ code: string }>;
        merged?: string[];
        imported?: number;
      }>(res);
      if (!res.ok) {
        const details = Array.isArray(json.rowErrors) && json.rowErrors.length > 0
          ? ': ' + json.rowErrors.slice(0, 3).map((e) => 'row ' + e.row + ' ' + e.sku + ' — ' + e.reason).join('; ')
          : '';
        throw new Error(apiMessage(json, 'Import failed') + details);
      }
      const codes = (json.tiers || []).map((t) => t.code).join(', ');
      const mergedPrefix = json.merged && json.merged.length > 0
        ? 'merged into ' + json.merged.join(', ') + ' and created '
        : '';
      setSuccess('Created ' + mergedPrefix + codes + ' — ' + json.imported + ' prices applied.');
      setPreview(null);
      setFile(null);
      resetMapping();
      setTierCode('');
      setTierName('');
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-brand-200 bg-brand-50/60 rounded-xl p-4 space-y-4">
      <h3 className="font-bold text-sm text-brand-950 flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4 text-brand-700" />
        <span>New Price Tier</span>
      </h3>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setMode('manual'); setError(null); setSuccess(null); setPreview(null); }}
          className={'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ' + (mode === 'manual' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-white/[0.04] border border-neutral-300 text-neutral-700 hover:bg-neutral-50')}
        >
          Manual entry
        </button>
        <button
          type="button"
          onClick={() => { setMode('file'); setError(null); setSuccess(null); setPreview(null); }}
          className={'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ' + (mode === 'file' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-white/[0.04] border border-neutral-300 text-neutral-700 hover:bg-neutral-50')}
        >
          Upload CSV / Excel
        </button>
      </div>

      {mode === 'manual' && (
        <form onSubmit={handleManualCreate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Tier Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="TIER_4"
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-brand-700"
              />
            </div>
            <div>
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Tier Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Volume Contract"
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
              />
            </div>
          </div>
          <div>
            <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">
              Basis (SKU to DECIMAL price JSON)
            </label>
            <textarea
              rows={5}
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              spellCheck={false}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-brand-700"
            />
            <p className="text-[10px] text-neutral-500 dark:text-slate-400 mt-1">Each price must be a DECIMAL string like &quot;85.00&quot;.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-neutral-800">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Active (available for assignment)</span>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Create Tier'}
          </button>
        </form>
      )}

      {mode === 'file' && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-600 dark:text-slate-300 leading-relaxed">
            Upload a <strong>CSV</strong> or <strong>MS Excel (.xlsx)</strong> price list. Two layouts supported:{' '}
            <strong>SKU + price</strong> (e.g. <span className="font-mono">Item Code, Price</span>) or a{' '}
            <strong>matrix</strong> (e.g. <span className="font-mono">SKU, TIER_1, TIER_2</span>).
            Columns are auto-detected — adjust the mapping below if needed. Start from a template:{' '}
            <a href="/api/admin/tiers/import?format=pairs" className="font-semibold text-brand-700 hover:underline">CSV pairs</a>
            {' · '}
            <a href="/api/admin/tiers/import?format=matrix" className="font-semibold text-brand-700 hover:underline">CSV matrix</a>
            {' · '}
            <a href="/api/admin/tiers/import?format=xlsx" className="font-semibold text-brand-700 hover:underline">Excel</a>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">
                Price list file (CSV / XLSX)
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setPreview(null);
                  resetMapping();
                  setError(null);
                  setSuccess(null);
                }}
                className="w-full text-xs text-neutral-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-brand-300 file:bg-white dark:bg-white/[0.04] file:text-brand-800 file:font-semibold hover:file:bg-brand-100"
              />
            </div>
            <div>
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Layout</label>
              <select
                value={layout}
                onChange={(e) => { setLayout(e.target.value as 'auto' | 'pairs' | 'matrix'); setPreview(null); }}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
              >
                <option value="auto">Auto-detect</option>
                <option value="pairs">SKU + price (single tier)</option>
                <option value="matrix">Matrix (price column per tier)</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-neutral-800">
                <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
                <span>Merge into existing tiers (overlay prices)</span>
              </label>
            </div>
            <div>
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">
                Tier Code {(layout === 'matrix' || layout === 'auto') ? '(matrix: from columns)' : ''}
              </label>
              <input
                value={tierCode}
                onChange={(e) => setTierCode(e.target.value.toUpperCase())}
                placeholder="TIER_4"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-brand-700"
              />
            </div>
            <div>
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Tier Name</label>
              <input
                value={tierName}
                onChange={(e) => setTierName(e.target.value)}
                placeholder="Volume Contract"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
              />
            </div>
          </div>

          {preview && (
            <div className="border border-neutral-200 bg-white dark:bg-white/[0.04] rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900 dark:text-slate-200">
                  Detected layout: <span className="font-mono text-brand-800">{preview.layout}</span> — {preview.valid} valid prices across {preview.total} rows
                </span>
                <button type="button" onClick={() => setPreview(null)} className="text-neutral-400 hover:text-neutral-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">SKU column</label>
                  <select
                    value={skuCol}
                    onChange={(e) => { setSkuCol(e.target.value); setPreview(null); }}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                  >
                    <option value="">— select —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                {preview.layout === 'pairs' && (
                  <div>
                    <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Price column</label>
                    <select
                      value={priceCol}
                      onChange={(e) => { setPriceCol(e.target.value); setPreview(null); }}
                      className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                    >
                      <option value="">— select —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {preview.layout === 'matrix' && (
                <div className="space-y-1.5">
                  <span className="block text-neutral-700 font-bold uppercase tracking-wider text-[11px]">Price columns → tier codes (edit codes as needed)</span>
                  {preview.headers.filter((h) => h !== skuCol).map((h) => (
                    <div key={h} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-neutral-600 dark:text-slate-300 w-40 truncate" title={h}>{h}</span>
                      <span aria-hidden="true">→</span>
                      <input
                        value={tierCols[h] ?? ''}
                        onChange={(e) => setTierCols((prev) => ({ ...prev, [h]: e.target.value.toUpperCase() }))}
                        placeholder="TIER_X (blank = ignore column)"
                        className="flex-1 px-2 py-1 border border-neutral-300 rounded-lg font-mono text-xs"
                      />
                      {existingTierCodes.includes((tierCols[h] || '').toUpperCase()) && tierCols[h] && (
                        <span className="text-[10px] font-bold text-amber-700 uppercase">exists{merge ? ' — will merge' : ''}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {Object.entries(preview.bases).map(([code, info]) => {
                const sampleStr = info.sample.map((s) => s.sku + '=R' + s.price).join(', ') || '—';
                return (
                  <div key={code} className="text-xs">
                    <span className="font-mono font-bold text-brand-950">{code}</span>
                    <span className="text-neutral-600 dark:text-slate-300"> — {info.count} prices (e.g. {sampleStr})</span>
                  </div>
                );
              })}

              {preview.rowErrors.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-900 space-y-1 max-h-36 overflow-y-auto">
                  <span className="font-bold">Fix these rows before creating (nothing has been saved):</span>
                  <ul className="list-disc pl-5">
                    {preview.rowErrors.slice(0, 20).map((e, i) => (
                      <li key={i}>Row {e.row} ({e.sku}): {e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFilePreview}
              disabled={loading || !file}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-white/[0.04] border border-brand-300 text-brand-800 hover:bg-brand-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              <span>{loading ? 'Working...' : preview ? 'Re-preview' : 'Preview price file'}</span>
            </button>
            <button
              type="button"
              onClick={handleFileCreate}
              disabled={loading || !file || !preview || preview.rowErrors.length > 0 || preview.valid === 0}
              title={preview && preview.rowErrors.length > 0 ? 'Fix flagged rows first — tier imports are all-or-nothing' : 'Create tiers from this file'}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{loading ? 'Working...' : 'Create tiers from file'}</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-lg flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium rounded-lg flex items-start gap-2">
          <CircleCheckBig className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
}
