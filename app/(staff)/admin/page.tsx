import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';
import { AdminService } from '@/lib/services/admin';
import { findProducts } from '@/lib/repo/mongo';
import { SiteHeader, SiteFooter, PageHeading, type SiteNavItem } from '@/app/components/brand-header';
import { AdminView } from './admin-view';

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await authenticateSession(token) : null;

  const isStaffOrAdmin = session !== null && (session.role === 'SALES_STAFF' || session.role === 'ADMIN');

  if (!session || !isStaffOrAdmin) {
    notFound();
  }

  const [customers, inventory, taxReport, auditLogs, products] = await Promise.all([
    AdminService.listCustomers(),
    AdminService.listInventoryStock(),
    AdminService.getTaxReport(),
    AdminService.listAuditLogs({ limit: 100 }),
    findProducts({ activeOnly: false, limit: 500 }),
  ]);

  const nav: SiteNavItem[] = [
    { href: '/queue', label: 'Fulfillment Queue', icon: 'queue' },
    { href: '/admin', label: 'Admin & Governance', icon: 'admin', active: true },
    { href: '/catalog', label: 'Catalog', icon: 'catalog' },
  ];

  const pendingCustomers = customers.filter((c) => c.status === 'PENDING_APPROVAL').length;
  const approvedCustomers = customers.filter((c) => c.status === 'APPROVED').length;
  const lowStock = inventory.filter((i) => i.available <= 50).length;
  const outOfStock = inventory.filter((i) => i.available === 0).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] dark:bg-[#0a1220]">
      <SiteHeader
        session={{ email: session.email, role: session.role, status: session.status, csrfToken: session.csrfToken }}
        nav={nav}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px] font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Business Operations • Live
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Business Administration</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
              Customer lifecycle, quoted pricing, inventory control, and financial compliance — all in one authentic business workspace.
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
            <span className="px-3 py-2 rounded-lg bg-white border border-slate-200 shadow-sm">{new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className="px-3 py-2 rounded-lg bg-ink text-white font-semibold shadow-sm">{session.role}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#101a2c] border border-slate-200/70 dark:border-white/10 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Customers</p>
              <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">◧</span>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">{customers.length}</p>
            <p className="text-xs text-slate-500 mt-1">{approvedCustomers} approved • {pendingCustomers} pending</p>
          </div>
          <div className="bg-white dark:bg-[#101a2c] border border-slate-200/70 dark:border-white/10 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pending Approvals</p>
              <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">◨</span>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-amber-700">{pendingCustomers}</p>
            <p className="text-xs text-slate-500 mt-1">Requires sales review</p>
          </div>
          <div className="bg-white dark:bg-[#101a2c] border border-slate-200/70 dark:border-white/10 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Inventory Health</p>
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">⬢</span>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">{inventory.length} SKUs</p>
            <p className="text-xs mt-1"><span className={lowStock > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700'}>{lowStock} low</span> • <span className={outOfStock > 0 ? 'text-rose-700 font-semibold' : 'text-slate-500'}>{outOfStock} out</span></p>
          </div>
          <div className="bg-ink text-white rounded-xl p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-200">Financial Register</p>
            <p className="mt-3 text-2xl font-extrabold">{taxReport.totalInvoicesCount} invoices</p>
            <p className="text-xs text-brand-200 mt-1">R {taxReport.totalGrossCents} gross • VAT R {taxReport.vatCents}</p>
          </div>
        </div>

        <div className="mt-8">
          <AdminView
            initialCustomers={customers}
            initialInventory={inventory}
            initialTaxReport={taxReport}
            initialAuditLogs={auditLogs}
            initialProducts={products}
            csrfToken={session.csrfToken}
            userRole={session.role}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
