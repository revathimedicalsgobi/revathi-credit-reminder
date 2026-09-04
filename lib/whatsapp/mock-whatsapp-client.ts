import {
  IWhatsAppProvider,
  PurchaseSummaryMessagePayload,
  PaymentReminderMessagePayload,
  PaymentReceivedMessagePayload,
  WhatsAppSendResult,
  WhatsAppProviderStatus,
} from './types';
import { formatINR } from '../calculations';
import { formatShortDate } from '../utils';

/**
 * Safe Mock WhatsApp Provider for local development & automated test suites
 */
export class MockWhatsAppClient implements IWhatsAppProvider {
  private sentMessages: Array<{ type: string; payload: unknown; timestamp: string }> = [];

  async sendPurchaseSummary(payload: PurchaseSummaryMessagePayload): Promise<WhatsAppSendResult> {
    const mockId = `mock_wamid_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    console.log(`\n========================================`);
    console.log(`[MOCK WHATSAPP] Sending Purchase Summary`);
    console.log(`To: ${payload.customerName} (${payload.recipientPhone})`);
    console.log(`Amount: ${formatINR(payload.amountPayable)}`);
    console.log(`Date: ${formatShortDate(payload.purchaseDate)}`);
    console.log(`Items count: ${payload.items.length}`);
    console.log(`Message ID: ${mockId}`);
    console.log(`========================================\n`);

    this.sentMessages.push({
      type: 'PURCHASE_SUMMARY',
      payload,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      messageId: mockId,
      recipient: payload.recipientPhone,
    };
  }

  async sendPaymentReminder(payload: PaymentReminderMessagePayload): Promise<WhatsAppSendResult> {
    const mockId = `mock_wamid_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(`\n========================================`);
    console.log(`[MOCK WHATSAPP] Sending Payment Reminder`);
    console.log(`To: ${payload.customerName} (${payload.recipientPhone})`);
    console.log(`Pending for: ${payload.pendingDays} days`);
    console.log(`Amount: ${formatINR(payload.amountPending)}`);
    console.log(`Message ID: ${mockId}`);
    console.log(`========================================\n`);

    this.sentMessages.push({
      type: 'PAYMENT_REMINDER',
      payload,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      messageId: mockId,
      recipient: payload.recipientPhone,
    };
  }

  async sendPaymentReceived(payload: PaymentReceivedMessagePayload): Promise<WhatsAppSendResult> {
    const mockId = `mock_wamid_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(`\n========================================`);
    console.log(`[MOCK WHATSAPP] Sending Payment Received (Thank You)`);
    console.log(`To: ${payload.customerName} (${payload.recipientPhone})`);
    console.log(`Amount Received: ${formatINR(payload.amountReceived)}`);
    console.log(`Message ID: ${mockId}`);
    console.log(`========================================\n`);

    this.sentMessages.push({
      type: 'PAYMENT_RECEIVED',
      payload,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      messageId: mockId,
      recipient: payload.recipientPhone,
    };
  }

  async getStatus(): Promise<WhatsAppProviderStatus> {
    return {
      isConfigured: false,
      isMock: true,
      statusText: 'Mock Mode',
      message: 'Development mock provider active (No credentials needed)',
    };
  }

  getSentMessages() {
    return this.sentMessages;
  }
}
