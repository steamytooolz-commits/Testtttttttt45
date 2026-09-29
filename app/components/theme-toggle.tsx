'use client';

import { useState, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'sd-theme';

let themeListeners: Array<() => void> = [];

function emitThemeChange() {
  for (const listener of themeListeners) listener();
}

function subscribeTheme(callback: () => void) {
  themeListeners.push(callback);
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => {
    themeListeners = themeListeners.filter((l) => l !== callback);
    observer.disconnect();
  };
}

function getThemeSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function getServerSnapshot(): boolean {
  return false;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [hydrated, setHydrated] = useState(false);
  const dark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerSnapshot);

  function toggle() {
    const next = !(document.documentElement.classList.contains('dark'));
    document.documentElement.classList.toggle('dark', next);
    setHydrated(true);
    emitThemeChange();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* storage unavailable; session-only theme */
    }
    try {
      document.cookie = `sd-theme=${next ? 'dark' : 'light'}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  }

  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={dark ?? false}
      className={`inline-flex items-center justify-center rounded-md p-2 text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:bg-white/[0.08] hover:text-brand-800 transition-colors dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60 ${className}`}
    >
      {hydrated && dark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}
