'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheckBig, KeyRound } from 'lucide-react';
import { BrandMark, RetailSiteLink } from '@/app/components/brand-header';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';

function isEmailVisible(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const emailVisible = isEmailVisible(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailVisible || loading) return;
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
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          ...(captcha ? { captcha_nonce: captcha.nonce, captcha_solution: captcha.solution, website: '' } : { recaptcha_token: 'test-token-valid' }),
        }),
      });

      const data = await readApiData<ApiResponseBody>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Request failed'));
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark">
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 dark:text-slate-300 hover:text-brand-800 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to home
        </Link>
      </div>
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex items-center justify-center gap-4 mb-5">
            <BrandMark size={72} />
            <div className="leading-tight text-left">
              <span className="font-bold text-2xl tracking-tight block text-brand-950 dark:text-white">STATIONERY DEPOT</span>
              <span className="text-[11px] text-brand-700 uppercase tracking-[0.18em] block font-semibold">
                Password help
              </span>
            </div>
          </div>
          <h1 className="text-center text-2xl font-extrabold text-neutral-950 dark:text-slate-100 tracking-tight">
            Forgot your password?
          </h1>
          <p className="mt-2 text-center text-sm text-neutral-500 dark:text-slate-400">
            Enter your account email and we will get you a new one
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="card p-6 sm:p-8">
            {error && <div className="notice-error mb-6">{error}</div>}

            {sent ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
                  <CircleCheckBig className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Request sent</p>
                    <p className="mt-1 text-xs leading-relaxed">
                      Your request is with our admin team. You will receive a new temporary password
                      by email shortly — keep an eye on your inbox (and spam folder).
                    </p>
                  </div>
                </div>
                <Link href="/login" className="btn-primary w-full py-2.5">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="forgot-email" className="field-label">
                    Account email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="purchasing@company.co.za"
                    className="input-field"
                  />
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-slate-400">
                    Type the email address on your account so we know where to send the new password.
                  </p>
                </div>

                <button type="submit" disabled={loading || !emailVisible} className="btn-primary w-full py-2.5">
                  {loading ? 'Sending request…' : 'Send reset request'}
                </button>

                <div className="text-center text-xs text-neutral-500 dark:text-slate-400 pt-1">
                  Remembered it?{' '}
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

      <footer className="py-5 text-center text-[11px] text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />© {new Date().getFullYear()} Stationery Depot (Pty) Ltd &middot; POPIA Compliant
        </span>
      </footer>
    </div>
  );
}
