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
  pharmacyName?: string;
  upiId?: string | null;
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
 * Builds polite greeting text message for WhatsApp Web (image is pasted below)
 */
export function buildWhatsAppSummaryText(data: WhatsAppShareData): string {
  const pharmacy = data.pharmacyName || 'Revathi Medicals & Distributors';
  const payableStr = formatINR(data.amountPayable);
  const upiLine = data.upiId ? `\n💳 *UPI ID:* ${data.upiId}` : '';

  return `Hello *${data.customerName}*,

Please find your purchase summary bill from *${pharmacy}* attached below.

💰 *Total Amount Payable:* *${payableStr}*${upiLine}

Thank you for choosing *${pharmacy}*! 🙏`;
}

export interface WhatsAppReminderData {
  customerName: string;
  recipientPhone: string;
  purchaseDate: string | Date;
  pendingDays: number;
  amountPending: number;
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

  return `Hello *${data.customerName}*,

This is a gentle payment reminder from *${pharmacy}* regarding your purchase on *${dateStr}* (Pending: ${daysText}).

💰 *Amount Pending:* *${pendingStr}*${upiLine}

Please complete the payment at your earliest convenience.
Thank you for your visit! 🙏`;
}

export interface WhatsAppThankYouData {
  customerName: string;
  recipientPhone: string;
  amountReceived: number;
  pharmacyName?: string;
}

/**
 * Builds polite thank-you message for WhatsApp Web
 */
export function buildWhatsAppThankYouText(data: WhatsAppThankYouData): string {
  const pharmacy = data.pharmacyName || 'Revathi Medicals & Distributors';
  const amountStr = formatINR(data.amountReceived);

  return `━━━━━━━━━━━━━━━━━━━━
🏥 *${pharmacy.toUpperCase()}*
✅ *PAYMENT RECEIVED*
━━━━━━━━━━━━━━━━━━━━

Hello *${data.customerName}*,

We have received your payment of *${amountStr}* successfully.

Thank you for choosing *${pharmacy}*. We look forward to serving you again! 🙏`;
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
