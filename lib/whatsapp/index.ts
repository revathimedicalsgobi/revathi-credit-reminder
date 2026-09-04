import { IWhatsAppProvider } from './types';
import { MetaWhatsAppClient } from './meta-whatsapp-client';
import { MockWhatsAppClient } from './mock-whatsapp-client';

let cachedProvider: IWhatsAppProvider | null = null;

/**
 * Returns the active WhatsApp provider instance (Meta Cloud API if configured, otherwise Mock)
 */
export function getWhatsAppProvider(): IWhatsAppProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (accessToken && phoneNumberId) {
    cachedProvider = new MetaWhatsAppClient({
      accessToken,
      phoneNumberId,
      apiVersion,
      businessAccountId,
    });
  } else {
    cachedProvider = new MockWhatsAppClient();
  }

  return cachedProvider;
}

export * from './types';
export * from './meta-whatsapp-client';
export * from './mock-whatsapp-client';
