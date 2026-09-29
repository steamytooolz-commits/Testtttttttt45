'use client';

import React, { useState } from 'react';
import type { CustomerWithTierInfo } from '@/lib/repo/mysql';
import { apiMessage, readApiData } from '@/lib/api-client';
import { CircleCheckBig, Pencil, TriangleAlert } from 'lucide-react';

const PAYMENT_TERMS = ['COD', 'NET_7', 'NET_14', 'NET_30', 'NET_60'];

function formatRand(value: string | null | undefined): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CustomerBusinessFormProps {
  customer: CustomerWithTierInfo;
  csrfToken: string;
  canEdit: boolean;
  onSaved: (customer: CustomerWithTierInfo) => void;
}

export function CustomerBusinessForm({ customer, csrfToken, canEdit, onSaved }: CustomerBusinessFormProps) {
  const [editing, setEditing] = useState(false);
  const [businessType, setBusinessType] = useState(customer.business_type ?? '');
  const [vatNumber, setVatNumber] = useState(customer.vat_number ?? '');
  const [creditLimit, setCreditLimit] = useState(customer.credit_limit ?? '');
  const [paymentTerms, setPaymentTerms] = useState(customer.payment_terms ?? 'NET_30');
  const [logoUrl, setLogoUrl] = useState(customer.logo_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const startEditing = () => {
    setBusinessType(customer.business_type ?? '');
    setVatNumber(customer.vat_number ?? '');
    setCreditLimit(customer.credit_limit ?? '');
    setPaymentTerms(customer.payment_terms ?? 'NET_30');
    setLogoUrl(customer.logo_url ?? '');
    setError(null);
    setEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          business: {
            business_type: businessType,
            vat_number: vatNumber,
            credit_limit: creditLimit,
            payment_terms: paymentTerms,
            logo_url: logoUrl,
          },
        }),
      });

      const data = await readApiData(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to save business profile'));
      }

      onSaved(data.customer as CustomerWithTierInfo);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t border-neutral-100">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-lg flex items-center gap-2">
            <TriangleAlert className="w-3.5 h-3.5 text-rose-700 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-neutral-700 dark:text-slate-300 font-bold mb-1 uppercase tracking-wider text-[10px]">
              Business Type
            </label>
            <input
              type="text"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="Wholesale"
              maxLength={50}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
            />
          </div>

          <div>
            <label className="block text-neutral-700 dark:text-slate-300 font-bold mb-1 uppercase tracking-wider text-[10px]">
              VAT Number
            </label>
            <input
              type="text"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              placeholder="4920184729"
              maxLength={20}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs uppercase focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
            />
          </div>

          <div>
            <label className="block text-neutral-700 dark:text-slate-300 font-bold mb-1 uppercase tracking-wider text-[10px]">
              Payment Terms
            </label>
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white dark:bg-white/[0.04] focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
            >
              {PAYMENT_TERMS.map((term) => (
                <option key={term} value={term}>
                  {term.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-neutral-700 dark:text-slate-300 font-bold mb-1 uppercase tracking-wider text-[10px]">
              Credit Limit (ZAR)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="25000.00"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-neutral-700 dark:text-slate-300 font-bold mb-1 uppercase tracking-wider text-[10px]">
              Logo URL
            </label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="/uploads/logos/customer.png"
              maxLength={500}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="px-4 py-2 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand-950 hover:bg-brand-900 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
          >
            {saving ? 'Saving...' : 'Save Business Profile'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="pt-3 border-t border-neutral-100 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-neutral-400 dark:text-slate-400 uppercase font-bold tracking-wider text-[10px]">
          Business &amp; Credit Account
        </span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
              <CircleCheckBig className="w-3 h-3" />
              Saved
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-neutral-300 rounded-lg text-[11px] font-bold text-neutral-700 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-colors"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-neutral-500 dark:text-slate-400 font-medium">Business Type:</span>
          <div className="font-semibold text-neutral-900 dark:text-slate-200">{customer.business_type || 'Wholesale'}</div>
        </div>
        <div>
          <span className="text-neutral-500 dark:text-slate-400 font-medium">VAT Number:</span>
          <div className="font-mono text-neutral-800">{customer.vat_number || 'Not registered'}</div>
        </div>
        <div>
          <span className="text-neutral-500 dark:text-slate-400 font-medium">Payment Terms:</span>
          <div className="font-semibold text-neutral-800">{(customer.payment_terms || 'NET_30').replace('_', ' ')}</div>
        </div>
        <div>
          <span className="text-neutral-500 dark:text-slate-400 font-medium">Credit Limit:</span>
          <div className="font-bold text-emerald-700">{formatRand(customer.credit_limit) || 'No credit limit set'}</div>
        </div>
      </div>
    </div>
  );
}
