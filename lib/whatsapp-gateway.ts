/**
 * WhatsApp Gateway Client (UltraMsg Integration)
 * Enables 100% automated direct WhatsApp message dispatching & bulk reminders.
 */

export interface WhatsAppGatewayConfig {
  instanceId?: string;
  token?: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  status?: string;
}

export interface GatewayStatusResponse {
  connected: boolean;
  authenticated: boolean;
  status?: string;
  substatus?: string;
  instanceId?: string;
  error?: string;
}

/**
 * Format phone numbers to international format with country code (defaults to 91 for India)
 */
export function formatPhoneForGateway(phone: string): string {
  let cleaned = phone.replace(/[^\d]/g, '');
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

/**
 * Gets configured UltraMsg instance ID and token
 */
export function getGatewayCredentials(config?: WhatsAppGatewayConfig) {
  const instanceId = config?.instanceId || process.env.ULTRAMSG_INSTANCE_ID || 'instance193144';
  const token = config?.token || process.env.ULTRAMSG_TOKEN || 'wa5p454vsbxagrso';
  return { instanceId, token };
}

/**
 * Check if the UltraMsg WhatsApp Gateway is connected and authenticated
 */
export async function checkWhatsAppGatewayStatus(config?: WhatsAppGatewayConfig): Promise<GatewayStatusResponse> {
  const { instanceId, token } = getGatewayCredentials(config);

  if (!instanceId || !token) {
    return {
      connected: false,
      authenticated: false,
      error: 'WhatsApp Gateway credentials not configured (Missing instanceId or token)',
    };
  }

  try {
    const url = `https://api.ultramsg.com/${instanceId}/instance/status?token=${token}`;
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    
    if (!res.ok) {
      const errText = await res.text();
      return {
        connected: false,
        authenticated: false,
        instanceId,
        error: `Gateway HTTP Error ${res.status}: ${errText}`,
      };
    }

    const data = await res.json();
    const accountStatus = data?.status?.accountStatus || {};
    const status = accountStatus.status || '';
    const substatus = accountStatus.substatus || '';

    const isAuth = status === 'authenticated';
    const isConn = substatus === 'connected' || isAuth;

    return {
      connected: isConn,
      authenticated: isAuth,
      status,
      substatus,
      instanceId,
    };
  } catch (err: any) {
    return {
      connected: false,
      authenticated: false,
      instanceId,
      error: err?.message || 'Failed to connect to WhatsApp Gateway API',
    };
  }
}

/**
 * Send an automated WhatsApp message directly to a recipient phone number
 */
export async function sendWhatsAppGatewayMessage({
  to,
  body,
  config,
}: {
  to: string;
  body: string;
  config?: WhatsAppGatewayConfig;
}): Promise<SendMessageResponse> {
  const { instanceId, token } = getGatewayCredentials(config);

  if (!instanceId || !token) {
    return {
      success: false,
      error: 'WhatsApp Gateway not configured. Missing instanceId or token.',
    };
  }

  const cleanTo = formatPhoneForGateway(to);
  if (!cleanTo || cleanTo.length < 10) {
    return {
      success: false,
      error: `Invalid recipient phone number: ${to}`,
    };
  }

  try {
    const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    const params = new URLSearchParams();
    params.append('token', token);
    params.append('to', cleanTo);
    params.append('body', body);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (data?.sent === 'true' || data?.sent === true || data?.id) {
      return {
        success: true,
        messageId: String(data?.id || data?.message || 'sent'),
        status: 'sent',
      };
    }

    return {
      success: false,
      error: data?.error || data?.message || 'Failed to send WhatsApp message via gateway',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error calling WhatsApp Gateway',
    };
  }
}
