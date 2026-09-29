import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';
import { StaffQueueService } from '@/lib/services/staff_queue';
import { SiteHeader, SiteFooter, PageHeading, type SiteNavItem } from '@/app/components/brand-header';
import { QueueView } from './queue-view';

export default async function StaffQueuePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await authenticateSession(token) : null;

  const isStaffOrAdmin = session !== null && (session.role === 'SALES_STAFF' || session.role === 'ADMIN');

  if (!session || !isStaffOrAdmin) {
    notFound();
  }

  const initialOrders = await StaffQueueService.getQueue({ limit: 100 });
  const pending = initialOrders.filter((o) => o.status === 'PENDING_SALES_REVIEW').length;
  const approved = initialOrders.filter((o) => o.status === 'APPROVED').length;
  const invoiced = initialOrders.filter((o) => o.status === 'INVOICED').length;

  const nav: SiteNavItem[] = [
    { href: '/queue', label: 'Fulfillment Queue', icon: 'queue', active: true },
    { href: '/admin', label: 'Admin & Governance', icon: 'admin' },
    { href: '/catalog', label: 'Catalog', icon: 'catalog' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] dark:bg-[#0a1220]">
      <SiteHeader
        session={{ email: session.email, role: session.role, status: session.status, csrfToken: session.csrfToken }}
        nav={nav}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Fulfillment • Live queue auto-refresh 30s
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Order Fulfillment</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
              Review wholesale orders, approve, issue sequential sales invoices, and dispatch — authentic business flow, audited.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-2 rounded-lg bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700">{pending} pending</span>
            <span className="px-3 py-2 rounded-lg bg-ink text-white text-xs font-bold shadow-sm">{approved} approved • {invoiced} invoiced</span>
          </div>
        </div>

        <div className="mt-6">
          <QueueView initialOrders={initialOrders} csrfToken={session.csrfToken} userRole={session.role} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
