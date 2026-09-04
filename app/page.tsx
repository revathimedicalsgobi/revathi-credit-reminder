'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  TrendingUp,
  Search,
  PlusCircle,
  Eye,
  RefreshCw,
  Phone,
  Calendar,
  AlertTriangle,
  ArrowUpDown,
  MessageCircle,
} from 'lucide-react';
import { Purchase, DashboardStats } from '@/lib/types';
import { formatINR } from '@/lib/calculations';
import { getPendingAgeText, getPendingDaysCount, formatShortDate, maskWhatsAppNumber } from '@/lib/utils';
import { PaymentStatusBadge } from '@/components/StatusBadge';
import { PaymentReceivedModal } from '@/components/PaymentReceivedModal';
import { buildWhatsAppReminderText, getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

export default function DashboardPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');
  const [upiId, setUpiId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    today_purchases_count: 0,
    pending_customers_count: 0,
    pending_amount: 0,
    payments_received_today_count: 0,
    payments_received_today_amount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'PAID' | 'ALL'>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const [activePaymentModal, setActivePaymentModal] = useState<{
    purchaseId: string;
    customerName: string;
    amount: number;
  } | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const statsRes = await fetch('/api/stats');
      const statsData = await statsRes.json();
      if (statsData?.stats) {
        setStats(statsData.stats);
      }

      const filterParam = statusFilter === 'ALL' ? '' : `status=${statusFilter}`;
      const searchParam = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : '';
      const purchasesRes = await fetch(`/api/purchases?${filterParam}${searchParam}`);
      const purchasesData = await purchasesRes.json();

      if (purchasesData?.purchases) {
        setPurchases(purchasesData.purchases);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch settings for pharmacy name & upiId
  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          if (data.settings.pharmacy_name) setPharmacyName(data.settings.pharmacy_name);
          if (data.settings.upi_id) setUpiId(data.settings.upi_id);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const handleSendManualReminder = (purchase: Purchase) => {
    const phone = purchase.customer?.whatsapp_number || '';
    const pendingDays = getPendingDaysCount(purchase.purchase_date);
    const reminderText = buildWhatsAppReminderText({
      customerName: purchase.customer?.name || 'Customer',
      recipientPhone: phone,
      purchaseDate: purchase.purchase_date,
      pendingDays,
      amountPending: Number(purchase.amount_payable),
      pharmacyName,
      upiId,
    });

    const chatUrl = getWhatsAppDirectUrl(phone, reminderText);
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
  };

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleOpenPaymentModal = (purchase: Purchase) => {
    setPaymentModalError(null);
    setActivePaymentModal({
      purchaseId: purchase.id,
      customerName: purchase.customer?.name || 'Customer',
      amount: Number(purchase.amount_payable),
    });
  };

  const handleConfirmPaymentReceived = async () => {
    if (!activePaymentModal) return;
    setIsProcessingPayment(true);
    setPaymentModalError(null);

    try {
      const res = await fetch(`/api/purchases/${activePaymentModal.purchaseId}/payment-received`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to mark payment as received');
      }

      setActivePaymentModal(null);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating payment status';
      setPaymentModalError(msg);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const sortedPurchases = [...purchases].sort((a, b) => {
    const timeA = new Date(a.purchase_date).getTime();
    const timeB = new Date(b.purchase_date).getTime();
    return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Monitor customer purchases, pending payments, and automated WhatsApp follow-ups.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/purchases/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md shadow-emerald-600/30 transition-all transform hover:-translate-y-0.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Purchase</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Today&apos;s Purchases
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              {stats.today_purchases_count}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Recorded today</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pending Customers
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-amber-600">
              {stats.pending_customers_count}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting payment</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-rose-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pending Amount
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-rose-600">
              {formatINR(stats.pending_amount)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total uncollected</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Received Today
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-600">
              {formatINR(stats.payments_received_today_amount)}
            </div>
            <p className="text-[11px] text-emerald-700/70 mt-0.5 font-medium">
              {stats.payments_received_today_count} payments marked paid
            </p>
          </div>
        </div>
      </div>

      {/* Main Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Control Header & Filters */}
        <div className="p-4 sm:p-6 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center p-1 bg-slate-200/60 rounded-xl max-w-fit">
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'PENDING'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending Payments
            </button>
            <button
              onClick={() => setStatusFilter('PAID')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'PAID'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Paid Recently
            </button>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Purchases
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search customer, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>

            <button
              onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
              title={`Sort: ${sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}`}
              className="p-2 rounded-xl border border-slate-200 hover:bg-white text-slate-600 transition-colors"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content View */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
            <span>Loading purchases...</span>
          </div>
        ) : sortedPurchases.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No purchases found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {searchTerm
                ? 'No matching customer records for your search query.'
                : statusFilter === 'PENDING'
                ? 'Great news! There are no pending payments at the moment.'
                : 'No purchase records recorded yet.'}
            </p>
            <div className="mt-4">
              <Link
                href="/purchases/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create New Purchase</span>
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-6">Customer</th>
                    <th className="py-3.5 px-4">WhatsApp</th>
                    <th className="py-3.5 px-4">Purchase Date</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Pending Age</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedPurchases.map((purchase) => {
                    const isPending = purchase.payment_status === 'PENDING';
                    const pendingAge = getPendingAgeText(purchase.purchase_date);

                    return (
                      <tr
                        key={purchase.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        <td className="py-4 px-6 font-semibold text-slate-900">
                          {purchase.customer?.name || 'Customer'}
                        </td>
                        <td className="py-4 px-4 text-xs font-mono text-slate-600">
                          {maskWhatsAppNumber(purchase.customer?.whatsapp_number || '')}
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-600">
                          {formatShortDate(purchase.purchase_date)}
                        </td>
                        <td className="py-4 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {formatINR(purchase.amount_payable)}
                        </td>
                        <td className="py-4 px-4 text-xs">
                          {isPending ? (
                            <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              {pendingAge}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <PaymentStatusBadge status={purchase.payment_status} />
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/purchases/${purchase.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                              title="View Purchase Summary"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </Link>

                            {isPending && (
                              <>
                                <button
                                  onClick={() => handleSendManualReminder(purchase)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all shadow-2xs"
                                  title="Open WhatsApp Web chat with reminder preloaded"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Reminder</span>
                                </button>

                                <button
                                  onClick={() => handleOpenPaymentModal(purchase)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Payment Received</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {sortedPurchases.map((purchase) => {
                const isPending = purchase.payment_status === 'PENDING';
                const pendingAge = getPendingAgeText(purchase.purchase_date);

                return (
                  <div key={purchase.id} className="p-4 space-y-3 bg-white">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">
                          {purchase.customer?.name || 'Customer'}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{maskWhatsAppNumber(purchase.customer?.whatsapp_number || '')}</span>
                        </div>
                      </div>
                      <PaymentStatusBadge status={purchase.payment_status} />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatShortDate(purchase.purchase_date)}</span>
                      </div>
                      {isPending && (
                        <div className="font-bold text-amber-700">
                          {pendingAge}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-[11px] text-slate-400 uppercase font-semibold block">
                          Amount Payable
                        </span>
                        <span className="text-lg font-extrabold text-slate-900">
                          {formatINR(purchase.amount_payable)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <Link
                          href={`/purchases/${purchase.id}`}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                        >
                          View
                        </Link>

                        {isPending && (
                          <>
                            <button
                              onClick={() => handleSendManualReminder(purchase)}
                              className="px-2.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1"
                              title="Send Reminder on WhatsApp"
                            >
                              <MessageCircle className="w-3 h-3 text-emerald-600" />
                              <span>Reminder</span>
                            </button>

                            <button
                              onClick={() => handleOpenPaymentModal(purchase)}
                              className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm"
                            >
                              Paid
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {activePaymentModal && (
        <PaymentReceivedModal
          isOpen={true}
          onClose={() => setActivePaymentModal(null)}
          onConfirm={handleConfirmPaymentReceived}
          customerName={activePaymentModal.customerName}
          amountPayable={activePaymentModal.amount}
          isProcessing={isProcessingPayment}
          errorMessage={paymentModalError}
        />
      )}
    </div>
  );
}
