'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Printer,
  Download,
  MessageCircle,
  CheckCircle2,
  Receipt,
  ShieldCheck,
  CreditCard,
  Banknote,
  Smartphone,
  Calendar,
  User,
  Phone,
  Check,
} from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { formatDisplayDate, formatShortDate, numberToIndianRupeeWords } from '@/lib/utils';
import { ReceiptDetails } from '@/lib/types';
import {
  downloadReceiptAsJpeg,
  buildWhatsAppPaymentReceiptText,
  getWhatsAppDirectUrl,
} from '@/lib/whatsapp-share';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptDetails | null;
  pharmacyName?: string;
  upiId?: string | null;
}

export function ReceiptModal({
  isOpen,
  onClose,
  receipt,
  pharmacyName = 'Revathi Medicals & Distributors',
  upiId,
}: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [formatMode, setFormatMode] = useState<'standard' | 'thermal'>('standard');

  if (!isOpen || !receipt) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadImage = async () => {
    if (!receiptRef.current) return;
    try {
      setIsExporting(true);
      const safeName = (receipt.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
      await downloadReceiptAsJpeg(
        receiptRef.current,
        `Receipt_${receipt.receipt_number}_${safeName}.jpg`
      );
      showToast('Receipt image downloaded successfully!');
    } catch {
      showToast('Failed to download receipt image.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendWhatsApp = async () => {
    const phone = receipt.whatsapp_number;
    if (!phone) {
      showToast('No customer phone number available.');
      return;
    }

    const receiptText = buildWhatsAppPaymentReceiptText({
      receiptNumber: receipt.receipt_number,
      receiptDate: receipt.receipt_date,
      billNumber: receipt.bill_number,
      customerName: receipt.customer_name,
      recipientPhone: phone,
      amountReceived: receipt.amount_received,
      totalBillAmount: receipt.total_bill_amount,
      previousPaid: receipt.previous_paid,
      remainingBalance: receipt.remaining_balance,
      paymentMode: receipt.payment_mode,
      pharmacyName: receipt.pharmacy_name || pharmacyName,
      upiId,
      notes: receipt.notes,
    });

    setIsSendingWhatsApp(true);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          message: receiptText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✅ Payment receipt sent to ${receipt.customer_name} via WhatsApp!`);
      } else {
        // Fallback to opening WhatsApp Web
        const directUrl = getWhatsAppDirectUrl(phone, receiptText);
        window.open(directUrl, '_blank', 'noopener,noreferrer');
        showToast('WhatsApp opened with payment receipt!');
      }
    } catch {
      const directUrl = getWhatsAppDirectUrl(phone, receiptText);
      window.open(directUrl, '_blank', 'noopener,noreferrer');
      showToast('WhatsApp opened with payment receipt!');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const amountInWords = numberToIndianRupeeWords(receipt.amount_received);
  const isSettled = receipt.remaining_balance <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header Toolbar */}
        <div className="no-print p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                Official Payment Receipt
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {receipt.receipt_number}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Format toggle: Standard vs Thermal Slip */}
            <div className="hidden sm:flex items-center p-0.5 bg-slate-200/80 rounded-lg text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setFormatMode('standard')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  formatMode === 'standard' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Standard Slip
              </button>
              <button
                type="button"
                onClick={() => setFormatMode('thermal')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  formatMode === 'thermal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Thermal (80mm)
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              title="Close receipt"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div className="no-print mx-4 mt-3 p-2.5 bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in">
            <span>{toastMsg}</span>
            <button onClick={() => setToastMsg(null)} className="text-white font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {/* Printable Receipt Paper Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex items-center justify-center">
          <div
            ref={receiptRef}
            id="printable-official-receipt"
            className={`bg-white rounded-2xl shadow-md border border-slate-300 p-6 text-slate-900 w-full transition-all ${
              formatMode === 'thermal' ? 'max-w-[340px] font-mono text-xs' : 'max-w-[500px]'
            }`}
          >
            {/* Pharmacy Branding Header */}
            <div className="text-center pb-4 border-b-2 border-slate-900/80 space-y-1">
              <div className="inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 inline no-print" />
                <h2 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
                  {receipt.pharmacy_name || pharmacyName}
                </h2>
              </div>
              <p className="text-[11px] text-slate-600 font-medium">
                Retail & Wholesale Healthcare Pharmacy
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                PAYMENT ACKNOWLEDGEMENT RECEIPT
              </p>
            </div>

            {/* Receipt & Bill Identifiers */}
            <div className="py-3.5 border-b border-dashed border-slate-300 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Receipt No:
                </span>
                <span className="font-mono font-black text-slate-900 text-xs">
                  {receipt.receipt_number}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Date & Time:
                </span>
                <span className="font-semibold text-slate-800 text-xs">
                  {formatDisplayDate(receipt.receipt_date)}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Bill Reference:
                </span>
                <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block text-[11px]">
                  {receipt.bill_number}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Payment Mode:
                </span>
                <span className="font-black text-slate-800 uppercase text-xs">
                  {receipt.payment_mode || 'CASH'}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                Received From:
              </span>
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-slate-900">
                  {receipt.customer_name}
                </span>
                {receipt.whatsapp_number && (
                  <span className="font-mono text-xs text-slate-600 font-medium">
                    {receipt.whatsapp_number}
                  </span>
                )}
              </div>
            </div>

            {/* Highlighted Amount Received Box */}
            <div className="py-4 my-2 text-center bg-emerald-50/80 rounded-xl border border-emerald-300 space-y-1">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                AMOUNT RECEIVED
              </span>
              <div className="text-2xl sm:text-3xl font-black text-emerald-950">
                {formatINR(receipt.amount_received)}
              </div>
              <p className="text-[10px] text-emerald-800 font-semibold italic capitalize px-2">
                &quot;{amountInWords}&quot;
              </p>
            </div>

            {/* Bill Financial Breakdown */}
            <div className="py-2.5 border-t border-b border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-slate-600">
                <span>Original Bill Total:</span>
                <span className="font-bold text-slate-900">
                  {formatINR(receipt.total_bill_amount)}
                </span>
              </div>

              {receipt.previous_paid > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span>Previously Paid:</span>
                  <span className="font-bold text-emerald-700">
                    {formatINR(receipt.previous_paid)}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center text-emerald-800 font-bold">
                <span>Payment Received Now:</span>
                <span className="font-black">
                  {formatINR(receipt.amount_received)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-700 font-bold pt-1 border-t border-slate-100">
                <span>Cumulative Total Paid:</span>
                <span className="font-black text-emerald-700">
                  {formatINR(receipt.new_total_paid)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-slate-200 text-sm">
                <span className="font-bold text-slate-800">
                  {isSettled ? 'Account Status:' : 'Remaining Balance Due:'}
                </span>
                <span
                  className={`font-black ${
                    isSettled ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {isSettled ? '✓ FULLY SETTLED' : formatINR(receipt.remaining_balance)}
                </span>
              </div>
            </div>

            {/* Remarks / Notes if any */}
            {receipt.notes && (
              <div className="py-2 text-[11px] text-slate-600 border-b border-slate-100">
                <span className="font-bold text-slate-400 mr-1">Remarks:</span>
                <span>{receipt.notes}</span>
              </div>
            )}

            {/* Signature & Seal Footer */}
            <div className="pt-6 pb-1 flex items-end justify-between text-xs">
              <div className="text-[10px] text-slate-400 space-y-0.5">
                <p>Computer Generated Receipt</p>
                <p>Thank you for your prompt payment!</p>
              </div>

              <div className="text-center">
                <div className="w-28 border-b border-slate-400 mb-1" />
                <span className="text-[10px] font-bold text-slate-700 uppercase">
                  Authorized Signatory
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Bar */}
        <div className="no-print p-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={isExporting}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-all cursor-pointer"
              title="Download Receipt as Image"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>{isExporting ? 'Downloading...' : 'Download Image'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-900 bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300 border border-emerald-300 rounded-xl transition-all cursor-pointer"
              title="Print Receipt"
            >
              <Printer className="w-4 h-4 text-emerald-800" />
              <span>Print Receipt</span>
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={isSendingWhatsApp}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
              title="Share Receipt on WhatsApp"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{isSendingWhatsApp ? 'Sending...' : 'WhatsApp Receipt'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
