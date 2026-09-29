'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function PickerInner({
  customers,
  selectedId,
}: {
  customers: Array<{ id: number; company_name: string; status: string }>;
  selectedId: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="card p-4">
      <label htmlFor="preview-customer" className="field-label">
        Preview portal as customer
      </label>
      <select
        id="preview-customer"
        value={selectedId === null ? '' : String(selectedId)}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) {
            params.set('customerId', e.target.value);
          } else {
            params.delete('customerId');
          }
          const qs = params.toString();
          router.replace(qs ? `/account?${qs}` : '/account', { scroll: false });
        }}
        className="input-field"
      >
        <option value="">— Select a customer —</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.company_name} ({c.status.replace(/_/g, ' ')})
          </option>
        ))}
      </select>
    </div>
  );
}

export function StaffPreviewPicker(props: {
  customers: Array<{ id: number; company_name: string; status: string }>;
  selectedId: number | null;
}) {
  return (
    <Suspense fallback={<div className="h-16 bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-xl animate-pulse" />}>
      <PickerInner {...props} />
    </Suspense>
  );
}
