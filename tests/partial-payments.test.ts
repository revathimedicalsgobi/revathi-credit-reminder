import { describe, it, expect } from 'vitest';
import {
  computePurchasePaymentDetails,
  parsePaymentRecord,
  generateNewBillNumber,
  generateReceiptNumber,
  getOrGenerateBillNumber,
  enrichPurchaseWithPayments,
} from '../lib/payment-helpers';
import { UpdatePurchaseSchema, RecordPaymentSchema, CreatePurchaseSchema } from '../lib/validations';
import {
  buildWhatsAppReminderText,
  buildWhatsAppThankYouText,
  buildWhatsAppSummaryText,
  buildWhatsAppPaymentReceiptText,
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

    // 2. Full settlement receipt with 0 remaining balance across all bills
    const fullReceiptZeroBalance = buildWhatsAppThankYouText({
      customerName: 'Boopathy',
      recipientPhone: '+919876543210',
      amountReceived: 600,
      totalBillAmount: 1000,
      remainingBalance: 0,
      isPartial: false,
      totalOutstandingBalance: 0,
      pharmacyName: 'Revathi Medicals',
    });

    expect(fullReceiptZeroBalance).toContain('PAYMENT RECEIVED (ALL DUES CLEARED)');
    expect(fullReceiptZeroBalance).toContain('All dues have been cleared!');

    // 3. Bill settled, BUT customer has another pending bill (reminds them of remaining balance!)
    const settledWithOtherBills = buildWhatsAppThankYouText({
      customerName: 'Boopathy',
      recipientPhone: '+919876543210',
      amountReceived: 600,
      totalBillAmount: 600,
      remainingBalance: 0,
      isPartial: false,
      totalOutstandingBalance: 1250,
      otherPendingBillsCount: 2,
      pharmacyName: 'Revathi Medicals',
    });

    expect(settledWithOtherBills).toContain('PAYMENT RECEIVED (BILL SETTLED)');
    expect(settledWithOtherBills).toContain('Remaining Outstanding Balance');
    expect(settledWithOtherBills).toContain('1,250.00');
    expect(settledWithOtherBills).not.toContain('All dues have been cleared!');

    // 4. Partial reminder
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

  it('correctly builds WhatsApp messages for stock arrival notifications', async () => {
    const { buildWhatsAppStockArrivalText } = await import('../lib/whatsapp-share');

    const arrivalMsg = buildWhatsAppStockArrivalText({
      customerName: 'Kavitha',
      recipientPhone: '+919876543210',
      productName: 'Telma 40mg Tablet',
      quantity: '2 Strips',
      requestedDate: '2026-10-01',
      notes: 'Urgent refill',
      pharmacyName: 'Revathi Medicals',
    });

    expect(arrivalMsg).toContain('STOCK ARRIVAL NOTIFICATION');
    expect(arrivalMsg).toContain('Telma 40mg Tablet');
    expect(arrivalMsg).toContain('2 Strips');
    expect(arrivalMsg).toContain('Urgent refill');
    expect(arrivalMsg).toContain('IN STOCK');
  });

  it('correctly generates, validates, and resolves Bill Numbers and Receipt Numbers', () => {
    // 1. Bill number generation
    const billNo = generateNewBillNumber('BILL');
    expect(billNo).toMatch(/^BILL-\d{4}-\d{4}$/);

    // 2. Custom bill number in CreatePurchaseSchema
    const createdWithBill = CreatePurchaseSchema.safeParse({
      bill_number: 'INV-2026-99',
      customer_name: 'Anitha',
      whatsapp_number: '9876543210',
      items: [{ item_name: 'Dolo 650', quantity: 1, mrp: 30, discount: 0 }],
    });
    expect(createdWithBill.success).toBe(true);
    if (createdWithBill.success) {
      expect(createdWithBill.data.bill_number).toBe('INV-2026-99');
    }

    // 3. Fallback deterministic bill number resolution
    const purchaseWithoutBill = {
      id: 'a1b2c3d4-e5f6-7890',
      purchase_date: '2026-11-20T10:00:00Z',
    };
    const resolved = getOrGenerateBillNumber(purchaseWithoutBill as any);
    expect(resolved).toContain('BILL-');
    expect(resolved).toContain('A1B2');

    // 4. Receipt number generation
    const rcpNo = generateReceiptNumber('purch-123');
    expect(rcpNo).toContain('RCP-');
    expect(rcpNo).toContain('PURC');

    // 5. Formal WhatsApp payment receipt message formatting
    const rcpMsg = buildWhatsAppPaymentReceiptText({
      receiptNumber: 'RCP-2611-1042',
      receiptDate: '2026-11-20T12:00:00Z',
      billNumber: 'BILL-1042',
      customerName: 'Karthik',
      recipientPhone: '+919876543210',
      amountReceived: 500,
      totalBillAmount: 800,
      remainingBalance: 300,
      paymentMode: 'UPI',
      pharmacyName: 'Revathi Medicals',
    });

    expect(rcpMsg).toContain('OFFICIAL PAYMENT RECEIPT');
    expect(rcpMsg).toContain('RCP-2611-1042');
    expect(rcpMsg).toContain('BILL-1042');
    expect(rcpMsg).toContain('500.00');
    expect(rcpMsg).toContain('300.00');
  });

});

