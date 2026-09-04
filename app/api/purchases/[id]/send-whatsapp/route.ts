import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppProvider } from '@/lib/whatsapp';
import { getPendingDaysCount } from '@/lib/utils';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const purchaseId = params.id;
    const body = await request.json().catch(() => ({}));
    const messageType = body.message_type || 'PURCHASE_SUMMARY';

    // Fetch purchase with customer and items
    const { data: purchase, error: fetchErr } = await supabase
      .from('purchases')
      .select('*, customer:customers(*), items:purchase_items(*)')
      .eq('id', purchaseId)
      .maybeSingle();

    if (fetchErr || !purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    const pharmacyName = settings?.pharmacy_name || 'HealthPlus Pharmacy';
    const upiId = settings?.upi_id || null;
    const paymentQrUrl = settings?.payment_qr_url || null;

    const whatsappProvider = getWhatsAppProvider();
    let whatsappResult;

    if (messageType === 'PURCHASE_SUMMARY') {
      whatsappResult = await whatsappProvider.sendPurchaseSummary({
        customerName: purchase.customer?.name || 'Customer',
        recipientPhone: purchase.customer?.whatsapp_number || '',
        purchaseId: purchase.id,
        purchaseDate: purchase.purchase_date,
        amountPayable: Number(purchase.amount_payable),
        grossTotal: Number(purchase.gross_total),
        totalDiscount: Number(purchase.total_discount),
        items: (purchase.items || []).map((i: any) => ({
          itemName: i.item_name,
          quantity: Number(i.quantity),
          mrp: Number(i.mrp),
          discount: Number(i.discount),
          netAmount: Number(i.net_amount),
        })),
        pharmacyName,
        upiId,
        paymentQrUrl,
      });
    } else if (messageType === 'PAYMENT_REMINDER') {
      const pendingDays = getPendingDaysCount(purchase.purchase_date);
      whatsappResult = await whatsappProvider.sendPaymentReminder({
        customerName: purchase.customer?.name || 'Customer',
        recipientPhone: purchase.customer?.whatsapp_number || '',
        purchaseId: purchase.id,
        purchaseDate: purchase.purchase_date,
        pendingDays,
        amountPending: Number(purchase.amount_payable),
        pharmacyName,
        upiId,
        paymentQrUrl,
      });
    } else if (messageType === 'PAYMENT_RECEIVED') {
      whatsappResult = await whatsappProvider.sendPaymentReceived({
        customerName: purchase.customer?.name || 'Customer',
        recipientPhone: purchase.customer?.whatsapp_number || '',
        purchaseId: purchase.id,
        amountReceived: Number(purchase.amount_payable),
        pharmacyName,
        paymentReceivedAt: purchase.payment_received_at || new Date().toISOString(),
      });
    } else {
      return NextResponse.json({ error: 'Invalid message_type' }, { status: 400 });
    }

    // Update purchase record status
    await supabase
      .from('purchases')
      .update({
        whatsapp_status: whatsappResult.success ? 'SENT' : 'FAILED',
        whatsapp_message_id: whatsappResult.messageId || null,
        whatsapp_last_sent_at: new Date().toISOString(),
      })
      .eq('id', purchase.id);

    // Record in reminder_logs
    await supabase.from('reminder_logs').insert({
      purchase_id: purchase.id,
      pending_days: getPendingDaysCount(purchase.purchase_date),
      message_type: messageType,
      whatsapp_message_id: whatsappResult.messageId || null,
      status: whatsappResult.success ? 'SENT' : 'FAILED',
      error_message: whatsappResult.error || null,
    });

    return NextResponse.json({
      success: whatsappResult.success,
      result: whatsappResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to dispatch WhatsApp message';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
