import { NextRequest, NextResponse } from 'next/server';
import { getStockRequestById, updateStockRequest } from '@/lib/stock-storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppProvider } from '@/lib/whatsapp';
import { buildWhatsAppStockArrivalText, getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = await getStockRequestById(params.id);
    if (!item) {
      return NextResponse.json({ error: 'Stock request not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const sendWhatsApp = body.send_whatsapp !== false;

    // Fetch Pharmacy Settings for branding
    const supabase = createAdminClient();
    const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    const pharmacyName = settings?.pharmacy_name || 'Revathi Medicals & Distributors';

    // Update status to ARRIVED
    let updated = await updateStockRequest(params.id, {
      status: 'ARRIVED',
    });

    let whatsappResult = null;

    if (sendWhatsApp) {
      try {
        const provider = getWhatsAppProvider();
        if (typeof provider.sendStockArrival === 'function') {
          whatsappResult = await provider.sendStockArrival({
            customerName: item.customer_name,
            recipientPhone: item.whatsapp_number,
            productName: item.product_name,
            quantity: item.quantity,
            requestedDate: item.requested_date,
            notes: item.notes,
            imageUrl: item.image_url,
            pharmacyName,
          });
        }

        if (whatsappResult?.success) {
          updated = await updateStockRequest(params.id, {
            status: 'NOTIFIED',
          });
        }
      } catch (err: unknown) {
        console.error('Failed to dispatch stock arrival WhatsApp message:', err);
        whatsappResult = {
          success: false,
          recipient: item.whatsapp_number,
          error: err instanceof Error ? err.message : 'Failed to send WhatsApp message',
        };
      }
    }

    // Direct WhatsApp web url fallback / sharing link
    const textMessage = buildWhatsAppStockArrivalText({
      customerName: item.customer_name,
      recipientPhone: item.whatsapp_number,
      productName: item.product_name,
      quantity: item.quantity,
      requestedDate: item.requested_date,
      notes: item.notes,
      pharmacyName,
      imageUrl: item.image_url,
    });
    const directUrl = getWhatsAppDirectUrl(item.whatsapp_number, textMessage);

    return NextResponse.json({
      success: true,
      message: 'Stock marked as ARRIVED successfully',
      stock_request: updated,
      whatsapp: whatsappResult,
      whatsapp_url: directUrl,
      whatsapp_text: textMessage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to mark stock arrived';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
