'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Send,
  CheckSquare,
  Square,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Eye,
  X,
  ExternalLink,
} from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

interface BulkCustomerItem {
  customerId: string;
  name: string;
  phone: string;
  pendingBillsCount: number;
  totalOutstanding: number;
  maxPendingDays: number;
  messagePreview: string;
}

export default function BulkRemindersPage() {
  const [customers, setCustomers] = useState<BulkCustomerItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filterDays, setFilterDays] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [gatewayStatus, setGatewayStatus] = useState<{ connected: boolean; instanceId?: string } | null>(null);

  // Preview Modal
  const [previewCustomer, setPreviewCustomer] = useState<BulkCustomerItem | null>(null);

  // Sending progress state
  const [isSending, setIsSending] = useState(false);
  const [sendingProgress, setSendingProgress] = useState<{
    total: number;
    current: number;
    sent: number;
    failed: number;
    currentCustomerName?: string;
    completed: boolean;
    logs: Array<{ customerName: string; success: boolean; error?: string }>;
  } | null>(null);

  const fetchDueCustomers = async () => {
    setLoading(true);
    try {
      // 1. Check gateway status
      fetch('/api/whatsapp/status')
        .then((r) => r.json())
        .then((st) => setGatewayStatus(st))
        .catch(() => setGatewayStatus({ connected: false }));

      // 2. Fetch bulk preview
      const res = await fetch('/api/whatsapp/bulk-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewOnly: true,
          minDays: filterDays,
          minBalance: 1,
        }),
      });

      const data = await res.json();
      if (data?.customers) {
        setCustomers(data.customers);
        // Default select all
        setSelectedIds(new Set(data.customers.map((c: BulkCustomerItem) => c.customerId)));
      }
    } catch (err) {
      console.error('Failed to load bulk customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDueCustomers();
  }, [filterDays]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const q = searchQuery.toLowerCase();
      const matchSearch = c.name.toLowerCase().includes(q) || c.phone.includes(q);
      return matchSearch;
    });
  }, [customers, searchQuery]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCustomers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCustomers.map((c) => c.customerId)));
    }
  };

  const toggleCustomer = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const totalSelectedAmount = useMemo(() => {
    return customers
      .filter((c) => selectedIds.has(c.customerId))
      .reduce((s, c) => s + c.totalOutstanding, 0);
  }, [customers, selectedIds]);

  const startAutomatedBulkDispatch = async () => {
    const targetList = customers.filter((c) => selectedIds.has(c.customerId));
    if (targetList.length === 0) return;

    setIsSending(true);
    setSendingProgress({
      total: targetList.length,
      current: 0,
      sent: 0,
      failed: 0,
      completed: false,
      logs: [],
    });

    for (let i = 0; i < targetList.length; i++) {
      const cust = targetList[i];
      setSendingProgress((prev) =>
        prev
          ? {
              ...prev,
              current: i + 1,
              currentCustomerName: cust.name,
            }
          : null
      );

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: cust.phone,
            message: cust.messagePreview,
          }),
        });

        const resData = await res.json();
        const success = res.ok && resData.success;

        setSendingProgress((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            sent: success ? prev.sent + 1 : prev.sent,
            failed: success ? prev.failed : prev.failed + 1,
            logs: [
              {
                customerName: cust.name,
                success,
                error: success ? undefined : resData.error || 'Failed to send',
              },
              ...prev.logs,
            ],
          };
        });
      } catch (err: any) {
        setSendingProgress((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            failed: prev.failed + 1,
            logs: [
              {
                customerName: cust.name,
                success: false,
                error: err?.message || 'Network error',
              },
              ...prev.logs,
            ],
          };
        });
      }

      // 3 second anti-ban throttling delay
      if (i < targetList.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    setSendingProgress((prev) => (prev ? { ...prev, completed: true } : null));
    setIsSending(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Automated Bulk Reminders
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
              100% Auto
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Dispatch personalized WhatsApp balance reminders to all overdue customers automatically without manual tapping.
          </p>
        </div>

        {/* Gateway Connection Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-700">
            <span className={`w-2.5 h-2.5 rounded-full ${gatewayStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>
              Gateway:{' '}
              {gatewayStatus?.connected ? (
                <strong className="text-emerald-700 font-bold">Connected ({gatewayStatus.instanceId || 'UltraMsg'})</strong>
              ) : (
                <strong className="text-amber-700 font-bold">Checking...</strong>
              )}
            </span>
          </div>

          <button
            onClick={fetchDueCustomers}
            disabled={loading || isSending}
            title="Refresh list"
            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Due Customers</span>
          <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
            {customers.length}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Selected Customers</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 block">
            {selectedIds.size} / {customers.length}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Selected Outstanding</span>
          <span className="text-xl sm:text-2xl font-black text-rose-600 mt-1 block">
            {formatINR(totalSelectedAmount)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Anti-Ban Throttling</span>
          <span className="text-xs sm:text-sm font-bold text-slate-700 mt-1.5 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            3s Safe Pacing
          </span>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Overdue Age Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </span>
            {[
              { label: 'All Due', days: 0 },
              { label: '> 3 Days', days: 3 },
              { label: '> 7 Days', days: 7 },
              { label: '> 15 Days', days: 15 },
              { label: '> 30 Days', days: 30 },
            ].map((pill) => (
              <button
                key={pill.days}
                onClick={() => setFilterDays(pill.days)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  filterDays === pill.days
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer name or phone..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>
        </div>

        {/* Selection / Action row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-slate-900 py-1"
          >
            {selectedIds.size === filteredCustomers.length && filteredCustomers.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-emerald-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>
              {selectedIds.size === filteredCustomers.length && filteredCustomers.length > 0
                ? 'Deselect All'
                : 'Select All Customers'}
            </span>
          </button>

          <button
            onClick={startAutomatedBulkDispatch}
            disabled={selectedIds.size === 0 || isSending || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-md shadow-emerald-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span>
              Send Reminders to Selected ({selectedIds.size})
            </span>
          </button>
        </div>
      </div>

      {/* Customer List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <div className="w-7 h-7 border-2 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
            <span>Scanning overdue credit accounts...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs space-y-1">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto stroke-[1.5]" />
            <p className="font-bold text-slate-700 text-sm">No Overdue Customers Found</p>
            <p className="text-slate-400">All customer dues are settled or match the selected filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredCustomers.map((cust) => {
              const isSelected = selectedIds.has(cust.customerId);
              return (
                <div
                  key={cust.customerId}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    isSelected ? 'bg-emerald-50/30' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleCustomer(cust.customerId)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/customers/${cust.customerId}`}
                          className="text-sm font-bold text-slate-900 hover:text-emerald-700 transition-colors truncate"
                        >
                          {cust.name}
                        </Link>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {cust.maxPendingDays}d overdue
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-mono">
                          <Smartphone className="w-3 h-3 text-slate-400" />
                          {cust.phone}
                        </span>
                        <span>•</span>
                        <span>
                          {cust.pendingBillsCount} pending {cust.pendingBillsCount === 1 ? 'bill' : 'bills'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Amount & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pl-7 sm:pl-0">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Balance Due</span>
                      <span className="text-sm sm:text-base font-black text-rose-600">
                        {formatINR(cust.totalOutstanding)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPreviewCustomer(cust)}
                        title="Preview WhatsApp message"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden sm:inline">Preview</span>
                      </button>

                      <a
                        href={getWhatsAppDirectUrl(cust.phone, cust.messagePreview)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in WhatsApp Web"
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-emerald-600 shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Message Preview Modal */}
      {previewCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Message Preview: {previewCustomer.name}
                </h3>
                <span className="text-xs text-slate-400 font-mono">{previewCustomer.phone}</span>
              </div>
              <button
                onClick={() => setPreviewCustomer(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap max-h-[350px] overflow-y-auto leading-relaxed">
              {previewCustomer.messagePreview}
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href={getWhatsAppDirectUrl(previewCustomer.phone, previewCustomer.messagePreview)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in WhatsApp Web</span>
              </a>

              <button
                onClick={() => setPreviewCustomer(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automated Dispatch Live Progress Modal */}
      {sendingProgress && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-slate-900">
                {sendingProgress.completed ? '🎉 Bulk Reminders Finished!' : '🚀 Sending WhatsApp Reminders...'}
              </h3>
              <p className="text-xs text-slate-500">
                {sendingProgress.completed
                  ? 'All targeted reminders have been processed through the gateway.'
                  : `Currently sending to: ${sendingProgress.currentCustomerName || 'customer'} (${sendingProgress.current}/${sendingProgress.total})`}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.round((sendingProgress.current / sendingProgress.total) * 100)}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>
                  Progress: {sendingProgress.current} / {sendingProgress.total}
                </span>
                <span>
                  {Math.round((sendingProgress.current / sendingProgress.total) * 100)}%
                </span>
              </div>
            </div>

            {/* Status Counters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <span className="text-[11px] font-bold text-emerald-600 block">Delivered</span>
                <span className="text-lg font-black text-emerald-800">{sendingProgress.sent}</span>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-center">
                <span className="text-[11px] font-bold text-rose-600 block">Failed</span>
                <span className="text-lg font-black text-rose-800">{sendingProgress.failed}</span>
              </div>
            </div>

            {/* Live Logs Stream */}
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-mono">
              {sendingProgress.logs.map((log, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px]">
                  <span className="truncate max-w-[250px]">{log.customerName}</span>
                  {log.success ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Sent
                    </span>
                  ) : (
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Finish Actions */}
            {sendingProgress.completed && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => {
                    setSendingProgress(null);
                    fetchDueCustomers();
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-md"
                >
                  Close & Refresh List
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
