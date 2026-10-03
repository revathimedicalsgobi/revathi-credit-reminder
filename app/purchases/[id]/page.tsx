'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Printer,
  Send,
  CheckCircle2,
  Calendar,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  MessageCircle,
  Sparkles,
  Edit2,
  CreditCard,
  Clock,
  Receipt,
  Check,
} from 'lucide-react';
import { Purchase, PaymentMode } from '@/lib/types';
import { formatINR } from '@/lib/calculations';
import { getPendingAgeText, getPendingDaysCount, formatDisplayDate, formatShortDate } from '@/lib/utils';
import { PurchaseSummaryCard } from '@/components/PurchaseSummaryCard';
import { PaymentReceivedModal } from '@/components/PaymentReceivedModal';
import { PaymentStatusBadge } from '@/components/StatusBadge';
import {
  buildWhatsAppReminderText,
  buildWhatsAppThankYouText,
  buildWhatsAppSummaryText,
  getWhatsAppDirectUrl,
} from '@/lib/whatsapp-share';

function PurchaseDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const purchaseId = params.id as string;
  const isJustCreated = searchParams.get('created') === 'true';
  const isJustUpdated = searchParams.get('updated') === 'true';

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [previousBalance, setPreviousBalance] = useState<number>(0);
  const [cumulativeTotal, setCumulativeTotal] = useState<number>(0);
  const [dateWisePendingBills, setDateWisePendingBills] = useState<Array<{ date: string | Date; amount: number }>>([]);

  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');
  const [upiId, setUpiId] = useState<string | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(
    isJustCreated
      ? 'Purchase bill recorded successfully!'
      : isJustUpdated
      ? 'Purchase bill updated successfully!'
      : null
  );

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState<string | null>(null);

  // Fetch settings for branding
  useEffect(() => {
    fetch(`/api/settings?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          if (data.settings.pharmacy_name) setPharmacyName(data.settings.pharmacy_name);
          if (data.settings.upi_id) setUpiId(data.settings.upi_id);
          if (data.settings.payment_qr_url) setPaymentQrUrl(data.settings.payment_qr_url);
        }
      })
      .catch((err) => console.error('Failed to load settings:', err));
  }, []);

  const fetchPurchase = useCallback(async () => {
    try {
      const res = await fetch(`/api/purchases/${purchaseId}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok || !data.purchase) {
        throw new Error(data?.error || 'Purchase not found');
      }

      setPurchase(data.purchase);
      setPreviousBalance(Number(data.previousBalance || 0));
      setCumulativeTotal(Number(data.cumulativeTotal || (data.purchase?.balance_due ?? data.purchase?.amount_payable ?? 0)));
      setDateWisePendingBills(data.dateWisePendingBills || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load purchase details';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  useEffect(() => {
    fetchPurchase();
  }, [fetchPurchase]);

  const handleSendWhatsApp = async (messageType: 'PURCHASE_SUMMARY' | 'PAYMENT_REMINDER') => {
    setIsSendingWhatsApp(true);
    setActionSuccessMsg(null);
    setError(null);

    try {
      const res = await fetch(`/api/purchases/${purchaseId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_type: messageType }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.result?.error || data?.error || 'Failed to send WhatsApp message');
      }

      setActionSuccessMsg(`WhatsApp message dispatched successfully! (ID: ${data.result?.messageId || 'OK'})`);
      fetchPurchase();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'WhatsApp dispatch error';
      setError(msg);
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const [isSendingDirect, setIsSendingDirect] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleSendManualReminder = async () => {
    if (!purchase) return;
    const phone = purchase.customer?.whatsapp_number || '';
    const customerName = purchase.customer?.name || 'Customer';
    const pendingDays = getPendingDaysCount(purchase.purchase_date);
    const balanceDue = purchase.balance_due !== undefined ? purchase.balance_due : Number(purchase.amount_payable);

    const reminderText = buildWhatsAppReminderText({
      customerName,
      recipientPhone: phone,
      purchaseDate: purchase.purchase_date,
      pendingDays,
      amountPending: balanceDue,
      totalBillAmount: Number(purchase.amount_payable),
      paidAmount: Number(purchase.paid_amount || 0),
      pharmacyName,
      upiId,
    });

    setIsSendingDirect(true);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          message: reminderText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', `✅ WhatsApp reminder sent automatically to ${customerName}!`);
      } else {
        showToast('error', `❌ Failed: ${data?.error || 'Gateway error'}`);
      }
    } catch (err: any) {
      showToast('error', `❌ Network error: ${err?.message || 'Please check connection'}`);
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleSendManualThankYou = async () => {
    if (!purchase) return;
    const phone = purchase.customer?.whatsapp_number || '';
    const customerName = purchase.customer?.name || 'Customer';
    const totalRemaining = Number(previousBalance || 0) + Number(purchase.balance_due !== undefined ? purchase.balance_due : purchase.amount_payable);

    const thankYouText = buildWhatsAppThankYouText({
      customerName,
      recipientPhone: phone,
      amountReceived: Number(purchase.paid_amount || purchase.amount_payable),
      totalBillAmount: Number(purchase.amount_payable),
      remainingBalance: purchase.balance_due,
      isPartial: purchase.payment_status === 'PARTIAL',
      totalOutstandingBalance: totalRemaining,
      otherPendingBillsCount: dateWisePendingBills.length,
      pharmacyName,
      upiId,
    });

    setIsSendingDirect(true);


    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          message: thankYouText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', `✅ Thank-you receipt sent automatically to ${customerName}!`);
      } else {
        showToast('error', `❌ Failed: ${data?.error || 'Gateway error'}`);
      }
    } catch (err: any) {
      showToast('error', `❌ Network error: ${err?.message || 'Please check connection'}`);
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleSendCumulativeStatement = async () => {
    if (!purchase) return;
    const phone = purchase.customer?.whatsapp_number || '';
    const customerName = purchase.customer?.name || 'Customer';
    const text = buildWhatsAppSummaryText({
      customerName,
      recipientPhone: phone,
      purchaseDate: purchase.purchase_date,
      items: (purchase.items || []).map((i) => ({
        itemName: i.item_name,
        quantity: Number(i.quantity) || 1,
        mrp: Number(i.mrp) || 0,
        discount_amount: Number(i.discount) || 0,
        netAmount: Number(i.net_amount) || 0,
      })),
      grossTotal: Number(purchase.gross_total) || 0,
      totalDiscount: Number(purchase.total_discount) || 0,
      amountPayable: Number(purchase.amount_payable) || 0,
      paidAmount: Number(purchase.paid_amount || 0),
      balanceDue: purchase.balance_due,
      pharmacyName,
      upiId,
      previousBalance,
      cumulativeTotal,
      dateWisePendingBills,
    });

    setIsSendingDirect(true);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          message: text,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', `✅ Purchase summary & statement sent automatically to ${customerName}!`);
      } else {
        showToast('error', `❌ Failed: ${data?.error || 'Gateway error'}`);
      }
    } catch (err: any) {
      showToast('error', `❌ Network error: ${err?.message || 'Please check connection'}`);
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleConfirmPayment = async (paymentData: { amount: number; payment_mode: PaymentMode; notes?: string }) => {
    setIsProcessingPayment(true);
    setPaymentModalError(null);

    try {
      const res = await fetch(`/api/purchases/${purchaseId}/payment-received`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to process payment');
      }

      setShowPaymentModal(false);
      setActionSuccessMsg(data.message || 'Payment recorded successfully!');
      await fetchPurchase();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to process payment';
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
        <span>Loading purchase details...</span>
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Purchase Not Found</h2>
        <p className="text-xs text-slate-500">{error || 'The requested purchase could not be retrieved.'}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    );
  }

  const isPending = purchase.payment_status === 'PENDING' || purchase.payment_status === 'PARTIAL';
  const isFullyPaid = purchase.payment_status === 'PAID';
  const pendingAge = getPendingAgeText(purchase.purchase_date);
  const paidAmount = Number(purchase.paid_amount || 0);
  const balanceDue = purchase.balance_due !== undefined ? purchase.balance_due : (isFullyPaid ? 0 : Number(purchase.amount_payable));
  const totalAmount = Number(purchase.amount_payable || 0);
  const paidPercentage = totalAmount > 0 ? Math.min(100, Math.round((paidAmount / totalAmount) * 100)) : 100;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl border border-slate-200 hover:bg-white text-slate-600 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
              <span>Purchase for {purchase.customer?.name}</span>
              <PaymentStatusBadge status={purchase.payment_status} />
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              <span>Created {formatDisplayDate(purchase.created_at)}</span>
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Edit Bill Button */}
          <Link
            href={`/purchases/${purchase.id}/edit`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-xs transition-all"
            title="Edit Customer, Items, MRP, or Discount on this Bill"
          >
            <Edit2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Edit Bill</span>
          </Link>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          {isPending && (
            <>
              {previousBalance > 0 && (
                <button
                  onClick={handleSendCumulativeStatement}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-300 rounded-xl shadow-sm transition-all"
                  title="Open customer chat on WhatsApp Web with full date-wise cumulative statement"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Cumulative Statement</span>
                </button>
              )}

              <button
                onClick={handleSendManualReminder}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl shadow-sm transition-all"
                title="Open customer chat on WhatsApp Web with reminder preloaded"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>WhatsApp Reminder</span>
              </button>
            </>
          )}

          {!isPending && (
            <button
              onClick={handleSendManualThankYou}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl shadow-sm transition-all"
              title="Open customer chat on WhatsApp Web with Thank-You message"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp Thank-You</span>
            </button>
          )}

          <button
            onClick={() => handleSendWhatsApp(isPending ? 'PURCHASE_SUMMARY' : 'PAYMENT_REMINDER')}
            disabled={isSendingWhatsApp}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-sm transition-all disabled:opacity-50"
            title="Auto-dispatch via WhatsApp Cloud API"
          >
            <Send className={`w-3.5 h-3.5 ${isSendingWhatsApp ? 'animate-spin' : ''}`} />
            <span>{isSendingWhatsApp ? 'Sending...' : 'Auto WhatsApp'}</span>
          </button>

          {isPending ? (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md shadow-emerald-600/30 transition-all transform hover:-translate-y-0.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{paidAmount > 0 ? 'Receive Balance Payment' : 'Payment Received'}</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-100 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>✓ PAID ({formatDisplayDate(purchase.payment_received_at)})</span>
            </span>
          )}
        </div>
      </div>

      {/* Success / Alert notification */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center justify-between no-print animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Grid: Purchase Summary Card on left, Status & Payment History on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Purchase Summary Card */}
        <div className="lg:col-span-7">
          <PurchaseSummaryCard
            pharmacyName={pharmacyName}
            customerName={purchase.customer?.name || 'Customer'}
            whatsappNumber={purchase.customer?.whatsapp_number}
            purchaseDate={purchase.purchase_date}
            items={(purchase.items || []).map((i) => {
              const qty = Number(i.quantity) || 1;
              const mrp = Number(i.mrp) || 0;
              const gross = Number(i.gross_amount) || (qty * mrp);
              const discAmt = Number(i.discount) || 0;
              const discPercent = gross > 0 ? Math.round((discAmt / gross) * 100 * 10) / 10 : 0;

              return {
                itemName: i.item_name,
                quantity: qty,
                mrp: mrp,
                discount_amount: discAmt,
                discount_percent: discPercent,
                grossAmount: gross,
                netAmount: Number(i.net_amount),
              };
            })}
            grossTotal={Number(purchase.gross_total)}
            totalDiscount={Number(purchase.total_discount)}
            amountPayable={Number(purchase.amount_payable)}
            paidAmount={paidAmount}
            balanceDue={balanceDue}
            paymentStatus={purchase.payment_status}
            previousBalance={previousBalance}
            cumulativeTotal={cumulativeTotal}
            dateWisePendingBills={dateWisePendingBills}
            upiId={upiId}
            paymentQrUrl={paymentQrUrl}
            showPrintButton={false}
          />
        </div>

        {/* Right Column: Payment Progress, Payment History & Message Logs */}
        <div className="lg:col-span-5 space-y-6 no-print">
          {/* Payment Status & Progress Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Payment Status & Breakdown
              </h3>
              <PaymentStatusBadge status={purchase.payment_status} />
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-emerald-700">Paid: {formatINR(paidAmount)} ({paidPercentage}%)</span>
                <span className={balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                  {balanceDue > 0 ? `Due: ${formatINR(balanceDue)}` : 'Settled'}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    isFullyPaid ? 'bg-emerald-500' : paidAmount > 0 ? 'bg-orange-500' : 'bg-slate-300'
                  }`}
                  style={{ width: `${paidPercentage}%` }}
                />
              </div>
            </div>

            <div className="space-y-2.5 text-xs pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">Total Bill Amount</span>
                <span className="font-bold text-slate-900">{formatINR(totalAmount)}</span>
              </div>

              {paidAmount > 0 && (
                <div className="flex justify-between items-center py-1 text-emerald-800">
                  <span>Total Amount Paid</span>
                  <span className="font-bold">{formatINR(paidAmount)}</span>
                </div>
              )}

              <div className="flex justify-between items-center py-1 text-sm">
                <span className="text-slate-600 font-semibold">Remaining Balance Due</span>
                <span className={`font-black text-base ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {formatINR(balanceDue)}
                </span>
              </div>

              {isPending && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Pending Age</span>
                  <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    {pendingAge}
                  </span>
                </div>
              )}

              {isFullyPaid && purchase.payment_received_at && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Fully Settled At</span>
                  <span className="font-semibold text-slate-800">
                    {formatDisplayDate(purchase.payment_received_at)}
                  </span>
                </div>
              )}
            </div>

            {isPending && (
              <div className="pt-2">
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>+ Record Payment Entry</span>
                </button>
              </div>
            )}
          </div>

          {/* Payment Transactions History */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-3.5 h-3.5 text-emerald-600" />
              Payment History ({purchase.payments?.length || (isFullyPaid ? 1 : 0)})
            </h3>

            {(!purchase.payments || purchase.payments.length === 0) && !isFullyPaid ? (
              <div className="text-center py-6 text-slate-400 text-xs italic">
                No payment recorded yet for this bill.
              </div>
            ) : (
              <div className="space-y-2.5">
                {(purchase.payments || []).map((pay, idx) => (
                  <div
                    key={pay.id || idx}
                    className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-emerald-950 text-sm">
                        {formatINR(pay.amount)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {pay.payment_mode || 'CASH'}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-500 text-[11px] pt-0.5">
                      <span>{formatDisplayDate(pay.paid_at)}</span>
                      {pay.notes && <span className="italic text-slate-600 truncate max-w-[180px]">{pay.notes}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reminder & Message History */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                Message / Reminder History
              </h3>
              <button
                onClick={fetchPurchase}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Refresh history"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {(!purchase.reminder_logs || purchase.reminder_logs.length === 0) ? (
              <div className="text-center py-6 text-slate-400 text-xs italic">
                No reminder or summary log recorded yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {purchase.reminder_logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        {log.message_type.replace('_', ' ')}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'SENT'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-500 text-[11px] pt-1">
                      <span>{formatDisplayDate(log.created_at)}</span>
                      {log.pending_days > 0 && <span>Age: {log.pending_days}d</span>}
                    </div>

                    {log.error_message && (
                      <p className="text-rose-600 text-[11px] mt-1 italic">
                        Error: {log.error_message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Received Modal (Supports Full and Partial Payments) */}
      {showPaymentModal && (
        <PaymentReceivedModal
          isOpen={true}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={handleConfirmPayment}
          customerName={purchase.customer?.name || 'Customer'}
          whatsappNumber={purchase.customer?.whatsapp_number || ''}
          amountPayable={totalAmount}
          paidAmount={paidAmount}
          balanceDue={balanceDue}
          customerTotalBalance={cumulativeTotal}
          otherPendingBillsCount={dateWisePendingBills.length}
          pharmacyName={pharmacyName}
          isProcessing={isProcessingPayment}
          errorMessage={paymentModalError}
        />
      )}

    </div>
  );
}

export default function PurchaseDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="py-24 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
          <span>Loading purchase details...</span>
        </div>
      }
    >
      <PurchaseDetailContent />
    </React.Suspense>
  );
}
