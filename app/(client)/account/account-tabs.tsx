'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { readApiData } from '@/lib/api-client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, Package, Receipt, RefreshCw } from 'lucide-react';

type PortalTab = 'overview' | 'orders' | 'invoices';

const TABS: Array<{ key: PortalTab; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'Account', icon: <User className="w-5 h-5 md:w-4 md:h-4" /> },
  { key: 'orders', label: 'Orders', icon: <Package className="w-5 h-5 md:w-4 md:h-4" /> },
  { key: 'invoices', label: 'Invoices', icon: <Receipt className="w-5 h-5 md:w-4 md:h-4" /> },
];

interface Profile {
  customer: {
    public_id: string;
    company_name: string;
    contact_name: string;
    email: string;
    phone: string;
    status: string;
    created_at: string;
  };
  tier: { code: string; name: string } | null;
  customPriceCount: number;
}

interface OrderRow {
  id: number;
  order_number: string;
  status: string;
  total: string;
  created_at: string;
  invoice?: { invoice_number: string } | null;
}

interface InvoiceRow {
  id: number;
  invoice_number: string;
  order_number: string;
  total: string;
  status: string;
  issued_at: string;
}

function usePortalTab(customerId: number | null): [PortalTab, (tab: PortalTab) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: PortalTab = raw === 'orders' || raw === 'invoices' ? raw : 'overview';
  const setTab = useCallback(
    (next: PortalTab) => {
      const params = new URLSearchParams();
      if (customerId !== null) {
        params.set('customerId', String(customerId));
      }
      if (next !== 'overview') {
        params.set('tab', next);
      }
      const qs = params.toString();
      router.replace(qs ? `/account?${qs}` : '/account', { scroll: false });
    },
    [router, customerId]
  );
  return [tab, setTab];
}

function OverviewTab({ customerId }: { customerId: number | null }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = customerId !== null ? `/api/account?customerId=${customerId}` : '/api/account';
    fetch(url, { cache: 'no-store' })
      .then((res) => (res.ok ? readApiData(res) : null))
      .then((json: unknown) => {
        if (!cancelled) {
          if (json && typeof json === 'object' && 'customer' in json) {
            setProfile(json as Profile);
          } else {
            setError('Could not load your account profile.');
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your account profile.');
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (error) {
    return <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-4">{error}</p>;
  }
  if (!profile) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-24 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-xl animate-pulse" />
        <div className="h-16 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 sm:p-6">
        <p className="kicker text-neutral-500 dark:text-slate-400">Trading as</p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-950 dark:text-slate-100 tracking-tight mt-1">{profile.customer.company_name}</h1>
        <p className="text-sm text-neutral-600 dark:text-slate-300 mt-1">{profile.customer.contact_name}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 p-3">
            <p className="kicker text-neutral-500 dark:text-slate-400">Client ID</p>
            <p className="font-mono font-bold text-brand-800 break-all">{profile.customer.public_id}</p>
            <p className="text-[11px] text-neutral-500 dark:text-slate-400 mt-1">Quote this ID when contacting sales.</p>
          </div>
          <div className="rounded-md bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 p-3">
            <p className="kicker text-neutral-500 dark:text-slate-400">Pricing</p>
            <p className="font-bold text-neutral-900 dark:text-slate-200">
              {profile.tier ? `${profile.tier.code} — ${profile.tier.name}` : 'Standard Wholesale'}
            </p>
            {profile.customPriceCount > 0 && (
              <p className="text-xs text-emerald-700 font-semibold mt-1">
                + {profile.customPriceCount} custom quoted {profile.customPriceCount === 1 ? 'price' : 'prices'}
              </p>
            )}
          </div>
        </div>
        <dl className="mt-4 space-y-1.5 text-sm text-neutral-700">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500 dark:text-slate-400">Email</dt>
            <dd className="font-mono text-right break-all">{profile.customer.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500 dark:text-slate-400">Phone</dt>
            <dd className="font-mono text-right">{profile.customer.phone}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500 dark:text-slate-400">Status</dt>
            <dd className="font-bold text-emerald-700">APPROVED</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/catalog" className="btn-primary py-3">
          Browse Catalog
        </Link>
        <Link href="/quick-order" className="btn-secondary py-3">
          Quick Order
        </Link>
        <Link href="/cart" className="btn-secondary py-3">
          View Cart
        </Link>
      </div>
    </div>
  );
}

function OrdersTab({ customerId }: { customerId: number | null }) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const url = customerId !== null ? `/api/orders?customerId=${customerId}` : '/api/orders';
    fetch(url, { cache: 'no-store' })
      .then((res) => (res.ok ? readApiData(res) : null))
      .then((json: unknown) => {
        if (cancelled) return;
        if (json && typeof json === 'object' && Array.isArray((json as { orders?: unknown }).orders)) {
          setOrders((json as { orders: OrderRow[] }).orders);
        } else {
          setError('Could not load orders.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load orders.');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, customerId]);

  if (error) {
    return <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-4">{error}</p>;
  }
  if (!orders) {
    return <div className="h-32 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-xl animate-pulse" aria-busy="true" />;
  }
  if (orders.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-bold text-neutral-950 dark:text-slate-100">No orders yet</p>
        <p className="text-xs text-neutral-500 dark:text-slate-400 mt-1 mb-4">Your placed orders will appear here.</p>
        <Link href="/catalog" className="btn-primary !text-xs">
          Start shopping
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setRefreshKey((k) => k + 1);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-slate-300 hover:text-brand-900"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>
      {orders.map((order) => (
        <div key={order.id} className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono font-bold text-neutral-950 dark:text-slate-100">{order.order_number}</span>
            <span className="badge-neutral uppercase">{order.status.replace(/_/g, ' ')}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-neutral-500 dark:text-slate-400 text-xs">{new Date(order.created_at).toLocaleDateString()}</span>
            <span className="font-mono font-extrabold text-neutral-950 dark:text-slate-100">R {order.total}</span>
          </div>
          {order.invoice && (
            <p className="mt-1 text-xs text-purple-800 font-mono">Invoice {order.invoice.invoice_number}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function InvoicesTab({ customerId }: { customerId: number | null }) {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = customerId !== null ? `/api/invoices?customerId=${customerId}` : '/api/invoices';
    fetch(url, { cache: 'no-store' })
      .then((res) => (res.ok ? readApiData(res) : null))
      .then((json: unknown) => {
        if (cancelled) return;
        if (json && typeof json === 'object' && Array.isArray((json as { invoices?: unknown }).invoices)) {
          setInvoices((json as { invoices: InvoiceRow[] }).invoices);
        } else {
          setError('Could not load invoices.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load invoices.');
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (error) {
    return <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-4">{error}</p>;
  }
  if (!invoices) {
    return <div className="h-32 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-xl animate-pulse" aria-busy="true" />;
  }
  if (invoices.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-bold text-neutral-950 dark:text-slate-100">No sales invoices yet</p>
        <p className="text-xs text-neutral-500 dark:text-slate-400 mt-1">Invoices appear here once staff processes your orders.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <div key={inv.id} className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono font-bold text-purple-900">{inv.invoice_number}</span>
            <span className="font-mono font-extrabold text-neutral-950 dark:text-slate-100">R {inv.total}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-neutral-500 dark:text-slate-400">
              {inv.order_number} · {new Date(inv.issued_at).toLocaleDateString()}
            </span>
            <a
              href={`/api/invoices/${inv.id}/pdf`}
              className="text-xs font-bold text-brand-700 hover:text-brand-900 hover:underline whitespace-nowrap"
            >
              Download PDF
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function PortalTabsInner({ customerId }: { customerId: number | null }) {
  const [tab, setTab] = usePortalTab(customerId);

  return (
    <div>
      <nav
        aria-label="Account sections"
        className="hidden md:flex gap-2 mb-6"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={tab === t.key ? 'tab-pill-active !px-4 !py-2.5' : 'tab-pill-idle !px-4 !py-2.5'}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab customerId={customerId} />}
      {tab === 'orders' && <OrdersTab customerId={customerId} />}
      {tab === 'invoices' && <InvoicesTab customerId={customerId} />}

      <nav
        aria-label="Account sections"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-white/[0.04] border-t border-neutral-200 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${
                tab === t.key ? 'text-brand-700' : 'text-neutral-400'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
              <span
                aria-hidden="true"
                className={`h-1 w-10 rounded-full ${tab === t.key ? 'bg-brand-600' : 'bg-transparent'}`}
              />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function AccountTabs({ customerId = null }: { customerId?: number | null }) {
  return (
    <Suspense
      fallback={<div className="h-32 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-xl animate-pulse" aria-busy="true" />}
    >
      <PortalTabsInner customerId={customerId} />
    </Suspense>
  );
}
