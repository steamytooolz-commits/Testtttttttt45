'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'sd-theme';

export function ThemeInit() {
  useEffect(() => {
    try {
      const cookieMatch = document.cookie.match(/(?:^|; )sd-theme=([^;]*)/)?.[1];
      if (cookieMatch === 'dark' || cookieMatch === 'light') {
        document.documentElement.classList.toggle('dark', cookieMatch === 'dark');
        try {
          localStorage.setItem(STORAGE_KEY, cookieMatch);
        } catch {}
        return;
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldDark = stored === 'dark' || (!stored && prefersDark);
      document.documentElement.classList.toggle('dark', shouldDark);
      const toStore = shouldDark ? 'dark' : 'light';
      try {
        localStorage.setItem(STORAGE_KEY, toStore);
      } catch {}
      document.cookie = `sd-theme=${toStore}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  }, []);

  return null;
}
