'use client';

import React, { useState } from 'react';
import type { ProductDocument } from '@/lib/repo/mongo';
import { apiMessage, readApiData } from '@/lib/api-client';
import { Package, Plus, Pencil, Upload, Download, TriangleAlert, CircleCheckBig, X, ImagePlus } from 'lucide-react';

interface CatalogueTabProps {
  initialProducts: ProductDocument[];
  csrfToken: string;
  isAdmin: boolean;
}

interface ImportResult {
  success: boolean;
  format?: string;
  total: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; sku: string; reason: string }>;
}

const EMPTY_FORM = {
  sku: '',
  name: '',
  description: '',
  category: '',
  paperWeight: '',
  packCount: '',
  colour: '',
  imageUrl: '',
  active: true,
  stockQty: '0',
  prices: '',
};

export function CatalogueTab({ initialProducts, csrfToken, isAdmin }: CatalogueTabProps) {
  const [products, setProducts] = useState<ProductDocument[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [columnPreview, setColumnPreview] = useState<{
    headers: string[];
    mapping: Record<string, string>;
    total: number;
    sample: Array<Record<string, string>>;
  } | null>(null);

  const CATALOG_FIELDS = ['sku', 'name', 'description', 'category', 'paperweight', 'packcount', 'colour', 'image', 'active'];

  const filtered = products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return p._id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  const openCreate = () => {
    setEditingSku(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (p: ProductDocument) => {
    setEditingSku(p._id);
    setForm({
      sku: p._id,
      name: p.name,
      description: p.description,
      category: p.categoryRef.replace(/^cat-/, ''),
      paperWeight: p.attributes.paperWeight || '',
      packCount: p.attributes.packCount ? String(p.attributes.packCount) : '',
      colour: p.attributes.colour || '',
      imageUrl: p.imageUrl || '',
      active: p.active,
      stockQty: '0',
      prices: '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleImageUpload = async (file: File) => {
    const sku = form.sku.trim().toUpperCase();
    if (!sku) {
      setFormError('Enter the product SKU before uploading an image.');
      return;
    }
    setUploadingImage(true);
    setFormError(null);
    try {
      const data = new FormData();
      data.append('sku', sku);
      data.append('file', file);
      const res = await fetch('/api/admin/catalog/image', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: data,
      });
      const json = await readApiData(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Image upload failed'));
      }
      setForm((f) => ({ ...f, imageUrl: json.url as string }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      let prices: Record<string, string> | undefined;
      if (form.prices.trim()) {
        try {
          const parsed: unknown = JSON.parse(form.prices);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Prices must be a JSON object of tier code to price');
          }
          prices = parsed as Record<string, string>;
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : 'Invalid prices JSON');
        }
      }
      const packCount = form.packCount.trim() ? Number(form.packCount.trim()) : undefined;
      if (form.packCount.trim() && (!Number.isInteger(packCount) || (packCount as number) <= 0)) {
        throw new Error('Pack count must be a positive integer');
      }
      if (editingSku) {
        const res = await fetch(`/api/admin/products/${encodeURIComponent(editingSku)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim(),
            category: form.category.trim(),
            ...(form.paperWeight.trim() ? { paperWeight: form.paperWeight.trim() } : {}),
            ...(packCount ? { packCount } : {}),
            ...(form.colour.trim() ? { colour: form.colour.trim() } : {}),
            imageUrl: form.imageUrl.trim(),
            active: form.active,
            ...(prices ? { prices } : {}),
          }),
        });
        const json = await readApiData(res);
        if (!res.ok) {
          throw new Error(apiMessage(json, 'Update failed'));
        }
        setProducts((prev) => prev.map((p) => (p._id === editingSku ? (json.product as ProductDocument) : p)));
      } else {
        const res = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({
            sku: form.sku.trim().toUpperCase(),
            name: form.name.trim(),
            description: form.description.trim(),
            category: form.category.trim(),
            ...(form.paperWeight.trim() ? { paperWeight: form.paperWeight.trim() } : {}),
            ...(packCount ? { packCount } : {}),
            ...(form.colour.trim() ? { colour: form.colour.trim() } : {}),
            ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
            active: form.active,
            stockQty: Number(form.stockQty) || 0,
            ...(prices ? { prices } : {}),
          }),
        });
        const json = await readApiData(res);
        if (!res.ok) {
          throw new Error(apiMessage(json, 'Creation failed'));
        }
        setProducts((prev) => [json.product as ProductDocument, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setImportError('Choose a CSV or Excel (.xlsx) file first.');
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportResult(null);
    try {
      const data = new FormData();
      data.append('file', importFile);
      const res = await fetch('/api/admin/catalog/import', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: data,
      });
      const json = await readApiData(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Import failed'));
      }
      setImportResult(json as unknown as ImportResult);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 rounded-b-xl p-6 shadow-sm space-y-6">
      {isAdmin && (
        <div className="border border-brand-200 bg-brand-50 rounded-xl p-4 space-y-3">
          <h3 className="font-bold text-sm text-brand-950 flex items-center gap-2">
            <Upload className="w-4 h-4 text-brand-700" />
            <span>Import Catalogue (CSV or MS Excel)</span>
          </h3>
          <p className="text-xs text-brand-900 leading-relaxed">
            Upload a CSV or <strong>.xlsx</strong> file with columns: sku, name, description, category,
            paperWeight, packCount, colour, image, active. Categories are auto-created, new SKUs start at
            zero stock, and every product can carry an image URL.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a href="/api/admin/catalog/import" className="inline-flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-white/[0.04] border border-brand-300 text-brand-800 rounded-lg font-semibold hover:bg-brand-100">
              <Download className="w-3.5 h-3.5" />
              <span>CSV template</span>
            </a>
            <a href="/api/admin/catalog/import?format=xlsx" className="inline-flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-white/[0.04] border border-brand-300 text-brand-800 rounded-lg font-semibold hover:bg-brand-100">
              <Download className="w-3.5 h-3.5" />
              <span>Excel template</span>
            </a>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="flex-1 text-xs text-neutral-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-brand-300 file:bg-white dark:bg-white/[0.04] file:text-brand-800 file:font-semibold hover:file:bg-brand-100"
            />
            <button
              onClick={handleImport}
              disabled={importLoading}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              {importLoading ? 'Importing...' : 'Upload & Import'}
            </button>
          </div>
          {importError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-lg flex items-center gap-2">
              <TriangleAlert className="w-4 h-4" />
              <span>{importError}</span>
            </div>
          )}
          {importResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CircleCheckBig className="w-4 h-4" />
                <span>
                  Imported {importResult.imported} of {importResult.total} rows ({importResult.skipped} skipped)
                </span>
                <button
                  onClick={() => window.location.reload()}
                  className="ml-auto px-3 py-1 bg-white dark:bg-white/[0.04] border border-emerald-300 rounded-lg font-semibold hover:bg-emerald-100"
                >
                  Refresh product list
                </button>
              </div>
              {importResult.errors.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto">
                  {importResult.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Row {e.row} ({e.sku}): {e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search SKU or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
          />
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Product</span>
          </button>
        )}
      </div>

      <div className="border border-neutral-200/80 dark:border-white/10 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs divide-y divide-neutral-200">
          <thead className="bg-brand-950 text-white font-mono uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-3">Image</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {filtered.map((p) => (
              <tr key={p._id} className="hover:bg-brand-50/60">
                <td className="px-4 py-2">
                  <img
                    src={p.imageUrl || '/product-placeholder.svg'}
                    alt={p.name}
                    width={48}
                    height={36}
                    className="w-12 h-9 object-cover rounded border border-neutral-200 bg-brand-50"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (el.src !== window.location.origin + '/product-placeholder.svg') {
                        el.src = '/product-placeholder.svg';
                      }
                    }}
                  />
                </td>
                <td className="px-4 py-3 font-mono font-bold text-brand-950">{p._id}</td>
                <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-slate-200">{p.name}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{p.categoryRef}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      p.active
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-neutral-100 dark:bg-white/[0.08] text-neutral-500 dark:text-slate-400 border border-neutral-200'
                    }`}
                  >
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(p)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg font-semibold text-xs transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <form onSubmit={handleSubmit} className="bg-white dark:bg-white/[0.04] rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-neutral-300 my-8">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="font-bold text-brand-950 flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-700" />
                <span>{editingSku ? `Edit ${editingSku}` : 'New Product'}</span>
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-lg">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">SKU</label>
                <input
                  value={form.sku}
                  disabled={!!editingSku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                  required
                  placeholder="SKU-..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-brand-700 disabled:bg-neutral-100"
                />
              </div>
              <div>
                <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Category</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  required
                  placeholder="paper / writing / filing"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
                />
              </div>
            </div>
            <div>
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
              />
            </div>
            <div>
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Paper Weight</label>
                <input
                  value={form.paperWeight}
                  onChange={(e) => setForm({ ...form, paperWeight: e.target.value })}
                  placeholder="80gsm"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
                />
              </div>
              <div>
                <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Pack Count</label>
                <input
                  value={form.packCount}
                  onChange={(e) => setForm({ ...form, packCount: e.target.value })}
                  placeholder="500"
                  inputMode="numeric"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
                />
              </div>
              <div>
                <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Colour</label>
                <input
                  value={form.colour}
                  onChange={(e) => setForm({ ...form, colour: e.target.value })}
                  placeholder="White"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
                />
              </div>
            </div>
            <div className="border border-brand-200 rounded-xl p-3 bg-brand-50/50 space-y-2">
              <label className="font-bold uppercase tracking-wider text-[11px] text-brand-950 flex items-center gap-1.5">
                <ImagePlus className="w-4 h-4 text-brand-700" />
                <span>Product Image (required look: every product shows an image)</span>
              </label>
              <div className="flex items-center gap-3">
                <img
                  src={form.imageUrl || '/product-placeholder.svg'}
                  alt="Preview"
                  width={96}
                  height={72}
                  className="w-24 h-[72px] object-cover rounded-lg border border-neutral-300 bg-white"
                />
                <div className="flex-1 space-y-2">
                  <input
                    value={form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="https://... or /product-images/....jpg"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-brand-700"
                  />
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-white/[0.04] border border-brand-300 text-brand-800 rounded-lg text-xs font-semibold cursor-pointer hover:bg-brand-100">
                    <span>{uploadingImage ? 'Uploading...' : 'Upload image file'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleImageUpload(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!editingSku && (
                <div>
                  <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">Opening Stock Qty</label>
                  <input
                    value={form.stockQty}
                    onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
                    inputMode="numeric"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-xs font-semibold text-neutral-800 pt-5">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <span>Active (visible in catalogue)</span>
              </label>
            </div>
            <div>
              <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">
                Tier Prices (JSON, e.g. {`{"TIER_1": "85.00"}`})
              </label>
              <textarea
                rows={2}
                value={form.prices}
                onChange={(e) => setForm({ ...form, prices: e.target.value })}
                spellCheck={false}
                placeholder='{"TIER_1": "85.00", "TIER_2": "78.50"}'
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-brand-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
              >
                {formLoading ? 'Saving...' : editingSku ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
