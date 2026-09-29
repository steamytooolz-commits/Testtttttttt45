import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-page dark:bg-page-dark text-neutral-900 dark:text-slate-200">
      <div className="card p-10 text-center max-w-md w-full">
        <p className="kicker text-brand-700 mb-2">Error 404</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-950 dark:text-slate-100">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-slate-400 leading-relaxed">
          The requested resource could not be found. It may have been moved, or you may not have access to it.
        </p>
        <Link href="/" className="btn-primary mt-6 w-full">
          Return Home
        </Link>
      </div>
    </div>
  );
}
