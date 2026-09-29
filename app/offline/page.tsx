import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-page dark:bg-page-dark text-neutral-900 dark:text-slate-200 dark:text-slate-200 flex flex-col items-center justify-center px-6 text-center">
      <div className="card p-8 sm:p-10 max-w-md w-full space-y-4">
        <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-300 flex items-center justify-center mx-auto">
          <WifiOff className="w-5 h-5 text-amber-700" aria-hidden="true" />
        </div>
        <span className="badge-amber">You are offline</span>
        <h1 className="text-xl font-extrabold text-neutral-950 dark:text-slate-100 tracking-tight">No connection right now</h1>
        <p className="text-sm text-neutral-600 dark:text-slate-300 leading-relaxed">
          Your connection dropped. Your cart is saved on this device and will sync when you are back online.
          Browsing the catalog needs a connection.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link href="/catalog" className="btn-primary">
            Retry catalog
          </Link>
          <Link href="/account" className="btn-secondary">
            My account
          </Link>
        </div>
      </div>
    </div>
  );
}
