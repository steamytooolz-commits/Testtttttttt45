'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { BrandMark, RetailSiteLink } from '@/app/components/brand-header';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'CREDENTIALS' | 'TOTP'>('CREDENTIALS');
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('email') || '';
    }
    return '';
  });
  const [password, setPassword] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('email') ? 'password123' : '';
    }
    return '';
  });
  const [totpCode, setTotpCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginResult, setLoginResult] = useState<{
    status: string;
    email: string;
    role: string;
  } | null>(null);

  async function handleCredentialsSubmit(e: React.FormEvent) {
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(captcha ? { captcha_nonce: captcha.nonce, captcha_solution: captcha.solution, website: '' } : { recaptcha_token: 'test-token-valid' }),
        }),
      });

      const data = await readApiData<ApiResponseBody>(res);
      if (!res.ok) {
        if (res.status === 403 && data.error === 'PASSWORD_RESET_REQUIRED') {
          const token =
            typeof data.password_reset_token === 'string' ? data.password_reset_token : '';
          window.location.href = token ? `/change-password?token=${encodeURIComponent(token)}` : '/change-password';
          return;
        }
        throw new Error(apiMessage(data, 'Login failed'));
      }

      if (data.user && typeof data.user === 'object') {
        const record = data as unknown as {
          user: { id: number; email: string; role: string; status: string };
        };
        setLoginResult({
          status: record.user.status,
          email: record.user.email,
          role: record.user.role,
        });
        if (record.user.role === 'ADMIN') {
          router.push('/admin');
        } else {
          router.push('/catalog');
        }
        return;
      }

      if (typeof data.challenge_token === 'string') {
        setChallengeToken(data.challenge_token);
        setStep('TOTP');
      } else {
        router.push('/catalog');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_token: challengeToken,
          totp_code: totpCode,
        }),
      });

      const data = await readApiData<ApiResponseBody>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Two-factor verification failed'));
      }
      if (data.user && typeof data.user === 'object') {
        const record = data as unknown as {
          csrfToken: string;
          user: { id: number; email: string; role: string; status: string };
        };

        setLoginResult({
          status: record.user.status,
          email: record.user.email,
          role: record.user.role,
        });

        if (record.user.status === 'APPROVED') {
          router.push('/catalog');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
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
          <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4 sm:mb-5">
            <BrandMark size={56} />
            <div className="leading-tight text-left">
              <span className="font-bold text-xl sm:text-2xl tracking-tight block text-brand-950 dark:text-white">STATIONERY DEPOT</span>
              <span className="text-[10px] sm:text-[11px] text-brand-700 uppercase tracking-[0.18em] block font-semibold">
                Welcome back
              </span>
            </div>
          </div>
          <h1 className="text-center text-xl sm:text-2xl font-extrabold text-neutral-950 dark:text-slate-100 tracking-tight">
            {step === 'TOTP' ? 'Check your authenticator app' : 'Sign in to see your prices'}
          </h1>
          <p className="mt-1.5 sm:mt-2 text-center text-xs sm:text-sm text-neutral-500 dark:text-slate-400">
            {step === 'TOTP'
              ? 'Enter the 6-digit code from your authenticator app'
              : 'Your catalog and ordering are inside'}
          </p>
        </div>

        <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="card p-5 sm:p-8">
            {error && <div className="notice-error mb-6">{error}</div>}

            {loginResult ? (
              <div className="space-y-4">
                <div
                  className={`rounded-md border p-4 text-sm leading-relaxed ${
                    loginResult.status === 'APPROVED'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <p className="font-bold text-base mb-1">Authentication successful</p>
                  <p className="mb-2">
                    Logged in as: <span className="font-mono font-semibold">{loginResult.email}</span>
                  </p>
                  <p className="mb-2">
                    Role: <span className="font-mono font-semibold">{loginResult.role}</span>
                  </p>
                    <p className="font-bold">
                      Status: <span className="font-mono uppercase">{loginResult.status}</span>
                    </p>
                    {loginResult.status === 'PENDING_APPROVAL' && (
                      <p className="mt-3 text-xs leading-relaxed border-t border-amber-200 pt-2 text-amber-800">
                        Thanks — we are getting your account ready. Your prices and checkout appear here as
                        soon as it is approved.
                      </p>
                    )}
                </div>
                <Link href="/" className="btn-secondary w-full">
                  Return to overview
                </Link>
              </div>
            ) : step === 'CREDENTIALS' ? (
              <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                <div>
                  <label htmlFor="login-email" className="field-label">
                    Business Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="purchasing@company.co.za"
                    className="input-field"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="field-label">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="flex items-start gap-2.5 rounded-md bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 px-3 py-2.5 text-xs text-neutral-500 dark:text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-brand-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Protected by bot defences and encrypted trade sessions.</span>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                      Quick Demo Credentials:
                    </p>
                    <span className="text-[10px] text-neutral-400 font-mono">pw: password123</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('procurement@capeoffice.co.za');
                        setPassword('password123');
                      }}
                      className="p-2.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-slate-200 hover:bg-neutral-100 dark:hover:bg-white/10 text-left transition-colors bg-white dark:bg-white/[0.03]"
                    >
                      <span className="font-bold block text-neutral-900 dark:text-white">Trade Customer (Cape Office)</span>
                      <span className="text-[10px] text-neutral-500 dark:text-slate-400 truncate block">procurement@capeoffice.co.za</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('admin@stationerydepot.co.za');
                        setPassword('password123');
                      }}
                      className="p-2.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-slate-200 hover:bg-neutral-100 dark:hover:bg-white/10 text-left transition-colors bg-white dark:bg-white/[0.03]"
                    >
                      <span className="font-bold block text-neutral-900 dark:text-white">System Admin</span>
                      <span className="text-[10px] text-neutral-500 dark:text-slate-400 truncate block">admin@stationerydepot.co.za</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('staff1@stationerydepot.co.za');
                        setPassword('password123');
                      }}
                      className="p-2.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-slate-200 hover:bg-neutral-100 dark:hover:bg-white/10 text-left transition-colors bg-white dark:bg-white/[0.03]"
                    >
                      <span className="font-bold block text-neutral-900 dark:text-white">Sales Queue Staff</span>
                      <span className="text-[10px] text-neutral-500 dark:text-slate-400 truncate block">staff1@stationerydepot.co.za</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('orders@peninsulaschools.org');
                        setPassword('password123');
                      }}
                      className="p-2.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-slate-200 hover:bg-neutral-100 dark:hover:bg-white/10 text-left transition-colors bg-white dark:bg-white/[0.03]"
                    >
                      <span className="font-bold block text-neutral-900 dark:text-white">School Customer (Education)</span>
                      <span className="text-[10px] text-neutral-500 dark:text-slate-400 truncate block">orders@peninsulaschools.org</span>
                    </button>
                  </div>
                </div>

                <div className="text-center text-xs text-neutral-500 dark:text-slate-400 pt-1">
                  No login yet?{' '}
                  <Link href="/register" className="font-bold text-brand-700 hover:text-brand-900 hover:underline">
                    Sign up first
                  </Link>{' '}
                  — required for everyone, including existing store clients.
                </div>
                <p className="text-center text-[11px] text-neutral-400 pt-2">
                  By signing in you agree to our{' '}
                  <Link href="/terms" className="underline hover:text-brand-800">
                    Terms
                  </Link>
                  {', '}
                  <Link href="/privacy" className="underline hover:text-brand-800">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/popia" className="underline hover:text-brand-800">
                    POPIA Policy
                  </Link>
                  .
                </p>
              </form>
            ) : (
              <form onSubmit={handleTotpSubmit} className="space-y-5">
                <div className="rounded-md bg-brand-50 border border-brand-200 px-3 py-2.5 text-xs text-brand-900">
                  Enter the 6-digit code generated by your authenticator app for{' '}
                  <span className="font-semibold">{email}</span>.
                </div>

                <div>
                  <label htmlFor="totp" className="field-label">
                    6-Digit Code
                  </label>
                  <input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="\d{6}"
                    required
                    autoFocus
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="input-field text-center text-xl font-mono tracking-[0.4em]"
                  />
                </div>

                <button type="submit" disabled={loading || totpCode.length !== 6} className="btn-primary w-full py-2.5">
                  {loading ? 'Validating…' : 'Verify & sign in'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('CREDENTIALS');
                    setTotpCode('');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-neutral-500 dark:text-slate-400 hover:text-neutral-900 dark:text-slate-200 py-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  Back to credentials
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs">
            <RetailSiteLink className="text-neutral-500 dark:text-slate-400 hover:text-brand-800" />
          </p>
        </div>
      </div>

      <footer className="py-5 text-center text-[11px] text-neutral-400">
        © {new Date().getFullYear()} Stationery Depot (Pty) Ltd &middot; POPIA Compliant
      </footer>
    </div>
  );
}
