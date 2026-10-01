import { IWhatsAppProvider } from './types';
import { MetaWhatsAppClient } from './meta-whatsapp-client';
import { MockWhatsAppClient } from './mock-whatsapp-client';
import { UltraMsgWhatsAppClient } from './ultramsg-client';

let cachedProvider: IWhatsAppProvider | null = null;

/**
 * Returns the active WhatsApp provider instance:
 * 1. UltraMsg Gateway (if configured)
 * 2. Meta WhatsApp Cloud API (if configured)
 * 3. Mock WhatsApp Client (fallback)
 */
export function getWhatsAppProvider(): IWhatsAppProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const ultramsgInstanceId = process.env.ULTRAMSG_INSTANCE_ID;
  const ultramsgToken = process.env.ULTRAMSG_TOKEN;

  if (ultramsgInstanceId && ultramsgToken) {
    cachedProvider = new UltraMsgWhatsAppClient({
      instanceId: ultramsgInstanceId,
      token: ultramsgToken,
    });
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
export * from './ultramsg-client';

