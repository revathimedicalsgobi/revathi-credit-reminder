import { describe, it, expect } from 'vitest';
import {
  calculateItemRow,
  calculatePurchaseSummary,
  formatINR,
  roundToTwoDecimals,
} from '../lib/calculations';

describe('Calculation Engine Tests (Discount as Percentage %)', () => {
  it('correctly calculates single item with discount percentage', () => {
    // Product A: 2 × ₹100 = ₹200, Discount = 10% (₹20), Net = ₹180
    const itemA = calculateItemRow('Product A', 2, 100, 10);
    expect(itemA.gross_amount).toBe(200);
    expect(itemA.discount_percent).toBe(10);
    expect(itemA.discount_amount).toBe(20);
    expect(itemA.net_amount).toBe(180);

    // Product B: 1 × ₹250 = ₹250, Discount = 20% (₹50), Net = ₹200
    const itemB = calculateItemRow('Product B', 1, 250, 20);
    expect(itemB.gross_amount).toBe(250);
    expect(itemB.discount_percent).toBe(20);
    expect(itemB.discount_amount).toBe(50);
    expect(itemB.net_amount).toBe(200);
  });

  it('correctly calculates multi-item purchase summary with percentage discounts', () => {
    const summary = calculatePurchaseSummary([
      { item_name: 'Product A', quantity: 2, mrp: 100, discount_percent: 10 }, // Gross 200, 10% = 20, Net 180
      { item_name: 'Product B', quantity: 1, mrp: 250, discount_percent: 20 }, // Gross 250, 20% = 50, Net 200
    ]);

    // Expected: Gross = ₹450, Total Discount = ₹70, Amount Payable = ₹380
    expect(summary.gross_total).toBe(450);
    expect(summary.total_discount).toBe(70);
    expect(summary.amount_payable).toBe(380);
    expect(summary.items.length).toBe(2);
    expect(summary.items[0].net_amount).toBe(180);
    expect(summary.items[1].net_amount).toBe(200);
  });

  it('caps discount percentage at 100%', () => {
    // 1 × ₹100 = ₹100, Discount percent input = 150% -> should cap at 100% (₹100)
    const capped = calculateItemRow('Product C', 1, 100, 150);
    expect(capped.gross_amount).toBe(100);
    expect(capped.discount_percent).toBe(100);
    expect(capped.discount_amount).toBe(100);
    expect(capped.net_amount).toBe(0);
  });

  it('safely handles negative inputs', () => {
    const safe = calculateItemRow('Product D', -2, -100, -50);
    expect(safe.quantity).toBe(0);
    expect(safe.mrp).toBe(0);
    expect(safe.discount_percent).toBe(0);
    expect(safe.gross_amount).toBe(0);
    expect(safe.net_amount).toBe(0);
  });

  it('formats currency in Indian Rupee (INR) format', () => {
    const formatted420 = formatINR(420);
    const formatted1250 = formatINR(1250);

    expect(formatted420).toContain('420.00');
    expect(formatted1250).toContain('1,250.00');
  });

  it('correctly rounds floating point values', () => {
    expect(roundToTwoDecimals(0.1 + 0.2)).toBe(0.3);
    expect(roundToTwoDecimals(19.999)).toBe(20);
  });
});
