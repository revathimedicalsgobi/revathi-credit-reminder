'use client';

import React from 'react';
import { formatINR } from '@/lib/calculations';
import { CheckCircle2, X, AlertCircle, HeartHandshake, MessageCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { buildWhatsAppThankYouText, getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

interface PaymentReceivedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  customerName: string;
  whatsappNumber?: string;
  amountPayable: number;
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
  pharmacyName = 'Revathi Medicals & Distributors',
  isProcessing,
  errorMessage,
}: PaymentReceivedModalProps) {
  if (!isOpen) return null;

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

  const handleConfirmOnly = async () => {
    try {
      triggerConfetti();
      await onConfirm();
    } catch {
      // Handled in parent
    }
  };

  const handleConfirmAndWhatsApp = async () => {
    try {
      triggerConfetti();
      await onConfirm();

      // Open WhatsApp Web with thank you message
      if (whatsappNumber) {
        const text = buildWhatsAppThankYouText({
          customerName,
          recipientPhone: whatsappNumber,
          amountReceived: amountPayable,
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
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 transform transition-all"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Mark Payment as Received
          </h3>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-3">
          <div className="bg-emerald-50/60 p-4 rounded-xl space-y-2 border border-emerald-100 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <p className="text-sm text-slate-600 font-medium">
              Confirm receiving payment from
            </p>
            <h4 className="text-base font-bold text-slate-900">{customerName}</h4>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {formatINR(amountPayable)}
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed text-center">
            This will mark the purchase as <strong className="text-emerald-700">PAID</strong> and stop future reminder messages.
          </p>

          {errorMessage && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-start gap-2 border border-rose-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

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
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-60"
          >
            Mark Paid Only
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
                <span>Updating...</span>
              </>
            ) : (
              <>
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Paid + WhatsApp Thank-You</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
