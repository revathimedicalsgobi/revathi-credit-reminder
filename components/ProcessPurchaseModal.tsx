'use client';

import React from 'react';
import { formatINR } from '@/lib/calculations';
import { Send, CheckCircle2, X, AlertCircle } from 'lucide-react';

interface ProcessPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  customerName: string;
  whatsappNumber: string;
  amountPayable: number;
  sendWhatsApp: boolean;
  isProcessing: boolean;
  errorMessage?: string | null;
}

export function ProcessPurchaseModal({
  isOpen,
  onClose,
  onConfirm,
  customerName,
  whatsappNumber,
  amountPayable,
  sendWhatsApp,
  isProcessing,
  errorMessage,
}: ProcessPurchaseModalProps) {
  if (!isOpen) return null;

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
            Process Purchase
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
          <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200/60">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Customer:</span>
              <span className="font-semibold text-slate-800">{customerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">WhatsApp:</span>
              <span className="font-medium text-slate-700">{whatsappNumber}</span>
            </div>
            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
              <span className="font-bold text-slate-800">Amount Payable:</span>
              <span className="text-lg font-extrabold text-emerald-700">
                {formatINR(amountPayable)}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 bg-emerald-50 rounded-xl text-xs text-emerald-800 border border-emerald-200">
            <Send className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <p>
              {sendWhatsApp
                ? `Purchase summary will be saved and automatically sent to ${whatsappNumber} via official WhatsApp Business API.`
                : 'Purchase will be saved as Pending without sending a WhatsApp message.'}
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-start gap-2 border border-rose-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md shadow-emerald-600/30 transition-all disabled:opacity-60"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Process</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
