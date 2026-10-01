'use client';

import React, { useState } from 'react';
import { formatINR, roundToTwoDecimals } from '@/lib/calculations';
import { PaymentMode } from '@/lib/types';
import { CheckCircle2, X, AlertCircle, HeartHandshake, MessageCircle, CreditCard, Banknote, QrCode } from 'lucide-react';
import confetti from 'canvas-confetti';
import { buildWhatsAppThankYouText, getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

interface PaymentReceivedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentData: { amount: number; payment_mode: PaymentMode; notes?: string }) => Promise<void> | void;
  customerName: string;
  whatsappNumber?: string;
  amountPayable: number;
  paidAmount?: number;
  balanceDue?: number;
  pharmacyName?: string;
  isProcessing: boolean;
  errorMessage?: string | null;
}

export function PaymentReceivedModal({
  isOpen,
  onClose,
  onConfirm,
  customerName,
  whatsappNumber,
  amountPayable,
  paidAmount = 0,
  balanceDue,
  pharmacyName = 'Revathi Medicals & Distributors',
  isProcessing,
  errorMessage,
}: PaymentReceivedModalProps) {
  const currentDue = balanceDue !== undefined ? balanceDue : roundToTwoDecimals(Math.max(0, amountPayable - paidAmount));
  
  // Payment Type: 'FULL' | 'PARTIAL'
  const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [customAmount, setCustomAmount] = useState<string>(currentDue.toString());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const enteredAmount = paymentType === 'FULL'
    ? currentDue
    : roundToTwoDecimals(Math.max(0, Number(customAmount) || 0));

  const newTotalPaid = roundToTwoDecimals(paidAmount + enteredAmount);
  const newRemainingBalance = roundToTwoDecimals(Math.max(0, currentDue - enteredAmount));
  const isFullSettlement = newRemainingBalance <= 0;

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // Confetti fallback
    }
  };

  const validateAndGetPayload = () => {
    setLocalError(null);
    if (enteredAmount <= 0) {
      setLocalError('Please enter a valid payment amount greater than 0.');
      return null;
    }
    if (enteredAmount > currentDue) {
      setLocalError(`Payment amount cannot exceed the pending balance of ${formatINR(currentDue)}.`);
      return null;
    }
    return {
      amount: enteredAmount,
      payment_mode: paymentMode,
      notes: notes.trim() || undefined,
    };
  };

  const handleConfirmOnly = async () => {
    const payload = validateAndGetPayload();
    if (!payload) return;

    try {
      if (isFullSettlement) triggerConfetti();
      await onConfirm(payload);
    } catch {
      // Handled in parent
    }
  };

  const handleConfirmAndWhatsApp = async () => {
    const payload = validateAndGetPayload();
    if (!payload) return;

    try {
      if (isFullSettlement) triggerConfetti();
      await onConfirm(payload);

      // Open WhatsApp Web with thank you message
      if (whatsappNumber) {
        const text = buildWhatsAppThankYouText({
          customerName,
          recipientPhone: whatsappNumber,
          amountReceived: enteredAmount,
          totalBillAmount: amountPayable,
          remainingBalance: newRemainingBalance,
          isPartial: !isFullSettlement,
          pharmacyName,
        });
        const url = getWhatsAppDirectUrl(whatsappNumber, text);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Handled in parent
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 transform transition-all max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Record Payment Entry
          </h3>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer & Bill Summary Banner */}
        <div className="py-4 space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Customer
                </span>
                <h4 className="text-base font-extrabold text-slate-900">{customerName}</h4>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Total Bill
                </span>
                <span className="text-sm font-bold text-slate-700">{formatINR(amountPayable)}</span>
              </div>
            </div>

            {paidAmount > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                <div>
                  <span className="text-slate-500">Already Paid:</span>
                  <span className="font-bold text-emerald-700 ml-1.5">{formatINR(paidAmount)}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500">Pending Balance:</span>
                  <span className="font-bold text-rose-700 ml-1.5">{formatINR(currentDue)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Payment Type Selection Tabs */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
              Select Payment Option
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setPaymentType('FULL');
                  setCustomAmount(currentDue.toString());
                  setLocalError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  paymentType === 'FULL'
                    ? 'bg-white text-emerald-800 shadow-sm border border-emerald-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Full Settle ({formatINR(currentDue)})
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentType('PARTIAL');
                  if (!customAmount || Number(customAmount) === currentDue) {
                    setCustomAmount((Math.round(currentDue / 2)).toString());
                  }
                  setLocalError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  paymentType === 'PARTIAL'
                    ? 'bg-white text-orange-800 shadow-sm border border-orange-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Partial Payment Entry
              </button>
            </div>
          </div>

          {/* Partial Payment Amount Input */}
          {paymentType === 'PARTIAL' && (
            <div className="p-4 bg-orange-50/60 border border-orange-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
              <label className="block text-xs font-bold text-orange-950 uppercase">
                Enter Partial Amount Received (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={currentDue}
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="e.g. 500"
                  className="w-full pl-8 pr-3 py-2.5 text-lg font-black text-slate-900 rounded-xl border border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] text-slate-500 font-semibold">Quick select:</span>
                {[
                  { label: '₹100', amt: 100 },
                  { label: '₹200', amt: 200 },
                  { label: '₹500', amt: 500 },
                  { label: '50%', amt: Math.round(currentDue * 0.5) },
                ].map((preset, idx) => {
                  if (preset.amt >= currentDue) return null;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCustomAmount(preset.amt.toString())}
                      className="px-2 py-1 bg-white hover:bg-orange-100 text-orange-800 border border-orange-200 rounded-md text-[11px] font-bold"
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment Mode Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="CASH">💵 Cash</option>
                <option value="UPI">📱 UPI (GPay / PhonePe / Paytm)</option>
                <option value="CARD">💳 Card / POS Machine</option>
                <option value="NETBANKING">🏦 Bank Transfer</option>
                <option value="OTHER">🔖 Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Remarks / Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Paid in cash at counter"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Real-time Calculation Breakdown Box */}
          <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 space-y-2 text-center">
            <span className="text-xs text-slate-600 font-medium block">
              {isFullSettlement ? 'Confirming Full Settlement:' : 'Confirming Partial Payment:'}
            </span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-800">
              {formatINR(enteredAmount)}
            </div>
            {!isFullSettlement && (
              <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg inline-block mt-1">
                Remaining Balance Due After Payment: {formatINR(newRemainingBalance)}
              </div>
            )}
            {isFullSettlement && (
              <p className="text-[11px] text-emerald-700 font-bold">
                ✓ Bill will be marked as fully PAID and reminders stopped.
              </p>
            )}
          </div>

          {(localError || errorMessage) && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-start gap-2 border border-rose-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{localError || errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmOnly}
            disabled={isProcessing}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-all disabled:opacity-60"
          >
            {isProcessing ? 'Processing...' : 'Record Payment Only'}
          </button>

          <button
            type="button"
            onClick={handleConfirmAndWhatsApp}
            disabled={isProcessing}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md shadow-emerald-600/30 transition-all disabled:opacity-60"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Recording...</span>
              </>
            ) : (
              <>
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Record + WhatsApp Receipt</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
