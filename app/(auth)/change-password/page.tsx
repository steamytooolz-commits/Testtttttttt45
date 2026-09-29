'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/app/components/brand-header';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      queueMicrotask(() => {
        setResetToken(token);
        setChecking(false);
      });
      return;
    }
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((res) => (res.ok ? readApiData(res) : null))
      .then((data: unknown) => {
        if (cancelled) return;
        if (data && typeof data === 'object' && 'csrfToken' in data) {
          setCsrfToken(String((data as { csrfToken: unknown }).csrfToken));
        } else {
          router.replace('/login');
        }
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: resetToken
          ? { 'Content-Type': 'application/json' }
          : { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify(
          resetToken
            ? { reset_token: resetToken, current_password: currentPassword, new_password: newPassword }
            : { current_password: currentPassword, new_password: newPassword }
        ),
      });
      const data = await readApiData<ApiResponseBody>(res);
      if (!res.ok) {
        setError(apiMessage(data, 'Password change failed'));
        return;
      }
      const okMessage = typeof data.message === 'string' ? data.message : '';
      setMessage(okMessage || 'Password changed. Please log in again.');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-page dark:bg-page-dark px-4 py-6">
      <div className="max-w-md w-full mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 dark:text-slate-300 hover:text-brand-800 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to home
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center py-8">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <BrandMark size={44} />
          <div className="leading-tight">
            <h1 className="text-xl font-extrabold text-neutral-950 dark:text-slate-100 tracking-tight">Change Password</h1>
            <p className="text-[10px] text-brand-700 uppercase tracking-[0.18em] font-semibold">Security Checkpoint</p>
          </div>
        </div>

        <div className="notice-info mb-6 text-xs flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {resetToken
              ? 'You signed in with a temporary password. Choose a new password to finish unlocking your account.'
              : 'Your administrator required a password reset. Choose a new password to continue.'}
          </span>
        </div>

        {checking ? (
          <p className="text-xs text-neutral-500 dark:text-slate-400 text-center py-4">Checking your session…</p>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="current-password" className="field-label">
              {resetToken ? 'Temporary Password' : 'Current Password'}
            </label>
            <input
              id="current-password"
              type="password"
              required
              autoComplete="current-password"
              className="input-field"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="new-password" className="field-label">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              required
              autoComplete="new-password"
              className="input-field"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-slate-400">
              Minimum 10 characters with upper and lower case letters, a digit, and a special character.
            </p>
          </div>

          <div className="hidden" aria-hidden="true">
            <label>Website</label>
            <input type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {error ? <div className="notice-error text-xs">{error}</div> : null}
          {message ? <div className="notice-success text-xs">{message}</div> : null}

          <button type="submit" className="btn-primary w-full py-2.5">
            Update password
          </button>
        </form>
        )}
      </div>
      </div>
    </div>
  );
}
