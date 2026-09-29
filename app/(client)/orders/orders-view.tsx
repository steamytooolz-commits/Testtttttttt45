'use client';

import React, { useState } from 'react';
import { apiMessage, readApiData, type ApiResponseBody } from '@/lib/api-client';
import Link from 'next/link';
import type { CustomerOrderHistoryItem } from '@/lib/services/order_history';
import type { OrderStatus } from '@/lib/repo/mysql';
import { 
  Package, 
  Repeat, 
  RefreshCw, 
  Search, 
  CircleCheckBig, 
  Clock, 
  Truck, 
  CircleX,
  Receipt,
  ChevronDown,
  ChevronUp,
  ArrowRight
} from 'lucide-react';

interface OrdersViewProps {
  initialOrders: CustomerOrderHistoryItem[];
  csrfToken: string;
}

type TabType = 'ALL' | OrderStatus;

export function OrdersView({ initialOrders, csrfToken }: OrdersViewProps) {
  const [orders, setOrders] = useState<CustomerOrderHistoryItem[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [repeatingOrderId, setRepeatingOrderId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    showCartLink?: boolean;
  } | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(
    initialOrders.length > 0 ? initialOrders[0].id : null
  );

  const filteredOrders = orders.filter((order) => {
    if (activeTab !== 'ALL' && order.status !== activeTab) {
      return false;
    }
    if (!searchQuery.trim()) {
      return true;
    }
    const q = searchQuery.toLowerCase().trim();
    const orderNum = order.order_number.toLowerCase();
    const invNum = order.invoice?.invoice_number.toLowerCase() || '';
    const hasSku = order.lines.some((l) => l.sku.toLowerCase().includes(q) || l.description_snapshot.toLowerCase().includes(q));
    return orderNum.includes(q) || invNum.includes(q) || hasSku;
  });

  const getCountByStatus = (status: TabType): number => {
    if (status === 'ALL') return orders.length;
    return orders.filter((o) => o.status === status).length;
  };

  const handleRefresh = async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await readApiData<ApiResponseBody>(res);
      if (res.ok && Array.isArray(data.orders)) {
        setOrders(data.orders as CustomerOrderHistoryItem[]);
      }
    } catch {

    }
  };

  const handleRepeatOrder = async (order: CustomerOrderHistoryItem) => {
    setRepeatingOrderId(order.id);
    setNotification(null);

    try {
      const res = await fetch(`/api/orders/${order.id}/repeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
      });

      const data = await readApiData<ApiResponseBody & { clonedCount: number }>(res);

      if (!res.ok) {
        throw new Error(apiMessage(data, 'Failed to clone order items'));
      }

      setNotification({
        type: 'success',
        message: `Successfully cloned ${data.clonedCount} line item(s) from Order #${order.order_number} into your active cart at current wholesale tier rates!`,
        showCartLink: true,
      });
    } catch (err: unknown) {
      setNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not repeat order.',
      });
    } finally {
      setRepeatingOrderId(null);
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING_SALES_REVIEW':
        return (
          <span className="badge-amber">
            <Clock className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'APPROVED':
        return (
          <span className="badge-blue">
            <CircleCheckBig className="w-3 h-3" />
            Sales Approved
          </span>
        );
      case 'INVOICED':
        return (
          <span className="badge-purple">
            <Receipt className="w-3 h-3" />
            Invoiced
          </span>
        );
      case 'FULFILLED':
        return (
          <span className="badge-emerald">
            <Truck className="w-3 h-3" />
            Dispatched & Fulfilled
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="badge-rose">
            <CircleX className="w-3 h-3" />
            Cancelled
          </span>
        );
      default:
        return <span className="badge-neutral">{status}</span>;
    }
  };

  const getTimelineSteps = (status: OrderStatus) => {
    const isCancelled = status === 'CANCELLED';
    const steps = [
      { key: 'PENDING_SALES_REVIEW', label: 'Order Placed' },
      { key: 'APPROVED', label: 'Sales Approved' },
      { key: 'INVOICED', label: 'Sales Invoice' },
      { key: 'FULFILLED', label: 'Dispatched' },
    ];

    const getStatusIndex = (st: OrderStatus) => {
      switch (st) {
        case 'PENDING_SALES_REVIEW': return 0;
        case 'APPROVED': return 1;
        case 'INVOICED': return 2;
        case 'FULFILLED': return 3;
        default: return -1;
      }
    };

    const currentIndex = getStatusIndex(status);

    if (isCancelled) {
      return (
        <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-lg text-rose-900 text-xs flex items-center justify-between">
          <span>This sales order has been cancelled. Inventory reservations were released.</span>
          <span className="font-bold uppercase tracking-wider text-[10px] bg-rose-200 px-2 py-0.5 rounded">Cancelled</span>
        </div>
      );
    }

    return (
      <div className="w-full py-1">
        <div className="flex items-center justify-between relative">
          {steps.map((step, idx) => {
            const isCompleted = currentIndex >= idx;
            const isCurrent = currentIndex === idx;

            return (
              <div key={step.key} className="flex-1 relative flex flex-col items-center">
                {idx > 0 && (
                  <div
                    className={`absolute top-3 left-0 right-1/2 -z-10 h-0.5 ${
                      currentIndex >= idx ? 'bg-brand-600' : 'bg-neutral-200'
                    }`}
                  />
                )}
                {idx < steps.length - 1 && (
                  <div
                    className={`absolute top-3 left-1/2 right-0 -z-10 h-0.5 ${
                      currentIndex > idx ? 'bg-brand-600' : 'bg-neutral-200'
                    }`}
                  />
                )}

                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isCompleted
                      ? 'bg-brand-600 text-white'
                      : 'bg-neutral-200 text-neutral-500 dark:text-slate-400 border border-neutral-300'
                  } ${isCurrent ? 'ring-2 ring-brand-600 ring-offset-2' : ''}`}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>

                <span
                  className={`text-[11px] mt-1 font-medium text-center ${
                    isCurrent ? 'text-neutral-950 dark:text-slate-100 font-bold' : isCompleted ? 'text-neutral-700' : 'text-neutral-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      { }
      {notification && (
        <div
          className={`p-4 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3 shadow-sm border ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            <span>{notification.message}</span>
            {notification.showCartLink && (
              <Link
                href="/cart"
                className="ml-2 px-3 py-1 bg-emerald-800 text-white hover:bg-emerald-900 font-bold rounded-lg text-xs transition inline-flex items-center gap-1"
              >
                <span>View Cart &amp; Checkout</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-neutral-500 dark:text-slate-400 hover:text-neutral-900 dark:text-slate-200 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      { }
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['ALL', 'All Orders'],
                ['PENDING_SALES_REVIEW', 'In Review'],
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
                  className={isActive ? 'tab-pill-active' : 'tab-pill-idle'}
                >
                  <span>{label}</span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded-full font-mono ${
                      isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 dark:bg-white/[0.08] text-neutral-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Order #, SKU…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field !py-1.5 !text-xs pl-9"
              />
            </div>
            <button onClick={handleRefresh} className="btn-secondary !py-1.5 !text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      { }
      {filteredOrders.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-white/[0.08] text-neutral-500 dark:text-slate-400 mx-auto flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
          <p className="text-neutral-900 dark:text-slate-200 text-sm font-bold">No sales orders found</p>
          <p className="text-neutral-500 dark:text-slate-400 text-xs max-w-md mx-auto">
            {activeTab !== 'ALL'
              ? `You do not have any orders currently in status ${activeTab}.`
              : 'You have not placed any commercial wholesale orders yet.'}
          </p>
          <Link href="/catalog" className="btn-primary">
            <span>Browse Wholesale Catalog</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const isRepeating = repeatingOrderId === order.id;

            return (
              <div
                key={order.id}
                className="card overflow-hidden divide-y divide-neutral-100 transition-all"
              >
                { }
                <div className="p-4 bg-neutral-50/80 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-base font-mono font-extrabold text-neutral-950 dark:text-slate-100">{order.order_number}</span>
                    {getStatusBadge(order.status)}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span className="text-neutral-500 dark:text-slate-400">
                      Date: <strong className="text-neutral-800">{new Date(order.created_at).toLocaleDateString()}</strong>
                    </span>
                    <span className="text-neutral-500 dark:text-slate-400">
                      Items: <strong className="text-neutral-800">{order.lines.length}</strong>
                    </span>
                    <span className="text-neutral-500 dark:text-slate-400 font-medium">
                      Total: <strong className="text-neutral-950 dark:text-slate-100 font-mono text-sm font-bold">R {order.total}</strong>
                    </span>

                    <button
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      className="btn-secondary !py-1.5 !text-xs"
                    >
                      <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                { }
                <div className="px-6 py-3.5 bg-white dark:bg-white/[0.04] border-b border-neutral-100">
                  {getTimelineSteps(order.status)}
                </div>

                { }
                {isExpanded && (
                  <div className="p-0 bg-neutral-50/20 divide-y divide-neutral-200">
                    { }
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-200 text-neutral-500 dark:text-slate-400 bg-neutral-100/80 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="py-2.5 px-4">SKU</th>
                            <th className="py-2.5 px-4">Description</th>
                            <th className="py-2.5 px-4 text-center">Tier</th>
                            <th className="py-2.5 px-4 text-right">Quantity</th>
                            <th className="py-2.5 px-4 text-right">Unit Price (excl. VAT)</th>
                            <th className="py-2.5 px-4 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200/60">
                          {order.lines.map((line) => (
                            <tr key={line.id} className="hover:bg-neutral-50 dark:bg-white/[0.06]">
                              <td className="py-2.5 px-4 font-mono font-medium text-neutral-800">
                                {line.sku}
                              </td>
                              <td className="py-2.5 px-4 text-neutral-800 font-medium">
                                {line.description_snapshot}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-white/[0.08] border border-neutral-200 text-neutral-800 rounded font-mono text-[10px]">
                                  {line.tier_code}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-neutral-900 dark:text-slate-200">
                                {line.qty}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-neutral-700">
                                R {line.unit_price}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-neutral-900 dark:text-slate-200">
                                R {line.line_total}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    { }
                    <div className="p-4 bg-white dark:bg-white/[0.04] flex flex-wrap items-center justify-between gap-4">
                      { }
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleRepeatOrder(order)}
                          disabled={isRepeating}
                          className="btn-primary !text-xs"
                        >
                          <Repeat className={`w-3.5 h-3.5 ${isRepeating ? 'animate-spin' : ''}`} />
                          <span>{isRepeating ? 'Cloning lines…' : 'Repeat Order (1-Click)'}</span>
                        </button>
                        <span className="text-[11px] text-neutral-500 dark:text-slate-400 hidden sm:inline">
                          Clones lines into active cart at current wholesale tier prices.
                        </span>
                      </div>

                      { }
                      <div className="text-right space-y-1 text-xs">
                        <div className="text-neutral-600 dark:text-slate-300">
                          Subtotal (excl. VAT): <span className="font-mono font-semibold">R {order.subtotal}</span>
                        </div>
                        <div className="text-neutral-600 dark:text-slate-300">
                          15% VAT: <span className="font-mono font-semibold">R {order.vat}</span>
                        </div>
                        <div className="text-sm font-extrabold text-neutral-950 dark:text-slate-100 pt-1 border-t border-neutral-200 dark:border-white/10">
                          Grand Total: <span className="font-mono text-neutral-900 dark:text-slate-200">R {order.total}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
