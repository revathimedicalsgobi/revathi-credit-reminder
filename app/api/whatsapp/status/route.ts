import { NextRequest, NextResponse } from 'next/server';
import { checkWhatsAppGatewayStatus } from '@/lib/whatsapp-gateway';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId') || undefined;
    const token = searchParams.get('token') || undefined;

    const status = await checkWhatsAppGatewayStatus({ instanceId, token });
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      {
        connected: false,
        authenticated: false,
        error: err?.message || 'Internal error checking WhatsApp gateway status',
      },
      { status: 500 }
    );
  }
}
