'use client';

import React, { useEffect, useState } from 'react';
import type { StaffUserInfo } from '@/lib/repo/mysql';
import { apiMessage, readApiData } from '@/lib/api-client';
import {
  KeyRound,
  UserPlus,
  TriangleAlert,
  X,
  Copy,
  ShieldCheck,
  RefreshCw,
  Smartphone,
} from 'lucide-react';

type ResetKind = 'password-reset' | '2fa-reset';

/**
 * The UI names these actions "password-reset"/"2fa-reset" but the API route folders are
 * "reset-password"/"reset-2fa". Keep the mapping in one place — building the URL straight
 * from the UI label hit a non-existent path and returned Next's HTML 404 page, which then
 * blew up in res.json() as "Unexpected token '<'".
 */
const RESET_ENDPOINTS: Record<ResetKind, string> = {
  'password-reset': 'reset-password',
  '2fa-reset': 'reset-2fa',
};

interface OneTimeCredentials {
  email: string;
  tempPassword: string;
  totpSecret: string;
  totpUri: string;
  emailSubject?: string;
  emailText?: string;
  context: 'created' | ResetKind;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function StaffTab({ csrfToken }: { csrfToken: string }) {
  const [users, setUsers] = useState<StaffUserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'SALES_STAFF' | 'ADMIN'>('SALES_STAFF');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<OneTimeCredentials | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const json = await readApiData(res);
      if (res.ok && Array.isArray(json.users)) {
        setUsers(json.users as StaffUserInfo[]);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/users', { cache: 'no-store' })
      .then((res) => (res.ok ? readApiData(res) : null))
      .then((json: unknown) => {
        if (cancelled) return;
        if (json && typeof json === 'object' && Array.isArray((json as { users?: unknown }).users)) {
          setUsers((json as { users: StaffUserInfo[] }).users);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreds(null);
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      const json = await readApiData<{
        user: { id: number; email: string };
        tempPassword: string;
        totpSecret: string;
        totpUri: string;
        message?: string;
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Staff creation failed'));
      }
      setCreds({
        email: json.user.email,
        tempPassword: json.tempPassword,
        totpSecret: json.totpSecret,
        totpUri: json.totpUri,
        context: 'created',
      });
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Staff creation failed');
    } finally {
      setCreating(false);
    }
  };

  const handleReset = async (userId: number, kind: ResetKind) => {
    setError(null);
    setCreds(null);
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/${RESET_ENDPOINTS[kind]}`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
      });
      const json = await readApiData(res);
      if (!res.ok) {
        throw new Error(apiMessage(json, 'Reset failed'));
      }
      const target = users.find((u) => u.id === userId);
      setCreds({
        email: (json.email as string) || target?.email || '',
        tempPassword: (json.tempPassword as string) || '',
        totpSecret: (json.secret as string) || '',
        totpUri: (json.uri as string) || '',
        emailSubject: (json.emailSubject as string) || undefined,
        emailText: (json.emailText as string) || undefined,
        context: kind,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setActionLoading(null);
    }
  };

  const credRow = (label: string, value: string, key: string) => (
    <div className="flex items-center justify-between gap-2 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-lg px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">{label}</div>
        <div className="font-mono text-xs font-bold text-neutral-900 dark:text-slate-200 break-all select-all">{value}</div>
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
        <strong>Staff accounts are ADMIN-only.</strong> New accounts start approved with a one-time
        password and a fresh 2FA secret, and must change the password at first login. Hand the
        credentials below to the staff member over a trusted channel — they are shown once and never
        stored or re-displayable.
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {creds && (
        <div className="border-2 border-emerald-300 bg-emerald-50/60 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-emerald-950 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-700" />
              <span>
                {creds.context === 'created'
                  ? `Account created for ${creds.email}`
                  : creds.context === 'password-reset'
                    ? `New one-time password for ${creds.email}`
                    : `New 2FA secret for ${creds.email}`}
              </span>
            </h4>
            <button
              type="button"
              onClick={() => setCreds(null)}
              className="text-neutral-400 hover:text-neutral-700"
              title="Dismiss — credentials cannot be shown again"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {creds.tempPassword ? credRow('One-time password', creds.tempPassword, 'pw') : null}
          {creds.emailSubject
            ? credRow('Email subject — copy for the handover email', creds.emailSubject, 'subject')
            : null}
          {creds.emailText ? (
            <div className="flex items-start justify-between gap-2 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-lg px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Email template — copy and paste to the user</div>
                <div className="whitespace-pre-wrap font-mono text-[11px] font-bold text-neutral-900 dark:text-slate-200 break-all select-all">{creds.emailText}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void copyText(creds.emailText || '').then((ok) => {
                    if (ok) {
                      setCopied('template');
                      setTimeout(() => setCopied(null), 1500);
                    }
                  });
                }}
                className="shrink-0 px-2.5 py-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied === 'template' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          ) : null}
          {creds.totpSecret ? credRow('2FA secret (enter in authenticator app)', creds.totpSecret, 'totp') : null}
          {creds.totpUri ? (
            <p className="text-[11px] text-neutral-500 dark:text-slate-400 break-all font-mono">TOTP URI: {creds.totpUri}</p>
          ) : null}
          <p className="text-[11px] font-semibold text-emerald-900">
            Dismiss this panel once handed over — these values are never shown again.
          </p>
        </div>
      )}

      <form onSubmit={handleCreate} className="border border-neutral-200 dark:border-white/10 rounded-xl p-4 space-y-3 bg-neutral-50/60">
        <h3 className="font-bold text-sm text-neutral-900 dark:text-slate-200 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-brand-700" />
          <span>Create staff account</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">
              Work email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@stationerydepot.co.za"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-700"
            />
          </div>
          <div>
            <label className="block text-neutral-700 font-bold mb-1 uppercase tracking-wider text-[11px]">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'SALES_STAFF' | 'ADMIN')}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white dark:bg-white/[0.04] focus:ring-2 focus:ring-brand-700"
            >
              <option value="SALES_STAFF">Sales staff</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create account & generate credentials'}
        </button>
      </form>

      <div className="border border-neutral-200/80 dark:border-white/10 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs divide-y divide-neutral-200">
          <thead className="bg-brand-950 text-white font-mono uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500 dark:text-slate-400">
                  Loading staff accounts...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500 dark:text-slate-400">
                  No staff accounts found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-brand-50/60">
                  <td className="px-4 py-3">
                    <div className="font-mono font-bold text-brand-950">{u.email}</div>
                    <div className="flex gap-1.5 mt-1">
                      {u.pwd_reset_required && (
                        <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          Must reset password
                        </span>
                      )}
                      {u.locked_until && (
                        <span className="inline-block px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          Locked
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        u.role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : 'bg-blue-100 text-blue-800 border-blue-200'
                      }`}
                    >
                      {u.role === 'ADMIN' ? 'Administrator' : 'Sales staff'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-neutral-700">{u.status.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={actionLoading === u.id}
                      onClick={() => void handleReset(u.id, 'password-reset')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50"
                      title="Generate a one-time password (shown once)"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reset password</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === u.id}
                      onClick={() => void handleReset(u.id, '2fa-reset')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 text-neutral-800 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50"
                      title="Generate a fresh 2FA secret (shown once)"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Reset 2FA</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-neutral-500 dark:text-slate-400 flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
        <span>Every creation and reset is audit-logged with actor, target, and timestamp.</span>
      </p>
    </div>
  );
}
