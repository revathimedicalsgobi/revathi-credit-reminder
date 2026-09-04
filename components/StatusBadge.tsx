import React from 'react';
import { PaymentStatus, WhatsAppStatus, ReminderStatus } from '@/lib/types';
import { CheckCircle2, Clock, AlertCircle, Send, CheckCheck } from 'lucide-react';

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

export function PaymentStatusBadge({ status, className = '' }: PaymentStatusBadgeProps) {
  if (status === 'PAID') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        PAID
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 ${className}`}>
      <Clock className="w-3.5 h-3.5 text-amber-600" />
      PENDING
    </span>
  );
}

interface WhatsAppStatusBadgeProps {
  status: WhatsAppStatus | ReminderStatus;
  className?: string;
}

export function WhatsAppStatusBadge({ status, className = '' }: WhatsAppStatusBadgeProps) {
  switch (status) {
    case 'SENT':
    case 'DELIVERED':
    case 'READ':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200 ${className}`}>
          <CheckCheck className="w-3 h-3 text-teal-600" />
          WhatsApp Sent
        </span>
      );
    case 'FAILED':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 ${className}`}>
          <AlertCircle className="w-3 h-3 text-rose-600" />
          WhatsApp Failed
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 ${className}`}>
          <Send className="w-3 h-3 text-slate-400" />
          Not Sent
        </span>
      );
  }
}
