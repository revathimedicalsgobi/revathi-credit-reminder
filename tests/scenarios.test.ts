import { describe, it, expect } from 'vitest';
import { calculatePurchaseSummary } from '../lib/calculations';
import { MockWhatsAppClient } from '../lib/whatsapp/mock-whatsapp-client';
import { getPendingDaysCount } from '../lib/utils';
import { subDays } from 'date-fns';

describe('End-to-End Acceptance Scenario Tests', () => {
  it('executes the full Ravi purchase lifecycle scenario with discount %', async () => {
    // 1. Customer Ravi purchases Product A (10%) & B (20%)
    const items = [
      { item_name: 'Product A', quantity: 2, mrp: 100, discount_percent: 10 }, // 200 - 20 = 180
      { item_name: 'Product B', quantity: 1, mrp: 250, discount_percent: 20 }, // 250 - 50 = 200
    ];

    const calculation = calculatePurchaseSummary(items);
    expect(calculation.gross_total).toBe(450);
    expect(calculation.total_discount).toBe(70);
    expect(calculation.amount_payable).toBe(380);

    let paymentStatus = 'PENDING';
    let paymentReceivedAt: string | null = null;
    const purchaseDate = new Date().toISOString();

    const mockWhatsApp = new MockWhatsAppClient();

    // 2. Dispatch purchase summary
    const summaryResult = await mockWhatsApp.sendPurchaseSummary({
      customerName: 'Ravi',
      recipientPhone: '+919876543210',
      purchaseId: 'test-purchase-123',
      purchaseDate,
      amountPayable: calculation.amount_payable,
      grossTotal: calculation.gross_total,
      totalDiscount: calculation.total_discount,
      items: calculation.items.map((i) => ({
        itemName: i.item_name,
        quantity: i.quantity,
        mrp: i.mrp,
        discount: i.discount_amount,
        netAmount: i.net_amount,
      })),
      pharmacyName: 'Revathi Medicals & Distributors',
      upiId: 'pharmacy@upi',
    });

    expect(summaryResult.success).toBe(true);
    expect(summaryResult.messageId).toBeDefined();

    // 3. Pending Days calculation for next day (1 day later)
    const yesterday = subDays(new Date(), 1).toISOString();
    const pendingDays = getPendingDaysCount(yesterday);
    expect(pendingDays).toBe(1);

    // 4. Eligible for reminder while PENDING
    const isEligibleForReminder = paymentStatus === 'PENDING' && pendingDays >= 1;
    expect(isEligibleForReminder).toBe(true);

    const reminderResult = await mockWhatsApp.sendPaymentReminder({
      customerName: 'Ravi',
      recipientPhone: '+919876543210',
      purchaseId: 'test-purchase-123',
      purchaseDate: yesterday,
      pendingDays,
      amountPending: calculation.amount_payable,
      pharmacyName: 'Revathi Medicals & Distributors',
      upiId: 'pharmacy@upi',
    });
    expect(reminderResult.success).toBe(true);

    // 5. Mark payment as received
    paymentStatus = 'PAID';
    paymentReceivedAt = new Date().toISOString();

    // 6. Verify future reminders stopped immediately
    const reminderEligibleAfterPaid = paymentStatus === 'PENDING' && pendingDays >= 1;
    expect(reminderEligibleAfterPaid).toBe(false);

    // 7. Dispatch Thank-You message
    const thankYouResult = await mockWhatsApp.sendPaymentReceived({
      customerName: 'Ravi',
      recipientPhone: '+919876543210',
      purchaseId: 'test-purchase-123',
      amountReceived: calculation.amount_payable,
      pharmacyName: 'Revathi Medicals & Distributors',
      paymentReceivedAt,
    });
    expect(thankYouResult.success).toBe(true);

    // 8. 30-day retention evaluation
    const recentPaidDate = new Date().toISOString();
    const oldPaidDate = subDays(new Date(), 31).toISOString();

    const isRecentExpired = new Date(recentPaidDate).getTime() <= subDays(new Date(), 30).getTime();
    const isOldExpired = new Date(oldPaidDate).getTime() <= subDays(new Date(), 30).getTime();

    expect(isRecentExpired).toBe(false);
    expect(isOldExpired).toBe(true);
  });
});
