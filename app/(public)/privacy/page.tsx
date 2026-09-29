import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SiteHeader, SiteFooter, BrandMark } from '@/app/components/brand-header';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';

export const metadata: Metadata = {
  title: 'Privacy Policy | Stationery Depot',
  description: 'How Stationery Depot handles your business and personal information under POPIA.',
};

const UPDATED = '13 September 2026';

export default async function PrivacyPage() {
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
              Privacy policy
            </h1>
            <p className="text-xs text-neutral-500 mt-1">Last updated: {UPDATED}</p>
          </div>
        </div>

        <div className="card p-6 sm:p-10 space-y-8 text-sm leading-relaxed text-neutral-700 dark:text-slate-300">
          <p>
            We are <strong>[Company legal name]</strong> (“we”, “us”). This policy explains what
            information we collect when you browse, register, sign in, or order — and what we do with it.
            It is written for the Protection of Personal Information Act 4 of 2013 (POPIA), read with the
            Electronic Communications and Transactions Act 25 of 2002 (ECTA s43(p): security and privacy for
            payment and personal information) and the Consumer Protection Act 68 of 2008 (CPA s26: written
            sales records). It applies to customers that are individuals and, as POPIA requires, to
            identifiable businesses too.
          </p>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">1. Responsible party and Information Officer</h2>
            <p>
              Responsible party: <strong>[Company legal name]</strong>, <strong>[country]</strong>,
              registration number <strong>[registration number]</strong>, <strong>[physical address]</strong>.
              Our Information Officer is <strong>[Information Officer name]</strong> and can be reached at{' '}
              <strong>[Information Officer email]</strong> / <strong>[Information Officer phone]</strong>.
              Full company and address details also appear on every tax invoice. For POPIA requests (access,
              correction, deletion), email the Information Officer with “POPIA request” in the subject line.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">2. What we collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Account details: company name, contact name, business email, phone, delivery address.</li>
              <li>Login and security data: password hash (never the password itself), two-factor settings, session and device identifiers.</li>
              <li>Order data: cart contents, orders, invoices, proofs of payment, delivery notes.</li>
              <li>Support messages and account-review notes (for example approval and contact history).</li>
              <li>Technical data: IP address, basic device and browser information, and strictly necessary cookies/sessions that keep you signed in.</li>
            </ul>
            <p className="mt-2">We collect the minimum needed to run your account and orders — nothing more.</p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">3. Why we use it (and the lawful basis)</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>To run your account and orders</strong> — registration, sign-in, pricing display, checkout, invoicing, delivery (necessary to perform our contract with you).</li>
              <li><strong>To verify accounts and prevent fraud</strong> — checking business details and protecting sign-in (our legitimate interest and your consent at registration).</li>
              <li><strong>To meet legal duties</strong> — VAT invoices, tax records, and audit trails (legal obligation).</li>
              <li><strong>To help you</strong> — responding to queries and order issues (contract and legitimate interest).</li>
              <li><strong>Marketing, only with permission</strong> — we do not add you to marketing lists automatically. Any marketing email has an opt-out, and you can opt out at any time.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">4. Who sees it</h2>
            <p>
              Only our staff who need it (sales, fulfilment, finance, support) and the service providers that
              help us operate — for example hosting, backups, and email delivery for invoices and
              order updates. Everyone with access follows written security and confidentiality duties. We do
              not sell your information.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">5. Where it is kept and cross-border transfers</h2>
            <p>
              Account, order, and invoice data is hosted in South Africa. Where a support tool (for example
              email delivery) routes data outside South Africa, it is protected under a written agreement and
              only what is needed is sent. Catalog browsing data (products and categories) contains no prices
              or personal information.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">6. How long we keep it</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Orders, invoices, and payment records: at least 5 years as tax law requires.</li>
              <li>Account details: for as long as your account is active, plus a reasonable period afterwards for queries and legal duties.</li>
              <li>Support messages and logs: only as long as needed for security, troubleshooting, and legal duties, then removed or anonymised.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">7. How we protect it</h2>
            <p>
              Passwords are stored as strong one-way hashes, sign-in requires two-factor authentication,
              sessions are CSRF-protected and expire automatically, uploads are validated, and access is
              limited by staff role. If a breach is suspected, we will notify you and the Information
              Regulator as POPIA requires.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">8. Your rights</h2>
            <p>You may at any time:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-1">
              <li>Ask what information we hold about you or your business and get a copy.</li>
              <li>Ask us to correct anything inaccurate or out of date.</li>
              <li>Ask us to delete information we are no longer authorised to keep (we must keep invoices and financial records by law).</li>
              <li>Object to processing based on legitimate interest, and opt out of any direct marketing.</li>
            </ul>
            <p className="mt-2">
              Email <strong>[Information Officer email]</strong> to exercise any right. If you are not
              satisfied, you may complain to the Information Regulator: 010 023 5200 / 0800 017 160,{' '}
              <a className="text-brand-700 underline" href="mailto:POPIAComplaints@inforegulator.org.za">POPIAComplaints@inforegulator.org.za</a>,{' '}
              Woodmead North Office Park, 54 Maxwell Drive, Woodmead, Johannesburg, 2191 —{' '}
              <a className="text-brand-700 underline" href="https://inforegulator.org.za" target="_blank" rel="noreferrer">inforegulator.org.za</a>.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">9. Cookies</h2>
            <p>
              We use strictly necessary cookies/sessions to keep you signed in, remember your cart, and keep
              the site secure. We do not use advertising trackers. Your browser controls can block cookies,
              but sign-in and checkout will not work without the essential ones.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">10. Sales records, PAIA, and marketing law</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Sales records (CPA s26):</strong> every transaction generates a written record — orders and VAT invoices in your account — showing our trading name and address, the goods, prices, and transaction details to support returns and warranties.</li>
              <li><strong>Access to information (PAIA):</strong> as a private body we maintain a Promotion of Access to Information Act 2 of 2000 manual describing the records we hold and how to request access. Request a copy from the Information Officer above.</li>
              <li><strong>Unwanted marketing (CPA s11; ECTA s45; POPIA s69):</strong> we do not pre-tick marketing consent or add buyers automatically. Every marketing message identifies us and carries a free opt-out; opt-outs are honoured promptly. Continuing to send communications you have rejected is an offence under ECTA s45.</li>
            </ul>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/terms" className="btn-secondary">Terms of service</Link>
          <Link href="/popia" className="btn-secondary">POPIA policy</Link>
          <Link href="/register" className="btn-primary">Create your account</Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
