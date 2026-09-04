import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsAppNumber,
  isValidWhatsAppNumber,
  CreatePurchaseSchema,
} from '../lib/validations';

describe('Validation and Normalization Tests', () => {
  it('normalizes various Indian phone number formats to E.164 +91', () => {
    expect(normalizeWhatsAppNumber('9876543210')).toBe('+919876543210');
    expect(normalizeWhatsAppNumber('09876543210')).toBe('+919876543210');
    expect(normalizeWhatsAppNumber('+91 98765 43210')).toBe('+919876543210');
    expect(normalizeWhatsAppNumber('+91-98765-43210')).toBe('+919876543210');
    expect(normalizeWhatsAppNumber('919876543210')).toBe('+919876543210');
  });

  it('validates WhatsApp numbers accurately', () => {
    expect(isValidWhatsAppNumber('9876543210')).toBe(true);
    expect(isValidWhatsAppNumber('+919876543210')).toBe(true);
    expect(isValidWhatsAppNumber('+14155552671')).toBe(true);

    expect(isValidWhatsAppNumber('12345')).toBe(false);
    expect(isValidWhatsAppNumber('abcdefghij')).toBe(false);
    expect(isValidWhatsAppNumber('')).toBe(false);
  });

  it('validates valid CreatePurchase schema payload with discount %', () => {
    const validData = {
      customer_name: 'Ravi',
      whatsapp_number: '9876543210',
      items: [
        { item_name: 'Product A', quantity: 2, mrp: 100, discount: 10 },
        { item_name: 'Product B', quantity: 1, mrp: 250, discount: 20 },
      ],
      send_whatsapp: true,
    };

    const parsed = CreatePurchaseSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it('rejects purchase with empty customer name or empty items', () => {
    const emptyName = {
      customer_name: '',
      whatsapp_number: '9876543210',
      items: [{ item_name: 'Product A', quantity: 1, mrp: 100, discount: 0 }],
    };
    expect(CreatePurchaseSchema.safeParse(emptyName).success).toBe(false);

    const emptyItems = {
      customer_name: 'Ravi',
      whatsapp_number: '9876543210',
      items: [],
    };
    expect(CreatePurchaseSchema.safeParse(emptyItems).success).toBe(false);
  });

  it('rejects discount percentage exceeding 100%', () => {
    const invalidDiscount = {
      customer_name: 'Ravi',
      whatsapp_number: '9876543210',
      items: [{ item_name: 'Product A', quantity: 1, mrp: 100, discount: 150 }],
    };
    expect(CreatePurchaseSchema.safeParse(invalidDiscount).success).toBe(false);
  });
});
