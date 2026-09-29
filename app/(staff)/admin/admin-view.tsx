'use client';

import React, { useState } from 'react';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';
import type { CustomerWithTierInfo, AuditLogRow, TaxReportSummary } from '@/lib/repo/mysql';
import type { ProductDocument } from '@/lib/repo/mongo';
import type { InventoryStockItem } from '@/lib/services/admin';
import { CatalogueTab } from './catalogue-tab';
import { CustomerPricesManager } from './customer-prices';
import { CustomerBusinessForm } from './business-profile-form';
import { StaffTab } from './staff-tab';
import { PasswordResetsTab } from './password-resets-tab';
import {
  Users,
  Package,
  Receipt,
  ShieldCheck,
  Search,
  Download,
  CircleCheckBig,
  X,
  Building2,
  TriangleAlert,
  History,
  Sliders,
  KeyRound
} from 'lucide-react';

interface AdminViewProps {
  initialCustomers: CustomerWithTierInfo[];
  initialInventory: InventoryStockItem[];
  initialTaxReport: TaxReportSummary;
  initialAuditLogs: AuditLogRow[];
  initialProducts: ProductDocument[];
  csrfToken: string;
  userRole: string;
}

type AdminTab = 'customers' | 'inventory' | 'catalogue' | 'tax' | 'audit' | 'staff' | 'resets';

function formatRand(value: string | null | undefined): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AdminView({
  initialCustomers,
  initialInventory,
  initialTaxReport,
  initialAuditLogs,
  initialProducts,
  csrfToken,
  userRole,
}: AdminViewProps) {
  const isAdmin = userRole === 'ADMIN';
  const [activeTab, setActiveTab] = useState<AdminTab>('customers');

  const [customers, setCustomers] = useState<CustomerWithTierInfo[]>(initialCustomers);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED' | 'NEW_PROSPECTS'>('ALL');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithTierInfo | null>(null);
  const [customerActionLoading, setCustomerActionLoading] = useState<number | null>(null);
  const [customerActionError, setCustomerActionError] = useState<string | null>(null);

  const [inventory, setInventory] = useState<InventoryStockItem[]>(initialInventory);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState<string>('ALL');
  const [adjustModalSku, setAdjustModalSku] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>('10');
  const [adjustReason, setAdjustReason] = useState<'ADJUSTMENT' | 'IMPORT' | 'REFUND'>('ADJUSTMENT');
  const [adjustRefId, setAdjustRefId] = useState<string>('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [movementDrawerSku, setMovementDrawerSku] = useState<string | null>(null);
  const [movementList, setMovementList] = useState<Array<{ id: number; sku: string; delta: number; reason: string; ref_type: string; ref_id: string; actor: number; created_at: string }>>([]);
  const [movementLoading, setMovementLoading] = useState(false);

  const [taxReport] = useState<TaxReportSummary>(initialTaxReport);
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [eraseLoading, setEraseLoading] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);

  const [auditLogs] = useState<AuditLogRow[]>(initialAuditLogs);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [auditRoleFilter, setAuditRoleFilter] = useState<string>('ALL');
  const [auditSearch, setAuditSearch] = useState('');

  const handleUpdateCustomer = async (
    customerId: number,
    updates: { status?: 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED'; tier_id?: number }
  ) => {
    setCustomerActionLoading(customerId);
    setCustomerActionError(null);

    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(updates),
      });

      const data = await readApiData<ApiResponseBody & { customer: CustomerWithTierInfo }>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to update customer account'));
      }

      setCustomers((prev) =>
        prev.map((c) => (c.id === customerId ? { ...c, ...data.customer } : c))
      );
      if (selectedCustomer && selectedCustomer.id === customerId) {
        setSelectedCustomer((prev) => (prev ? { ...prev, ...data.customer } : null));
      }
    } catch (err) {
      setCustomerActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setCustomerActionLoading(null);
    }
  };

  const handleApproveCustomer = async (customerId: number, tierId?: number) => {
    setCustomerActionLoading(customerId);
    setCustomerActionError(null);

    try {
      const res = await fetch(`/api/admin/customers/${customerId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(tierId !== undefined ? { tier_id: tierId } : {}),
      });

      const data = await readApiData<ApiResponseBody & { customer: CustomerWithTierInfo }>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to approve customer account'));
      }

      setCustomers((prev) =>
        prev.map((c) => (c.id === customerId ? { ...c, ...data.customer } : c))
      );
      if (selectedCustomer && selectedCustomer.id === customerId) {
        setSelectedCustomer((prev) => (prev ? { ...prev, ...data.customer } : null));
      }
    } catch (err) {
      setCustomerActionError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setCustomerActionLoading(null);
    }
  };

  const handleEraseCustomer = async () => {
    if (!selectedCustomer) return;
    if (!eraseConfirm) {
      setEraseConfirm(true);
      return;
    }

    setEraseLoading(true);
    setEraseError(null);

    try {
      const res = await fetch(`/api/admin/popia/erase/${selectedCustomer.id}`, {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken,
        },
      });

      const data = await readApiData<ApiResponseBody>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to erase customer PII'));
      }

      setCustomers((prev) => prev.filter((c) => c.id !== selectedCustomer.id));
      setSelectedCustomer(null);
      setEraseConfirm(false);
    } catch (err) {
      setEraseError(err instanceof Error ? err.message : 'Erasure failed');
    } finally {
      setEraseLoading(false);
    }
  };

  const handleAdjustStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalSku) return;

    const deltaNum = parseInt(adjustDelta, 10);
    if (isNaN(deltaNum) || deltaNum === 0) {
      setAdjustError('Please enter a non-zero integer delta');
      return;
    }

    setAdjustLoading(true);
    setAdjustError(null);

    try {
      const res = await fetch('/api/admin/stock/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          sku: adjustModalSku,
          delta: deltaNum,
          reason: adjustReason,
          ref_id: adjustRefId.trim() || `MANUAL-${Date.now()}`,
        }),
      });

      const data = await readApiData<
        ApiResponseBody & { stock: { qty: number; updated_at?: string } }
      >(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to adjust stock'));
      }

      setInventory((prev) =>
        prev.map((item) => {
          if (item.sku === adjustModalSku) {
            const newQty = data.stock.qty;
            const reserved = item.reserved;
            return {
              ...item,
              qty: newQty,
              available: Math.max(0, newQty - reserved),
              updated_at: data.stock.updated_at ?? item.updated_at,
            };
          }
          return item;
        })
      );

      setAdjustModalSku(null);
      setAdjustDelta('10');
      setAdjustRefId('');
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Adjustment failed');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleOpenMovementDrawer = async (sku: string) => {
    setMovementDrawerSku(sku);
    setMovementLoading(true);
    try {
      const res = await fetch(`/api/admin/stock/movements?sku=${encodeURIComponent(sku)}&limit=50`);
      const data = await readApiData<
        ApiResponseBody & {
          movements: Array<{
            id: number;
            sku: string;
            delta: number;
            reason: string;
            ref_type: string;
            ref_id: string;
            actor: number;
            created_at: string;
          }>;
        }
      >(res);
      if (res.ok && Array.isArray(data.movements)) {
        setMovementList(data.movements);
      }
    } catch {
      setMovementList([]);
    } finally {
      setMovementLoading(false);
    }
  };

  const handleExport = async (type: 'invoices' | 'customers' | 'inventory' | 'audit', format: 'csv' | 'json') => {
    const key = `${type}-${format}`;
    setExportLoading(key);
    setExportSuccess(null);

    try {
      const res = await fetch(`/api/admin/reports/export?type=${type}&format=${format}`);
      if (!res.ok) {
        const data = await readApiData<ApiResponseBody>(res);
        throw new Error(apiMessage(data, 'Export failed'));
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_export_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportSuccess(`Successfully downloaded ${type.toUpperCase()} (${format.toUpperCase()})`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportLoading(null);
    }
  };

  const uniqueCustomers = Array.from(new Map(customers.map((c) => [c.id, c])).values());
  const prospectsAwaitingContact = uniqueCustomers.filter((c) => c.is_new_prospect && c.status === 'PENDING_APPROVAL');
  const filteredCustomers = uniqueCustomers.filter((c) => {
    if (customerStatusFilter === 'NEW_PROSPECTS') {
      if (!(c.is_new_prospect && c.status === 'PENDING_APPROVAL')) return false;
    } else if (customerStatusFilter !== 'ALL' && c.status !== customerStatusFilter) return false;
    if (customerSearch) {
      const q = customerSearch.toLowerCase();
      return (
        c.company_name.toLowerCase().includes(q) ||
        c.contact_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const categories = Array.from(new Set(inventory.map((i) => i.category))).filter(Boolean);
  const filteredInventory = inventory.filter((item) => {
    if (stockCategoryFilter !== 'ALL' && item.category !== stockCategoryFilter) return false;
    if (stockSearch) {
      const q = stockSearch.toLowerCase();
      return item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (auditActionFilter !== 'ALL' && log.action !== auditActionFilter) return false;
    if (auditRoleFilter !== 'ALL' && log.actor_role !== auditRoleFilter) return false;
    if (auditSearch) {
      const q = auditSearch.toLowerCase();
      return (
        log.entity_id.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.ip.toLowerCase().includes(q) ||
        (log.entity_type && log.entity_type.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#101a2c] border border-slate-200 dark:border-white/10 rounded-xl p-1 flex gap-1 overflow-x-auto shadow-sm">
        <button
          onClick={() => setActiveTab('customers')}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wide whitespace-nowrap transition-all ${activeTab === 'customers' ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Customers</span>
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${activeTab === 'customers' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{uniqueCustomers.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wide whitespace-nowrap transition-all ${activeTab === 'inventory' ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Inventory</span>
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${activeTab === 'inventory' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{inventory.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('catalogue')}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wide whitespace-nowrap transition-all ${activeTab === 'catalogue' ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Catalogue</span>
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${activeTab === 'catalogue' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{initialProducts.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('tax')}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wide whitespace-nowrap transition-all ${activeTab === 'tax' ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Invoices & VAT</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wide whitespace-nowrap transition-all ${activeTab === 'audit' ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Audit Log</span>
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${activeTab === 'audit' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{auditLogs.length}</span>
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('staff')}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wide whitespace-nowrap transition-all ${activeTab === 'staff' ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staff</span>
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('resets')}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wide whitespace-nowrap transition-all ${activeTab === 'resets' ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Resets</span>
          </button>
        )}
      </div>

      {customerActionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-center gap-2">
          <TriangleAlert className="w-4 h-4 text-rose-700" />
          <span>{customerActionError}</span>
        </div>
      )}

      {exportSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium rounded-xl flex items-center gap-2">
          <CircleCheckBig className="w-4 h-4 text-emerald-700" />
          <span>{exportSuccess}</span>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="card p-6 space-y-4">
          {prospectsAwaitingContact.length > 0 && (
            <button
              type="button"
              onClick={() => setCustomerStatusFilter('NEW_PROSPECTS')}
              className="w-full text-left p-4 bg-brand-50 border border-brand-300 rounded-xl flex items-center gap-3 hover:bg-brand-100 transition-colors"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-900 text-white text-sm font-extrabold shrink-0">
                {prospectsAwaitingContact.length}
              </span>
              <span className="text-xs text-brand-950 leading-relaxed">
                <strong>New prospect{prospectsAwaitingContact.length === 1 ? '' : 's'} waiting for contact.</strong>{' '}
                Call them, load their custom quoted prices in Details, then approve — approval is the green light that unlocks their SKUs and pricing on the site.
              </span>
            </button>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-2">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search company, contact, or email..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="pl-8 pr-3 py-2 border border-neutral-300 rounded-lg text-xs w-full focus:outline-none focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
              />
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-neutral-500 dark:text-slate-400">Status:</span>
              <select
                value={customerStatusFilter}
                onChange={(e) => setCustomerStatusFilter(e.target.value as 'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED' | 'NEW_PROSPECTS')}
                className="px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white dark:bg-white/[0.04] text-neutral-800 font-medium focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
              >
                <option value="ALL">All Statuses</option>
                <option value="NEW_PROSPECTS">New prospects — needs contact</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-xs divide-y divide-slate-100">
              <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Company &amp; Contact</th>
                  <th className="px-4 py-3.5">Email / Phone</th>
                  <th className="px-4 py-3.5">Business Account</th>
                  <th className="px-4 py-3.5">Quoted Prices</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Registered</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500 dark:text-slate-400">
                      No customer accounts match the filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-ink text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                            {cust.company_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white text-sm leading-none">{cust.company_name}</div>
                            <div className="text-slate-500 text-[11px] mt-1">{cust.contact_name} • {cust.business_type || 'Wholesale'}</div>
                          </div>
                        </div>
                        {cust.is_new_prospect && cust.status === 'PENDING_APPROVAL' && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-brand-100 text-brand-900 border border-brand-300 rounded-full text-[10px] font-bold uppercase tracking-wider">
                            New prospect — needs contact
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-neutral-800">{cust.email}</div>
                        <div className="text-neutral-500 dark:text-slate-400 text-[11px] font-mono">{cust.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          VAT {cust.vat_number || '—'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {formatRand(cust.credit_limit) ? `Credit ${formatRand(cust.credit_limit)}` : 'No credit limit set'}
                        </div>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.08] text-slate-600 dark:text-slate-300 text-[10px] font-bold tracking-wider">
                          {(cust.payment_terms || 'NET_30').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-bold uppercase tracking-wider">
                          Quoted only
                        </span>
                        <div className="text-[11px] text-neutral-500 mt-1">Manage in Details →</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            cust.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : cust.status === 'PENDING_APPROVAL'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {cust.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-500 dark:text-slate-400 font-mono text-[11px]">
                        {new Date(cust.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedCustomer(cust);
                            setEraseConfirm(false);
                            setEraseError(null);
                          }}
                          className="px-3 py-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg font-semibold text-xs transition-colors"
                        >
                          Details
                        </button>

                        {isAdmin && cust.status === 'PENDING_APPROVAL' && (
                          <button
                            disabled={customerActionLoading === cust.id}
                            onClick={() => handleApproveCustomer(cust.id)}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs transition-colors disabled:opacity-50 shadow-xs"
                          >
                            Approve
                          </button>
                        )}

                        {isAdmin && cust.status === 'APPROVED' && (
                          <button
                            disabled={customerActionLoading === cust.id}
                            onClick={() => handleUpdateCustomer(cust.id, { status: 'SUSPENDED' })}
                            className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold text-xs transition-colors disabled:opacity-50 shadow-xs"
                          >
                            Suspend
                          </button>
                        )}

                        {isAdmin && cust.status === 'SUSPENDED' && (
                          <button
                            disabled={customerActionLoading === cust.id}
                            onClick={() => handleUpdateCustomer(cust.id, { status: 'APPROVED' })}
                            className="px-3 py-1.5 bg-brand-950 hover:bg-brand-900 text-white rounded-lg font-bold text-xs transition-colors disabled:opacity-50 shadow-xs"
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-2">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search SKU or product name..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="pl-8 pr-3 py-2 border border-neutral-300 rounded-lg text-xs w-full focus:outline-none focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
              />
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <span className="text-xs font-semibold text-neutral-500 dark:text-slate-400">Category:</span>
              <select
                value={stockCategoryFilter}
                onChange={(e) => setStockCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white dark:bg-white/[0.04] text-neutral-800 focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 rounded-xl overflow-x-auto shadow-2xs">
            <table className="w-full min-w-[680px] text-left text-xs divide-y divide-neutral-200">
              <thead className="bg-brand-950 text-white font-mono uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">SKU &amp; Category</th>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3 text-right">Physical Qty</th>
                  <th className="px-4 py-3 text-right">Reserved in Orders</th>
                  <th className="px-4 py-3 text-right">Available to Sell</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono">
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500 dark:text-slate-400 font-sans">
                      No stock items found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => (
                    <tr key={item.sku} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-neutral-950 dark:text-slate-100">{item.sku}</div>
                        <div className="text-neutral-500 dark:text-slate-400 text-[11px] font-sans">{item.category}</div>
                      </td>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-neutral-900 dark:text-slate-200">{item.name}</div>
                        <div className="text-neutral-500 dark:text-slate-400 text-[11px] line-clamp-1">{item.description}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-neutral-900 dark:text-slate-200">
                        {item.qty.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-700 font-semibold">
                        {item.reserved.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-bold ${
                            item.available <= 50
                              ? 'text-rose-600'
                              : item.available <= 200
                              ? 'text-amber-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {item.available.toLocaleString()}
                        </span>
                        <div className="mt-1.5 ml-auto h-1.5 w-24 rounded-full bg-slate-100 dark:bg-white/[0.08] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.available <= 50
                                ? 'bg-rose-500'
                                : item.available <= 200
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${item.qty > 0 ? Math.min(100, Math.max(2, Math.round((item.available / item.qty) * 100))) : 0}%`,
                            }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {item.qty > 0 ? `${Math.round((item.available / item.qty) * 100)}% of ${item.qty.toLocaleString()}` : 'no stock on hand'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 font-sans">
                        <button
                          onClick={() => handleOpenMovementDrawer(item.sku)}
                          className="px-3 py-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg font-semibold text-xs transition-colors"
                        >
                          Movements
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setAdjustModalSku(item.sku);
                              setAdjustDelta('50');
                              setAdjustError(null);
                            }}
                            className="px-3 py-1.5 bg-brand-950 hover:bg-brand-900 text-white rounded-lg font-bold text-xs transition-colors shadow-xs"
                          >
                            Adjust Stock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'catalogue' && (
        <CatalogueTab initialProducts={initialProducts} csrfToken={csrfToken} isAdmin={isAdmin} />
      )}

      {activeTab === 'tax' && (
        <div className="bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 rounded-b-xl p-6 shadow-sm space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 rounded-xl p-5 shadow-2xs">
              <div className="text-[11px] font-mono text-neutral-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                Gross Invoiced Turnover
              </div>
              <div className="text-2xl font-extrabold font-mono text-neutral-950 dark:text-slate-100 mt-2">
                R {taxReport.totalGrossCents}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-slate-400 mt-1">Inclusive of 15.00% VAT</div>
            </div>

            <div className="bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 rounded-xl p-5 shadow-2xs">
              <div className="text-[11px] font-mono text-neutral-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                Net Taxable Turnover
              </div>
              <div className="text-2xl font-extrabold font-mono text-neutral-950 dark:text-slate-100 mt-2">
                R {taxReport.taxableSubtotalCents}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-slate-400 mt-1">Sales Value Excl. VAT</div>
            </div>

            <div className="bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 rounded-xl p-5 shadow-2xs">
              <div className="text-[11px] font-mono text-neutral-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                Output VAT (15%)
              </div>
              <div className="text-2xl font-extrabold font-mono text-emerald-700 mt-2">
                R {taxReport.vatCents}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-slate-400 mt-1">Tax Liability Section 20</div>
            </div>

            <div className="bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 rounded-xl p-5 shadow-2xs">
              <div className="text-[11px] font-mono text-neutral-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                Total Sales Invoices
              </div>
              <div className="text-2xl font-extrabold font-mono text-neutral-950 dark:text-slate-100 mt-2">
                {taxReport.totalInvoicesCount}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-slate-400 mt-1">Consecutive Sequence Register</div>
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-xl p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-slate-200 uppercase font-mono tracking-wider flex items-center gap-2">
              <Download className="w-4 h-4 text-purple-700" />
              <span>Data Export &amp; Compliance Archives</span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-slate-400 leading-relaxed">
              Export officially formatted RFC-4180 CSV registers or structured JSON datasets. Every export action is logged with an immutable audit hash.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                disabled={exportLoading !== null}
                onClick={() => handleExport('invoices', 'csv')}
                className="px-4 py-2 bg-brand-950 hover:bg-brand-900 text-white rounded-lg text-xs font-bold font-mono transition disabled:opacity-50 shadow-xs"
              >
                {exportLoading === 'invoices-csv' ? 'Generating...' : 'Export Sales Invoices (CSV)'}
              </button>
              <button
                disabled={exportLoading !== null}
                onClick={() => handleExport('invoices', 'json')}
                className="px-4 py-2 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-900 dark:text-slate-200 rounded-lg text-xs font-bold font-mono transition disabled:opacity-50"
              >
                {exportLoading === 'invoices-json' ? 'Generating...' : 'Export Invoices (JSON)'}
              </button>
              <button
                disabled={exportLoading !== null}
                onClick={() => handleExport('customers', 'csv')}
                className="px-4 py-2 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-900 dark:text-slate-200 rounded-lg text-xs font-bold font-mono transition disabled:opacity-50"
              >
                {exportLoading === 'customers-csv' ? 'Generating...' : 'Export Customer Register (CSV)'}
              </button>
              <button
                disabled={exportLoading !== null}
                onClick={() => handleExport('inventory', 'csv')}
                className="px-4 py-2 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-900 dark:text-slate-200 rounded-lg text-xs font-bold font-mono transition disabled:opacity-50"
              >
                {exportLoading === 'inventory-csv' ? 'Generating...' : 'Export Stock Ledger (CSV)'}
              </button>
              <button
                disabled={exportLoading !== null}
                onClick={() => handleExport('audit', 'csv')}
                className="px-4 py-2 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-900 dark:text-slate-200 rounded-lg text-xs font-bold font-mono transition disabled:opacity-50"
              >
                {exportLoading === 'audit-csv' ? 'Generating...' : 'Export Audit Log (CSV)'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 rounded-xl overflow-x-auto shadow-2xs space-y-2">
            <div className="p-4 border-b border-neutral-200 font-mono text-xs font-bold uppercase tracking-wider text-neutral-800 bg-neutral-50 dark:bg-white/[0.06] flex justify-between items-center">
<span>Consecutive Sales Invoice Register</span>
                <span className="text-[11px] text-neutral-500 dark:text-slate-400 font-normal">Sales Invoices for Pastel Processing</span>
            </div>
            <table className="w-full min-w-[680px] text-left text-xs divide-y divide-neutral-200">
              <thead className="bg-brand-950 text-white font-mono uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Invoice Number</th>
                  <th className="px-4 py-3">Order Ref</th>
                  <th className="px-4 py-3">Billed Customer</th>
                  <th className="px-4 py-3">Issue Date</th>
                  <th className="px-4 py-3 text-right">Taxable Excl.</th>
                  <th className="px-4 py-3 text-right">VAT 15%</th>
                  <th className="px-4 py-3 text-right">Total Incl.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono">
                {taxReport.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500 dark:text-slate-400 font-sans">
                      No sales invoices have been issued yet.
                    </td>
                  </tr>
                ) : (
                  taxReport.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-neutral-950 dark:text-slate-100">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{inv.order_number}</td>
                      <td className="px-4 py-3 font-sans font-semibold text-neutral-900 dark:text-slate-200">{inv.company_name}</td>
                      <td className="px-4 py-3 text-neutral-500 dark:text-slate-400 text-[11px]">
                        {new Date(inv.issued_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-700">R {inv.subtotal}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-semibold">R {inv.vat}</td>
                      <td className="px-4 py-3 text-right font-bold text-neutral-950 dark:text-slate-100">R {inv.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-2">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search action, entity ID, or IP..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="pl-8 pr-3 py-2 border border-neutral-300 rounded-lg text-xs w-full focus:outline-none focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-semibold text-neutral-500 dark:text-slate-400">Action:</span>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white dark:bg-white/[0.04] text-neutral-800 focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
                >
                  <option value="ALL">All Actions</option>
                  <option value="USER_REGISTERED">USER_REGISTERED</option>
                  <option value="PROSPECT_REGISTERED">PROSPECT_REGISTERED</option>
                  <option value="STAFF_CREATED">STAFF_CREATED</option>
                  <option value="PASSWORD_RESET">PASSWORD_RESET</option>
                  <option value="PASSWORD_RESET_REQUESTED">PASSWORD_RESET_REQUESTED</option>
                  <option value="PASSWORD_RESET_FULFILLED">PASSWORD_RESET_FULFILLED</option>
                  <option value="PASSWORD_RESET_DISMISSED">PASSWORD_RESET_DISMISSED</option>
                  <option value="2FA_RESET">2FA_RESET</option>
                  <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                  <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                  <option value="ORDER_CREATED">ORDER_CREATED</option>
                  <option value="ORDER_STATE_TRANSITION">ORDER_STATE_TRANSITION</option>
                  <option value="INVOICE_ISSUED">INVOICE_ISSUED</option>
                  <option value="STOCK_ADJUSTED">STOCK_ADJUSTED</option>
                  <option value="CUSTOMER_STATUS_UPDATED">CUSTOMER_STATUS_UPDATED</option>
                  <option value="CUSTOMER_TIER_ASSIGNED">CUSTOMER_TIER_ASSIGNED</option>
                  <option value="DATA_EXPORT">DATA_EXPORT</option>
                </select>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-semibold text-neutral-500 dark:text-slate-400">Role:</span>
                <select
                  value={auditRoleFilter}
                  onChange={(e) => setAuditRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white dark:bg-white/[0.04] text-neutral-800 focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
                >
                  <option value="ALL">All Roles</option>
                  <option value="CUSTOMER">CUSTOMER</option>
                  <option value="SALES_STAFF">SALES_STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 rounded-xl overflow-x-auto shadow-2xs">
            <table className="w-full min-w-[680px] text-left text-xs divide-y divide-neutral-200">
              <thead className="bg-brand-950 text-white font-mono uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor / Role</th>
                  <th className="px-4 py-3">Action Event</th>
                  <th className="px-4 py-3">Target Entity</th>
                  <th className="px-4 py-3">State Delta (Before &rarr; After)</th>
                  <th className="px-4 py-3 text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono">
                {filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500 dark:text-slate-400 font-sans">
                      No audit log entries found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="px-4 py-3 text-neutral-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-neutral-800">
                          {log.actor_role || 'SYSTEM'} #{log.actor_id ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-neutral-100 dark:bg-white/[0.08] text-neutral-900 dark:text-slate-200 rounded font-bold text-[10px] uppercase tracking-wider border border-neutral-200 dark:border-white/10">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {log.entity_type} <span className="text-neutral-400">#</span>{log.entity_id}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-neutral-600 dark:text-slate-300 max-w-xs truncate">
                        {log.before_hash ? (
                          <span>
                            <span className="text-rose-700">{log.before_hash}</span> &rarr;{' '}
                            <span className="text-emerald-700 font-bold">{log.after_hash}</span>
                          </span>
                        ) : log.after_hash ? (
                          <span className="text-emerald-700 font-bold">{log.after_hash}</span>
                        ) : (
                          <span className="text-neutral-400">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-500 dark:text-slate-400 text-[11px]">
                        {log.ip}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdmin && activeTab === 'staff' && <StaffTab csrfToken={csrfToken} />}

      {isAdmin && activeTab === 'resets' && <PasswordResetsTab csrfToken={csrfToken} />}

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-white/[0.04] rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-neutral-300">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="font-bold text-base text-neutral-900 dark:text-slate-200 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-700" />
                <span>Customer Account #{selectedCustomer.id}</span>
              </h3>
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setEraseConfirm(false);
                  setEraseError(null);
                }}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {selectedCustomer.is_new_prospect && selectedCustomer.status === 'PENDING_APPROVAL' && (
                <div className="p-3 bg-brand-50 border border-brand-300 rounded-lg text-brand-950 leading-relaxed">
                  <strong>New prospect — contact them first:</strong> {selectedCustomer.phone} · {selectedCustomer.email}.
                  Finalise their custom quoted prices below, then approve to give the green light.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-neutral-500 dark:text-slate-400 font-medium">Company Name:</span>
                  <div className="font-bold text-neutral-900 dark:text-slate-200 text-sm">{selectedCustomer.company_name}</div>
                </div>
                <div>
                  <span className="text-neutral-500 dark:text-slate-400 font-medium">Contact Person:</span>
                  <div className="font-semibold text-neutral-900 dark:text-slate-200">{selectedCustomer.contact_name}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-neutral-500 dark:text-slate-400 font-medium">Email Address:</span>
                  <div className="font-mono text-neutral-800">{selectedCustomer.email}</div>
                </div>
                <div>
                  <span className="text-neutral-500 dark:text-slate-400 font-medium">Phone Number:</span>
                  <div className="font-mono text-neutral-800">{selectedCustomer.phone}</div>
                </div>
              </div>

              <CustomerBusinessForm
                key={selectedCustomer.id}
                customer={selectedCustomer}
                csrfToken={csrfToken}
                canEdit={isAdmin}
                onSaved={(updated) => {
                  setCustomers((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
                  setSelectedCustomer((prev) => (prev ? { ...prev, ...updated } : prev));
                }}
              />

              <div>
                <span className="text-neutral-500 dark:text-slate-400 font-medium">Registered Address / Metadata:</span>
                <pre className="mt-1 p-2.5 bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 rounded-lg text-[11px] font-mono text-neutral-700 overflow-x-auto">
                  {selectedCustomer.address_json}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-100">
                <div>
                  <span className="text-neutral-500 dark:text-slate-400 font-medium">Assigned Price Tier:</span>
                  <div className="font-bold text-neutral-900 dark:text-slate-200">
                    {selectedCustomer.assigned_tier_code || 'TIER_1'} (
                    {selectedCustomer.assigned_tier_name || 'Standard Wholesale'})
                  </div>
                </div>
                <div>
                  <span className="text-neutral-500 dark:text-slate-400 font-medium">User Login Status:</span>
                  <div className="font-semibold text-neutral-800">
                    {selectedCustomer.user_status || 'PENDING_APPROVAL'}
                    {selectedCustomer.locked_until && (
                      <span className="text-rose-600 block text-[10px]">
                        Locked until {new Date(selectedCustomer.locked_until).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <CustomerPricesManager customerId={selectedCustomer.id} csrfToken={csrfToken} />
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-neutral-200 dark:border-white/10">
              <div>
                {isAdmin && (
                  <button
                    onClick={handleEraseCustomer}
                    disabled={eraseLoading}
                    title="Anonymize all PII for this customer. Financial records are preserved."
                    className="px-4 py-2 bg-white dark:bg-white/[0.04] border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {eraseConfirm ? (eraseLoading ? 'Erasing...' : 'Confirm Erase PII') : 'Erase PII'}
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setEraseConfirm(false);
                  setEraseError(null);
                }}
                className="px-5 py-2 bg-brand-950 hover:bg-brand-900 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                Close
              </button>
            </div>
            {eraseError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-lg">
                {eraseError}
              </div>
            )}
          </div>
        </div>
      )}

      {adjustModalSku && (
        <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleAdjustStockSubmit}
            className="bg-white dark:bg-[#101a2c] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-neutral-300 dark:border-white/10"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 pb-3">
              <h3 className="font-bold text-base text-neutral-900 dark:text-slate-100 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                <span>Manual Stock Adjustment: <span className="font-mono">{adjustModalSku}</span></span>
              </h3>
              <button
                type="button"
                onClick={() => setAdjustModalSku(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adjustError && (
              <div className="p-3 bg-rose-50 border border-rose-200 dark:bg-rose-950/60 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs font-medium rounded-lg">
                {adjustError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 dark:text-slate-300 font-bold mb-1 uppercase tracking-wider text-[11px]">
                  Quantity Delta (+ / -)
                </label>
                <input
                  type="number"
                  step="1"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-white/15 dark:bg-[#0d1526] dark:text-slate-100 rounded-lg font-mono focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
                  required
                />
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-slate-300 font-bold mb-1 uppercase tracking-wider text-[11px]">
                  Adjustment Reason
                </label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value as 'ADJUSTMENT' | 'IMPORT' | 'REFUND')}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-white/15 dark:bg-[#0d1526] dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
                >
                  <option value="ADJUSTMENT">Manual Stock Take / Count Adjustment</option>
                  <option value="IMPORT">Supplier Consignment Import</option>
                  <option value="REFUND">Customer Return / Restock</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-slate-300 font-bold mb-1 uppercase tracking-wider text-[11px]">
                  Reference Note / ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. AUDIT-2026-Q3 or PO-99812"
                  value={adjustRefId}
                  onChange={(e) => setAdjustRefId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-white/15 dark:bg-[#0d1526] dark:text-slate-100 rounded-lg font-mono focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-neutral-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setAdjustModalSku(null)}
                className="px-4 py-2 border border-neutral-300 dark:border-white/15 rounded-lg text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adjustLoading}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 shadow-xs"
              >
                {adjustLoading ? 'Saving...' : 'Confirm Stock Adjustment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {movementDrawerSku && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setMovementDrawerSku(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-8 z-50 pointer-events-auto">
            <div
              className="w-screen max-w-md bg-white dark:bg-[#0d1526] h-full p-6 space-y-4 shadow-2xl border-l border-neutral-300 dark:border-white/10 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 pb-3">
                <h3 className="font-bold text-base text-neutral-900 dark:text-slate-200 flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                  <span>Stock Movements: <span className="font-mono">{movementDrawerSku}</span></span>
                </h3>
                <button
                  onClick={() => setMovementDrawerSku(null)}
                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-slate-200 p-1"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            {movementLoading ? (
              <div className="text-xs text-neutral-500 dark:text-slate-400 py-8 text-center font-mono">
                Loading movement audit entries...
              </div>
            ) : movementList.length === 0 ? (
              <div className="text-xs text-neutral-500 dark:text-slate-400 py-8 text-center">
                No recent stock movements recorded for this item.
              </div>
            ) : (
              <div className="space-y-3 font-mono text-xs">
                {movementList.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50/60 space-y-1 shadow-2xs"
                  >
                    <div className="flex justify-between items-center">
                      <span
                        className={`font-bold ${
                          m.delta > 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {m.delta > 0 ? `+${m.delta}` : m.delta} units
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-700 font-sans">
                      Reason: <strong className="font-mono">{m.reason}</strong> ({m.ref_type}: {m.ref_id})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
