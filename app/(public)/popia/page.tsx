import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SiteHeader, SiteFooter, BrandMark } from '@/app/components/brand-header';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';

export const metadata: Metadata = {
  title: 'POPIA Policy | Stationery Depot',
  description: 'How Stationery Depot meets the eight conditions of POPIA.',
};

const UPDATED = '13 September 2026';

const CONDITIONS: Array<{ title: string; body: string }> = [
  { title: '1. Accountability', body: 'We take responsibility for your information. Our Information Officer ([Information Officer name], [Information Officer email]) oversees how data is collected, used, stored, and deleted.' },
  { title: '2. Processing limitation', body: 'We collect the minimum needed — account details, orders, invoices, and sign-in data — directly from you, and only with a lawful basis such as your consent, our contract with you, a legal duty, or a legitimate business interest.' },
  { title: '3. Purpose specification', body: 'Your information is used for the purpose you gave it: running your account, showing your prices, processing orders, invoicing, delivery, and support. Tax records are kept for at least 5 years as the law requires.' },
  { title: '4. Further processing limitation', body: 'We do not repurpose order or account data for unrelated uses. Order details never silently become a marketing list — marketing only happens with separate permission and always has an opt-out.' },
  { title: '5. Information quality', body: 'You can review and correct your details in My Account or by emailing us, so invoices and deliveries stay accurate.' },
  { title: '6. Openness', body: 'This page, our Privacy Policy, and our Terms tell you who we are, what we collect, why, who sees it, and how to contact us — before and while we hold your information.' },
  { title: '7. Security safeguards', body: 'Hashed passwords, mandatory two-factor sign-in, expiring CSRF-bound sessions, validated uploads, role-based staff access, and encrypted hosting with backups. Providers who handle data for us work under written security duties.' },
  { title: '8. Your participation', body: 'You may ask what we hold, ask for corrections, ask for deletion of anything we are no longer authorised to keep, object to processing, and complain to the Information Regulator. Financial records under legal hold are preserved, not deleted.' },
];

export default async function PopiaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await authenticateSession(token) : null;

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
      <SiteHeader
        session={session ? { email: session.email, role: session.role, status: session.status, csrfToken: session.csrfToken } : null}
        nav={[{ href: '/catalog', label: 'Catalog', icon: 'catalog' }]}
      />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center gap-4 mb-6">
          <BrandMark size={64} />
          <div>
            <p className="kicker text-brand-700">Legal</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-950 dark:text-slate-100">
              POPIA policy
            </h1>
            <p className="text-xs text-neutral-500 mt-1">Last updated: {UPDATED}</p>
          </div>
        </div>

        <div className="card p-6 sm:p-10 space-y-8 text-sm leading-relaxed text-neutral-700 dark:text-slate-300">
          <p>
            The Protection of Personal Information Act 4 of 2013 (POPIA) protects both individuals and
            identifiable businesses. This page explains, in plain language, how we meet its eight conditions
            on this trade portal. Our <Link className="text-brand-700 underline" href="/privacy">Privacy policy</Link> has
            the full detail of what we collect and how to contact us.
          </p>

          <div className="space-y-5">
            {CONDITIONS.map((c) => (
              <section key={c.title} className="rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.04] p-4">
                <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-sm mb-1">{c.title}</h2>
                <p className="text-sm">{c.body}</p>
              </section>
            ))}
          </div>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">How to exercise your rights</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Email <strong>[Information Officer email]</strong> with “POPIA request” in the subject line and tell us what you need (access, correction, or deletion).</li>
              <li>We will verify your identity against the account before sharing anything.</li>
              <li>If we must keep something by law (for example a VAT invoice), we will explain why and keep only what the law requires.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">Direct marketing (POPIA s69; CPA s11; ECTA s45)</h2>
            <p>
              We do not pre-tick marketing consent and do not add buyers to marketing lists automatically.
              Where you agree to marketing, every message identifies us and carries a free opt-out, honoured
              promptly. You may demand we stop all direct marketing at any time. Continuing to send
              communications you have rejected is an offence under ECTA s45. Our full approach is in the{' '}
              <Link className="text-brand-700 underline" href="/privacy">Privacy policy</Link> and forms part
              of our <Link className="text-brand-700 underline" href="/terms">Terms of service</Link>.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">PAIA and related consumer law</h2>
            <p>
              Our Promotion of Access to Information Act 2 of 2000 (PAIA) manual — the records we hold and
              how to request access — is available from the Information Officer. Online-consumer rights
              (ECTA ss43–46 cooling-off and performance, CPA ss55–56 quality warranty and ss19–20 delivery)
              and where to complain (CGSO, NCC) are set out in our{' '}
              <Link className="text-brand-700 underline" href="/terms">Terms of service</Link>.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">Breach notification</h2>
            <p>
              If we suspect your information has been unlawfully accessed, we will notify you and the
              Information Regulator as POPIA requires, with what happened, what may be affected, and what we
              are doing about it.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">Complain to the Regulator</h2>
            <p>
              Information Regulator (South Africa): 010 023 5200 / 0800 017 160,{' '}
              <a className="text-brand-700 underline" href="mailto:POPIAComplaints@inforegulator.org.za">POPIAComplaints@inforegulator.org.za</a>,{' '}
              Woodmead North Office Park, 54 Maxwell Drive, Woodmead, Johannesburg, 2191 —{' '}
              <a className="text-brand-700 underline" href="https://inforegulator.org.za" target="_blank" rel="noreferrer">inforegulator.org.za</a>.
            </p>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/terms" className="btn-secondary">Terms of service</Link>
          <Link href="/privacy" className="btn-secondary">Privacy policy</Link>
          <Link href="/register" className="btn-primary">Create your account</Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
