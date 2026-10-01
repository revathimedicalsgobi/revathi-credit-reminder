import { toJpeg, toBlob } from 'html-to-image';
import { formatINR } from './calculations';
import { formatShortDate } from './utils';

export interface WhatsAppShareData {
  customerName: string;
  recipientPhone: string;
  purchaseDate: string | Date;
  items: Array<{
    itemName: string;
    quantity: number;
    mrp: number;
    discount?: number;
    discount_percent?: number;
    discount_amount?: number;
    grossAmount?: number;
    netAmount: number;
  }>;
  grossTotal: number;
  totalDiscount: number;
  roundOff?: number;
  amountPayable: number;
  paidAmount?: number;
  balanceDue?: number;
  pharmacyName?: string;
  upiId?: string | null;
  previousBalance?: number;
  cumulativeTotal?: number;
  dateWisePendingBills?: Array<{
    date: string | Date;
    amount: number;
  }>;
}

/**
 * Adds "Mr/Mrs. " in front of the customer name if not already present
 */
export function formatCustomerSalutation(name: string): string {
  const trimmed = (name || 'Customer').trim();
  if (/^(mr|mrs|ms|dr|mr\/mrs)\.?\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Mr/Mrs. ${trimmed}`;
}

/**
 * Clean and format recipient phone for wa.me / WhatsApp Web
 */
export function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[^\d]/g, '');
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

/**
 * Builds polite greeting & statement text message for WhatsApp Web (image is pasted below)
 * If customer has previous unpaid credit, it formats the full cumulative date-wise statement.
 */
export function buildWhatsAppSummaryText(data: WhatsAppShareData): string {
  const pharmacy = data.pharmacyName || 'Revathi Medicals & Distributors';
  const billAmountStr = formatINR(data.amountPayable);
  const dateStr = formatShortDate(data.purchaseDate);
  const upiLine = data.upiId ? `\n💳 *UPI ID:* \`${data.upiId}\`` : '';
  const customerGreeting = formatCustomerSalutation(data.customerName);

  const itemsList = data.items && data.items.length > 0
    ? data.items.map((i) => `• ${i.itemName} × ${i.quantity} = ${formatINR(i.netAmount)}`).join('\n')
    : '';

  const previousBal = Number(data.previousBalance || 0);
  const cumulativeTotal = Number(data.cumulativeTotal || (previousBal + data.amountPayable));

  let partialLine = '';
  if (data.paidAmount && data.paidAmount > 0 && (data.balanceDue !== undefined && data.balanceDue > 0)) {
    partialLine = `\n💵 *Paid Amount:* ${formatINR(data.paidAmount)}\n⏳ *Remaining Balance:* *${formatINR(data.balanceDue)}*`;
  }

  // Highlighted Big Savings Banner
  let savingsSection = '';
  if (data.totalDiscount && data.totalDiscount > 0) {
    savingsSection = `\n\n🎉 *━━━━━━━━━━━━━━━━━━━━━━━*\n🎁 *YOUR TOTAL SAVINGS: ${formatINR(data.totalDiscount)}* 💰\n🎉 *━━━━━━━━━━━━━━━━━━━━━━━*`;
  }

  if (previousBal > 0) {
    let dateWiseList = '';
    if (data.dateWisePendingBills && data.dateWisePendingBills.length > 0) {
      dateWiseList = data.dateWisePendingBills
        .map((b, idx) => `  ${idx + 1}. ${formatShortDate(b.date)}: ${formatINR(b.amount)}`)
        .join('\n');
    }

    return `━━━━━━━━━━━━━━━━━━━━━━━
🏥 *${pharmacy.toUpperCase()}*
📋 *CREDIT BILL & CUMULATIVE STATEMENT*
━━━━━━━━━━━━━━━━━━━━━━━

Hello *${customerGreeting}*,

Thank you for your visit. Here is your bill and cumulative account statement:

📅 *Bill Date:* ${dateStr}

🛒 *Today's Items:*
${itemsList}

───────────────────────
💵 *Today's Bill Amount:* *${billAmountStr}*${partialLine}
───────────────────────${savingsSection}

📌 *Previous Unpaid Credit (Date-Wise):*
${dateWiseList ? dateWiseList + '\n' : ''}• *Previous Outstanding:* ${formatINR(previousBal)}
• *Today's New Purchase:* ${billAmountStr}

━━━━━━━━━━━━━━━━━━━━━━━
🔴 *TOTAL CUMULATIVE BALANCE DUE:* *${formatINR(cumulativeTotal)}*
━━━━━━━━━━━━━━━━━━━━━━━${upiLine}

Please settle the cumulative amount at your convenience.
Thank you for choosing *${pharmacy}*! 🙏`;
  }

  return `━━━━━━━━━━━━━━━━━━━━━━━
🏥 *${pharmacy.toUpperCase()}*
📄 *PURCHASE SUMMARY BILL*
━━━━━━━━━━━━━━━━━━━━━━━

Hello *${customerGreeting}*,

Thank you for your purchase from *${pharmacy}*.

📅 *Date:* ${dateStr}

🛒 *Items:*
${itemsList}

───────────────────────
💰 *Total Bill Amount:* *${billAmountStr}*${partialLine}
*Payment Status:* ⏳ Pending (Credit)
───────────────────────${savingsSection}${upiLine}

Thank you for choosing *${pharmacy}*! 🙏`;
}

export interface WhatsAppReminderData {
  customerName: string;
  recipientPhone: string;
  purchaseDate: string | Date;
  pendingDays: number;
  amountPending: number;
  totalBillAmount?: number;
  paidAmount?: number;
  pharmacyName?: string;
  upiId?: string | null;
}

/**
 * Builds polite payment reminder message for WhatsApp Web
 */
export function buildWhatsAppReminderText(data: WhatsAppReminderData): string {
  const pharmacy = data.pharmacyName || 'Revathi Medicals & Distributors';
  const pendingStr = formatINR(data.amountPending);
  const dateStr = formatShortDate(data.purchaseDate);
  const daysText = data.pendingDays === 0 ? 'Today' : data.pendingDays === 1 ? '1 day' : `${data.pendingDays} days`;
  const upiLine = data.upiId ? `\n💳 *UPI ID:* ${data.upiId}` : '';
  const customerGreeting = formatCustomerSalutation(data.customerName);

  let breakdownText = `💰 *Amount Pending:* *${pendingStr}*`;
  if (data.paidAmount && data.paidAmount > 0 && data.totalBillAmount && data.totalBillAmount > data.amountPending) {
    breakdownText = `📋 *Total Bill:* ${formatINR(data.totalBillAmount)}\n💵 *Already Paid:* ${formatINR(data.paidAmount)}\n⏳ *Remaining Balance Due:* *${pendingStr}*`;
  }

  return `Hello *${customerGreeting}*,

This is a gentle payment reminder from *${pharmacy}* regarding your purchase on *${dateStr}* (Pending: ${daysText}).

${breakdownText}${upiLine}

Please complete the payment at your earliest convenience.
Thank you for your visit! 🙏`;
}

export interface WhatsAppThankYouData {
  customerName: string;
  recipientPhone: string;
  amountReceived: number;
  totalBillAmount?: number;
  remainingBalance?: number;
  isPartial?: boolean;
  pharmacyName?: string;
}

/**
 * Builds polite thank-you message for WhatsApp Web
 */
export function buildWhatsAppThankYouText(data: WhatsAppThankYouData): string {
  const pharmacy = data.pharmacyName || 'Revathi Medicals & Distributors';
  const amountStr = formatINR(data.amountReceived);
  const customerGreeting = formatCustomerSalutation(data.customerName);

  if (data.isPartial && data.remainingBalance && data.remainingBalance > 0) {
    const remainingStr = formatINR(data.remainingBalance);
    const totalStr = data.totalBillAmount ? formatINR(data.totalBillAmount) : '';

    return `━━━━━━━━━━━━━━━━━━━━
🏥 *${pharmacy.toUpperCase()}*
💵 *PARTIAL PAYMENT RECEIVED*
━━━━━━━━━━━━━━━━━━━━

Hello *${customerGreeting}*,

We have received your payment of *${amountStr}* successfully.

📊 *Payment Details:*
${totalStr ? `• *Total Bill Amount:* ${totalStr}\n` : ''}• *Amount Received:* *${amountStr}*
• ⏳ *Remaining Balance Due:* *${remainingStr}*

Thank you for choosing *${pharmacy}*. Please settle the remaining balance at your convenience! 🙏`;
  }

  return `━━━━━━━━━━━━━━━━━━━━
🏥 *${pharmacy.toUpperCase()}*
✅ *PAYMENT RECEIVED (SETTLED)*
━━━━━━━━━━━━━━━━━━━━

Hello *${customerGreeting}*,

We have received your payment of *${amountStr}* successfully. Your bill is now fully settled.

Thank you for choosing *${pharmacy}*. We look forward to serving you again! 🙏`;
}

export interface WhatsAppStatementData {
  customerName: string;
  recipientPhone: string;
  totalPurchasesCount: number;
  totalBilled: number;
  totalPaid: number;
  totalDiscount?: number;
  outstandingBalance: number;
  pendingBills: Array<{
    date: string | Date;
    amount: number;
    itemsSummary?: string;
  }>;
  pharmacyName?: string;
  upiId?: string | null;
}

/**
 * Builds polite and detailed customer account statement message for WhatsApp
 */
export function buildWhatsAppCustomerStatementText(data: WhatsAppStatementData): string {
  const pharmacy = data.pharmacyName || 'Revathi Medicals & Distributors';
  const totalBilledStr = formatINR(data.totalBilled);
  const totalPaidStr = formatINR(data.totalPaid);
  const balanceStr = formatINR(data.outstandingBalance);
  const upiLine = data.upiId ? `\n💳 *UPI ID:* \`${data.upiId}\`` : '';
  const customerGreeting = formatCustomerSalutation(data.customerName);

  let pendingListText = '';
  if (data.pendingBills.length > 0) {
    const lines = data.pendingBills.map((b, idx) => {
      const dStr = formatShortDate(b.date);
      const amtStr = formatINR(b.amount);
      const itemNote = b.itemsSummary ? ` (${b.itemsSummary})` : '';
      return `  ${idx + 1}. ${dStr}: *${amtStr}*${itemNote}`;
    });
    pendingListText = `\n\n📌 *Date-Wise Pending Credit Bills (${data.pendingBills.length}):*\n` + lines.join('\n');
  }

  const savingsLine = data.totalDiscount && data.totalDiscount > 0
    ? `\n• 🎁 *Your Lifetime Savings:* *${formatINR(data.totalDiscount)}* 🎉`
    : '';

  return `━━━━━━━━━━━━━━━━━━━━
🏥 *${pharmacy.toUpperCase()}*
📋 *COMPLETE ACCOUNT STATEMENT*
━━━━━━━━━━━━━━━━━━━━

Hello *${customerGreeting}*,

Here is your full account statement and balance summary from *${pharmacy}*:

📊 *Account Summary:*
• Total Invoices: ${data.totalPurchasesCount}
• Total Billed: *${totalBilledStr}*
• Total Paid: *${totalPaidStr}*${savingsLine}
• 🔴 *Total Cumulative Outstanding:* *${balanceStr}*${pendingListText}${upiLine}

Please settle the cumulative outstanding balance at your earliest convenience.
Thank you for choosing *${pharmacy}*! 🙏`;
}

/**
 * Generates direct WhatsApp chat link (works for WhatsApp Web & WhatsApp App)
 */
export function getWhatsAppDirectUrl(phone: string, text: string): string {
  const cleanPhone = formatPhoneForWhatsApp(phone);
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Converts a DOM element (the bill summary card) into a JPEG blob / file and downloads it
 */
export async function downloadReceiptAsJpeg(element: HTMLElement, filename = 'Purchase_Summary.jpg'): Promise<string> {
  try {
    const dataUrl = await toJpeg(element, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      filter: (node) => {
        // Exclude elements with 'no-print' class or buttons from image
        if (node instanceof HTMLElement && (node.classList.contains('no-print') || node.tagName === 'BUTTON')) {
          return false;
        }
        return true;
      },
    });

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return dataUrl;
  } catch (err) {
    console.error('Failed to generate JPEG receipt:', err);
    throw new Error('Could not generate receipt image');
  }
}

/**
 * Copies the receipt image directly to the system clipboard so user can paste (Ctrl+V) into WhatsApp
 */
export async function copyReceiptImageToClipboard(element: HTMLElement): Promise<boolean> {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return false;
    }

    const blob = await toBlob(element, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      filter: (node) => {
        if (node instanceof HTMLElement && (node.classList.contains('no-print') || node.tagName === 'BUTTON')) {
          return false;
        }
        return true;
      },
    });

    if (!blob) return false;

    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
      }),
    ]);

    return true;
  } catch (err) {
    console.warn('Clipboard write image not supported or failed:', err);
    return false;
  }
}
