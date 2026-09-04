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

export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  apiVersion?: string;
  purchaseTemplate?: string;
  reminderTemplate?: string;
  paymentReceivedTemplate?: string;
}

export class MetaWhatsAppClient implements IWhatsAppProvider {
  private accessToken: string;
  private phoneNumberId: string;
  private apiVersion: string;
  private baseUrl: string;

  constructor(config: MetaWhatsAppConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = config.apiVersion || 'v20.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Helper to format international phone number for Meta Graph API (requires numeric only, e.g. "919876543210")
   */
  private formatRecipient(phone: string): string {
    return phone.replace(/[^\d]/g, '');
  }

  /**
   * Dispatches an HTTP request to Meta WhatsApp Business Cloud API
   */
  private async sendRequest(body: Record<string, unknown>, recipient: string): Promise<WhatsAppSendResult> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || `WhatsApp API error: HTTP ${response.status}`;
        return {
          success: false,
          recipient,
          error: errorMsg,
          statusCode: response.status,
          rawResponse: data,
        };
      }

      const messageId = data?.messages?.[0]?.id || 'meta-msg-' + Date.now();
      return {
        success: true,
        messageId,
        recipient,
        statusCode: response.status,
        rawResponse: data,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Network request failed';
      return {
        success: false,
        recipient,
        error: errorMsg,
      };
    }
  }

  async sendPurchaseSummary(payload: PurchaseSummaryMessagePayload): Promise<WhatsAppSendResult> {
    const recipient = this.formatRecipient(payload.recipientPhone);
    const formattedDate = formatShortDate(payload.purchaseDate);
    const formattedAmount = formatINR(payload.amountPayable);
    
    // Construct item summary list
    const itemsText = payload.items
      .map((item) => `• ${item.itemName} × ${item.quantity} = ${formatINR(item.netAmount)}`)
      .join('\n');

    const paymentInfo = payload.upiId ? `\n💳 UPI ID: ${payload.upiId}` : '';

    const textBody = 
`━━━━━━━━━━━━━━━━━━━━━━━
🏥 *${payload.pharmacyName}*
📄 *PURCHASE SUMMARY*
━━━━━━━━━━━━━━━━━━━━━━━

Hello *${payload.customerName}*,

Here is your purchase summary from *${payload.pharmacyName}*:

📅 *Date:* ${formattedDate}

🛒 *Items:*
${itemsText}

───────────────────────
*Total Amount Payable:* ${formattedAmount}
*Payment Status:* ⏳ Pending
───────────────────────${paymentInfo}

Please complete the payment using the payment options provided.

Thank you for your visit! 🙏`;

    const requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: textBody,
      },
    };

    return this.sendRequest(requestBody, recipient);
  }

  async sendPaymentReminder(payload: PaymentReminderMessagePayload): Promise<WhatsAppSendResult> {
    const recipient = this.formatRecipient(payload.recipientPhone);
    const formattedDate = formatShortDate(payload.purchaseDate);
    const formattedAmount = formatINR(payload.amountPending);
    const daysLabel = payload.pendingDays === 1 ? '1 day' : `${payload.pendingDays} days`;
    const paymentInfo = payload.upiId ? `\n💳 UPI ID: ${payload.upiId}` : '';

    const textBody = 
`━━━━━━━━━━━━━━━━━━━━━━━
🏥 *${payload.pharmacyName}*
🔔 *PAYMENT REMINDER*
━━━━━━━━━━━━━━━━━━━━━━━

Hello *${payload.customerName}*,

This is a gentle reminder regarding your pending payment for the purchase on *${formattedDate}*.

⏳ *Pending for:* ${daysLabel}
💰 *Amount Pending:* ${formattedAmount}
${paymentInfo}

Please complete the payment using our available payment method.

Thank you! 🙏`;

    const requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: textBody,
      },
    };

    return this.sendRequest(requestBody, recipient);
  }

  async sendPaymentReceived(payload: PaymentReceivedMessagePayload): Promise<WhatsAppSendResult> {
    const recipient = this.formatRecipient(payload.recipientPhone);
    const formattedAmount = formatINR(payload.amountReceived);

    const textBody = 
`━━━━━━━━━━━━━━━━━━━━━━━
🏥 *${payload.pharmacyName}*
✅ *PAYMENT RECEIVED*
━━━━━━━━━━━━━━━━━━━━━━━

Hello *${payload.customerName}*,

We have received your payment of *${formattedAmount}* successfully.

Thank you for choosing *${payload.pharmacyName}*. We look forward to serving you again! 🙏`;

    const requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: textBody,
      },
    };

    return this.sendRequest(requestBody, recipient);
  }

  async getStatus(): Promise<WhatsAppProviderStatus> {
    if (!this.accessToken || !this.phoneNumberId) {
      return {
        isConfigured: false,
        isMock: false,
        statusText: 'Not Configured',
        message: 'Missing Access Token or Phone Number ID',
      };
    }

    return {
      isConfigured: true,
      isMock: false,
      phoneNumberId: this.phoneNumberId,
      apiVersion: this.apiVersion,
      statusText: 'Connected',
      message: `Meta Cloud API (${this.apiVersion}) Active`,
    };
  }
}
