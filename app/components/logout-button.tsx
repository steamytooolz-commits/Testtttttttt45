'use client';

import React, { useState } from 'react';

 export function LogoutButton({
  csrfToken,
  className,
  children,
  ariaLabel,
}: {
  csrfToken: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
      });
    } catch {

    } finally {

      window.location.href = '/login';
    }
  }

  return (
    <button type="button" onClick={handleLogout} disabled={busy} className={className} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
