import Link from 'next/link';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';
import { CartService } from '@/lib/services/cart';
import { RequisitionService } from '@/lib/services/requisition';
import { findProducts } from '@/lib/repo/mongo';
import { SiteHeader, SiteFooter, PageHeading, type SiteNavItem } from '@/app/components/brand-header';
import { TradeGateCard } from '@/app/components/trade-gate-card';
import { QuickOrderView } from './quick-order-view';

export default async function QuickOrderPage() {
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
            title="Quick Order Matrix Protected"
            message="High-throughput SKU ordering, CSV spreadsheet import, and recurring requisition templates are reserved for approved commercial clients."
            pending={session?.status === 'PENDING_APPROVAL'}
          />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const [cart, templates, rawProducts] = await Promise.all([
    CartService.getCart(session.customerId),
    RequisitionService.listTemplates(session.customerId),
    findProducts({ limit: 100 }),
  ]);

  const availableProducts = rawProducts
    .filter((p) => p.active)
    .map((p) => ({
      sku: p._id,
      name: p.name,
    }));

  const nav: SiteNavItem[] = [
    { href: '/catalog', label: 'Catalog', icon: 'catalog' },
    { href: '/quick-order', label: 'Quick Order', icon: 'quick', active: true },
    { href: '/cart', label: 'Cart', icon: 'cart' },
    { href: '/orders', label: 'Orders', icon: 'orders' },
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
          title="B2B Quick Order & Requisitions"
          subtitle="High-throughput SKU matrix, CSV bulk upload, and reusable recurring requisition lists."
          actions={
            <Link href="/cart" className="btn-secondary text-xs">
              Wholesale Cart &rarr;
            </Link>
          }
        />

        <div className="mt-6">
          <QuickOrderView
            csrfToken={session.csrfToken}
            initialTemplates={templates}
            availableProducts={availableProducts}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
