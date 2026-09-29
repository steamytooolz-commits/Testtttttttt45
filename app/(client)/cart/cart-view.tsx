'use client';

import { useState } from 'react';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';
import Link from 'next/link';
import type { CartData } from '@/lib/repo/redis';

interface CartViewProps {
  initialCart: CartData;
  csrfToken: string;
}

export function CartView({ initialCart, csrfToken }: CartViewProps) {
  const [cart, setCart] = useState<CartData>(initialCart);
  const [loadingSku, setLoadingSku] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<{
    orderId: number;
    orderNumber: string;
    total: string;
  } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofUploaded, setProofUploaded] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const handleUpdateQty = async (sku: string, qty: number) => {
    setLoadingSku(sku);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/cart/items/${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ qty }),
      });

      const data = await readApiData<ApiResponseBody & CartData>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to update item quantity'));
      }

      setCart(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating item';
      setErrorMessage(msg);
    } finally {
      setLoadingSku(null);
    }
  };

  const handleRemoveItem = async (sku: string) => {
    setLoadingSku(sku);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/cart/items/${encodeURIComponent(sku)}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });

      const data = await readApiData<ApiResponseBody & CartData>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to remove item'));
      }

      setCart(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error removing item';
      setErrorMessage(msg);
    } finally {
      setLoadingSku(null);
    }
  };

  const handleCheckout = async () => {
    if (cart.items.length === 0) return;
    setCheckingOut(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
      });

      const data = await readApiData<
        ApiResponseBody & { order: { id: number; order_number: string; total: string } }
      >(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to process checkout'));
      }

      setOrderConfirmation({
        orderId: data.order.id,
        orderNumber: data.order.order_number,
        total: data.order.total,
      });

      setCart({
        customerId: cart.customerId,
        items: [],
        subtotal: '0.00',
        vat: '0.00',
        total: '0.00',
        updatedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Checkout encountered an error';
      setErrorMessage(msg);
    } finally {
      setCheckingOut(false);
    }
  };

  const handleProofUpload = async () => {
    if (!orderConfirmation || !proofFile) return;
    setUploadingProof(true);
    setProofError(null);
    try {
      const fd = new FormData();
      fd.append('file', proofFile);
      const res = await fetch(`/api/orders/${orderConfirmation.orderId}/payment-proof`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: fd,
      });
      const data = await readApiData<ApiResponseBody>(res);
      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to upload proof of payment'));
      }
      setProofUploaded(true);
      setProofFile(null);
    } catch (err: unknown) {
      setProofError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingProof(false);
    }
  };

  if (orderConfirmation) {
    return (
      <div id="order-confirmation-card" className="card p-8 sm:p-10 max-w-2xl mx-auto text-center space-y-6">
        <div className="w-14 h-14 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <span className="badge-amber">Status: PENDING_SALES_REVIEW</span>
          <h2 className="text-2xl font-extrabold text-neutral-950 dark:text-slate-100 mt-3 tracking-tight">
            Order <span className="font-mono">{orderConfirmation.orderNumber}</span> confirmed
          </h2>
          <p className="text-sm text-neutral-600 dark:text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
            Your commercial purchase order has been captured in the ledger. Inventory has been verified and stock balances decremented.
          </p>
        </div>

        <div className="rounded-md bg-neutral-50 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 p-4 text-left text-sm space-y-2 max-w-md mx-auto">
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-slate-400">Order reference</span>
            <span className="font-mono font-bold text-neutral-900 dark:text-slate-200">{orderConfirmation.orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-slate-400">Total (ZAR incl. VAT)</span>
            <span className="font-mono font-bold text-neutral-900 dark:text-slate-200">R {orderConfirmation.total}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-slate-400">Queue status</span>
            <span className="text-amber-700 font-semibold">Awaiting staff review</span>
          </div>
        </div>

        <div className="rounded-md bg-brand-50 dark:bg-white/[0.06] border border-brand-200 dark:border-white/10 p-4 text-left text-sm space-y-2 max-w-md mx-auto">
          <div className="font-bold text-brand-900 dark:text-slate-100 text-xs uppercase tracking-wider">Pay at checkout — EFT transfer</div>
          <div className="text-xs text-neutral-700 dark:text-slate-300 font-mono leading-relaxed">
            First National Bank<br />
            Acc: 62819284719 &nbsp;•&nbsp; Branch: 250655<br />
            Reference: <strong>{orderConfirmation.orderNumber}</strong><br />
            Amount due: <strong>R {orderConfirmation.total}</strong>
          </div>
          {proofUploaded ? (
            <div className="mt-3 p-2.5 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Proof of payment received — the sales team has been notified.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <label htmlFor="proof-upload" className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                Upload proof of payment (PNG, JPEG, WebP or PDF, max 5 MB)
              </label>
              <input
                id="proof-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => {
                  setProofFile(e.target.files?.[0] ?? null);
                  setProofError(null);
                }}
                className="block w-full text-xs text-neutral-700 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-brand-700 file:text-white file:text-xs file:font-bold file:cursor-pointer"
              />
              {proofError && <p className="text-xs text-rose-600 font-semibold">{proofError}</p>}
              <button
                type="button"
                id="proof-upload-btn"
                disabled={!proofFile || uploadingProof}
                onClick={handleProofUpload}
                className="btn-primary w-full py-2.5 text-xs uppercase tracking-wider disabled:opacity-40"
              >
                {uploadingProof ? 'Uploading…' : 'Upload Proof of Payment'}
              </button>
            </div>
          )}
        </div>

        <div className="pt-4 flex flex-col sm:flex-row justify-center gap-3">
          <Link id="browse-catalog-link" href="/catalog" className="btn-primary">
            Return to Catalog
          </Link>
          <Link id="orders-history-link" href="/orders" className="btn-secondary">
            Order History
          </Link>
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div id="empty-cart-card" className="card p-12 text-center max-w-xl mx-auto space-y-4">
        <h2 className="text-lg font-bold text-neutral-950 dark:text-slate-100">Wholesale cart is empty</h2>
        <p className="text-sm text-neutral-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
          No commercial line items added yet. Select products from the wholesale catalog to build your order.
        </p>
        <div className="pt-2">
          <Link id="empty-cart-catalog-btn" href="/catalog" className="btn-primary">
            Browse Wholesale Catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div id="cart-container" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      { }
      <div className="lg:col-span-2 space-y-4">
        {errorMessage && (
          <div id="cart-error-banner" className="notice-error font-mono text-xs">{errorMessage}</div>
        )}

        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 bg-neutral-50 dark:bg-white/[0.06] border-b border-neutral-200 dark:border-white/10 flex justify-between items-center text-xs font-semibold text-neutral-600 dark:text-slate-300">
            <span>Wholesale line items ({cart.items.length})</span>
            <span className="font-mono text-[11px]">All prices excl. 15% VAT</span>
          </div>

          <div className="divide-y divide-neutral-100">

          {cart.items.map((item) => (
            <div
              key={item.sku}
              id={`cart-item-${item.sku}`}
              className="p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-brand-800">{item.sku}</span>
                  <span className="badge-neutral !text-[10px] !px-1.5 !py-0 font-mono">{item.tier_code}</span>
                </div>
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-slate-200">{item.description}</h4>
                <div className="text-xs font-mono text-neutral-500 dark:text-slate-400">Unit rate: R {item.unit_price} (excl. VAT)</div>
              </div>

              <div className="flex items-center justify-between sm:justify-end space-x-6">
                { }
                <div className="flex items-center border border-neutral-300 rounded-md overflow-hidden">
                  <button
                    type="button"
                    disabled={loadingSku === item.sku || item.qty <= 1}
                    onClick={() => handleUpdateQty(item.sku, item.qty - 1)}
                    className="px-3 py-1.5 text-sm text-neutral-600 dark:text-slate-300 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-30 transition-colors"
                  >
                    &minus;
                  </button>
                  <span className="px-3 py-1.5 text-xs font-mono font-bold text-neutral-900 dark:text-slate-200 bg-white dark:bg-white/[0.04] min-w-[36px] text-center">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    disabled={loadingSku === item.sku}
                    onClick={() => handleUpdateQty(item.sku, item.qty + 1)}
                    className="px-3 py-1.5 text-sm text-neutral-600 dark:text-slate-300 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-30 transition-colors"
                  >
                    +
                  </button>
                </div>

                { }
                <div className="text-right min-w-[90px]">
                  <div className="font-mono font-bold text-sm text-neutral-950 dark:text-slate-100">R {item.line_total}</div>
                  <div className="text-[10px] text-neutral-400 font-mono">excl. VAT</div>
                </div>

                <button
                  type="button"
                  id={`remove-item-${item.sku}`}
                  disabled={loadingSku === item.sku}
                  onClick={() => handleRemoveItem(item.sku)}
                  className="text-xs text-rose-600 hover:text-rose-800 p-1.5 rounded hover:bg-rose-50 disabled:opacity-50 transition-colors"
                  title="Remove Item"
                  aria-label={`Remove ${item.sku} from cart`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          </div>
        </div>

        <div className="notice-warn text-xs space-y-1">
          <div className="font-bold">VAT & stock compliance</div>
          <p className="leading-relaxed">
            Upon order placement, available stock is checked and reserved. Invoices are issued sequentially upon dispatch according to national tax regulations.
          </p>
        </div>
      </div>

      { }
      <div className="lg:col-span-1">
        <div id="cart-summary-card" className="card p-6 space-y-6 lg:sticky lg:top-24">
          <h3 className="kicker text-neutral-900 dark:text-slate-200 pb-3 border-b border-neutral-200 dark:border-white/10">Order Summary</h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-neutral-600 dark:text-slate-300">
              <span>Subtotal (excl. VAT)</span>
              <span className="font-mono font-bold text-neutral-900 dark:text-slate-200">R {cart.subtotal}</span>
            </div>

            <div className="flex justify-between text-neutral-600 dark:text-slate-300">
              <span>VAT @ 15.00%</span>
              <span className="font-mono font-bold text-neutral-900 dark:text-slate-200">R {cart.vat}</span>
            </div>

            <div className="pt-3 border-t border-neutral-200 dark:border-white/10 flex justify-between items-baseline">
              <span className="font-bold text-neutral-950 dark:text-slate-100">Total</span>
              <span className="font-extrabold text-neutral-950 dark:text-slate-100 font-mono text-xl tracking-tight">R {cart.total}</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              id="checkout-submit-btn"
              type="button"
              disabled={checkingOut || cart.items.length === 0}
              onClick={handleCheckout}
              className="btn-primary w-full py-3.5 text-xs uppercase tracking-wider"
            >
              {checkingOut ? 'Reserving stock & placing order…' : 'Submit Wholesale Order'}
            </button>
            <p className="text-[11px] text-neutral-500 dark:text-slate-400 text-center mt-3">
              Pay via EFT at checkout and upload your proof of payment on the confirmation screen. Sales review both.
            </p>
          </div>

          <div className="pt-4 border-t border-neutral-100 text-center">
            <Link href="/catalog" className="text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline underline-offset-4">
              &larr; Back to Catalog
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
