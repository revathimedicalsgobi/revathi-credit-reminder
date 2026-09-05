'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Printer,
  MessageCircle,
  PlusCircle,
  CheckCircle2,
  Calendar,
  AlertCircle,
  RefreshCw,
  Phone,
  FileText,
  Eye,
  Edit2,
  X,
  Clock,
  Sparkles,
  Receipt,
  User,
} from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { getPendingAgeText, getPendingDaysCount, formatDisplayDate, formatShortDate, maskWhatsAppNumber } from '@/lib/utils';
import { PaymentStatusBadge } from '@/components/StatusBadge';
import { PaymentReceivedModal } from '@/components/PaymentReceivedModal';
import {
  buildWhatsAppReminderText,
  buildWhatsAppCustomerStatementText,
  buildWhatsAppThankYouText,
  getWhatsAppDirectUrl,
} from '@/lib/whatsapp-share';

interface CustomerStatementData {
  customer: {
    id: string;
    name: string;
    whatsapp_number: string;
    created_at: string;
    updated_at: string;
  };
  purchases: Array<{
    id: string;
    purchase_date: string;
    gross_total: number;
    total_discount: number;
    amount_payable: number;
    payment_status: 'PENDING' | 'PAID';
    payment_received_at: string | null;
    items: Array<{
      id: string;
      item_name: string;
      quantity: number;
      mrp: number;
      discount: number;
      gross_amount: number;
      net_amount: number;
    }>;
  }>;
  summary: {
    total_purchases_count: number;
    total_gross: number;
    total_discount: number;
    total_billed: number;
    total_paid: number;
    outstanding_balance: number;
    pending_bills_count: number;
    settled_bills_count: number;
    first_purchase_date: string | null;
    latest_purchase_date: string | null;
  };
}

export default function CustomerStatementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [statement, setStatement] = useState<CustomerStatementData | null>(null);
  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');
  const [upiId, setUpiId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status Filter on Ledger
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');

  // Edit Customer Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Payment Received Modal
  const [activePaymentModal, setActivePaymentModal] = useState<{
    purchaseId: string;
    amount: number;
  } | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState<string | null>(null);

  const fetchCustomerStatement = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/customers/${customerId}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok || !data.customer) {
        throw new Error(data?.error || 'Customer statement not found');
      }

      setStatement(data);
      setEditName(data.customer.name);
      setEditPhone(data.customer.whatsapp_number);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load customer statement';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchCustomerStatement();
  }, [fetchCustomerStatement]);

  useEffect(() => {
    fetch(`/api/settings?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          if (data.settings.pharmacy_name) setPharmacyName(data.settings.pharmacy_name);
          if (data.settings.upi_id) setUpiId(data.settings.upi_id);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editPhone.trim()) return;

    setIsSavingCustomer(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          whatsapp_number: editPhone.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update customer');
      }

      setIsEditModalOpen(false);
      fetchCustomerStatement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating customer';
      setEditError(msg);
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleSendWhatsAppStatement = () => {
    if (!statement) return;
    const pendingBills = statement.purchases
      .filter((p) => p.payment_status === 'PENDING')
      .map((p) => ({
        date: p.purchase_date,
        amount: Number(p.amount_payable),
      }));

    const text = buildWhatsAppCustomerStatementText({
      customerName: statement.customer.name,
      recipientPhone: statement.customer.whatsapp_number,
      totalPurchasesCount: statement.summary.total_purchases_count,
      totalBilled: statement.summary.total_billed,
      totalPaid: statement.summary.total_paid,
      outstandingBalance: statement.summary.outstanding_balance,
      pendingBills,
      pharmacyName,
      upiId,
    });

    const chatUrl = getWhatsAppDirectUrl(statement.customer.whatsapp_number, text);
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendSingleReminder = (purchase: CustomerStatementData['purchases'][0]) => {
    if (!statement) return;
    const pendingDays = getPendingDaysCount(purchase.purchase_date);
    const reminderText = buildWhatsAppReminderText({
      customerName: statement.customer.name,
      recipientPhone: statement.customer.whatsapp_number,
      purchaseDate: purchase.purchase_date,
      pendingDays,
      amountPending: Number(purchase.amount_payable),
      pharmacyName,
      upiId,
    });

    const chatUrl = getWhatsAppDirectUrl(statement.customer.whatsapp_number, reminderText);
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendThankYou = (purchase: CustomerStatementData['purchases'][0]) => {
    if (!statement) return;
    const text = buildWhatsAppThankYouText({
      customerName: statement.customer.name,
      recipientPhone: statement.customer.whatsapp_number,
      amountReceived: Number(purchase.amount_payable),
      pharmacyName,
    });

    const chatUrl = getWhatsAppDirectUrl(statement.customer.whatsapp_number, text);
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
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
      await fetchCustomerStatement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating payment status';
      setPaymentModalError(msg);
      throw err;
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
        <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
        <span>Loading customer account statement...</span>
      </div>
    );
  }

  if (error || !statement) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Customer Not Found</h2>
        <p className="text-xs text-slate-500">{error || 'The requested customer statement could not be retrieved.'}</p>
        <Link
          href="/customers"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Customers</span>
        </Link>
      </div>
    );
  }

  const filteredPurchases = statement.purchases.filter((p) => {
    if (statusFilter === 'ALL') return true;
    return p.payment_status === statusFilter;
  });

  const hasOutstanding = statement.summary.outstanding_balance > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <Link
            href="/customers"
            className="p-2 rounded-xl border border-slate-200 hover:bg-white text-slate-600 transition-colors"
            title="Back to Customer Master"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {statement.customer.name}
              </h1>
              <button
                onClick={() => {
                  setEditError(null);
                  setIsEditModalOpen(true);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Edit Customer Details"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
              <span className="flex items-center gap-1 font-mono">
                <Phone className="w-3 h-3 text-slate-400" />
                {maskWhatsAppNumber(statement.customer.whatsapp_number)}
              </span>
              <span>•</span>
              <span>Customer since {formatShortDate(statement.customer.created_at)}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Statement</span>
          </button>

          <button
            onClick={handleSendWhatsAppStatement}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl shadow-sm transition-all"
            title="Open WhatsApp Web with complete account statement"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>WhatsApp Statement</span>
          </button>

          <Link
            href={`/purchases/new?customerId=${statement.customer.id}&name=${encodeURIComponent(statement.customer.name)}&phone=${encodeURIComponent(statement.customer.whatsapp_number)}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md shadow-emerald-600/30 transition-all transform hover:-translate-y-0.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ New Bill</span>
          </Link>
        </div>
      </div>

      {/* Account Statement Banner & KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Outstanding Balance Banner */}
        <div
          className={`md:col-span-2 p-5 rounded-2xl border transition-all ${
            hasOutstanding
              ? 'bg-rose-50/70 border-rose-200'
              : 'bg-emerald-50/70 border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                hasOutstanding ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              Current Outstanding Balance
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                hasOutstanding
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {hasOutstanding ? `${statement.summary.pending_bills_count} Bills Pending` : '✓ Account Settled'}
            </span>
          </div>
          <div className="mt-2">
            <div
              className={`text-3xl sm:text-4xl font-black ${
                hasOutstanding ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {formatINR(statement.summary.outstanding_balance)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {hasOutstanding
                ? `Total credit awaiting payment for ${statement.customer.name}`
                : `All transactions are fully paid. Thank you!`}
            </p>
          </div>
        </div>

        {/* Total Billed */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Total Billed (Lifetime)
          </span>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900">
              {formatINR(statement.summary.total_billed)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Across {statement.summary.total_purchases_count} total invoices
            </p>
          </div>
        </div>

        {/* Total Paid */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
            Total Paid (Received)
          </span>
          <div className="mt-2">
            <div className="text-2xl font-black text-emerald-600">
              {formatINR(statement.summary.total_paid)}
            </div>
            <p className="text-[11px] text-emerald-700/70 mt-0.5 font-medium">
              {statement.summary.settled_bills_count} settled bills
            </p>
          </div>
        </div>
      </div>

      {/* Statement Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Ledger Header & Filter */}
        <div className="p-4 sm:p-6 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-600" />
              <span>Transaction Statement Ledger</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Itemized history of all purchases, discounts, and payments.
            </p>
          </div>

          <div className="flex items-center p-1 bg-slate-200/60 rounded-xl no-print">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({statement.summary.total_purchases_count})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'PENDING'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({statement.summary.pending_bills_count})
            </button>
            <button
              onClick={() => setStatusFilter('PAID')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                statusFilter === 'PAID'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Paid ({statement.summary.settled_bills_count})
            </button>
          </div>
        </div>

        {/* Statement Content */}
        {filteredPurchases.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No bills found matching the selected filter.
          </div>
        ) : (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-6">Bill Date</th>
                    <th className="py-3.5 px-4">Items Summary</th>
                    <th className="py-3.5 px-4">Gross Total</th>
                    <th className="py-3.5 px-4">Discount</th>
                    <th className="py-3.5 px-4">Net Amount</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-6 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPurchases.map((purchase) => {
                    const isPending = purchase.payment_status === 'PENDING';
                    const pendingAge = getPendingAgeText(purchase.purchase_date);

                    return (
                      <tr key={purchase.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-6 text-xs text-slate-900 font-semibold whitespace-nowrap">
                          {formatDisplayDate(purchase.purchase_date)}
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-700 max-w-xs">
                          {purchase.items && purchase.items.length > 0 ? (
                            <div className="space-y-0.5">
                              {purchase.items.map((i) => (
                                <div key={i.id} className="truncate">
                                  <span className="font-semibold text-slate-900">{i.item_name}</span>{' '}
                                  <span className="text-slate-500">× {i.quantity}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Bill #{purchase.id.slice(0, 8)}</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                          {formatINR(purchase.gross_total)}
                        </td>
                        <td className="py-4 px-4 text-xs font-mono text-emerald-700 whitespace-nowrap">
                          {Number(purchase.total_discount) > 0 ? formatINR(purchase.total_discount) : '—'}
                        </td>
                        <td className="py-4 px-4 font-black text-slate-900 whitespace-nowrap text-sm">
                          {formatINR(purchase.amount_payable)}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          {isPending ? (
                            <div className="space-y-0.5">
                              <PaymentStatusBadge status="PENDING" />
                              <div className="text-[10px] text-amber-700 font-semibold">{pendingAge}</div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <PaymentStatusBadge status="PAID" />
                              {purchase.payment_received_at && (
                                <div className="text-[10px] text-slate-400">
                                  {formatShortDate(purchase.payment_received_at)}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right no-print">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/purchases/${purchase.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                              title="View Full Bill & Summary Card"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </Link>

                            {isPending ? (
                              <>
                                <button
                                  onClick={() => handleSendSingleReminder(purchase)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold"
                                  title="Send Reminder on WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Reminder</span>
                                </button>

                                <button
                                  onClick={() =>
                                    setActivePaymentModal({
                                      purchaseId: purchase.id,
                                      amount: Number(purchase.amount_payable),
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Paid</span>
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleSendThankYou(purchase)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold"
                                title="Send Thank-You on WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Thank-You</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredPurchases.map((purchase) => {
                const isPending = purchase.payment_status === 'PENDING';
                const pendingAge = getPendingAgeText(purchase.purchase_date);

                return (
                  <div key={purchase.id} className="p-4 space-y-3 bg-white">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {formatDisplayDate(purchase.purchase_date)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Bill ID: {purchase.id.slice(0, 8)}
                        </div>
                      </div>
                      <PaymentStatusBadge status={purchase.payment_status} />
                    </div>

                    {purchase.items && purchase.items.length > 0 && (
                      <div className="bg-slate-50 p-2.5 rounded-xl text-xs space-y-1">
                        {purchase.items.map((i) => (
                          <div key={i.id} className="flex justify-between">
                            <span className="font-semibold text-slate-800">
                              {i.item_name} × {i.quantity}
                            </span>
                            <span className="font-mono text-slate-600">{formatINR(i.net_amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Net Amount Payable
                        </span>
                        <span className="text-lg font-black text-slate-900">
                          {formatINR(purchase.amount_payable)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end no-print">
                        <Link
                          href={`/purchases/${purchase.id}`}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                        >
                          View
                        </Link>

                        {isPending ? (
                          <>
                            <button
                              onClick={() => handleSendSingleReminder(purchase)}
                              className="px-2.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1"
                            >
                              <MessageCircle className="w-3 h-3 text-emerald-600" />
                              <span>Reminder</span>
                            </button>

                            <button
                              onClick={() =>
                                setActivePaymentModal({
                                  purchaseId: purchase.id,
                                  amount: Number(purchase.amount_payable),
                                })
                              }
                              className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm"
                            >
                              Paid
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleSendThankYou(purchase)}
                            className="px-2.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600" />
                            <span>Thank-You</span>
                          </button>
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

      {/* Edit Customer Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-emerald-600" />
                Edit Customer Details
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  WhatsApp Mobile Number *
                </label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {editError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs border border-rose-200">
                  {editError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSavingCustomer}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md disabled:opacity-60"
                >
                  {isSavingCustomer ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Received Modal */}
      {activePaymentModal && (
        <PaymentReceivedModal
          isOpen={true}
          onClose={() => setActivePaymentModal(null)}
          onConfirm={handleConfirmPaymentReceived}
          customerName={statement.customer.name}
          whatsappNumber={statement.customer.whatsapp_number}
          amountPayable={activePaymentModal.amount}
          pharmacyName={pharmacyName}
          isProcessing={isProcessingPayment}
          errorMessage={paymentModalError}
        />
      )}
    </div>
  );
}
