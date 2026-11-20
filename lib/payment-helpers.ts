import { Purchase, PaymentRecord, PaymentStatus, AuditLog } from './types';
import { roundToTwoDecimals } from './calculations';

/**
 * Formats a sequential number into a standard ascending series bill number, e.g. BILL-0001, BILL-0049
 */
export function formatSeriesBillNumber(sequence: number, prefix: string = 'BILL'): string {
  const safeSeq = Math.max(1, Math.floor(sequence || 1));
  const padded = String(safeSeq).padStart(4, '0');
  return `${prefix}-${padded}`;
}

/**
 * Extracts sequence integer from a bill number string (e.g. "BILL-0048" -> 48, "INV-102" -> 102)
 */
export function extractBillSequenceNumber(billNumber?: string | null): number | null {
  if (!billNumber || typeof billNumber !== 'string') return null;
  const match = billNumber.match(/(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Generates an ascending continuous series bill number (e.g. BILL-0001, BILL-0049)
 */
export function generateNewBillNumber(sequenceOrPrefix: number | string = 1, prefix = 'BILL'): string {
  if (typeof sequenceOrPrefix === 'number') {
    return formatSeriesBillNumber(sequenceOrPrefix, prefix);
  }
  // If string passed, check if it's a numeric string or a prefix
  const parsed = parseInt(sequenceOrPrefix, 10);
  if (!isNaN(parsed) && String(parsed) === sequenceOrPrefix.trim()) {
    return formatSeriesBillNumber(parsed, prefix);
  }
  const customPrefix = sequenceOrPrefix.trim() || 'BILL';
  return formatSeriesBillNumber(1, customPrefix);
}

/**
 * Determines the next continuous ascending bill number given a list of existing purchases and audit logs
 */
export function getNextSeriesBillNumberFromList(
  purchases: Array<{ id?: string; bill_number?: string | null }>,
  auditLogs?: Array<{ id?: string; purchase_id?: string; new_status?: string | null; notes?: string | null }> | AuditLog[],
  prefix: string = 'BILL'
): string {
  const count = purchases ? purchases.length : 0;
  let maxSeq = count;

  if (purchases && purchases.length > 0) {
    for (const p of purchases) {
      if (p.bill_number) {
        const num = extractBillSequenceNumber(p.bill_number);
        if (num !== null && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  if (auditLogs && auditLogs.length > 0) {
    for (const log of auditLogs) {
      if (log.notes) {
        let candidate: string | null = null;
        if (log.new_status === 'BILL_NUMBER') {
          candidate = log.notes.replace(/^BILL_NUMBER:\s*/i, '').trim();
        } else if (log.notes.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(log.notes);
            if (parsed.bill_number) candidate = String(parsed.bill_number).trim();
          } catch {}
        }
        if (candidate) {
          const num = extractBillSequenceNumber(candidate);
          if (num !== null && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return formatSeriesBillNumber(nextSeq, prefix);
}

/**
 * Builds a chronological map mapping purchase ID -> sequential series number (e.g. BILL-0001, BILL-0002)
 */
export function buildChronologicalBillNumberMap(
  allPurchases: Array<{ id: string; created_at?: string; purchase_date?: string; bill_number?: string | null }>,
  auditLogs?: Array<{ id?: string; purchase_id?: string; new_status?: string | null; notes?: string | null }> | AuditLog[],
  prefix: string = 'BILL'
): Map<string, string> {
  const map = new Map<string, string>();
  if (!allPurchases || allPurchases.length === 0) return map;

  // Sort ascending by creation time to establish canonical chronological order
  const sorted = [...allPurchases].sort((a, b) => {
    const timeA = new Date(a.created_at || a.purchase_date || 0).getTime();
    const timeB = new Date(b.created_at || b.purchase_date || 0).getTime();
    return timeA - timeB;
  });

  sorted.forEach((p, index) => {
    // 1. Direct bill_number
    if (p.bill_number && p.bill_number.trim()) {
      map.set(p.id, p.bill_number.trim());
      return;
    }

    // 2. Audit logs override
    if (auditLogs && auditLogs.length > 0) {
      for (const log of auditLogs) {
        if (log.purchase_id === p.id) {
          if (log.new_status === 'BILL_NUMBER' && log.notes) {
            const trimmed = log.notes.replace(/^BILL_NUMBER:\s*/i, '').trim();
            if (trimmed) {
              map.set(p.id, trimmed);
              return;
            }
          }
          if (log.notes && log.notes.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(log.notes);
              if (parsed.bill_number && String(parsed.bill_number).trim()) {
                map.set(p.id, String(parsed.bill_number).trim());
                return;
              }
            } catch {}
          }
        }
      }
    }

    // 3. Sequential ascending series number (1-based: BILL-0001, BILL-0002, ...)
    const seriesNumber = formatSeriesBillNumber(index + 1, prefix);
    map.set(p.id, seriesNumber);
  });

  return map;
}

/**
 * Generates a formal Receipt Number for a payment entry
 */
export function generateReceiptNumber(purchaseId?: string, paymentSeq?: number): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const idPart = purchaseId ? purchaseId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : 'PAY';
  const seqPadded = paymentSeq ? String(paymentSeq).padStart(3, '0') : String(Math.floor(100 + Math.random() * 900));
  return `RCP-${year}${month}-${idPart}-${seqPadded}`;
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
  auditLogs?: Array<{ id?: string; purchase_id?: string; new_status?: string | null; notes?: string | null }> | AuditLog[],
  fallbackIndex?: number
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

  // If fallback chronological index is provided, use continuous series format (BILL-0001, BILL-0048)
  if (fallbackIndex !== undefined && fallbackIndex > 0) {
    return formatSeriesBillNumber(fallbackIndex);
  }

  // Fallback using first 4 hex characters
  const cleanId = (purchase.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || '0001';
  return `BILL-${cleanId}`;
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
  auditLogs?: AuditLog[],
  fallbackIndexOrBillNumber?: number | string
): Purchase {
  const logs = auditLogs || purchase.audit_logs || [];
  const details = computePurchasePaymentDetails(purchase, logs);
  const resolvedBillNumber = typeof fallbackIndexOrBillNumber === 'string' && fallbackIndexOrBillNumber
    ? fallbackIndexOrBillNumber
    : getOrGenerateBillNumber(
        purchase,
        logs,
        typeof fallbackIndexOrBillNumber === 'number' ? fallbackIndexOrBillNumber : undefined
      );

  return {
    ...purchase,
    bill_number: resolvedBillNumber,
    paid_amount: details.paid_amount,
    balance_due: details.balance_due,
    payment_status: details.payment_status,
    payments: details.payments,
  };
}
