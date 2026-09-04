import { z } from 'zod';

/**
 * Normalizes phone numbers to standard E.164 / +91 Indian format:
 * Examples:
 * "9876543210" -> "+919876543210"
 * "+91 98765 43210" -> "+919876543210"
 * "09876543210" -> "+919876543210"
 */
export function normalizeWhatsAppNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = '+' + cleaned.replace(/[^\d]/g, '');
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = '+' + cleaned;
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = '+91' + cleaned.substring(1);
  } else if (cleaned.length === 10) {
    cleaned = '+91' + cleaned;
  }

  return cleaned;
}

/**
 * Validates normalized WhatsApp phone number (E.164 format: + followed by 10 to 15 digits).
 */
export function isValidWhatsAppNumber(phone: string): boolean {
  const normalized = normalizeWhatsAppNumber(phone);
  return /^\+[1-9]\d{9,14}$/.test(normalized);
}

export const PurchaseItemSchema = z.object({
  item_name: z.string().min(1, 'Item name cannot be empty').trim(),
  quantity: z.number().gt(0, 'Quantity must be greater than 0'),
  mrp: z.number().gte(0, 'MRP cannot be negative'),
  discount: z.number().gte(0, 'Discount percentage cannot be negative').lte(100, 'Discount percentage cannot exceed 100%').default(0),
  discount_percent: z.number().gte(0).lte(100).optional(),
});

export const CreatePurchaseSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required').trim(),
  whatsapp_number: z.string().refine(isValidWhatsAppNumber, {
    message: 'Please provide a valid 10-digit WhatsApp number (e.g. 9876543210 or +919876543210)',
  }),
  items: z.array(PurchaseItemSchema).min(1, 'At least one purchase item is required'),
  send_whatsapp: z.boolean().optional().default(true),
});

export const PharmacySettingsSchema = z.object({
  pharmacy_name: z.string().min(1, 'Pharmacy name is required').trim(),
  display_name: z.string().min(1, 'Display name is required').trim(),
  logo_url: z.string().trim().optional().nullable(),
  payment_qr_url: z.string().trim().optional().nullable(),
  upi_id: z.string().trim().optional().nullable(),
  timezone: z.string().default('Asia/Kolkata'),
  reminders_enabled: z.boolean().default(true),
  max_reminder_days: z.coerce.number().int().min(1).max(365).default(30),
  reminder_frequency: z.string().default('daily'),
});
