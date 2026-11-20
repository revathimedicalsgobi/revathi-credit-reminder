import { Purchase, PaymentRecord, PaymentStatus, AuditLog } from './types';
import { roundToTwoDecimals } from './calculations';

/**
 * Generates a clean default Bill Number for a new or existing purchase
 */
export function generateNewBillNumber(customPrefix = 'BILL'): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${customPrefix}-${year}${month}-${randomSuffix}`;
}

/**
 * Generates a formal Receipt Number for a payment entry
 */
export function generateReceiptNumber(purchaseId?: string): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const idPart = purchaseId ? purchaseId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : Math.random().toString(36).slice(2, 6).toUpperCase();
  const seq = Math.floor(100 + Math.random() * 900);
  return `RCP-${year}${month}-${idPart}-${seq}`;
}

/**
 * Resolves or deterministically derives a Bill Number for any purchase
 */
export function getOrGenerateBillNumber(
  purchase: {
    id: string;
    bill_number?: string | null;
    purchase_date?: string;
    created_at?: string;
  },
  auditLogs?: AuditLog[]
): string {
  if (purchase.bill_number && purchase.bill_number.trim()) {
    return purchase.bill_number.trim();
  }

  // Check audit logs for bill number override
  if (auditLogs && auditLogs.length > 0) {
    for (const log of auditLogs) {
      if (log.purchase_id === purchase.id) {
        if (log.new_status === 'BILL_NUMBER' && log.notes) {
          const trimmed = log.notes.replace(/^BILL_NUMBER:\s*/i, '').trim();
          if (trimmed) return trimmed;
        }
        if (log.notes && log.notes.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(log.notes);
            if (parsed.bill_number && String(parsed.bill_number).trim()) {
              return String(parsed.bill_number).trim();
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }

  // Deterministic fallback based on purchase date and ID
  const d = purchase.purchase_date || purchase.created_at || new Date().toISOString();
  const year = d.slice(2, 4);
  const month = d.slice(5, 7);
  const cleanId = (purchase.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || '0001';
  return `BILL-${year}${month}-${cleanId}`;
}

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
        const paidAt = parsed.paid_at || log.changed_at;
        const year = paidAt.slice(2, 4);
        const month = paidAt.slice(5, 7);
        const logIdSuffix = log.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
        const fallbackReceiptNo = `RCP-${year}${month}-${logIdSuffix}`;

        return {
          id: log.id,
          purchase_id: log.purchase_id,
          amount: Math.max(0, Number(parsed.amount) || 0),
          payment_mode: parsed.payment_mode || 'CASH',
          receipt_number: parsed.receipt_number || fallbackReceiptNo,
          notes: parsed.notes || null,
          paid_at: paidAt,
          created_at: log.changed_at,
        };
      }
    } catch {
      // Fall through to plain text parsing
    }
  }

  // Legacy or status-based payment log
  if (log.new_status === 'PAID' || log.new_status === 'PARTIAL_PAYMENT') {
    const paidAt = log.changed_at;
    const year = paidAt.slice(2, 4);
    const month = paidAt.slice(5, 7);
    const logIdSuffix = log.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();

    return {
      id: log.id,
      purchase_id: log.purchase_id,
      amount: 0, // Will be matched against purchase if standalone
      payment_mode: 'CASH',
      receipt_number: `RCP-${year}${month}-${logIdSuffix}`,
      notes: log.notes || 'Full payment received',
      paid_at: paidAt,
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
        receipt_number: `RCP-LEGACY-${purchase.id.slice(0, 4).toUpperCase()}`,
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
 * Enriches a single purchase object with computed partial payment details and Bill Number
 */
export function enrichPurchaseWithPayments(
  purchase: Purchase & { audit_logs?: AuditLog[] },
  auditLogs?: AuditLog[]
): Purchase {
  const logs = auditLogs || purchase.audit_logs || [];
  const details = computePurchasePaymentDetails(purchase, logs);
  const resolvedBillNumber = getOrGenerateBillNumber(purchase, logs);

  return {
    ...purchase,
    bill_number: resolvedBillNumber,
    paid_amount: details.paid_amount,
    balance_due: details.balance_due,
    payment_status: details.payment_status,
    payments: details.payments,
  };
}
