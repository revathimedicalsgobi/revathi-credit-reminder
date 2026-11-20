'use client';

import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { formatINR } from '@/lib/calculations';

interface DeleteBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDeleting: boolean;
  billNumber?: string;
  customerName?: string;
  amount?: number;
  error?: string | null;
}

export function DeleteBillModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  billNumber,
  customerName,
  amount,
  error,
}: DeleteBillModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-rose-100 overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header with warning accent */}
        <div className="p-5 sm:p-6 pb-0 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0 border border-rose-100">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Delete Bill Record
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                This action is permanent and cannot be undone.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Bill summary snippet */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold text-slate-500">Bill No:</span>
              <span className="font-mono font-bold text-slate-900">
                {billNumber || 'N/A'}
              </span>
            </div>
            {customerName && (
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-semibold text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{customerName}</span>
              </div>
            )}
            {amount !== undefined && (
              <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200">
                <span className="font-semibold text-slate-500">Bill Amount:</span>
                <span className="font-extrabold text-slate-900">{formatINR(amount)}</span>
              </div>
            )}
          </div>

          {/* Warning box */}
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Are you sure you want to delete this bill? All sale items and associated payment history for this bill will be removed.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold animate-in fade-in">
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 sm:p-6 pt-0 bg-white flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-extrabold shadow-sm shadow-rose-600/30 transition-all disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Bill</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
