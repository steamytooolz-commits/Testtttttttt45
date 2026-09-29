import Link from 'next/link';
import { Lock } from 'lucide-react';

export function TradeGateCard({
  title,
  message,
  pending,
}: {
  title: string;
  message: string;
  pending?: boolean;
}) {
  return (
    <div className="max-w-xl mx-auto py-20 px-4 text-center">
      <div className="card p-8 sm:p-10 space-y-4">
        <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-300 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-amber-700" aria-hidden="true" />
        </div>
        <span className="badge-amber">{pending ? 'Awaiting Approval' : 'Trade Only Access'}</span>
        <h1 className="text-xl font-bold text-neutral-950 dark:text-slate-100">{title}</h1>
        <p className="text-sm text-neutral-600 dark:text-slate-300 leading-relaxed">{message}</p>
        <div className="pt-4 flex flex-col sm:flex-row justify-center gap-3">
          <Link href="/login" className="btn-dark">
            Log In
          </Link>
          <Link href="/register" className="btn-secondary">
            Apply for Wholesale Account
          </Link>
        </div>
      </div>
    </div>
  );
}
