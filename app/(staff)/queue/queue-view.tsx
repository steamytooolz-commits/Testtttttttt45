'use client';

import React, { useState, useEffect } from 'react';
import type { StaffQueueOrder, OrderStatus, OrderTransitionAction } from '@/lib/repo/mysql';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';
import {
  FileText,
  RefreshCw,
  CircleCheckBig,
  Clock,
  CircleX,
  PackageCheck,
  Search,
  TriangleAlert,
  Building2,
  Calendar,
  Download,
  ReceiptText,
  X
} from 'lucide-react';

interface QueueViewProps {
  initialOrders: StaffQueueOrder[];
  csrfToken: string;
  userRole: string;
}

type TabType = 'ALL' | OrderStatus;

export function QueueView({ initialOrders, csrfToken, userRole }: QueueViewProps) {
  const isAdmin = userRole === 'ADMIN';
  const [orders, setOrders] = useState<StaffQueueOrder[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedOrderForCancel, setSelectedOrderForCancel] = useState<StaffQueueOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const filteredOrders = orders.filter((order) => {
    if (activeTab !== 'ALL' && order.status !== activeTab) {
      return false;
    }
    if (!searchQuery.trim()) {
      return true;
    }
    const q = searchQuery.toLowerCase().trim();
    const orderNum = order.order_number.toLowerCase();
    const company = order.customer?.company_name.toLowerCase() || '';
    const contact = order.customer?.contact_name.toLowerCase() || '';
    const invNum = order.invoice?.invoice_number.toLowerCase() || '';
    return orderNum.includes(q) || company.includes(q) || contact.includes(q) || invNum.includes(q);
  });

  const getCountByStatus = (status: TabType): number => {
    if (status === 'ALL') return orders.length;
    return orders.filter((o) => o.status === status).length;
  };

  const handleRefresh = async () => {
    try {
      setErrorMessage(null);
      const res = await fetch('/api/staff/queue');
      const data = await readApiData(res);
      if (res.ok && data.orders) {
        setOrders(data.orders as StaffQueueOrder[]);
      }
    } catch {
      setErrorMessage('Failed to refresh order queue.');
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      void handleRefresh();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleTransition = async (orderId: number, action: OrderTransitionAction, reason?: string) => {
    setLoadingOrderId(orderId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/staff/orders/${orderId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          action,
          reason,
        }),
      });

      const data = await readApiData<
        ApiResponseBody & {
          order: { order_number: string };
          invoice?: { invoice_number: string };
        }
      >(res);

      if (!res.ok) {
        throw new Error(apiMessage(data, `Failed to transition order (${res.status})`));
      }

      setSuccessMessage(
        action === 'INVOICE'
          ? `Order #${data.order.order_number} invoiced successfully with Sales Invoice ${data.invoice?.invoice_number}!`
          : action === 'APPROVE'
          ? `Order #${data.order.order_number} has been approved.`
          : action === 'FULFIL'
          ? `Order #${data.order.order_number} marked as fulfilled.`
          : `Order #${data.order.order_number} has been cancelled and inventory restored.`
      );

      await handleRefresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Transition failed.');
    } finally {
      setLoadingOrderId(null);
    }
  };

  const openCancelModal = (order: StaffQueueOrder) => {
    setSelectedOrderForCancel(order);
    setCancelReason('');
    setCancelError(null);
    setCancelModalOpen(true);
  };

  const confirmCancel = async () => {
    if (!selectedOrderForCancel) return;
    if (!cancelReason.trim()) {
      setCancelError('Please enter a cancellation reason.');
      return;
    }

    const orderId = selectedOrderForCancel.id;
    setCancelModalOpen(false);
    await handleTransition(orderId, 'CANCEL', cancelReason.trim());
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING_SALES_REVIEW':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-900 text-xs font-semibold rounded-full border border-amber-200 inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-700" />
            <span>Pending Sales Review</span>
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 bg-blue-50 text-blue-900 text-xs font-semibold rounded-full border border-blue-200 inline-flex items-center gap-1">
            <CircleCheckBig className="w-3 h-3 text-blue-700" />
            <span>Approved</span>
          </span>
        );
      case 'INVOICED':
        return (
          <span className="px-2.5 py-1 bg-purple-50 text-purple-900 text-xs font-semibold rounded-full border border-purple-200 inline-flex items-center gap-1">
            <FileText className="w-3 h-3 text-purple-700" />
            <span>Invoiced (Sales Invoice)</span>
          </span>
        );
      case 'FULFILLED':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-900 text-xs font-semibold rounded-full border border-emerald-200 inline-flex items-center gap-1">
            <PackageCheck className="w-3 h-3 text-emerald-700" />
            <span>Fulfilled &amp; Dispatched</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-1 bg-rose-50 text-rose-900 text-xs font-semibold rounded-full border border-rose-200 inline-flex items-center gap-1">
            <CircleX className="w-3 h-3 text-rose-700" />
            <span>Cancelled (Stock Restored)</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-neutral-100 dark:bg-white/[0.08] text-neutral-800 text-xs font-semibold rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium rounded-xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-2">
            <CircleCheckBig className="w-4 h-4 text-emerald-700" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium rounded-xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-2">
            <TriangleAlert className="w-4 h-4 text-rose-700" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-900 font-bold ml-4"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-[#101a2c] border border-slate-200 dark:border-white/10 rounded-xl p-1.5 flex flex-wrap gap-1 shadow-sm">
        <div className="flex flex-wrap gap-1 flex-1">
            {(
              [
                ['ALL', 'All Orders'],
                ['PENDING_SALES_REVIEW', 'Pending'],
                ['APPROVED', 'Approved'],
                ['INVOICED', 'Invoiced'],
                ['FULFILLED', 'Fulfilled'],
                ['CANCELLED', 'Cancelled'],
              ] as [TabType, string][]
            ).map(([tab, label]) => {
              const count = getCountByStatus(tab);
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold tracking-wide whitespace-nowrap transition-all ${isActive ? 'bg-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}
                >
                  <span>{label}</span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded-full font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search order #, company…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
              />
            </div>
            <button onClick={handleRefresh} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
      </div>

      { }
      {filteredOrders.length === 0 ? (
        <div className="card p-12 text-center space-y-2">
          <p className="text-neutral-900 dark:text-slate-200 text-sm font-bold">No sales orders found matching criteria</p>
          <p className="text-neutral-500 dark:text-slate-400 text-xs max-w-sm mx-auto">
            {activeTab !== 'ALL'
              ? `There are currently no orders in status ${activeTab}.`
              : 'New commercial customer orders will appear here automatically.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredOrders.map((order) => {
            const isProcessing = loadingOrderId === order.id;

            return (
              <div
                key={order.id}
                className="card overflow-hidden divide-y divide-neutral-100"
              >
                <div className="p-4 bg-neutral-50/70 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-mono font-bold text-neutral-900 dark:text-slate-200">
                      {order.order_number}
                    </span>
                    {getStatusBadge(order.status)}
                    {order.invoice && (
                      <span className="badge-purple font-mono">
                        <FileText className="w-3 h-3" />
                        {order.invoice.invoice_number}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-neutral-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      Placed: <strong className="text-neutral-800">{new Date(order.created_at).toLocaleString()}</strong>
                    </span>
                    <span>
                      Order ID: <strong className="font-mono text-neutral-800">#{order.id}</strong>
                    </span>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-white">
                  <div>
                    <span className="text-neutral-400 uppercase font-bold tracking-wider text-[10px] flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-neutral-400" />
                      Commercial Customer
                    </span>
                    <p className="font-semibold text-neutral-900 dark:text-slate-200 mt-0.5 text-sm">
                      {order.customer?.company_name || `Customer ID #${order.customer_id}`}
                    </p>
                    <p className="text-neutral-600 dark:text-slate-300 mt-0.5">{order.customer?.contact_name}</p>
                    <p className="text-neutral-500 dark:text-slate-400 font-mono mt-0.5">{order.customer?.email}</p>
                    {order.customer?.phone && (
                      <p className="text-neutral-500 dark:text-slate-400 font-mono mt-0.5">{order.customer.phone}</p>
                    )}
                  </div>

                  <div>
                    <span className="text-neutral-400 uppercase font-bold tracking-wider text-[10px]">
                      Sales Invoice
                    </span>
                    {order.invoice ? (
                      <div className="mt-0.5 space-y-0.5">
                        <p className="text-neutral-900 dark:text-slate-200 font-semibold font-mono">
                          Invoice: {order.invoice.invoice_number}
                        </p>
                        <p className="text-neutral-600 dark:text-slate-300">
                          Issued: {new Date(order.invoice.issued_at).toLocaleString()}
                        </p>
                        <p className="text-purple-700 font-medium text-[11px] flex items-center gap-1">
                          <CircleCheckBig className="w-3 h-3 text-purple-700" />
                          Sales Invoice Issued
                        </p>
                        <a
                          href={`/api/invoices/${order.invoice.id}/pdf`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:text-brand-900 hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Sales Invoice PDF (for Pastel)</span>
                        </a>
                      </div>
                    ) : (
                      <p className="text-neutral-500 dark:text-slate-400 mt-0.5">
                        {order.status === 'PENDING_SALES_REVIEW'
                          ? 'Awaiting sales review before invoice generation.'
                          : order.status === 'APPROVED'
                          ? 'Ready for sales invoice issue.'
                          : 'No invoice issued.'}
                      </p>
                    )}

                    {order.cancel_reason && (
                      <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-[11px]">
                        <span className="font-bold">Cancellation Reason:</span> {order.cancel_reason}
                      </div>
                    )}
                  </div>

                  <div className="text-right flex flex-col justify-between items-end">
                    <div>
                      <span className="text-neutral-400 uppercase font-bold tracking-wider text-[10px]">
                        Order Financials (ZAR)
                      </span>
                      <div className="mt-1 space-y-0.5">
                        <div className="text-neutral-600 dark:text-slate-300">
                          Subtotal: <span className="font-mono">R {order.subtotal}</span>
                        </div>
                        <div className="text-neutral-600 dark:text-slate-300">
                          15% VAT: <span className="font-mono">R {order.vat}</span>
                        </div>
                        <div className="text-base font-extrabold text-neutral-950 dark:text-slate-100 pt-1">
                          Total: <span className="font-mono">R {order.total}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {order.proofs && order.proofs.length > 0 && (
                  <div className="px-4 py-3 bg-amber-50/60 border-b border-neutral-100 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-800 flex items-center gap-1">
                      <ReceiptText className="w-3.5 h-3.5" />
                      Proof of payment ({order.proofs.length}) — customer uploaded at checkout
                    </span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {order.proofs.map((p) => (
                        <a
                          key={p.id}
                          href={`/api/staff/payment-proofs/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-amber-300 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                        >
                          {p.mime_type === 'application/pdf' ? (
                            <FileText className="w-3.5 h-3.5 text-rose-600" />
                          ) : (
                            <ReceiptText className="w-3.5 h-3.5 text-brand-700" />
                          )}
                          <span className="font-mono">{p.filename}</span>
                          <span className="text-neutral-400">({Math.round(p.size_bytes / 1024)} KB)</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto bg-neutral-50/40">
                  <table className="w-full min-w-[560px] text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-200 text-neutral-500 dark:text-slate-400 bg-neutral-100/60 font-mono text-[10px] uppercase tracking-wider">
                        <th className="py-2.5 px-4 font-semibold">SKU</th>
                        <th className="py-2.5 px-4 font-semibold">Description Snapshot</th>
                        <th className="py-2.5 px-4 font-semibold text-center">Tier</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Qty</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Unit Price (excl)</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200/60 font-mono">
                      {order.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-neutral-50/80">
                          <td className="py-2 px-4 font-bold text-neutral-900 dark:text-slate-200">{line.sku}</td>
                          <td className="py-2 px-4 text-neutral-700 font-sans">{line.description_snapshot}</td>
                          <td className="py-2 px-4 text-center">
                            <span className="px-1.5 py-0.5 bg-neutral-200 text-neutral-800 rounded font-mono text-[10px] font-bold">
                              {line.tier_code}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-right font-bold text-neutral-900 dark:text-slate-200">
                            {line.qty}
                          </td>
                          <td className="py-2 px-4 text-right text-neutral-700">
                            R {line.unit_price}
                          </td>
                          <td className="py-2 px-4 text-right font-bold text-neutral-950 dark:text-slate-100">
                            R {line.line_total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-white dark:bg-white/[0.04] flex flex-wrap items-center justify-end gap-3">
                  <div className="flex items-center space-x-3">
                    {order.status === 'PENDING_SALES_REVIEW' && (
                      <>
                        {isAdmin && (
                          <button
                            onClick={() => openCancelModal(order)}
                            disabled={isProcessing}
                            className="btn-secondary !py-2 !text-xs !border-rose-300 !text-rose-700 hover:!bg-rose-50"
                          >
                            Cancel Order
                          </button>
                        )}

                        <button
                          onClick={() => handleTransition(order.id, 'APPROVE')}
                          disabled={isProcessing}
                          className="btn-primary !py-2 !text-xs uppercase tracking-wider"
                        >
                          {isProcessing ? 'Processing…' : 'Approve Order'}
                        </button>
                      </>
                    )}

                    {order.status === 'APPROVED' && (
                      <>
                        {isAdmin && (
                          <button
                            onClick={() => openCancelModal(order)}
                            disabled={isProcessing}
                            className="btn-secondary !py-2 !text-xs !border-rose-300 !text-rose-700 hover:!bg-rose-50"
                          >
                            Cancel Order
                          </button>
                        )}

                        <button
                          onClick={() => handleTransition(order.id, 'INVOICE')}
                          disabled={isProcessing}
                          className="btn bg-purple-700 text-white hover:bg-purple-800 px-4 py-2 !text-xs font-bold uppercase tracking-wider shadow-sm"
                        >
                          {isProcessing ? 'Issuing Invoice…' : 'Issue Sales Invoice'}
                        </button>
                      </>
                    )}

                    {order.status === 'INVOICED' && (
                      <button
                        onClick={() => handleTransition(order.id, 'FULFIL')}
                        disabled={isProcessing}
                        className="btn bg-emerald-700 text-white hover:bg-emerald-800 px-4 py-2 !text-xs font-bold uppercase tracking-wider shadow-sm"
                      >
                        {isProcessing ? 'Dispatching…' : 'Mark Order Fulfilled'}
                      </button>
                    )}

                    {order.status === 'FULFILLED' && (
                      <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 inline-flex items-center gap-1">
                        <CircleCheckBig className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Order Completed &amp; Dispatched</span>
                      </span>
                    )}

                    {order.status === 'CANCELLED' && (
                      <span className="text-xs font-semibold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 inline-flex items-center gap-1">
                        <CircleX className="w-3.5 h-3.5 text-rose-700" />
                        <span>Order Cancelled (Stock Restored)</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelModalOpen && selectedOrderForCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="card max-w-md w-full p-6 space-y-4 shadow-lift">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <h3 className="text-base font-bold text-neutral-900 dark:text-slate-200 flex items-center gap-2">
                <TriangleAlert className="w-5 h-5 text-rose-600" />
                <span>Cancel Order {selectedOrderForCancel.order_number}</span>
              </h3>
              <button
                onClick={() => setCancelModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-600 dark:text-slate-300">
              Cancelling this order will release and restore the reserved inventory back to warehouse stock balances and log an audit trail. A valid cancellation reason is required.
            </p>

            <div className="space-y-2">
              <label htmlFor="cancel-reason" className="field-label">Cancellation Reason *</label>
              <textarea
                id="cancel-reason"
                rows={3}
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  setCancelError(null);
                }}
                placeholder="e.g. Customer requested cancellation / duplicate order / credit check failed"
                className="input-field text-xs"
              />
              {cancelError && <p className="text-xs text-rose-600 font-semibold">{cancelError}</p>}
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-neutral-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="btn-secondary !py-2 !text-xs"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                className="btn-danger !py-2 !text-xs"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
