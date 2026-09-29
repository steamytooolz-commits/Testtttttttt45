import Link from 'next/link';
import { cookies } from 'next/headers';
import { PackageSearch, ShieldQuestion, Lock } from 'lucide-react';
import { CatalogService } from '@/lib/services/catalog';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';
import { SiteHeader, SiteFooter, PageHeading, type SiteNavItem } from '@/app/components/brand-header';

interface PageProps {
  searchParams: Promise<{
    categoryRef?: string;
    paperWeight?: string;
    packCount?: string;
    colour?: string;
  }>;
}

export default async function CatalogPage(props: PageProps) {
  const searchParams = await props.searchParams;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await authenticateSession(token) : null;

  const categoryRef = searchParams.categoryRef?.trim() || undefined;
  const paperWeight = searchParams.paperWeight?.trim() || undefined;
  const packCountRaw = searchParams.packCount ? Number(searchParams.packCount) : undefined;
  const packCount =
    packCountRaw !== undefined && Number.isInteger(packCountRaw) && packCountRaw > 0
      ? packCountRaw
      : undefined;
  const colour = searchParams.colour?.trim() || undefined;

  const catalog = await CatalogService.getCatalog(
    { categoryRef, paperWeight, packCount, colour },
    session
  );

  const categories = await CatalogService.getCategories();
  const isApproved = catalog.trade_gate.is_approved;

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
    ...(session && (session.role === 'SALES_STAFF' || session.role === 'ADMIN')
      ? [{ href: '/queue', label: 'Staff Queue', icon: 'queue' } as SiteNavItem]
      : []),
  ];

  const buildFilterUrl = (overrides: Record<string, string | number | undefined>) => {
    const current: Record<string, string> = {};
    if (categoryRef) current.categoryRef = categoryRef;
    if (paperWeight) current.paperWeight = paperWeight;
    if (packCount) current.packCount = String(packCount);
    if (colour) current.colour = colour;

    for (const [key, val] of Object.entries(overrides)) {
      if (val === undefined || val === '') {
        delete current[key];
      } else {
        current[key] = String(val);
      }
    }

    const qs = new URLSearchParams(current).toString();
    return qs ? `/catalog?${qs}` : '/catalog';
  };

  const hasActiveFilters = categoryRef || paperWeight || packCount || colour;

  const chip = (selected: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
      selected
        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
        : 'bg-white dark:bg-white/[0.04] text-neutral-700 border-neutral-300 hover:border-brand-400 hover:text-brand-800'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
      <SiteHeader
        session={session ? { email: session.email, role: session.role, status: session.status, csrfToken: session.csrfToken } : null}
        nav={nav}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <PageHeading
          title="Catalog"
          subtitle={
            isApproved
              ? catalog.trade_gate.quotedCount === 0
                ? 'Your account is approved — quoted prices will appear once your sales representative loads them.'
                : `Showing ${catalog.trade_gate.quotedCount} of ${catalog.trade_gate.totalCount} items with your quoted prices.`
              : 'Browse the range — sign up to see your quoted prices.'
          }
          actions={
            <span className="text-sm text-neutral-500 dark:text-slate-400 font-mono">
              {catalog.products.length} item{catalog.products.length === 1 ? '' : 's'}
            </span>
          }
        />

        {!isApproved && (
          <div
            id="trade-gate-banner"
            className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 p-5 shadow-card"
          >
            <div className="flex items-start gap-3">
              <ShieldQuestion className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-amber">Sign up for prices</span>
                  <span className="text-sm font-semibold text-amber-950">
                    {catalog.trade_gate.status === 'PENDING_APPROVAL'
                      ? 'Your account is being set up'
                      : 'Prices are hidden until you have an account'}
                  </span>
                </div>
                <p className="text-sm text-amber-900 leading-relaxed">{catalog.trade_gate.message}</p>
              </div>
            </div>
            {!session && (
              <Link href="/register" className="btn-dark shrink-0 whitespace-nowrap">
                Sign up to view pricing
              </Link>
            )}
          </div>
        )}

        {isApproved && (
          <div
            id="trade-status-banner"
            className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 shadow-card"
          >
            <div className="flex items-center gap-3">
              <span className="badge-emerald">Signed in</span>
              <span className="text-sm text-emerald-950">
                {catalog.trade_gate.quotedCount === 0
                  ? 'No quoted prices yet — contact sales if you need an item priced.'
                  : `${catalog.trade_gate.quotedCount} item${catalog.trade_gate.quotedCount === 1 ? '' : 's'} with your quoted prices — others are hidden until quoted.`}
              </span>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-64 shrink-0">
            <div className="card p-5 lg:sticky lg:top-24">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-100">
                <h2 className="kicker text-neutral-900 dark:text-slate-200">Filters</h2>
                {hasActiveFilters && (
                  <Link href="/catalog" className="text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline">
                    Reset all
                  </Link>
                )}
              </div>

              <div className="mb-6">
                <label className="field-label">Category</label>
                <div className="space-y-1 text-sm">
                  <Link
                    href={buildFilterUrl({ categoryRef: undefined })}
                    className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      !categoryRef ? 'bg-brand-950 text-white shadow-sm' : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    All Categories
                  </Link>
                  {categories.map((cat) => (
                    <Link
                      key={cat._id}
                      href={buildFilterUrl({ categoryRef: cat._id })}
                      className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        categoryRef === cat._id
                          ? 'bg-brand-950 text-white shadow-sm'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="field-label">Paper Weight</label>
                <div className="flex flex-wrap gap-2">
                  <Link href={buildFilterUrl({ paperWeight: undefined })} className={chip(!paperWeight)}>
                    Any
                  </Link>
                  {['75gsm', '80gsm'].map((weight) => (
                    <Link key={weight} href={buildFilterUrl({ paperWeight: weight })} className={chip(paperWeight === weight)}>
                      {weight}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="field-label">Pack Count</label>
                <div className="flex flex-wrap gap-2">
                  <Link href={buildFilterUrl({ packCount: undefined })} className={chip(!packCount)}>
                    Any
                  </Link>
                  {[50, 500].map((cnt) => (
                    <Link key={cnt} href={buildFilterUrl({ packCount: cnt })} className={chip(packCount === cnt)}>
                      {cnt} units
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <label className="field-label">Colour</label>
                <div className="flex flex-wrap gap-2">
                  <Link href={buildFilterUrl({ colour: undefined })} className={chip(!colour)}>
                    Any
                  </Link>
                  {['White', 'Blue', 'Black', 'Red'].map((c) => (
                    <Link key={c} href={buildFilterUrl({ colour: c })} className={chip(colour === c)}>
                      {c}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div className="flex-1">
            {catalog.products.length === 0 ? (
              <div className="card p-14 text-center">
                <PackageSearch className="w-10 h-10 text-neutral-300 mx-auto mb-3" aria-hidden="true" />
                <p className="font-semibold text-neutral-900 dark:text-slate-200">No matching products found</p>
                <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1 mb-5">Try adjusting your attribute filter criteria.</p>
                <Link href="/catalog" className="btn-primary">
                  Clear Filters
                </Link>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {catalog.products.map((prod) => {
                  const hasQuotedPrice = isApproved && 'unit_price' in prod && typeof (prod as { unit_price?: string }).unit_price === 'string';
                  const quotedPrice = hasQuotedPrice ? (prod as { unit_price: string }).unit_price : null;
                  return (
                    <div
                      key={prod._id}
                      id={`product-card-${prod._id}`}
                      className="card overflow-hidden flex flex-col justify-between hover:shadow-lift hover:border-brand-300 transition-all"
                    >
                      <div className="relative">
                        <img
                          src={prod.imageUrl || '/product-placeholder.svg'}
                          alt={prod.name}
                          loading="lazy"
                          className="w-full h-44 object-cover bg-brand-50 border-b border-neutral-100"
                        />
                        {prod.attributes.packCount ? (
                          <span className="absolute top-3 left-3 rounded-md bg-brand-950/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                            Pack of {prod.attributes.packCount}
                          </span>
                        ) : null}
                      </div>

                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-[11px] font-bold text-brand-800 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded">
                            {prod.sku}
                          </span>
                          <span className="text-[11px] text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                            {prod.categoryRef.replace('cat-', '')}
                          </span>
                        </div>

                        <h3 className="font-bold text-neutral-950 dark:text-slate-100 leading-snug">
                          <Link href={`/catalog/${prod.sku}`} className="hover:text-brand-800 transition-colors">
                            {prod.name}
                          </Link>
                        </h3>

                        <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-4">
                          {prod.description}
                        </p>

                        <div className="mt-auto">
                          {hasQuotedPrice && quotedPrice ? (
                            <div className="pt-4 border-t border-neutral-100">
                              <div className="flex items-end justify-between">
                                <div>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-xs font-mono text-neutral-400">R</span>
                                    <span className="text-2xl font-extrabold text-neutral-950 dark:text-slate-100 font-mono tracking-tight">
                                      {quotedPrice}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-neutral-500 dark:text-slate-400 mt-0.5">Your quoted price &middot; excl. VAT</div>
                                </div>
                                <span className="badge-emerald">In Stock</span>
                              </div>
                              <Link
                                href={`/catalog/${prod.sku}`}
                                className="btn-primary w-full mt-4 py-2 text-xs uppercase tracking-wider"
                              >
                                View Item Details
                              </Link>
                            </div>
                          ) : isApproved ? (
                            <div className="pt-4 border-t border-neutral-100">
                              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-center mb-3">
                                <span className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-800">
                                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                                  No quoted price
                                </span>
                                <span className="text-[11px] text-amber-700 block mt-0.5">Contact sales to have this item quoted</span>
                              </div>
                              <Link href={`/catalog/${prod.sku}`} className="btn-secondary w-full py-2 text-xs">
                                View Details
                              </Link>
                            </div>
                          ) : (
                            <div className="pt-4 border-t border-neutral-100">
                              <div className="rounded-md bg-neutral-100 dark:bg-white/[0.08] px-3 py-2.5 text-center mb-3">
                                <span className="flex items-center justify-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-slate-300">
                                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                                  Sign up to see your price
                                </span>
                                <span className="text-[11px] text-neutral-500 dark:text-slate-400 block mt-0.5">Everyone signs up — even existing store clients</span>
                              </div>
                              <Link href="/register" className="btn-secondary w-full py-2 text-xs">
                                Sign Up to View
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
