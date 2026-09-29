import Link from 'next/link';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';
import { CartService } from '@/lib/services/cart';
import { SiteHeader, SiteFooter, PageHeading, type SiteNavItem } from '@/app/components/brand-header';
import { TradeGateCard } from '@/app/components/trade-gate-card';
import { CartView } from './cart-view';

export default async function CartPage() {
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
            title="Wholesale Cart Protected"
            message="Order building, trade pricing, and inventory reservation are reserved for approved commercial clients. If your registration is pending staff review, access unlocks upon approval."
            pending={session?.status === 'PENDING_APPROVAL'}
          />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const cart = await CartService.getCart(session.customerId);

  const nav: SiteNavItem[] = [
    { href: '/catalog', label: 'Catalog', icon: 'catalog' },
    { href: '/quick-order', label: 'Quick Order', icon: 'quick' },
    { href: '/cart', label: 'Cart', icon: 'cart', active: true },
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
          title="Wholesale Cart & Checkout"
          subtitle="B2B commercial order builder. Your cart is saved automatically as you shop."
          actions={
            <Link href="/catalog" className="btn-secondary text-xs">
              &larr; Continue Shopping
            </Link>
          }
        />

        <div className="mt-6">
          <CartView initialCart={cart} csrfToken={session.csrfToken} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
