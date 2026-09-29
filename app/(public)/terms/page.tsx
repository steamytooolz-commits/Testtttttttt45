import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SiteHeader, SiteFooter, BrandMark } from '@/app/components/brand-header';
import { SESSION_COOKIE_NAME, authenticateSession } from '@/lib/security/session';

export const metadata: Metadata = {
  title: 'Terms of Service | Stationery Depot',
  description: 'Terms for shopping with The Stationery Depot wholesale portal.',
};

const UPDATED = '13 September 2026';

export default async function TermsPage() {
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
              Terms of service
            </h1>
            <p className="text-xs text-neutral-500 mt-1">Last updated: {UPDATED}</p>
          </div>
        </div>

        <div className="card p-6 sm:p-10 space-y-8 text-sm leading-relaxed text-neutral-700 dark:text-slate-300">
          <p>
            These terms govern your use of this trade portal and every order placed through it. They are
            written to comply with the Electronic Communications and Transactions Act 25 of 2002 (ECTA),
            the Consumer Protection Act 68 of 2008 (CPA) where it applies, the Value-Added Tax Act 89 of
            1991, and the Protection of Personal Information Act 4 of 2013 (POPIA). Where a consumer right
            cannot be limited by law, that right prevails over anything to the contrary below.
          </p>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">1. Who we are (ECTA section 43 disclosure)</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Supplier:</strong> <strong>[Company legal name]</strong>, <strong>[company type, e.g. private company]</strong> registered in <strong>[country]</strong>, registration number <strong>[registration number]</strong>, place of registration <strong>[place of registration]</strong>.</li>
              <li><strong>What we sell:</strong> wholesale stationery — paper, writing, filing, and office essentials — via this portal and our retail site at{' '}
                <a className="text-brand-700 underline" href="https://thestationerydepot.co.za" target="_blank" rel="noreferrer">
                  thestationerydepot.co.za
                </a>.
              </li>
              <li><strong>Contact:</strong> email <strong>[contact email]</strong>, phone <strong>[phone number]</strong>, physical address <strong>[street address, city, province, postal code]</strong>. Address for legal service of documents: <strong>[legal service address]</strong>. Office-bearer details available on request at <strong>[contact email]</strong>.</li>
              <li><strong>VAT:</strong> VAT registration number <strong>[VAT number]</strong>. Every order issues a VAT-compliant tax invoice (Value-Added Tax Act 89 of 1991).</li>
              <li><strong>Codes and memberships:</strong> we subscribe to the Consumer Goods and Services Ombud (CGSO) alternative dispute resolution process — see section 11. We hold no other accreditation relevant to these sales; if that changes we will list it here with contact details and a link to the code.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">2. Who can shop here</h2>
            <p>
              Anyone may browse the catalog. To see prices and place orders everyone must sign up for an
              online account — this includes existing store clients. If you already buy from our store,
              tick “already a client” on the signup form so sales can link your store pricing to your new
              login. We review each account so prices, delivery details, and invoices are correct from day
              one. You must provide accurate business and contact details, keep your password and
              authenticator app safe, and tell us promptly of any unauthorised use.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">3. Products, prices, and your transaction record (ECTA s43(h)–(m))</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Each product page describes the main characteristics of the goods so you can make an informed decision, with SKU, specifications, and images.</li>
              <li>Prices are hidden until you sign in. Your prices appear automatically after sign-in. All catalog prices exclude VAT; VAT at 15% plus any delivery fee is shown at checkout before you confirm, so the full price including transport, taxes, and fees is always visible (ECTA s43(i)).</li>
              <li>If a price or stock figure is clearly wrong, we will contact you before dispatch — you may accept the corrected position or cancel with a full refund of anything paid.</li>
              <li>Before placing an order you can review the entire transaction, correct mistakes, and withdraw (ECTA s43(2)). Your cart, checkout summary, and confirmation serve this purpose.</li>
              <li>After ordering you can access and maintain a full record at any time in Orders and Invoices (PDF downloads), for as long as your account is active and thereafter on request subject to our retention duties.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">4. Orders, payment, and performance (ECTA s43(j), s43(l), s46)</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Submitting checkout places an order request. Our team reviews, invoices, and fulfils it. Minimum quantities may apply on selected lines and are shown before you confirm.</li>
              <li><strong>Manner of payment:</strong> EFT. After checkout you may upload a proof of payment (PNG, JPEG, WebP, or PDF) against the order. Orders dispatch once payment is verified and stock is confirmed.</li>
              <li><strong>Payment security (ECTA s43(5)–(6), s43(p)):</strong> sign-in requires two-factor authentication, sessions are CSRF-protected and expire automatically, and uploads are validated. Our{' '}
                <Link className="text-brand-700 underline" href="/privacy">Privacy policy</Link> and{' '}
                <Link className="text-brand-700 underline" href="/popia">POPIA policy</Link> describe payment and personal-information safeguards.</li>
              <li><strong>Delivery time (ECTA s46):</strong> we execute orders within 30 days of receipt unless otherwise agreed and shown at checkout. If we cannot meet the agreed time you may cancel on 7 days&apos; written notice. If goods are unavailable we will notify you immediately and refund anything paid within 30 days of that notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">5. Delivery and inspection (CPA ss19–20)</h2>
            <p>
              We deliver to the address on your account within South Africa. Delivery fees, where applicable,
              are shown before you confirm. Risk passes on delivery. Check goods on arrival: where the CPA
              applies you may inspect, refuse delivery, or cancel without penalty if goods do not meet the
              quality and specifications ordered — see section 6. Report shortages or visible damage promptly
              with your order or invoice number and photos where possible.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">6. Returns, refunds, and faulty goods (CPA ss55–56; ECTA s44)</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Cooling-off for online orders (ECTA s44):</strong> where you buy as a consumer by electronic transaction, you may cancel without reason and without penalty within 7 days after receiving the goods (or within 7 days after concluding a services agreement). Only the direct cost of returning the goods may be charged to you. If you already paid, we refund in full within 30 days of cancellation. Exclusions in ECTA s42(2) apply — for example goods made to your specification, personalised, that by nature cannot be returned, likely to deteriorate rapidly, or audio/video/software you unsealed, as well as the other statutory exclusions.</li>
              <li><strong>Quality and 6-month implied warranty (CPA ss55–56):</strong> where the CPA applies, goods must be reasonably suitable, of good quality, in working order, and free of defects. Within 6 months after delivery, if goods fail those standards you may return them without penalty at our risk and expense, and <em>you</em> choose: repair, replacement, or refund of the price paid. Change-of-mind returns outside these rights are handled case by case and must be unused, sealed, and reported promptly.</li>
              <li><strong>Direct-marketing cooling-off (CPA s16):</strong> an agreement resulting from direct marketing may be cancelled within 5 business days after conclusion or after delivery of the goods, without reason or penalty.</li>
              <li><strong>Non-disclosure cancellation (ECTA s43(3)–(4)):</strong> if we ever failed to provide the section-43 information or the review opportunity above, you may cancel within 14 days of receiving the goods or services; you return our performance and we refund all payments minus the direct cost of returning goods.</li>
              <li><strong>How to return:</strong> contact us at <strong>[contact email]</strong> / <strong>[phone number]</strong> with your order or invoice number first so we can authorise the return and advise packaging and courier details. Refunds go to the original payment method within the statutory periods above.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">7. When the CPA applies — and when it does not</h2>
            <p>
              The CPA protects natural persons and juristic persons with an asset value or annual turnover
              below the statutory threshold (currently R2 million) at the time of the transaction. Larger
              business-to-business purchases fall outside most CPA protections and are governed by these
              terms and the common law — including our agreed quality, inspection, risk, and remedy terms
              above — subject always to non-excludable rights (for example CPA ss60–61 on safe goods and
              strict product liability, which apply irrespective of threshold). Nothing here limits a right
              the law does not allow us to limit, and unfair, unreasonable, or unjust terms (CPA ss48–51)
              do not apply: our attention is drawn to any limitation of liability, indemnity, or
              acknowledgement of fact in these terms as required by CPA s49.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">8. Marketing and unwanted communications (CPA s11; ECTA s45; POPIA s69)</h2>
            <p>
              We do not add buyers to marketing lists automatically and checkouts carry no pre-ticked
              marketing consent. Any marketing message identifies us and gives you a free opt-out, which we
              honour promptly. You may demand we stop all direct marketing at any time. A person who keeps
              sending communications you have rejected commits an offence under ECTA s45.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">9. Fair use and account integrity</h2>
            <p>
              Use the site lawfully: no attempts to access other accounts, scrape catalog data at scale,
              bypass sign-in or security checks, upload malicious or false files, or misuse proofs of
              payment. We may suspend accounts that abuse the service or provide false business details, and
              report fraud to the authorities.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">10. Privacy and records (CPA s26; ECTA s43(p))</h2>
            <p>
              How we handle your information — including payment, payment information, and personal
              information — is set out in our{' '}
              <Link className="text-brand-700 underline" href="/privacy">Privacy policy</Link> and{' '}
              <Link className="text-brand-700 underline" href="/popia">POPIA policy</Link>, which form part of
              these terms. Every transaction generates a written sales record (CPA s26) available in your
              account as orders and VAT invoices.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">11. Complaints and dispute resolution</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Contact us first with your order or invoice number — most issues are resolved at this step.</li>
              <li><strong>Consumer Goods and Services Ombud (CGSO):</strong> 0860 000 272,{' '}
                <a className="text-brand-700 underline" href="mailto:info@cgso.org.za">info@cgso.org.za</a>, 292 Surrey Avenue, Ferndale, Randburg, 2194 —{' '}
                <a className="text-brand-700 underline" href="https://www.cgso.org.za" target="_blank" rel="noreferrer">cgso.org.za</a>.</li>
              <li><strong>National Consumer Commission (NCC):</strong> 012 065 1940,{' '}
                <a className="text-brand-700 underline" href="mailto:enquiries@thencc.org.za">enquiries@thencc.org.za</a>, e-services portal at{' '}
                <a className="text-brand-700 underline" href="https://eservice.thencc.org.za" target="_blank" rel="noreferrer">eservice.thencc.org.za</a> —{' '}
                <a className="text-brand-700 underline" href="https://thencc.org.za" target="_blank" rel="noreferrer">thencc.org.za</a>.</li>
              <li><strong>Information Regulator (POPIA/PAIA):</strong> see our{' '}
                <Link className="text-brand-700 underline" href="/privacy">Privacy policy</Link>.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">12. Liability and governing law</h2>
            <p>
              To the maximum extent allowed by law, and subject to CPA ss55–56 and ss60–61 where they apply,
              our liability for any order is limited to the price of the goods concerned; we are not liable
              for indirect or consequential losses. ECTA consumer protections apply irrespective of any
              foreign-law choice (ECTA s47) and cannot be excluded (ECTA s48); CPA rights may be enforced
              through the NCC, the Tribunal, the courts, or an accredited ombud. These terms are otherwise
              governed by the laws of South Africa.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-neutral-950 dark:text-slate-100 text-base mb-2">13. Changes and contact</h2>
            <p>
              We may update these terms and will show the latest version here with its date; the version in
              force when you order governs that order. How the current terms may be accessed, stored, and
              reproduced electronically (ECTA s43(k)): this page is printable and downloadable in your
              browser, and your order confirmations remain in your account. Questions? Contact us at{' '}
              <strong>[contact email]</strong> / <strong>[phone number]</strong> or through our retail site
              in section 1.
            </p>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/privacy" className="btn-secondary">Privacy policy</Link>
          <Link href="/popia" className="btn-secondary">POPIA policy</Link>
          <Link href="/register" className="btn-primary">Create your account</Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
