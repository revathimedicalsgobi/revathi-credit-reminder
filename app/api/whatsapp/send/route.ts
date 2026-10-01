import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppGatewayMessage } from '@/lib/whatsapp-gateway';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, message, instanceId, token } = body;

    if (!to || !message) {
      return NextResponse.json(
        { success: false, error: 'Recipient phone number (to) and message text are required' },
        { status: 400 }
      );
    }

    const result = await sendWhatsAppGatewayMessage({
      to,
      body: message,
      config: instanceId && token ? { instanceId, token } : undefined,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to dispatch WhatsApp message',
      },
      { status: 500 }
    );
  }
}
