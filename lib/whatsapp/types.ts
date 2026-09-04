/**
 * WhatsApp Provider Adapter Type Definitions
 * Supports official Meta WhatsApp Cloud API integration with interchangeable provider pattern.
 */

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  recipient: string;
  error?: string;
  statusCode?: number;
  rawResponse?: unknown;
}

export interface PurchaseSummaryMessagePayload {
  customerName: string;
  recipientPhone: string;
  purchaseId: string;
  purchaseDate: string;
  amountPayable: number;
  grossTotal: number;
  totalDiscount: number;
  items: Array<{
    itemName: string;
    quantity: number;
    mrp: number;
    discount: number;
    netAmount: number;
  }>;
  pharmacyName: string;
  upiId?: string | null;
  paymentQrUrl?: string | null;
}

export interface PaymentReminderMessagePayload {
  customerName: string;
  recipientPhone: string;
  purchaseId: string;
  purchaseDate: string;
  pendingDays: number;
  amountPending: number;
  pharmacyName: string;
  upiId?: string | null;
  paymentQrUrl?: string | null;
}

export interface PaymentReceivedMessagePayload {
  customerName: string;
  recipientPhone: string;
  purchaseId: string;
  amountReceived: number;
  pharmacyName: string;
  paymentReceivedAt: string;
}

export interface WhatsAppProviderStatus {
  isConfigured: boolean;
  isMock: boolean;
  phoneNumberId?: string;
  apiVersion?: string;
  statusText: 'Connected' | 'Not Configured' | 'Mock Mode' | 'Error';
  message?: string;
}

export interface IWhatsAppProvider {
  sendPurchaseSummary(payload: PurchaseSummaryMessagePayload): Promise<WhatsAppSendResult>;
  sendPaymentReminder(payload: PaymentReminderMessagePayload): Promise<WhatsAppSendResult>;
  sendPaymentReceived(payload: PaymentReceivedMessagePayload): Promise<WhatsAppSendResult>;
  getStatus(): Promise<WhatsAppProviderStatus>;
}
