'use client';

import React, { useState } from 'react';
import { readApiData, type ApiResponseBody } from '@/lib/api-client';
import Link from 'next/link';
import type { CustomerInvoiceHistoryItem } from '@/lib/services/order_history';
import { 
  FileText, 
  Search, 
  RefreshCw, 
  CircleCheckBig, 
  Building2, 
  Receipt,
  ArrowLeft,
  X,
  CreditCard,
  ShieldCheck
} from 'lucide-react';

interface InvoicesViewProps {
  initialInvoices: CustomerInvoiceHistoryItem[];
}

export function InvoicesView({ initialInvoices }: InvoicesViewProps) {
  const [invoices, setInvoices] = useState<CustomerInvoiceHistoryItem[]>(initialInvoices);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoiceHistoryItem | null>(null);

  const filteredInvoices = invoices.filter((inv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const invNum = inv.invoice_number.toLowerCase();
    const orderNum = inv.order_number.toLowerCase();
    return invNum.includes(q) || orderNum.includes(q);
  });

  const handleRefresh = async () => {
    try {
      const res = await fetch('/api/invoices');
      const data = await readApiData<ApiResponseBody>(res);
      if (res.ok && Array.isArray(data.invoices)) {
        setInvoices(data.invoices as CustomerInvoiceHistoryItem[]);
      }
    } catch {

    }
  };

  const parseAddress = (addressJson?: string) => {
    if (!addressJson) return null;
    try {
      return JSON.parse(addressJson) as { street?: string; city?: string; province?: string; postal_code?: string };
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6">
      { }
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="kicker text-neutral-500 dark:text-slate-400">Total Sales Invoices</p>
            <p className="text-2xl font-bold font-mono text-neutral-950 dark:text-slate-100 mt-1">{invoices.length}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="kicker text-neutral-500 dark:text-slate-400">VAT Applied</p>
            <p className="text-sm font-semibold text-emerald-700 mt-1 flex items-center gap-1.5">
              <CircleCheckBig className="w-4 h-4" /> 15% Standard Rate
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="kicker text-neutral-500 dark:text-slate-400">PDF Exporting</p>
            <p className="text-xs text-neutral-600 dark:text-slate-300 mt-1">Vector documents ready for accounting ingestion</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      { }
      <div className="card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Invoice # (e.g. INV-10001) or Order #…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field !py-2 !text-xs pl-9"
            />
          </div>
          <button onClick={handleRefresh} className="btn-secondary !py-2 !text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="text-xs text-neutral-500 dark:text-slate-400 font-medium flex items-center gap-2">
          <span>PDF invoices and statements available</span>
          <a href="/api/statements/me" className="text-brand-700 hover:text-brand-900 font-semibold underline underline-offset-2">Download statement (PDF)</a>
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
        </div>
      </div>

      { }
      {filteredInvoices.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-700 mx-auto flex items-center justify-center">
            <Receipt className="w-6 h-6" />
          </div>
          <p className="text-neutral-900 dark:text-slate-200 text-sm font-bold">No sales invoices issued yet</p>
          <p className="text-neutral-500 dark:text-slate-400 text-xs max-w-md mx-auto leading-relaxed">
            Sequential sales invoices are automatically generated once wholesale orders undergo staff review and dispatch approval.
          </p>
          <Link href="/orders" className="btn-primary">
            <ArrowLeft className="w-4 h-4" />
            <span>View Active Orders</span>
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Sales Invoice #</th>
                  <th>Sales Order #</th>
                  <th>Issue Date</th>
                  <th className="!text-right">Taxable Subtotal</th>
                  <th className="!text-right">15% VAT</th>
                  <th className="!text-right">Grand Total (ZAR)</th>
                  <th className="!text-center">Status</th>
                  <th className="!text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <span className="badge-purple font-mono">
                        <Receipt className="w-3 h-3" />
                        {inv.invoice_number}
                      </span>
                    </td>
                    <td className="font-mono font-medium text-neutral-800">{inv.order_number}</td>
                    <td className="text-neutral-600 dark:text-slate-300">{new Date(inv.issued_at).toLocaleDateString()}</td>
                    <td className="text-right font-mono text-neutral-700">R {inv.subtotal}</td>
                    <td className="text-right font-mono text-neutral-700">R {inv.vat}</td>
                    <td className="text-right font-mono font-bold text-neutral-950 dark:text-slate-100">R {inv.total}</td>
                    <td className="text-center">
                      <span className="badge-emerald uppercase">{inv.status}</span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setSelectedInvoice(inv)} className="btn-primary !py-1.5 !text-xs">
                          <FileText className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <a href={`/api/invoices/${inv.id}/pdf`} className="btn-secondary !py-1.5 !text-xs">
                          <span>PDF</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      { }
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="card max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-lift my-8">
            { }              <div className="flex flex-wrap justify-between items-center border-b border-brand-200 bg-brand-50/50 -mx-6 -mt-6 px-6 py-3 gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-600 text-white text-[10px] font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Official Sales Invoice
                  </span>
                  <span className="font-mono text-xs text-brand-700 font-bold">{selectedInvoice.invoice_number}</span>
                </div>
                <button type="button" onClick={() => setSelectedInvoice(null)} className="btn-secondary !px-2.5 !py-1.5" aria-label="Close invoice preview">
                  <X className="w-4 h-4" />
                </button>
              </div>

            { }
            <div className="space-y-6 text-neutral-900 dark:text-slate-200 font-sans">
              { }
              <div className="flex justify-between items-start gap-6 pb-4 border-b-2 border-brand-700">
                <div className="flex gap-3">
                  <img src="/brand-logo.png" alt="Stationery Depot" className="w-12 h-12 rounded-full object-cover ring-1 ring-brand-100 shrink-0" />
                  <div>
                    <h2 className="text-[11px] font-extrabold tracking-[0.12em] text-brand-900 font-mono">STATIONERY DEPOT (PTY) LTD</h2>
                    <p className="text-[11px] text-neutral-600 dark:text-slate-300 mt-0.5">Wholesale Office &amp; Commercial Supplies</p>
                    <p className="text-[11px] text-neutral-600 dark:text-slate-300">VAT Reg No: <strong className="font-mono text-neutral-800">4920184729</strong> • Reg 2016/214905/07</p>
                    <p className="text-[11px] text-neutral-600 dark:text-slate-300">14 Apex Commerce Park, Midrand, Gauteng, 1685</p>
                    <p className="text-[11px] text-neutral-600 dark:text-slate-300">Tel: +27 11 888 4000 • accounts@stationerydepot.co.za • thestationerydepot.co.za</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <h1 className="text-xl font-black tracking-tight text-brand-950 uppercase">SALES INVOICE</h1>
                  <p className="text-[10px] text-neutral-500 tracking-wider uppercase mt-0.5">Original document for the recipient</p>
                  <div className="mt-3 space-y-1 text-xs">
                    <p className="font-mono font-bold text-brand-700 text-sm">
                      {selectedInvoice.invoice_number}
                    </p>
                    <p className="text-neutral-600 dark:text-slate-300">
                      Date Issued: <strong className="text-neutral-900 dark:text-slate-200">{new Date(selectedInvoice.issued_at).toLocaleDateString()}</strong>
                    </p>
                    <p className="text-neutral-600 dark:text-slate-300">
                      Due Date: <strong className="text-neutral-900 dark:text-slate-200">{new Date(new Date(selectedInvoice.issued_at).getTime() + 30*24*60*60*1000).toLocaleDateString()}</strong>
                    </p>
                    <p className="text-neutral-600 dark:text-slate-300">
                      Order Ref: <strong className="font-mono text-neutral-900 dark:text-slate-200">{selectedInvoice.order_number}</strong>
                    </p>
                    <p className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      Net 30 Days Trade
                    </p>
                  </div>
                </div>
              </div>

              { }
              <div className="bg-neutral-50 dark:bg-white/[0.06] p-4 rounded-xl border border-neutral-200 text-xs grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 dark:text-slate-400 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Billed To (Commercial Account):
                  </span>
                  <p className="font-bold text-neutral-900 dark:text-slate-200 text-sm mt-1">
                    {selectedInvoice.customer?.company_name || 'Commercial Customer'}
                  </p>
                  <p className="text-neutral-700 mt-0.5">Attn: {selectedInvoice.customer?.contact_name}</p>
                  <p className="text-neutral-600 dark:text-slate-300 font-mono">{selectedInvoice.customer?.email}</p>
                  {selectedInvoice.customer?.phone && (
                    <p className="text-neutral-600 dark:text-slate-300 font-mono">{selectedInvoice.customer.phone}</p>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 dark:text-slate-400">
                    Delivery Address:
                  </span>
                  {(() => {
                    const addr = parseAddress(selectedInvoice.customer?.address_json);
                    if (!addr) return <p className="text-neutral-600 dark:text-slate-300 mt-1">Commercial Delivery Address on File</p>;
                    return (
                      <div className="text-neutral-700 mt-1 space-y-0.5">
                        <p>{addr.street}</p>
                        <p>{addr.city}, {addr.province} {addr.postal_code}</p>
                        <p className="font-semibold text-neutral-800">South Africa</p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              { }
              <div className="border border-neutral-200 dark:border-white/10 rounded-xl overflow-x-auto shadow-sm">
                <table className="w-full min-w-[560px] text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-brand-950 text-white font-mono uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 text-left">SKU</th>
                    <th className="py-2.5 px-3 text-left">Item Description</th>
                    <th className="py-2.5 px-3 text-center">Tier</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit (excl. VAT)</th>
                    <th className="py-2.5 px-3 text-right">Total (excl. VAT)</th>
                  </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {selectedInvoice.lines?.map((line) => (
                      <tr key={line.id} className="hover:bg-neutral-50 dark:bg-white/[0.06]">
                        <td className="py-2.5 px-3 font-mono font-medium text-neutral-800">{line.sku}</td>
                        <td className="py-2.5 px-3 text-neutral-800">{line.description_snapshot}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-mono text-[10px] bg-neutral-100 dark:bg-white/[0.08] border border-neutral-200 dark:border-white/10 px-1.5 py-0.5 rounded">
                            {line.tier_code}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900 dark:text-slate-200">{line.qty}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-neutral-700">R {line.unit_price}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900 dark:text-slate-200">R {line.line_total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              { }
              <div className="flex justify-end">
                <div className="w-80 space-y-2 text-xs bg-neutral-50 dark:bg-white/[0.06] p-4 rounded-xl border border-neutral-200 shadow-sm">
                  <div className="flex justify-between text-neutral-600 dark:text-slate-300">
                    <span>Taxable Subtotal (excl. VAT):</span>
                    <span className="font-mono font-semibold">R {selectedInvoice.subtotal}</span>
                  </div>
                  <div className="flex justify-between text-neutral-600 dark:text-slate-300">
                    <span>Standard VAT @ 15.00%:</span>
                    <span className="font-mono font-semibold">R {selectedInvoice.vat}</span>
                  </div>
                  <div className="border-t border-neutral-300 pt-2 flex justify-between text-sm font-extrabold text-neutral-950 dark:text-slate-100">
                    <span>Total Amount Due (ZAR)</span>
                    <span className="font-mono text-brand-800">R {selectedInvoice.total}</span>
                  </div>
                </div>
              </div>

              { }
              <div className="border-t border-neutral-200 pt-4 text-[11px] text-neutral-500 dark:text-slate-400 space-y-1">
                <p className="flex items-center gap-1 font-medium text-neutral-700">
                  <CreditCard className="w-3.5 h-3.5 text-purple-700" />
                  <strong>Banking Details:</strong> First National Bank | Account: 62819284719 | Branch: 250655 | Reference: {selectedInvoice.invoice_number}
                </p>
                <p>
                  This is a computer-generated sales invoice issued from a strictly sequential invoice register. Sequential numbering verified.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
