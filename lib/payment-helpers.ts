import { Purchase, PaymentRecord, PaymentStatus, AuditLog } from './types';
import { roundToTwoDecimals } from './calculations';

/**
 * Extracts and parses structured payment data from an audit log record
 */
export function parsePaymentRecord(log: AuditLog): PaymentRecord | null {
  if (!log) return null;

  // Check if notes is formatted as JSON
  if (log.notes && log.notes.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(log.notes);
      if (parsed.type === 'PAYMENT' || parsed.amount !== undefined) {
        return {
          id: log.id,
          purchase_id: log.purchase_id,
          amount: Math.max(0, Number(parsed.amount) || 0),
          payment_mode: parsed.payment_mode || 'CASH',
          notes: parsed.notes || null,
          paid_at: parsed.paid_at || log.changed_at,
          created_at: log.changed_at,
        };
      }
    } catch {
      // Fall through to plain text parsing
    }
  }

  // Legacy or status-based payment log
  if (log.new_status === 'PAID' || log.new_status === 'PARTIAL_PAYMENT') {
    return {
      id: log.id,
      purchase_id: log.purchase_id,
      amount: 0, // Will be inferred or matched against purchase if standalone
      payment_mode: 'CASH',
      notes: log.notes || 'Full payment received',
      paid_at: log.changed_at,
      created_at: log.changed_at,
    };
  }

  return null;
}

/**
 * Computes paid amount, balance due, payment records, and computed payment status for a purchase
 */
export function computePurchasePaymentDetails(
  purchase: {
    id: string;
    amount_payable: number;
    payment_status: string;
    payment_received_at?: string | null;
    paid_amount?: number | null;
  },
  auditLogs?: AuditLog[]
): {
  paid_amount: number;
  balance_due: number;
  payment_status: PaymentStatus;
  payments: PaymentRecord[];
  payment_percentage: number;
} {
  const amountPayable = roundToTwoDecimals(Math.max(0, Number(purchase.amount_payable) || 0));
  const payments: PaymentRecord[] = [];

  if (auditLogs && auditLogs.length > 0) {
    for (const log of auditLogs) {
      if (log.purchase_id === purchase.id) {
        const record = parsePaymentRecord(log);
        if (record) {
          payments.push(record);
        }
      }
    }
  }

  // Sort payments chronologically (earliest first)
  payments.sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());

  let totalPaidFromRecords = 0;
  for (const p of payments) {
    if (p.amount > 0) {
      totalPaidFromRecords += p.amount;
    }
  }
  totalPaidFromRecords = roundToTwoDecimals(totalPaidFromRecords);

  // If purchase has direct paid_amount column value
  let effectivePaid = totalPaidFromRecords;
  if (purchase.paid_amount !== undefined && purchase.paid_amount !== null && Number(purchase.paid_amount) > effectivePaid) {
    effectivePaid = roundToTwoDecimals(Number(purchase.paid_amount));
  }

  // If status is marked 'PAID' in DB and no specific amount was logged (legacy full payment), treat as fully paid
  if (purchase.payment_status === 'PAID' && effectivePaid === 0 && amountPayable > 0) {
    effectivePaid = amountPayable;
    if (payments.length === 0) {
      payments.push({
        id: `legacy-payment-${purchase.id}`,
        purchase_id: purchase.id,
        amount: amountPayable,
        payment_mode: 'CASH',
        notes: 'Full payment received',
        paid_at: purchase.payment_received_at || new Date().toISOString(),
      });
    } else {
      // Set the legacy payment record's amount to amountPayable
      payments[0].amount = amountPayable;
    }
  }

  effectivePaid = Math.min(amountPayable, Math.max(0, effectivePaid));
  const balanceDue = roundToTwoDecimals(Math.max(0, amountPayable - effectivePaid));

  let computedStatus: PaymentStatus = 'PENDING';
  if (balanceDue === 0 || purchase.payment_status === 'PAID') {
    computedStatus = 'PAID';
  } else if (effectivePaid > 0) {
    computedStatus = 'PARTIAL';
  }

  const paymentPercentage = amountPayable > 0 ? Math.min(100, Math.round((effectivePaid / amountPayable) * 100)) : 100;

  return {
    paid_amount: effectivePaid,
    balance_due: balanceDue,
    payment_status: computedStatus,
    payments,
    payment_percentage: paymentPercentage,
  };
}

/**
 * Enriches a single purchase object with computed partial payment details
 */
export function enrichPurchaseWithPayments(
  purchase: Purchase & { audit_logs?: AuditLog[] },
  auditLogs?: AuditLog[]
): Purchase {
  const logs = auditLogs || purchase.audit_logs || [];
  const details = computePurchasePaymentDetails(purchase, logs);

  return {
    ...purchase,
    paid_amount: details.paid_amount,
    balance_due: details.balance_due,
    payment_status: details.payment_status,
    payments: details.payments,
  };
}
