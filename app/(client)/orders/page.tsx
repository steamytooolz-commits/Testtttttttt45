import Link from 'next/link';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';
import { OrderHistoryService } from '@/lib/services/order_history';
import { SiteHeader, SiteFooter, PageHeading, type SiteNavItem } from '@/app/components/brand-header';
import { TradeGateCard } from '@/app/components/trade-gate-card';
import { OrdersView } from './orders-view';

export default async function OrdersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await authenticateSession(token) : null;

  const isApproved = session !== null && session.status === 'APPROVED';

  if (!session || !isApproved || !session.customerId) {
    return (
      <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
        <SiteHeader session={null} nav={[{ href: '/catalog', label: 'Catalog', icon: 'catalog' }]} />
        <main className="flex-1">
          <TradeGateCard
            title="Order History Protected"
            message="Wholesale purchasing history, live status tracking, and one-click repeat orders are reserved for approved commercial clients."
            pending={session?.status === 'PENDING_APPROVAL'}
          />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const orders = await OrderHistoryService.listCustomerOrders(session.customerId);

  const nav: SiteNavItem[] = [
    { href: '/catalog', label: 'Catalog', icon: 'catalog' },
    { href: '/quick-order', label: 'Quick Order', icon: 'quick' },
    { href: '/cart', label: 'Cart', icon: 'cart' },
    { href: '/orders', label: 'Orders', icon: 'orders', active: true },
    { href: '/invoices', label: 'Invoices', icon: 'invoices' },
    { href: '/account', label: 'My Account', icon: 'account' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
      <SiteHeader
        session={{ email: session.email, role: session.role, status: session.status, csrfToken: session.csrfToken }}
        nav={nav}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <PageHeading
          title="Purchase History & Orders"
          subtitle="Review live fulfilment status, immutable line snapshots, and one-click repeat replenishment."
          actions={
            <Link href="/invoices" className="btn-secondary text-xs">
              View Sales Invoices &rarr;
            </Link>
          }
        />

        <div className="mt-6">
          <OrdersView initialOrders={orders} csrfToken={session.csrfToken} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
