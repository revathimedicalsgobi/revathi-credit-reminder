import {
  IWhatsAppProvider,
  PurchaseSummaryMessagePayload,
  PaymentReminderMessagePayload,
  PaymentReceivedMessagePayload,
  WhatsAppSendResult,
  WhatsAppProviderStatus,
} from './types';
import {
  buildWhatsAppSummaryText,
  buildWhatsAppReminderText,
  buildWhatsAppThankYouText,
} from '../whatsapp-share';
import { sendWhatsAppGatewayMessage, checkWhatsAppGatewayStatus } from '../whatsapp-gateway';

export interface UltraMsgConfig {
  instanceId: string;
  token: string;
}

export class UltraMsgWhatsAppClient implements IWhatsAppProvider {
  private instanceId: string;
  private token: string;

  constructor(config: UltraMsgConfig) {
    this.instanceId = config.instanceId;
    this.token = config.token;
  }

  async sendPurchaseSummary(payload: PurchaseSummaryMessagePayload): Promise<WhatsAppSendResult> {
    try {
      const textMessage = buildWhatsAppSummaryText({
        customerName: payload.customerName,
        recipientPhone: payload.recipientPhone,
        purchaseDate: payload.purchaseDate,
        amountPayable: payload.amountPayable,
        grossTotal: payload.grossTotal,
        totalDiscount: payload.totalDiscount,
        items: payload.items,
        pharmacyName: payload.pharmacyName,
        upiId: payload.upiId,
        previousBalance: payload.previousBalance,
        cumulativeTotal: payload.cumulativeTotal,
        dateWisePendingBills: payload.dateWisePendingBills,
      });

      const res = await sendWhatsAppGatewayMessage({
        to: payload.recipientPhone,
        body: textMessage,
        config: {
          instanceId: this.instanceId,
          token: this.token,
        },
      });

      return {
        success: res.success,
        messageId: res.messageId,
        recipient: payload.recipientPhone,
        error: res.error,
        rawResponse: res,
      };
    } catch (err: any) {
      return {
        success: false,
        recipient: payload.recipientPhone,
        error: err?.message || 'Failed to send Purchase Summary via UltraMsg',
      };
    }
  }

  async sendPaymentReminder(payload: PaymentReminderMessagePayload): Promise<WhatsAppSendResult> {
    try {
      const textMessage = buildWhatsAppReminderText({
        customerName: payload.customerName,
        recipientPhone: payload.recipientPhone,
        purchaseDate: payload.purchaseDate,
        pendingDays: payload.pendingDays,
        amountPending: payload.amountPending,
        totalBillAmount: payload.totalBillAmount,
        paidAmount: payload.paidAmount,
        pharmacyName: payload.pharmacyName,
        upiId: payload.upiId,
      });

      const res = await sendWhatsAppGatewayMessage({
        to: payload.recipientPhone,
        body: textMessage,
        config: {
          instanceId: this.instanceId,
          token: this.token,
        },
      });

      return {
        success: res.success,
        messageId: res.messageId,
        recipient: payload.recipientPhone,
        error: res.error,
        rawResponse: res,
      };
    } catch (err: any) {
      return {
        success: false,
        recipient: payload.recipientPhone,
        error: err?.message || 'Failed to send Payment Reminder via UltraMsg',
      };
    }
  }

  async sendPaymentReceived(payload: PaymentReceivedMessagePayload): Promise<WhatsAppSendResult> {
    try {
      const textMessage = buildWhatsAppThankYouText({
        customerName: payload.customerName,
        recipientPhone: payload.recipientPhone,
        amountReceived: payload.amountReceived,
        totalBillAmount: payload.totalBillAmount,
        remainingBalance: payload.remainingBalance,
        isPartial: payload.isPartial,
        pharmacyName: payload.pharmacyName,
      });

      const res = await sendWhatsAppGatewayMessage({
        to: payload.recipientPhone,
        body: textMessage,
        config: {
          instanceId: this.instanceId,
          token: this.token,
        },
      });

      return {
        success: res.success,
        messageId: res.messageId,
        recipient: payload.recipientPhone,
        error: res.error,
        rawResponse: res,
      };
    } catch (err: any) {
      return {
        success: false,
        recipient: payload.recipientPhone,
        error: err?.message || 'Failed to send Payment Received receipt via UltraMsg',
      };
    }
  }

  async getStatus(): Promise<WhatsAppProviderStatus> {
    try {
      const statusRes = await checkWhatsAppGatewayStatus({
        instanceId: this.instanceId,
        token: this.token,
      });

      if (statusRes.connected) {
        return {
          isConfigured: true,
          isMock: false,
          phoneNumberId: this.instanceId,
          statusText: 'Connected',
          message: `UltraMsg Gateway active and connected (Instance: ${this.instanceId})`,
        };
      }

      return {
        isConfigured: true,
        isMock: false,
        phoneNumberId: this.instanceId,
        statusText: 'Error',
        message: statusRes.error || 'UltraMsg instance not connected to WhatsApp',
      };
    } catch (err: any) {
      return {
        isConfigured: true,
        isMock: false,
        statusText: 'Error',
        message: err?.message || 'Error checking UltraMsg status',
      };
    }
  }
}
