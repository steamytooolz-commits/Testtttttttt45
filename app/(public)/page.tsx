import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  ShieldCheck,
  ClipboardCheck,
  FileText,
  Landmark,
  PackageCheck,
  ArrowRight,
} from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/app/components/brand-header';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';

const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'Made For Businesses Like Yours',
    body: 'Whether you are opening your first trade account or you already buy from us — schools, offices, and resellers order here in minutes.',
  },
  {
    icon: Landmark,
    title: 'Your Prices, On Sign-In',
    body: 'Browse the full range freely. Your trade prices appear as soon as you sign in — simple, private, and always up to date.',
  },
  {
    icon: FileText,
    title: 'Clean Invoices For Your Books',
    body: 'Every order comes with a proper VAT sales invoice as a PDF download — easy for your accountant and your records.',
  },
  {
    icon: ClipboardCheck,
    title: 'Fast Reordering',
    body: 'Quick-order grids, CSV uploads for bulk lists, and saved templates for the items you buy every month.',
  },
  {
    icon: PackageCheck,
    title: 'Reliable Stock',
    body: 'Live availability on every product. If plans change, cancelled items go straight back into stock — no surprises.',
  },
  {
    icon: ShieldCheck,
    title: 'Safe And Secure',
    body: 'Two-factor sign-in, protected sessions, and careful handling of your business information in line with POPIA.',
  },
];

const FLOW = [
  { step: '01', title: 'New here? Register', body: 'Tell us about your business in about two minutes. Already a client? Use the same form — we will link your account.' },
  { step: '02', title: 'We verify your account', body: 'Our team confirms your details so your prices and ordering unlock correctly.' },
  { step: '03', title: 'Sign in and order', body: 'See your prices, add to cart, use quick-order, or upload a CSV — whatever suits you.' },
  { step: '04', title: 'Invoice and delivery', body: 'Get your VAT invoice instantly and track fulfilment through to dispatch.' },
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await authenticateSession(token) : null;
  const isApproved = session?.status === 'APPROVED';

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark overflow-x-hidden">
      <SiteHeader
        session={
          session
            ? {
                email: session.email,
                role: session.role,
                status: session.status,
                csrfToken: session.csrfToken,
              }
            : null
        }
        nav={[
          { href: '/catalog', label: 'Catalog', icon: 'catalog' },
          { href: '/quick-order', label: 'Quick Order', icon: 'quick' },
          { href: '/cart', label: 'Cart', icon: 'cart' },
          ...(isApproved
            ? [
                { href: '/orders', label: 'Orders', icon: 'orders' as const },
                { href: '/invoices', label: 'Invoices', icon: 'invoices' as const },
                { href: '/account', label: 'My Account', icon: 'account' as const },
              ]
            : []),
        ]}
      />

      <section className="relative overflow-hidden bg-brand-950 text-white">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.7) 1px, transparent 0)',
            backgroundSize: '26px 26px',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute -top-40 -right-32 h-[480px] w-[480px] rounded-full bg-brand-600/40 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-400/60 to-transparent" aria-hidden="true" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-16 sm:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/40 bg-brand-900/60 px-3 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-brand-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Trade-only wholesale &middot; South Africa
            </div>

            <h1 className="mt-4 sm:mt-6 text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.12] sm:leading-[1.05]">
              Stationery for your business,
              <span className="block text-brand-300">without the runaround.</span>
            </h1>

            <p className="mt-4 sm:mt-6 text-base sm:text-lg text-brand-100/90 leading-relaxed max-w-2xl">
              New customer or long-standing client — browse paper, writing, filing, and office essentials,
              sign up to see your prices, and check out in minutes with a proper VAT invoice for your records.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              {session ? (
                <>
                  <Link
                    href="/catalog"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-brand-900 font-bold rounded-md transition-colors shadow-lift text-sm sm:text-base"
                  >
                    {isApproved ? 'Browse your catalog' : 'Check account status'}
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/account"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/10 border border-white/25 text-white font-semibold rounded-md hover:bg-white/15 transition-colors text-sm sm:text-base"
                  >
                    My Account
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-md transition-colors shadow-lift text-sm sm:text-base"
                  >
                    Get started — it takes 2 minutes
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/catalog"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white/10 border border-white/25 text-white font-semibold rounded-md hover:bg-white/15 transition-colors text-sm sm:text-base"
                  >
                    Browse the catalog
                  </Link>
                </>
              )}
            </div>

            <div className="mt-10 sm:mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-x-6 sm:gap-y-4 max-w-xl">
              {[
                ['2 min', 'To register your business'],
                ['PDF', 'VAT invoices included'],
                ['2FA', 'Secure sign-in'],
                ['POPIA', 'Your info protected'],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="text-xl font-extrabold text-white font-mono">{value}</div>
                  <div className="text-[11px] text-brand-200 uppercase tracking-wider mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 -mt-10 relative z-10">
          <div className="card p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-4 border-l-4 !border-l-brand-500">
            {session ? (
              <>
                <div className={`badge-${isApproved ? 'emerald' : 'amber'} shrink-0`}>{isApproved ? 'Signed in' : 'Account pending'}</div>
                <p className="text-sm text-neutral-700 leading-relaxed">
                  {isApproved
                    ? `Welcome back — your prices are live in the catalog. Continue to the catalog or your orders from the navigation above.`
                    : `You are signed in as ${session.email} — your account is being set up. Your prices will appear automatically once approved.`}
                </p>
              </>
            ) : (
              <>
                <div className="badge-amber shrink-0">How pricing works</div>
                <p className="text-sm text-neutral-700 leading-relaxed">
                  You can browse the whole range without signing in. To see prices and order, everyone signs
                  up through the form above — new customers and existing store clients alike. Already a
                  client? Tick “already a client” when you sign up and we will link your store pricing to
                  your new login.
                </p>
              </>
            )}
          </div>
        </div>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <p className="kicker text-brand-700">Why shop with us</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-950 dark:text-slate-100">
              Simple ordering for busy teams
            </h2>
            <p className="mt-3 text-neutral-600 dark:text-slate-300 leading-relaxed">
              Everything you need to keep the office, classroom, or shop stocked — in one place.
            </p>
          </div>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-6 hover:shadow-lift transition-shadow">
                <div className="w-10 h-10 rounded-md bg-brand-950 text-white flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-bold text-neutral-950 dark:text-slate-100">{title}</h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-slate-300 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-neutral-200/80 dark:border-white/10 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl">
              <p className="kicker text-brand-700">How it works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-950 dark:text-slate-100">
                From first visit to delivery in four steps
              </h2>
            </div>

            <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {FLOW.map(({ step, title, body }, i) => (
                <li key={step} className="relative card p-6">
                  <span className="text-4xl font-extrabold font-mono text-brand-100 leading-none" aria-hidden="true">
                    {step}
                  </span>
                  <h3 className="mt-3 font-bold text-neutral-950 dark:text-slate-100">{title}</h3>
                  <p className="mt-1.5 text-sm text-neutral-600 dark:text-slate-300 leading-relaxed">{body}</p>
                  {i < FLOW.length - 1 && (
                    <ArrowRight
                      className="hidden lg:block absolute top-1/2 -right-[13px] w-5 h-5 text-brand-300 z-10"
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="relative overflow-hidden rounded-lg bg-brand-950 text-white px-6 sm:px-12 py-14 sm:py-16 shadow-lift">
            <div
              className="absolute inset-0 opacity-[0.1]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.7) 1px, transparent 0)',
                backgroundSize: '26px 26px',
              }}
              aria-hidden="true"
            />
            <div className="relative max-w-2xl">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                {session ? (isApproved ? 'Continue shopping' : 'We are getting you ready') : 'Ready to get your prices?'}
              </h2>
              <p className="mt-4 text-brand-100/90 leading-relaxed text-lg">
                {session
                  ? isApproved
                    ? 'You are signed in — jump back to the catalog or check your orders.'
                    : 'You are signed in — once your account is approved your prices appear automatically. No need to sign in again.'
                  : 'Everyone signs up here — register in two minutes. Already buy from our store? Sign up too and tick “already a client” so we link your pricing.'}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {session ? (
                  <>
                    <Link
                      href="/catalog"
                      className="inline-flex items-center gap-2 px-6 py-3.5 bg-white text-brand-900 font-bold rounded-md transition-colors shadow-lift"
                    >
                      Go to Catalog
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                    <Link
                      href="/account"
                      className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/10 border border-white/25 text-white font-semibold rounded-md hover:bg-white/15 transition-colors"
                    >
                      My Account
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/register"
                      className="inline-flex items-center gap-2 px-6 py-3.5 bg-brand-500 hover:bg-brand-400 text-white font-bold rounded-md transition-colors"
                    >
                      Create your account
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/10 border border-white/25 text-white font-semibold rounded-md hover:bg-white/15 transition-colors"
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter isRegistered={Boolean(session)} />
    </div>
  );
}
