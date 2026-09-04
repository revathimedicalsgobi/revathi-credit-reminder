/**
 * Safe Calculation Engine for Purchase Summary
 * Handles Decimal calculations with Discount as PERCENTAGE (%), Gross/Net amounts,
 * Round-off adjustment to the nearest whole Rupee, and Indian Rupee (INR) formatting.
 */

export interface CalculatedItem {
  item_name: string;
  quantity: number;
  mrp: number;
  discount_percent: number;
  discount_amount: number;
  gross_amount: number;
  net_amount: number;
}

export interface CalculatedPurchaseSummary {
  items: CalculatedItem[];
  gross_total: number;
  total_discount: number;
  raw_payable: number;
  round_off: number;
  amount_payable: number;
}

/**
 * Rounds a number safely to 2 decimal places to avoid IEEE-754 floating point issues.
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates a single item row:
 * Gross Item Amount = Quantity × MRP
 * Item Discount Amount = Gross Item Amount × (Discount Percent / 100)
 * Item Net Amount = Gross Item Amount - Item Discount Amount
 */
export function calculateItemRow(
  itemName: string,
  quantity: number,
  mrp: number,
  discountPercent: number
): CalculatedItem {
  const safeQty = Math.max(0, Number(quantity) || 0);
  const safeMrp = Math.max(0, Number(mrp) || 0);
  const grossAmount = roundToTwoDecimals(safeQty * safeMrp);
  
  // Discount percentage must be between 0% and 100%
  const rawPercent = Math.max(0, Number(discountPercent) || 0);
  const safePercent = Math.min(100, roundToTwoDecimals(rawPercent));
  
  const discountAmount = roundToTwoDecimals(grossAmount * (safePercent / 100));
  const netAmount = roundToTwoDecimals(grossAmount - discountAmount);

  return {
    item_name: (itemName || '').trim(),
    quantity: safeQty,
    mrp: safeMrp,
    discount_percent: safePercent,
    discount_amount: discountAmount,
    gross_amount: grossAmount,
    net_amount: Math.max(0, netAmount),
  };
}

/**
 * Calculates the entire purchase summary from item rows:
 * Gross Total = Sum of all Gross Item Amounts
 * Total Discount = Sum of all Item Discount Amounts
 * Raw Payable = Gross Total - Total Discount
 * Amount Payable = Rounded to the nearest whole integer (e.g., 382.40 -> 382, 382.60 -> 383)
 * Round Off = Amount Payable - Raw Payable (e.g., -0.40 or +0.40)
 */
export function calculatePurchaseSummary(
  items: Array<{ item_name: string; quantity: number; mrp: number; discount?: number; discount_percent?: number }>
): CalculatedPurchaseSummary {
  if (!items || items.length === 0) {
    return {
      items: [],
      gross_total: 0,
      total_discount: 0,
      raw_payable: 0,
      round_off: 0,
      amount_payable: 0,
    };
  }

  const calculatedItems = items.map((item) => {
    const percent = item.discount_percent !== undefined ? item.discount_percent : (item.discount || 0);
    return calculateItemRow(item.item_name, item.quantity, item.mrp, percent);
  });

  const grossTotal = roundToTwoDecimals(
    calculatedItems.reduce((acc, curr) => acc + curr.gross_amount, 0)
  );

  const totalDiscount = roundToTwoDecimals(
    calculatedItems.reduce((acc, curr) => acc + curr.discount_amount, 0)
  );

  const rawPayable = roundToTwoDecimals(grossTotal - totalDiscount);
  const amountPayable = Math.max(0, Math.round(rawPayable));
  const roundOff = roundToTwoDecimals(amountPayable - rawPayable);

  return {
    items: calculatedItems,
    gross_total: grossTotal,
    total_discount: totalDiscount,
    raw_payable: rawPayable,
    round_off: roundOff,
    amount_payable: amountPayable,
  };
}

/**
 * Formats a currency amount into Indian Rupee (INR) format: e.g. ₹1,250.00 or ₹1,250
 */
export function formatINR(amount: number | string | null | undefined): string {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
