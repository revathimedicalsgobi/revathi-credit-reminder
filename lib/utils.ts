import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calculates pending age text from a purchase date:
 * e.g. "Today", "1 day ago", "2 days ago", "N days ago"
 */
export function getPendingAgeText(purchaseDateStr: string | Date): string {
  const purchaseDate = typeof purchaseDateStr === 'string' ? parseISO(purchaseDateStr) : purchaseDateStr;
  const now = new Date();
  const diffDays = Math.max(0, differenceInCalendarDays(now, purchaseDate));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return '1 day ago';
  } else {
    return `${diffDays} days ago`;
  }
}

/**
 * Returns numeric pending days
 */
export function getPendingDaysCount(purchaseDateStr: string | Date): number {
  const purchaseDate = typeof purchaseDateStr === 'string' ? parseISO(purchaseDateStr) : purchaseDateStr;
  const now = new Date();
  return Math.max(0, differenceInCalendarDays(now, purchaseDate));
}

/**
 * Formats a timestamp into friendly display format: "04 Sep 2026, 04:30 PM"
 */
export function formatDisplayDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
  return format(date, 'dd MMM yyyy, hh:mm a');
}

/**
 * Formats a timestamp into short date format: "04 Sep 2026"
 */
export function formatShortDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
  return format(date, 'dd MMMM yyyy');
}

/**
 * Masks a WhatsApp number for privacy: e.g. +91 98*** **210
 */
export function maskWhatsAppNumber(phone: string): string {
  if (!phone || phone.length < 8) return phone || '—';
  const cleaned = phone.trim();
  if (cleaned.length <= 10) {
    return cleaned.substring(0, 2) + '****' + cleaned.substring(cleaned.length - 2);
  }
  return cleaned.substring(0, 5) + '*****' + cleaned.substring(cleaned.length - 3);
}

/**
 * Converts numeric amount to Indian Rupee Words: e.g. 870 -> "Rupees Eight Hundred Seventy Only"
 */
export function numberToIndianRupeeWords(num: number): string {
  const rounded = Math.round(num);
  if (rounded === 0) return 'Rupees Zero Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertBelowThousand(n: number): string {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  }

  let result = '';
  let n = rounded;

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;

  if (crore > 0) {
    result += convertBelowThousand(crore) + ' Crore ';
  }
  if (lakh > 0) {
    result += convertBelowThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    result += convertBelowThousand(thousand) + ' Thousand ';
  }
  if (n > 0) {
    result += convertBelowThousand(n) + ' ';
  }

  return `Rupees ${result.trim()} Only`;
}
