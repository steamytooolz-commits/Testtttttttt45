'use client';

import Link from 'next/link';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutGrid,
  Zap,
  ShoppingCart,
  ClipboardList,
  ReceiptText,
  UserRound,
  Building2,
  Menu,
  X,
  ExternalLink,
  LogOut,
  ShieldCheck,
  ChevronRight,
  KeyRound,
} from 'lucide-react';
import { LogoutButton } from './logout-button';
import { ThemeToggle } from './theme-toggle';

const emptySubscribe = () => () => {};

export const RETAIL_SITE_URL = 'https://thestationerydepot.co.za';

export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <img
      src="/brand-logo.png"
      alt="The Stationery Depot logo"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="rounded-full object-cover shrink-0 ring-2 ring-white/20"
    />
  );
}

export function RetailSiteLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={RETAIL_SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`items-center gap-1.5 font-semibold transition-colors ${className || 'inline-flex'}`}
    >
      <span className="truncate">thestationerydepot.co.za</span>
      <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

export function BrandHeaderLeft({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
      <BrandMark size={compact ? 34 : 38} />
      <div className="leading-tight min-w-0">
        <span className={`font-bold tracking-tight block text-brand-950 dark:text-white truncate ${compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'}`}>
          STATIONERY DEPOT
        </span>
        <span className="text-[8px] sm:text-[10px] text-brand-700 dark:text-brand-300 uppercase tracking-[0.14em] sm:tracking-[0.16em] block font-semibold truncate">
          B2B Trade Wholesale
        </span>
      </div>
    </Link>
  );
}

export interface SiteHeaderSession {
  email: string;
  role: string;
  status: string;
  tierCode?: string | null;
  csrfToken: string;
}

export interface SiteNavItem {
  href: string;
  label: string;
  icon: 'catalog' | 'quick' | 'cart' | 'orders' | 'invoices' | 'account' | 'queue' | 'admin';
  active?: boolean;
}

const NAV_ICONS = {
  catalog: LayoutGrid,
  quick: Zap,
  cart: ShoppingCart,
  orders: ClipboardList,
  invoices: ReceiptText,
  account: UserRound,
  queue: ClipboardList,
  admin: Building2,
} as const;

export function SiteHeader({
  session,
  nav,
}: {
  session: SiteHeaderSession | null;
  nav: SiteNavItem[];
}) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const approved = session?.status === 'APPROVED';

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Close drawer on ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // All primary portal links for the mobile drawer
  const allMobilePortalLinks = [
    { href: '/catalog', label: 'Wholesale Catalog', description: 'Browse 100+ office & paper supplies', icon: LayoutGrid },
    { href: '/quick-order', label: 'Quick Matrix Order', description: 'Rapid SKU entry & CSV bulk uploads', icon: Zap },
    { href: '/cart', label: 'Shopping Cart', description: 'Review items, VAT & EFT checkout', icon: ShoppingCart },
    { href: '/orders', label: 'Orders & Proofs', description: 'Track status & upload payment receipts', icon: ClipboardList },
    { href: '/invoices', label: 'Tax Invoices', description: 'Download sequential SARS VAT invoices', icon: ReceiptText },
    { href: '/account', label: 'My Account', description: 'Contract pricing, tiers & delivery address', icon: UserRound },
  ];

  const staffOperationsLinks = [
    ...(session?.role === 'SALES_STAFF' || session?.role === 'ADMIN'
      ? [{ href: '/queue', label: 'Staff Fulfillment Queue', description: 'Process orders & issue invoices', icon: ClipboardList }]
      : []),
    ...(session?.role === 'ADMIN'
      ? [{ href: '/admin', label: 'Admin Management', description: 'Customer approval, tiers & stock', icon: Building2 }]
      : []),
  ];

  const demoAccounts = [
    { label: 'System Admin', email: 'admin@stationerydepot.co.za', desc: 'Full catalogue & approval governance' },
    { label: 'Trade Customer', email: 'procurement@capeoffice.co.za', desc: 'Cape Office (Tier 1 Commercial: 15%)' },
    { label: 'Sales Staff 1', email: 'staff1@stationerydepot.co.za', desc: 'Order fulfillment & invoice queue' },
    { label: 'School Customer', email: 'orders@peninsulaschools.org', desc: 'Peninsula Schools (Education: 12%)' },
  ];

  const drawerContent = (
    <div id="mobile-nav-drawer" className="lg:hidden fixed inset-0 z-[9999] overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs transition-opacity"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer Sheet */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-8 z-[10000] pointer-events-auto">
        <div
          className="w-screen max-w-sm sm:max-w-md bg-white dark:bg-[#0d1526] h-full shadow-2xl flex flex-col border-l border-neutral-200 dark:border-white/10 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="p-4 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between bg-neutral-50 dark:bg-white/[0.03] shrink-0">
            <div className="flex items-center gap-3">
              <BrandMark size={32} />
              <div>
                <span className="font-bold text-sm tracking-tight block text-brand-950 dark:text-white">
                  STATIONERY DEPOT
                </span>
                <span className="text-[9px] text-brand-700 dark:text-brand-300 uppercase tracking-widest font-semibold block">
                  B2B Portal Menu
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Content */}
          <div className="p-4 space-y-5 flex-1">
            {/* Account Status / Auth Banner */}
            {session ? (
              <div className="p-3.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-white/[0.04] space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                      Authenticated Session
                    </div>
                    <div className="text-sm font-bold text-neutral-900 dark:text-white truncate" title={session.email}>
                      {session.email}
                    </div>
                  </div>
                  {approved ? (
                    <span className="badge-emerald shrink-0">{session.tierCode || 'APPROVED'}</span>
                  ) : (
                    <span className="badge-amber shrink-0">PENDING</span>
                  )}
                </div>
                <div className="pt-2 border-t border-neutral-200 dark:border-white/10 flex items-center justify-between">
                  <Link
                    href="/account"
                    onClick={() => setOpen(false)}
                    className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline flex items-center gap-1"
                  >
                    <UserRound className="w-3.5 h-3.5" />
                    View Account & Tiers
                  </Link>
                  <LogoutButton csrfToken={session.csrfToken} className="btn-ghost !text-xs !py-1 !px-2">
                    <LogOut className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                    Sign out
                  </LogoutButton>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg border border-brand-200 dark:border-brand-900/60 bg-brand-50/70 dark:bg-brand-950/40 space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0" />
                  <span className="text-xs font-bold text-brand-950 dark:text-white">Trade-Only Portal</span>
                </div>
                <p className="text-xs text-brand-900/90 dark:text-brand-200/90 leading-relaxed">
                  Sign in to view your quoted rates, load quick matrix orders, and check out with SARS VAT tax invoices.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="btn-secondary !text-xs !py-2 text-center justify-center font-bold"
                  >
                    Trade Sign In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="btn-primary !text-xs !py-2 text-center justify-center font-bold"
                  >
                    Open Account
                  </Link>
                </div>
              </div>
            )}

            {/* Primary Wholesale Navigation Links */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-2 px-1">
                Wholesale Operations
              </p>
              <div className="space-y-1">
                {allMobilePortalLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/[0.06] text-neutral-800 dark:text-slate-200 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-md bg-brand-50 dark:bg-brand-950/70 text-brand-700 dark:text-brand-300 group-hover:bg-brand-100 shrink-0">
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-slate-400 truncate">
                            {item.description}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-slate-200 shrink-0 ml-2" />
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Staff / Admin Operations (when authenticated with staff/admin role) */}
            {staffOperationsLinks.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-2 px-1">
                  Staff & Admin Controls
                </p>
                <div className="space-y-1">
                  {staffOperationsLinks.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/[0.06] text-neutral-800 dark:text-slate-200 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 shrink-0">
                            <Icon className="w-4 h-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-neutral-500 dark:text-slate-400 truncate">
                              {item.description}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-slate-200 shrink-0 ml-2" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Demo Accounts Quick-Switch Helper (Private Demo Testing) */}
            <div className="rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50/60 dark:bg-white/[0.02] p-3">
              <button
                type="button"
                onClick={() => setShowDemoAccounts((v) => !v)}
                className="w-full flex items-center justify-between text-left text-xs font-bold text-neutral-800 dark:text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                  <span>Demo Accounts & Passwords</span>
                </div>
                <span className="text-[10px] text-brand-700 dark:text-brand-300 font-mono">
                  {showDemoAccounts ? 'Hide ▲' : 'Show ▼'}
                </span>
              </button>
              {showDemoAccounts && (
                <div className="mt-3 space-y-2 pt-2 border-t border-neutral-200 dark:border-white/10 text-xs font-mono">
                  <p className="text-[11px] font-sans text-neutral-500 dark:text-slate-400">
                    Standard demo password: <span className="font-mono font-bold text-neutral-900 dark:text-white">password123</span>
                  </p>
                  {demoAccounts.map((acc) => (
                    <Link
                      key={acc.email}
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="block p-2 rounded bg-white dark:bg-white/[0.05] border border-neutral-200 dark:border-white/10 hover:border-brand-500 transition-colors"
                    >
                      <div className="font-bold font-sans text-neutral-900 dark:text-white flex items-center justify-between">
                        <span>{acc.label}</span>
                        <span className="text-[10px] text-brand-700 dark:text-brand-300 font-sans">1-tap login &rarr;</span>
                      </div>
                      <div className="text-[10px] text-neutral-500 dark:text-slate-400 truncate">{acc.email}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Company & Compliance Links */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-2 px-1">
                Policies & Store
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Link
                  href="/terms"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded bg-neutral-50 dark:bg-white/[0.04] text-neutral-700 dark:text-slate-300 hover:text-brand-800"
                >
                  Wholesale Terms
                </Link>
                <Link
                  href="/privacy"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded bg-neutral-50 dark:bg-white/[0.04] text-neutral-700 dark:text-slate-300 hover:text-brand-800"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/popia"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded bg-neutral-50 dark:bg-white/[0.04] text-neutral-700 dark:text-slate-300 hover:text-brand-800"
                >
                  POPIA Notice
                </Link>
                <a
                  href={RETAIL_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded bg-neutral-50 dark:bg-white/[0.04] text-brand-700 dark:text-brand-300 font-semibold flex items-center justify-between"
                >
                  <span>Retail Store</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] flex items-center justify-between text-xs text-neutral-500 dark:text-slate-400 shrink-0">
            <span className="font-semibold">Stationery Depot B2B</span>
            <span className="font-mono text-[11px]">South Africa</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 dark:border-white/10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 shadow-card dark:bg-[#0d1526]/95 dark:border-white/10">
        <div className="h-1 bg-gradient-to-r from-brand-700 via-brand-600 to-brand-400" aria-hidden="true" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-16 flex items-center justify-between gap-2 sm:gap-4">
          <BrandHeaderLeft compact={true} />

          {/* Desktop Primary Nav */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
            {nav.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    item.active
                      ? 'bg-brand-50 text-brand-800 dark:bg-brand-950/70 dark:text-brand-200'
                      : 'text-neutral-600 dark:text-slate-300 hover:text-brand-800 hover:bg-neutral-100 dark:bg-white/[0.08] dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Desktop Session / Auth actions */}
          <div className="hidden lg:flex items-center gap-2">
            <ThemeToggle />
            {session ? (
              <>
                <div className="text-right leading-tight">
                  <div className="text-xs font-semibold text-neutral-800 max-w-[180px] truncate dark:text-slate-200" title={session.email}>
                    {session.email}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                    {approved ? (
                      <span className="badge-emerald">{session.tierCode || 'APPROVED'}</span>
                    ) : (
                      <span className="badge-amber">PENDING APPROVAL</span>
                    )}
                  </div>
                </div>
                <LogoutButton
                  csrfToken={session.csrfToken}
                  className="btn-ghost !px-2.5"
                  aria-label="Log out"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                </LogoutButton>
              </>
            ) : (
              <>
                <Link href="/login" className="btn-ghost">
                  Trade Sign In
                </Link>
                <Link href="/register" className="btn-primary">
                  Open Trade Account
                </Link>
              </>
            )}
          </div>

          {/* Mobile Action Bar (Direct Cart + Theme + Drawer Toggle) */}
          <div className="flex lg:hidden items-center gap-1">
            <Link
              href="/cart"
              className="inline-flex items-center justify-center p-2 rounded-md text-neutral-700 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-white/10 transition-colors"
              aria-label="Shopping Cart"
              title="Wholesale Cart"
            >
              <ShoppingCart className="w-5 h-5 text-brand-800 dark:text-brand-300" aria-hidden="true" />
            </Link>
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-neutral-700 hover:bg-neutral-100 dark:bg-white/[0.08] dark:text-slate-300 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60 min-w-[42px] min-h-[42px]"
              aria-expanded={open}
              aria-controls="mobile-nav-drawer"
              aria-label={open ? 'Close wholesale menu' : 'Open wholesale menu'}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>
      {mounted && open && createPortal(drawerContent, document.body)}
    </>
  );
}

export function SiteFooter({
  session,
  isRegistered: isRegisteredProp,
}: {
  session?: SiteHeaderSession | null;
  isRegistered?: boolean;
} = {}) {
  const [asyncRegistered, setAsyncRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    if (isRegisteredProp !== undefined || session !== undefined) {
      return;
    }
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setAsyncRegistered(Boolean(data?.user));
      })
      .catch(() => {
        setAsyncRegistered(false);
      });
  }, [session, isRegisteredProp]);

  const isRegistered =
    isRegisteredProp !== undefined
      ? isRegisteredProp
      : session !== undefined
      ? Boolean(session)
      : Boolean(asyncRegistered);

  return (
    <footer className="border-t border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0d1526] mt-auto">
      <div className="h-0.5 bg-gradient-to-r from-brand-700 via-brand-600 to-brand-400 opacity-70" aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-4 shrink-0">
              <BrandMark size={72} />
              <div className="leading-tight">
                <span className="font-bold text-xl tracking-tight block text-brand-950 dark:text-white">
                  STATIONERY DEPOT
                </span>
                <span className="text-[11px] text-brand-700 dark:text-brand-300 uppercase tracking-[0.18em] block font-semibold">
                  B2B Trade Wholesale
                </span>
              </div>
            </Link>
            <p className="mt-4 text-sm text-neutral-600 dark:text-slate-300 leading-relaxed">
              Wholesale stationery for South African businesses, schools, and resellers. Browse the range
              online — sign in to see your prices and order.
            </p>
            <RetailSiteLink className="mt-3 inline-flex text-brand-700 hover:text-brand-900 text-sm" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 flex-1">
            <nav aria-label="Shop">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500 dark:text-slate-400 mb-3">
                Shop
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/catalog" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    Browse catalog
                  </Link>
                </li>
                <li>
                  <Link href="/quick-order" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    Quick order
                  </Link>
                </li>
                <li>
                  <Link href="/cart" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    Cart
                  </Link>
                </li>
                <li>
                  <Link href="/orders" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    Orders
                  </Link>
                </li>
              </ul>
            </nav>
            <nav aria-label="Account">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500 dark:text-slate-400 mb-3">
                Account
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/login" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    Open a trade account
                  </Link>
                </li>
                {isRegistered && (
                  <li>
                    <Link href="/account" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                      My account
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
            <nav aria-label="Legal">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500 dark:text-slate-400 mb-3">
                Legal
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/terms" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    Terms of service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    Privacy policy
                  </Link>
                </li>
                <li>
                  <Link href="/popia" className="text-neutral-700 dark:text-slate-300 hover:text-brand-800 hover:underline">
                    POPIA policy
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-neutral-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500 dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} Stationery Depot (Pty) Ltd &middot; South Africa &middot; All rights reserved</p>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-brand-800 hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-brand-800 hover:underline">
              Privacy
            </Link>
            <Link href="/popia" className="hover:text-brand-800 hover:underline">
              POPIA
            </Link>
          </div>
          <p className="font-mono text-[11px]">POPIA Compliant &bull; VAT Reg 4920184729</p>
        </div>
      </div>
    </footer>
  );
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 dark:text-slate-400 dark:text-slate-400 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
