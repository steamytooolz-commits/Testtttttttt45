'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'sd-theme';
const emptySubscribe = () => () => {};

function subscribeTheme(callback: () => void) {
  window.addEventListener('theme-changed', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('theme-changed', callback);
    window.removeEventListener('storage', callback);
  };
}

function getThemeSnapshot(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
}

function getServerSnapshot(): boolean {
  return false;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const isDark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerSnapshot);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  function toggle() {
    const currentlyDark = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
    const nextDark = !currentlyDark;

    if (nextDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    }

    try {
      localStorage.setItem(STORAGE_KEY, nextDark ? 'dark' : 'light');
    } catch {}

    try {
      document.cookie = `sd-theme=${nextDark ? 'dark' : 'light'}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}

    window.dispatchEvent(new Event('theme-changed'));
  }

  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-md p-2 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60 min-w-[38px] min-h-[38px] ${className}`}
    >
      {mounted && isDark ? (
        <Sun className="w-5 h-5 text-amber-400" aria-hidden="true" />
      ) : (
        <Moon className="w-5 h-5 text-neutral-600 dark:text-slate-300" aria-hidden="true" />
      )}
    </button>
  );
}


