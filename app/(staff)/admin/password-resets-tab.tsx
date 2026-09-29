'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { PasswordResetRequestRow } from '@/lib/repo/mysql';
import { apiMessage, readApiData } from '@/lib/api-client';
import {
  KeyRound,
  Search,
  TriangleAlert,
  CircleCheckBig,
  X,
  Copy,
  ShieldCheck,
  Send,
  MailX,
} from 'lucide-react';

interface FulfilResult {
  email: string;
  tempPassword: string;
  emailSubject: string;
  emailText: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PasswordResetsTab({ csrfToken }: { csrfToken: string }) {
  const [requests, setRequests] = useState<PasswordResetRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'FULFILLED' | 'DISMISSED' | 'ALL'>('PENDING');
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | string | null>(null);
  const [result, setResult] = useState<FulfilResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundEmail, setFoundEmail] = useState<string | null>(null);

  const lookupEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lookupEmail.trim());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/password-resets?status=${statusFilter}`, { cache: 'no-store' });
      const json = await readApiData(res);
      if (res.ok && Array.isArray(json.requests)) {
        setRequests(json.requests as PasswordResetRequestRow[]);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/password-resets?status=${statusFilter}`, { cache: 'no-store' })
      .then((res) => (res.ok ? readApiData(res) : null))
      .then((json: unknown) => {
        if (cancelled) return;
        if (json && typeof json === 'object' && Array.isArray((json as { requests?: unknown }).requests)) {
          setRequests((json as { requests: PasswordResetRequestRow[] }).requests);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const handleFulfil = async (requestId: number) => {
    setError(null);
    setResult(null);
    setActionLoading(requestId);
    try {
      const res = await fetch(`/api/admin/password-resets/${requestId}/fulfil`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
      });
      const json = await readApiData(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Failed to issue new password'));
      }
      setResult({
        email: json.email as string,
        tempPassword: json.tempPassword as string,
        emailSubject: json.emailSubject as string,
        emailText: json.emailText as string,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue new password');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDismiss = async (requestId: number) => {
    setError(null);
    setActionLoading(`dismiss-${requestId}`);
    try {
      const res = await fetch(`/api/admin/password-resets/${requestId}/dismiss`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
      });
      const json = await readApiData(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Failed to dismiss request'));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupEmailValid || lookupLoading) return;
    setLookupError(null);
    setFoundEmail(null);
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/admin/customers?search=${encodeURIComponent(lookupEmail.trim())}`);
      const json = await readApiData(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Lookup failed'));
      }
      const customers = Array.isArray(json.customers) ? json.customers : [];
      const match = customers.find(
        (c: { email?: string }) => typeof c.email === 'string' && c.email.toLowerCase() === lookupEmail.trim().toLowerCase()
      );
      if (match) {
        setFoundEmail(match.email as string);
        return;
      }
      const staffRes = await fetch('/api/admin/users', { cache: 'no-store' });
      const staffJson = await readApiData(staffRes);
      const staffUsers = staffRes.ok && Array.isArray(staffJson.users) ? staffJson.users : [];
      const staffMatch = staffUsers.find(
        (u: { email?: string }) => typeof u.email === 'string' && u.email.toLowerCase() === lookupEmail.trim().toLowerCase()
      );
      if (staffMatch) {
        setFoundEmail(staffMatch.email as string);
        return;
      }
      throw new Error(`No account exists for ${lookupEmail.trim().toLowerCase()}`);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleDirectReset = async () => {
    if (!foundEmail) return;
    setError(null);
    setResult(null);
    setActionLoading('direct');
    try {
      const res = await fetch('/api/admin/password-resets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ email: foundEmail }),
      });
      const json = await readApiData(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Failed to issue new password'));
      }
      setResult({
        email: json.email as string,
        tempPassword: json.tempPassword as string,
        emailSubject: json.emailSubject as string,
        emailText: json.emailText as string,
      });
      setFoundEmail(null);
      setLookupEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue new password');
    } finally {
      setActionLoading(null);
    }
  };

  const copyRow = (label: string, value: string, key: string, multiline = false) => (
    <div className="flex items-start justify-between gap-2 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-lg px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">{label}</div>
        <div className={`${multiline ? 'whitespace-pre-wrap text-[11px]' : 'text-xs'} font-mono font-bold text-neutral-900 dark:text-slate-200 break-all select-all`}>
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          void copyText(value).then((ok) => {
            if (ok) {
              setCopied(key);
              setTimeout(() => setCopied(null), 1500);
            }
          });
        }}
        className="shrink-0 px-2.5 py-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
      >
        <Copy className="w-3.5 h-3.5" />
        <span>{copied === key ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );

  return (
    <div className="bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 rounded-b-xl p-6 shadow-sm space-y-6">
      <div className="p-4 bg-brand-50 border border-brand-200 rounded-xl text-xs text-brand-950 leading-relaxed">
        <strong>Password resets are ADMIN-only.</strong> Requests from the forgot-password page land here.
        The user&apos;s email is always shown before you send anything — review it, then issue a new
        temporary password. The user is emailed automatically and must change it at next sign-in.
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="border-2 border-emerald-300 bg-emerald-50/60 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-emerald-950 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-700" />
              <span>New temporary password for {result.email}</span>
            </h4>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-neutral-400 hover:text-neutral-700"
              title="Dismiss — the password was already emailed to the user"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {copyRow('One-time password', result.tempPassword, 'pw')}
          {copyRow('Email subject', result.emailSubject, 'subject')}
          {copyRow('Email template — copy and paste if you need to resend it manually', result.emailText, 'template', true)}
          <p className="text-[11px] font-semibold text-emerald-900">
            Already emailed to the user automatically. The template above is a copy in case you need it.
          </p>
        </div>
      )}

      <form onSubmit={handleLookup} className="border border-neutral-200 dark:border-white/10 rounded-xl p-4 space-y-3 bg-neutral-50/60">
        <h3 className="font-bold text-sm text-neutral-900 dark:text-slate-200 flex items-center gap-2">
          <Search className="w-4 h-4 text-brand-700" />
          <span>Reset password for an existing account</span>
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={lookupEmail}
            onChange={(e) => {
              setLookupEmail(e.target.value);
              setFoundEmail(null);
              setLookupError(null);
            }}
            placeholder="user@company.co.za"
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
          />
          <button
            type="submit"
            disabled={!lookupEmailValid || lookupLoading}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
          >
            {lookupLoading ? 'Finding…' : 'Find account'}
          </button>
        </div>
        {lookupError && <p className="text-[11px] font-semibold text-rose-700">{lookupError}</p>}
        {foundEmail && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-emerald-950">
              Account found: <span className="font-mono font-bold">{foundEmail}</span>
            </div>
            <button
              type="button"
              onClick={handleDirectReset}
              disabled={actionLoading === 'direct'}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{actionLoading === 'direct' ? 'Sending…' : 'Send new password'}</span>
            </button>
          </div>
        )}
        {!foundEmail && (
          <p className="text-[11px] text-neutral-500 dark:text-slate-400">
            Look up the account first — the send button only appears once the account email is visible above.
          </p>
        )}
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-sm text-neutral-900 dark:text-slate-200">Reset requests ({requests.length})</h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'PENDING' | 'FULFILLED' | 'DISMISSED' | 'ALL')}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white dark:bg-white/[0.04] text-neutral-800 font-medium focus:ring-2 focus:ring-brand-600/60 focus:border-brand-600"
          >
            <option value="PENDING">Pending</option>
            <option value="FULFILLED">Fulfilled</option>
            <option value="DISMISSED">Dismissed</option>
            <option value="ALL">All</option>
          </select>
        </div>

        <div className="border border-neutral-200/80 dark:border-white/10 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs divide-y divide-neutral-200">
            <thead className="bg-brand-950 text-white font-mono uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Account email</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500 dark:text-slate-400">
                    Loading reset requests...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500 dark:text-slate-400">
                    No reset requests found.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="hover:bg-brand-50/60">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-brand-950">{r.email}</div>
                      <div className="text-neutral-500 dark:text-slate-400 text-[11px] font-mono">user #{r.user_id ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500 dark:text-slate-400 font-mono text-[11px]">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          r.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : r.status === 'FULFILLED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-neutral-100 dark:bg-white/[0.08] text-neutral-500 dark:text-slate-400 border-neutral-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {r.status === 'PENDING' ? (
                        <>
                          <button
                            type="button"
                            disabled={actionLoading === r.id}
                            onClick={() => void handleFulfil(r.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
                            title={`Issue a new temporary password for ${r.email}`}
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{actionLoading === r.id ? 'Sending…' : 'Send new password'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === `dismiss-${r.id}`}
                            onClick={() => void handleDismiss(r.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50"
                          >
                            <MailX className="w-3.5 h-3.5" />
                            <span>Dismiss</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-neutral-500 dark:text-slate-400 flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
        <span>Every request, fulfilment, and dismissal is audit-logged with actor and timestamp.</span>
      </p>

      <p className="text-[11px] text-neutral-500 dark:text-slate-400 flex items-center gap-1.5">
        <CircleCheckBig className="w-3.5 h-3.5 text-emerald-700" />
        <span>Users sign in with the temporary password plus their usual authenticator code, then set a new password.</span>
      </p>
    </div>
  );
}
