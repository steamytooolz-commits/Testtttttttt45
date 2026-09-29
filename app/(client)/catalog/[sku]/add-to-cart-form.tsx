'use client';

import { useState } from 'react';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';

interface AddToCartFormProps {
  sku: string;
  csrfToken: string;
}

export function AddToCartForm({ sku, csrfToken }: AddToCartFormProps) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/cart/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ sku, qty }),
      });

      const data = await readApiData<ApiResponseBody>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to add item to cart'));
      }

      setSuccess(true);
      router.refresh();
      setTimeout(() => {
        router.push('/cart');
      }, 600);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error adding item';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" id="add-to-cart-form">
      {error && <div className="notice-error text-xs font-mono">{error}</div>}

      {success && (
        <div className="notice-success text-xs">Added {qty} units to cart. Redirecting to checkout…</div>
      )}

      <div>
        <label htmlFor="order-qty-input" className="field-label">
          Order Quantity
        </label>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={loading}
            className="btn-secondary !px-3.5 font-mono"
          >
            &minus;
          </button>
          <input
            id="order-qty-input"
            type="number"
            value={qty}
            min={1}
            max={10000}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="input-field flex-1 text-center font-mono"
            disabled={loading}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty((q) => Math.min(10000, q + 1))}
            disabled={loading}
            className="btn-secondary !px-3.5 font-mono"
          >
            +
          </button>
        </div>
      </div>

      <button
        id="add-to-cart-submit"
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3 text-xs uppercase tracking-wider"
      >
        <ShoppingCart className="w-4 h-4" aria-hidden="true" />
        {loading ? 'Adding to Cart…' : 'Add to Wholesale Cart'}
      </button>
    </form>
  );
}
