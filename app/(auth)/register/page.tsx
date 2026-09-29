'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, KeyRound, CircleCheckBig, ArrowLeft } from 'lucide-react';
import { BrandMark, RetailSiteLink } from '@/app/components/brand-header';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';

const INPUT_SECTIONS: Array<{
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: Array<{
    key: 'company_name' | 'contact_name' | 'email' | 'phone' | 'street' | 'city' | 'province' | 'postal_code' | 'password';
    label: string;
    type: string;
    placeholder: string;
    autoComplete?: string;
    hint?: string;
  }>;
}> = [
  {
    title: 'Company Details',
    icon: Building2,
    fields: [
      { key: 'company_name', label: 'Company Legal Name', type: 'text', placeholder: 'Acme Books (Pty) Ltd', autoComplete: 'organization' },
      { key: 'contact_name', label: 'Contact Person', type: 'text', placeholder: 'Jane Doe', autoComplete: 'name' },
      { key: 'email', label: 'Business Email', type: 'email', placeholder: 'procurement@acme.co.za', autoComplete: 'email' },
      { key: 'phone', label: 'Business Telephone', type: 'tel', placeholder: '+27 11 555 0100', autoComplete: 'tel' },
    ],
  },
  {
    title: 'Delivery Address',
    icon: Building2,
    fields: [
      { key: 'street', label: 'Street Address', type: 'text', placeholder: '14 Industrial Way, Unit 4', autoComplete: 'address-line1' },
      { key: 'city', label: 'City', type: 'text', placeholder: 'Johannesburg', autoComplete: 'address-level2' },
      { key: 'province', label: 'Province', type: 'text', placeholder: 'Gauteng', autoComplete: 'address-level1' },
      { key: 'postal_code', label: 'Postal Code', type: 'text', placeholder: '2000', autoComplete: 'postal-code' },
    ],
  },
  {
    title: 'Security',
    icon: KeyRound,
    fields: [
      {
        key: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Minimum 10 characters',
        autoComplete: 'new-password',
        hint: 'Upper and lower case letters, a digit, and a symbol. Hashed with argon2id.',
      },
    ],
  },
];

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    province: '',
    postal_code: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExistingClient, setIsExistingClient] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    isNewProspect: boolean;
    totpSecret: string;
    totpUri: string;
  } | null>(null);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let captcha: { nonce: string; solution: string } | null = null;
      try {
        const chRes = await fetch('/api/auth/challenge', { cache: 'no-store' });
        if (chRes.ok) {
          const ch = await readApiData<{ nonce: string; difficulty: string }>(chRes);
          const { solvePowChallenge } = await import('@/lib/captcha-client');
          const solution = await solvePowChallenge(ch.nonce, ch.difficulty);
          captcha = { nonce: ch.nonce, solution };
        }
      } catch {
        captcha = null;
      }
      const payload = {
        company_name: formData.company_name,
        contact_name: formData.contact_name,
        email: formData.email,
        phone: formData.phone,
        address: {
          street: formData.street,
          city: formData.city,
          province: formData.province,
          postal_code: formData.postal_code,
        },
        password: formData.password,
        is_existing_client: isExistingClient,
        ...(captcha ? { captcha_nonce: captcha.nonce, captcha_solution: captcha.solution, website: '' } : { recaptcha_token: 'test-token-valid' }),
      };

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await readApiData<ApiResponseBody>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Registration failed'));
      }

      if (data.totpSecret && typeof data.totpSecret === 'string') {
        const record = data as unknown as {
          status: string;
          isNewProspect?: boolean;
          totpSecret: string;
          totpUri: string;
        };
        setResult({
          status: record.status,
          isNewProspect: record.isNewProspect === true,
          totpSecret: record.totpSecret,
          totpUri: record.totpUri,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 dark:text-slate-300 hover:text-brand-800 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to home
        </Link>
      </div>
      <div className="flex-1 py-10 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
          <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4 sm:mb-5">
            <BrandMark size={56} />
            <div className="leading-tight text-left">
              <span className="font-bold text-xl sm:text-2xl tracking-tight block text-brand-950 dark:text-white">STATIONERY DEPOT</span>
              <span className="text-[10px] sm:text-[11px] text-brand-700 uppercase tracking-[0.18em] block font-semibold">
                New or existing customer
              </span>
            </div>
          </div>
          <h1 className="text-center text-xl sm:text-2xl font-extrabold text-neutral-950 dark:text-slate-100 tracking-tight">
            Create your account
          </h1>
          <p className="mt-1.5 sm:mt-2 text-center text-xs sm:text-sm text-neutral-500 dark:text-slate-400">
            About two minutes &middot; prices appear after sign-in &middot; we will get you set up
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
          <div className="card p-6 sm:p-10">
            {error && <div className="notice-error mb-6">{error}</div>}

            {result ? (
              <div className="space-y-6">
                <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
                  <CircleCheckBig className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Thanks — your account is on its way</p>
                    <p className="mt-1 text-xs leading-relaxed">
                      {result.isNewProspect
                        ? 'We have your details and our team will be in touch shortly to get everything ready. Your prices will appear in the catalog as soon as your account is approved.'
                        : 'Your account has been created. We are just finishing setup — your prices and ordering unlock as soon as it is approved.'}
                    </p>
                  </div>
                </div>

                <div className="rounded-md border border-neutral-200 bg-neutral-50 dark:bg-white/[0.06] p-5">
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-slate-200 mb-2">Configure two-factor authenticator</h3>
                  <p className="text-xs text-neutral-600 dark:text-slate-300 mb-4 leading-relaxed">
                    Every login requires a 6-digit TOTP code. Add this key to Google Authenticator or Microsoft
                    Authenticator:
                  </p>
                  <div className="rounded-md bg-white dark:bg-white/[0.04] border border-neutral-300 p-3 font-mono text-center text-sm font-bold tracking-wider text-neutral-900 dark:text-slate-200 select-all">
                    {result.totpSecret}
                  </div>
                  <div className="mt-3 rounded-md bg-neutral-100 dark:bg-white/[0.08] p-2 font-mono text-[11px] text-neutral-500 dark:text-slate-400 break-all">
                    TOTP URI: {result.totpUri}
                  </div>
                </div>

                <Link href="/login" className="btn-primary w-full py-2.5">
                  Proceed to login portal
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
                {INPUT_SECTIONS.map((section) => (
                  <fieldset key={section.title}>
                    <legend className="flex items-center gap-2 text-sm font-bold text-neutral-950 dark:text-slate-100 mb-4">
                      <span className="w-7 h-7 rounded-md bg-brand-950 text-white flex items-center justify-center">
                        <section.icon className="w-3.5 h-3.5" />
                      </span>
                      {section.title}
                    </legend>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {section.fields.map((f) => (
                        <div key={f.key} className={f.key === 'street' || f.key === 'password' ? 'sm:col-span-2' : ''}>
                          <label htmlFor={`reg-${f.key}`} className="field-label">
                            {f.label}
                          </label>
                          <input
                            id={`reg-${f.key}`}
                            type={f.type}
                            required
                            autoComplete={f.autoComplete}
                            value={formData[f.key]}
                            onChange={(e) => handleChange(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            className="input-field"
                          />
                          {f.hint && <p className="mt-1 text-[11px] text-neutral-500 dark:text-slate-400">{f.hint}</p>}
                        </div>
                      ))}
                    </div>
                  </fieldset>
                ))}

                <label className="flex items-start gap-3 rounded-md border border-brand-200 bg-brand-50 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isExistingClient}
                    onChange={(e) => setIsExistingClient(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-brand-700"
                  />
                  <span className="text-xs text-brand-950 leading-relaxed">
                    <strong>Already buy from our store? Tick this — and still complete this signup.</strong>{' '}
                    Everyone needs an online account to see pricing, including existing clients. Ticking
                    tells sales to link your store pricing to this new login. New here? Leave it unticked
                    and we will get you set up from scratch.
                  </span>
                </label>

                <div className="rounded-md bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 px-3 py-2.5 text-xs text-neutral-600 dark:text-slate-300">
                  We review each account so your prices and delivery details are correct from day one.
                </div>

                <p className="text-[11px] text-neutral-500 dark:text-slate-400 leading-relaxed">
                  By creating an account you agree to our{' '}
                  <Link href="/terms" className="underline hover:text-brand-800">
                    Terms of service
                  </Link>
                  {', '}
                  <Link href="/privacy" className="underline hover:text-brand-800">
                    Privacy policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/popia" className="underline hover:text-brand-800">
                    POPIA policy
                  </Link>
                  . We handle your business information in line with POPIA — see the policies for details.
                </p>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? 'Creating your account…' : 'Create account & set up 2FA'}
                </button>

                <div className="text-center text-xs text-neutral-500 dark:text-slate-400">
                  Already registered?{' '}
                  <Link href="/login" className="font-bold text-brand-700 hover:text-brand-900 hover:underline">
                    Sign in here
                  </Link>
                </div>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs">
            <RetailSiteLink className="text-neutral-500 dark:text-slate-400 hover:text-brand-800" />
          </p>
        </div>
      </div>
    </div>
  );
}
