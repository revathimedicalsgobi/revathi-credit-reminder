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
} from 'lucide-react';
import { Purchase } from '@/lib/types';
import { formatINR } from '@/lib/calculations';
import { getPendingAgeText, getPendingDaysCount, formatDisplayDate } from '@/lib/utils';
import { PurchaseSummaryCard } from '@/components/PurchaseSummaryCard';
import { PaymentReceivedModal } from '@/components/PaymentReceivedModal';
import { buildWhatsAppReminderText, buildWhatsAppThankYouText, getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

export default function PurchaseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const purchaseId = params.id as string;
  const isJustCreated = searchParams.get('created') === 'true';

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');
  const [upiId, setUpiId] = useState<string | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(
    isJustCreated ? 'Purchase recorded successfully!' : null
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

  const handleSendManualReminder = () => {
    if (!purchase) return;
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

  const handleSendManualThankYou = () => {
    if (!purchase) return;
    const phone = purchase.customer?.whatsapp_number || '';
    const thankYouText = buildWhatsAppThankYouText({
      customerName: purchase.customer?.name || 'Customer',
      recipientPhone: phone,
      amountReceived: Number(purchase.amount_payable),
      pharmacyName,
    });

    const chatUrl = getWhatsAppDirectUrl(phone, thankYouText);
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
  };

  const handleConfirmPayment = async () => {
    setIsProcessingPayment(true);
    setPaymentModalError(null);

    try {
      const res = await fetch(`/api/purchases/${purchaseId}/payment-received`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to mark payment received');
      }

      // Optimistic update
      setPurchase((prev) =>
        prev
          ? {
              ...prev,
              payment_status: 'PAID',
              payment_received_at: new Date().toISOString(),
            }
          : null
      );

      setShowPaymentModal(false);
      setActionSuccessMsg('Payment marked as PAID successfully!');
      fetchPurchase();
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

  const isPending = purchase.payment_status === 'PENDING';
  const pendingAge = getPendingAgeText(purchase.purchase_date);

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
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Purchase for {purchase.customer?.name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              <span>Created {formatDisplayDate(purchase.created_at)}</span>
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          {isPending ? (
            <button
              onClick={handleSendManualReminder}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl shadow-sm transition-all"
              title="Open customer chat on WhatsApp Web with reminder preloaded"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp Reminder</span>
            </button>
          ) : (
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
              <span>Payment Received</span>
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
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center justify-between no-print">
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

      {/* Grid: Purchase Summary Card on left, Status & Reminder Logs on right */}
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
            paymentStatus={purchase.payment_status}
            upiId={upiId}
            paymentQrUrl={paymentQrUrl}
            showPrintButton={false}
          />
        </div>

        {/* Right Column: Status Details & Reminder History */}
        <div className="lg:col-span-5 space-y-6 no-print">
          {/* Status Overview Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Payment Status Overview
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500">Status</span>
                <span
                  className={`font-bold ${
                    isPending ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                >
                  {purchase.payment_status}
                </span>
              </div>

              {isPending && (
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500">Pending Age</span>
                  <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-xs">
                    {pendingAge}
                  </span>
                </div>
              )}

              {!isPending && purchase.payment_received_at && (
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500">Payment Received</span>
                  <span className="font-semibold text-slate-800 text-xs">
                    {formatDisplayDate(purchase.payment_received_at)}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center py-2">
                <span className="text-slate-500">Amount Payable</span>
                <span className="text-lg font-black text-slate-900">
                  {formatINR(purchase.amount_payable)}
                </span>
              </div>
            </div>
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

      {/* Payment Received Modal */}
      {showPaymentModal && (
        <PaymentReceivedModal
          isOpen={true}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={handleConfirmPayment}
          customerName={purchase.customer?.name || 'Customer'}
          whatsappNumber={purchase.customer?.whatsapp_number || ''}
          amountPayable={Number(purchase.amount_payable)}
          pharmacyName={pharmacyName}
          isProcessing={isProcessingPayment}
          errorMessage={paymentModalError}
        />
      )}
    </div>
  );
}
