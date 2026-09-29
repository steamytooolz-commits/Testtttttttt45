'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'sd-theme';

export function ThemeInit() {
  useEffect(() => {
    try {
      const cookieMatch = document.cookie.match(/(?:^|; )sd-theme=([^;]*)/)?.[1];
      if (cookieMatch === 'dark' || cookieMatch === 'light') {
        const isDark = cookieMatch === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        if (isDark) {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
        try {
          localStorage.setItem(STORAGE_KEY, cookieMatch);
        } catch {}
        window.dispatchEvent(new Event('theme-changed'));
        return;
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldDark = stored === 'dark' || (!stored && prefersDark);
      
      document.documentElement.classList.toggle('dark', shouldDark);
      if (shouldDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      const toStore = shouldDark ? 'dark' : 'light';
      
      try {
        localStorage.setItem(STORAGE_KEY, toStore);
      } catch {}
      
      document.cookie = `sd-theme=${toStore}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new Event('theme-changed'));
    } catch {}
  }, []);

  return null;
}

