import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ChevronRight, Lock, ShieldCheck, FileText } from 'lucide-react';
import { findProductBySku } from '@/lib/repo/mongo';
import { CatalogService } from '@/lib/services/catalog';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';
import { SiteHeader, SiteFooter, type SiteNavItem } from '@/app/components/brand-header';
import { AddToCartForm } from './add-to-cart-form';

interface PageProps {
  params: Promise<{ sku: string }>;
}

export default async function ProductDetailPage(props: PageProps) {
  const { sku: rawSku } = await props.params;
  const sku = rawSku.trim().toUpperCase();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await authenticateSession(token) : null;

  const rawProduct = await findProductBySku(sku);
  if (!rawProduct || !rawProduct.active) {
    notFound();
  }

  const isApproved = session !== null && session.status === 'APPROVED';

  let unitPrice: string | null = null;

  if (isApproved) {
    const priced = await CatalogService.getCustomerTierPrice(session.customerId || 0, sku);
    unitPrice = priced?.unitPrice || null;
  }

  const nav: SiteNavItem[] = [
    { href: '/catalog', label: 'Catalog', icon: 'catalog', active: true },
    ...(isApproved
      ? ([
          { href: '/quick-order', label: 'Quick Order', icon: 'quick' },
          { href: '/cart', label: 'Cart', icon: 'cart' },
          { href: '/orders', label: 'Orders', icon: 'orders' },
          { href: '/invoices', label: 'Invoices', icon: 'invoices' },
          { href: '/account', label: 'My Account', icon: 'account' },
        ] as SiteNavItem[])
      : []),
  ];

  const specs = [
    rawProduct.attributes.paperWeight ? { label: 'Paper Weight', value: rawProduct.attributes.paperWeight } : null,
    rawProduct.attributes.packCount ? { label: 'Pack Quantity', value: `${rawProduct.attributes.packCount} units` } : null,
    rawProduct.attributes.colour ? { label: 'Colour', value: rawProduct.attributes.colour } : null,
    { label: 'Compliance', value: 'Commercial Standard' },
  ].filter((s): s is { label: string; value: string } => s !== null);

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
      <SiteHeader
        session={session ? { email: session.email, role: session.role, status: session.status, csrfToken: session.csrfToken } : null}
        nav={nav}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-slate-400 mb-6">
          <Link href="/catalog" className="hover:text-brand-800 hover:underline">
            Catalog
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-neutral-300" aria-hidden="true" />
          <span className="capitalize">{rawProduct.categoryRef.replace('cat-', '')}</span>
          <ChevronRight className="w-3.5 h-3.5 text-neutral-300" aria-hidden="true" />
          <span className="font-mono font-bold text-neutral-900 dark:text-slate-200">{rawProduct._id}</span>
        </nav>

        <div className="card grid md:grid-cols-2 gap-8 p-6 sm:p-8">
          <div>
            <div className="rounded-lg border border-neutral-100 bg-brand-50/60 overflow-hidden mb-6">
              <img
                src={rawProduct.imageUrl || '/product-placeholder.svg'}
                alt={rawProduct.name}
                className="w-full h-72 object-cover"
              />
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-[11px] font-bold text-brand-800 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded">
                SKU: {rawProduct._id}
              </span>
              <span className="text-[11px] text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                {rawProduct.categoryRef.replace('cat-', '')}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-950 dark:text-slate-100 tracking-tight leading-snug mb-3">
              {rawProduct.name}
            </h1>

            <p className="text-sm text-neutral-600 dark:text-slate-300 leading-relaxed mb-6">{rawProduct.description}</p>

            <h2 className="kicker text-neutral-900 dark:text-slate-200 mb-3">Technical Specifications</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px rounded-md overflow-hidden border border-neutral-100 bg-neutral-100 dark:bg-white/[0.08] text-xs">
              {specs.map((s) => (
                <div key={s.label} className="bg-white dark:bg-white/[0.04] p-3.5">
                  <dt className="text-neutral-500 dark:text-slate-400 mb-0.5">{s.label}</dt>
                  <dd className="font-semibold text-neutral-900 dark:text-slate-200">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-col border-t md:border-t-0 md:border-l border-neutral-200 md:pl-8 pt-6 md:pt-0">
            {isApproved && unitPrice ? (
              <div className="space-y-6">
                <div className="rounded-lg bg-brand-950 text-white p-6 shadow-lift">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-200 block mb-2">
                    Your Quoted Price
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-mono text-brand-200">R</span>
                    <span className="text-5xl font-extrabold font-mono tracking-tight">{unitPrice}</span>
                    <span className="text-xs font-mono text-brand-200">excl. VAT</span>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10 text-xs text-brand-100 flex items-center justify-between">
                    <span>Live stock · ready to add to cart</span>
                    <span className="badge-emerald">In Stock</span>
                  </div>
                </div>

                <div className="notice-info text-xs flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>VAT invoice included:</strong> 15% VAT is added at checkout and a PDF invoice is
                    issued with every order.
                  </span>
                </div>

                <AddToCartForm sku={sku} csrfToken={session?.csrfToken || ''} />
              </div>
            ) : isApproved ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 flex flex-col justify-between h-full text-amber-950">
                <div>
                  <span className="badge-amber mb-3">No quoted price</span>
                  <h3 className="flex items-center gap-2 font-bold text-base mb-2">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    Not yet quoted
                  </h3>
                  <p className="text-xs leading-relaxed text-amber-900 mb-3">
                    This item does not have a quoted price on your account yet. Contact your sales representative to have it quoted — once quoted it will appear here and be orderable.
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    Need it urgently? Call sales — they can quote and approve instantly.
                  </p>
                </div>
                <div className="pt-6 border-t border-amber-200">
                  <Link href="/catalog" className="btn-secondary w-full py-2.5 text-xs uppercase tracking-wider">
                    Back to Catalog
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 flex flex-col justify-between h-full text-amber-950">
                <div>
                  <span className="badge-amber mb-3">Sign up for prices</span>
                  <h3 className="flex items-center gap-2 font-bold text-base mb-2">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    See your price in seconds
                  </h3>
                  <p className="text-xs leading-relaxed text-amber-900 mb-3">
                    Prices are hidden until you have an account. Everyone signs up — even if you already buy
                    from our store. Create an account in about two minutes and tick “already a client”.
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    If you just registered, we are getting your account ready — your prices appear automatically.
                  </p>
                </div>

                <div className="pt-6 border-t border-amber-200 space-y-2 mt-6">
                  <Link href="/register" className="btn-dark w-full py-2.5 text-xs uppercase tracking-wider">
                    Create account
                  </Link>
                  <Link href="/login" className="btn-secondary w-full py-2.5 text-xs uppercase tracking-wider">
                    Already have a login? Sign in
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
