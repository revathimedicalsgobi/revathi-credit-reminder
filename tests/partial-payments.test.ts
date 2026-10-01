import { describe, it, expect } from 'vitest';
import { computePurchasePaymentDetails, parsePaymentRecord } from '../lib/payment-helpers';
import { UpdatePurchaseSchema, RecordPaymentSchema } from '../lib/validations';
import {
  buildWhatsAppReminderText,
  buildWhatsAppThankYouText,
  buildWhatsAppSummaryText,
} from '../lib/whatsapp-share';
import { AuditLog } from '../lib/types';

describe('Partial Payments & Bill Edit Tests', () => {
  it('validates UpdatePurchaseSchema correctly for bill editing', () => {
    const valid = UpdatePurchaseSchema.safeParse({
      customer_name: 'Boopathy',
      whatsapp_number: '9876543210',
      purchase_date: '2026-10-01',
      items: [
        { item_name: 'Paracetamol 500mg', quantity: 2, mrp: 50, discount: 10 },
      ],
      send_whatsapp: true,
    });

    expect(valid.success).toBe(true);

    const invalid = UpdatePurchaseSchema.safeParse({
      customer_name: '',
      whatsapp_number: '123',
      items: [],
    });

    expect(invalid.success).toBe(false);
  });

  it('validates RecordPaymentSchema correctly for payment entry', () => {
    const validPartial = RecordPaymentSchema.safeParse({
      amount: 400,
      payment_mode: 'UPI',
      notes: 'Paid via GPay',
    });

    expect(validPartial.success).toBe(true);
    if (validPartial.success) {
      expect(validPartial.data.amount).toBe(400);
      expect(validPartial.data.payment_mode).toBe('UPI');
    }

    const invalidAmount = RecordPaymentSchema.safeParse({
      amount: -50,
    });

    expect(invalidAmount.success).toBe(false);
  });

  it('correctly computes partial payment, balance due, and status transitions', () => {
    const purchase = {
      id: 'purch-123',
      amount_payable: 1000,
      payment_status: 'PENDING',
    };

    // 1. Initial State: Unpaid
    const initial = computePurchasePaymentDetails(purchase, []);
    expect(initial.paid_amount).toBe(0);
    expect(initial.balance_due).toBe(1000);
    expect(initial.payment_status).toBe('PENDING');

    // 2. Customer makes partial payment of ₹400 in CASH
    const log1: AuditLog = {
      id: 'log-1',
      purchase_id: 'purch-123',
      previous_status: 'PENDING',
      new_status: 'PARTIAL_PAYMENT',
      notes: JSON.stringify({
        type: 'PAYMENT',
        amount: 400,
        payment_mode: 'CASH',
        notes: 'Cash at counter',
        paid_at: '2026-10-01T10:00:00Z',
      }),
      changed_at: '2026-10-01T10:00:00Z',
    };

    const afterPart1 = computePurchasePaymentDetails(purchase, [log1]);
    expect(afterPart1.paid_amount).toBe(400);
    expect(afterPart1.balance_due).toBe(600);
    expect(afterPart1.payment_status).toBe('PARTIAL');
    expect(afterPart1.payments.length).toBe(1);
    expect(afterPart1.payment_percentage).toBe(40);

    // 3. Customer makes second partial payment of ₹350 via UPI
    const log2: AuditLog = {
      id: 'log-2',
      purchase_id: 'purch-123',
      previous_status: 'PARTIAL',
      new_status: 'PARTIAL_PAYMENT',
      notes: JSON.stringify({
        type: 'PAYMENT',
        amount: 350,
        payment_mode: 'UPI',
        notes: 'GPay payment',
        paid_at: '2026-10-02T12:00:00Z',
      }),
      changed_at: '2026-10-02T12:00:00Z',
    };

    const afterPart2 = computePurchasePaymentDetails(purchase, [log1, log2]);
    expect(afterPart2.paid_amount).toBe(750);
    expect(afterPart2.balance_due).toBe(250);
    expect(afterPart2.payment_status).toBe('PARTIAL');
    expect(afterPart2.payments.length).toBe(2);
    expect(afterPart2.payment_percentage).toBe(75);

    // 4. Customer settles remaining ₹250
    const log3: AuditLog = {
      id: 'log-3',
      purchase_id: 'purch-123',
      previous_status: 'PARTIAL',
      new_status: 'PAID',
      notes: JSON.stringify({
        type: 'PAYMENT',
        amount: 250,
        payment_mode: 'UPI',
        notes: 'Final settlement',
        paid_at: '2026-10-03T15:00:00Z',
      }),
      changed_at: '2026-10-03T15:00:00Z',
    };

    const afterFinal = computePurchasePaymentDetails(purchase, [log1, log2, log3]);
    expect(afterFinal.paid_amount).toBe(1000);
    expect(afterFinal.balance_due).toBe(0);
    expect(afterFinal.payment_status).toBe('PAID');
    expect(afterFinal.payments.length).toBe(3);
    expect(afterFinal.payment_percentage).toBe(100);
  });

  it('correctly builds WhatsApp messages for partial payment receipts and reminders', () => {
    // 1. Partial payment receipt
    const partialReceipt = buildWhatsAppThankYouText({
      customerName: 'Boopathy',
      recipientPhone: '+919876543210',
      amountReceived: 400,
      totalBillAmount: 1000,
      remainingBalance: 600,
      isPartial: true,
      pharmacyName: 'Revathi Medicals',
    });

    expect(partialReceipt).toContain('PARTIAL PAYMENT RECEIVED');
    expect(partialReceipt).toContain('400.00');
    expect(partialReceipt).toContain('600.00');

    // 2. Full settlement receipt
    const fullReceipt = buildWhatsAppThankYouText({
      customerName: 'Boopathy',
      recipientPhone: '+919876543210',
      amountReceived: 600,
      totalBillAmount: 1000,
      remainingBalance: 0,
      isPartial: false,
      pharmacyName: 'Revathi Medicals',
    });

    expect(fullReceipt).toContain('PAYMENT RECEIVED (SETTLED)');

    // 3. Partial reminder
    const partialReminder = buildWhatsAppReminderText({
      customerName: 'Boopathy',
      recipientPhone: '+919876543210',
      purchaseDate: '2026-10-01',
      pendingDays: 3,
      amountPending: 600,
      totalBillAmount: 1000,
      paidAmount: 400,
      pharmacyName: 'Revathi Medicals',
    });

    expect(partialReminder).toContain('Total Bill');
    expect(partialReminder).toContain('Already Paid');
    expect(partialReminder).toContain('Remaining Balance Due');
  });
});
