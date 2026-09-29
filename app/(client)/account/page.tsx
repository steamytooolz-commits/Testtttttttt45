import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Eye } from 'lucide-react';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';
import { AdminService } from '@/lib/services/admin';
import { SiteHeader, SiteFooter, type SiteNavItem } from '@/app/components/brand-header';
import { AccountTabs } from './account-tabs';
import { StaffPreviewPicker } from './staff-preview-picker';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; tab?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await authenticateSession(token) : null;

  if (!session || session.status !== 'APPROVED') {
    notFound();
  }

  if (session.role === 'SALES_STAFF' || session.role === 'ADMIN') {
    const params = await searchParams;
    const customers = await AdminService.listCustomers();
    const previewId = params.customerId ? Number(params.customerId) : NaN;
    const previewCustomer = Number.isInteger(previewId)
      ? customers.find((c) => c.id === previewId) || null
      : null;

    const nav: SiteNavItem[] = [
      { href: '/catalog', label: 'Catalog', icon: 'catalog' },
      { href: '/queue', label: 'Staff Queue', icon: 'queue' },
      { href: '/admin', label: 'Admin', icon: 'admin' },
      { href: '/account', label: 'Account Preview', icon: 'account', active: true },
    ];

    return (
      <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
        <SiteHeader
          session={{ email: session.email, role: session.role, status: session.status, csrfToken: session.csrfToken }}
          nav={nav}
        />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          <div className="rounded-md border border-purple-200 bg-purple-50 px-4 py-3 text-xs text-purple-900 leading-relaxed flex items-start gap-2">
            <Eye className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>Staff preview mode.</strong> Select a customer to see exactly what they see in their portal —
              useful for support calls. Read-only; nothing here acts as the customer.
            </span>
          </div>

          <StaffPreviewPicker
            customers={customers.map((c) => ({ id: c.id, company_name: c.company_name, status: c.status }))}
            selectedId={previewCustomer?.id ?? null}
          />

          {previewCustomer ? (
            <AccountTabs customerId={previewCustomer.id} />
          ) : (
            <div className="card p-8 text-center text-sm text-neutral-500 dark:text-slate-400">
              Choose a customer above to preview their portal.
            </div>
          )}
        </main>

        <SiteFooter />
      </div>
    );
  }

  if (session.role !== 'CUSTOMER' || !session.customerId) {
    notFound();
  }

  const nav: SiteNavItem[] = [
    { href: '/catalog', label: 'Catalog', icon: 'catalog' },
    { href: '/quick-order', label: 'Quick Order', icon: 'quick' },
    { href: '/cart', label: 'Cart', icon: 'cart' },
    { href: '/orders', label: 'Orders', icon: 'orders' },
    { href: '/invoices', label: 'Invoices', icon: 'invoices' },
    { href: '/account', label: 'My Account', icon: 'account', active: true },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
      <SiteHeader
        session={{ email: session.email, role: session.role, status: session.status, csrfToken: session.csrfToken }}
        nav={nav}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <AccountTabs />
      </main>

      <SiteFooter />
    </div>
  );
}
