import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const purchaseId = params.id;

    // 1. Fetch current purchase
    const { data: purchase, error: fetchErr } = await supabase
      .from('purchases')
      .select('*, customer:customers(*)')
      .eq('id', purchaseId)
      .maybeSingle();

    if (fetchErr || !purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    if (purchase.payment_status === 'PAID') {
      return NextResponse.json(
        { error: 'Payment is already marked as PAID' },
        { status: 400 }
      );
    }

    const paymentTimestamp = new Date().toISOString();

    // 2. Update payment status to PAID
    const { data: updatedPurchase, error: updateErr } = await supabase
      .from('purchases')
      .update({
        payment_status: 'PAID',
        payment_received_at: paymentTimestamp,
      })
      .eq('id', purchaseId)
      .select('*, customer:customers(*)')
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update payment status: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 3. Record Audit Log
    await supabase.from('audit_logs').insert({
      purchase_id: purchaseId,
      previous_status: 'PENDING',
      new_status: 'PAID',
      notes: 'Payment confirmed by staff via Payment Received action',
    });

    // 4. Fetch Pharmacy Settings
    const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    const pharmacyName = settings?.pharmacy_name || 'Revathi Medicals & Distributors';

    // 5. Trigger Thank-You WhatsApp Message
    let whatsappResult = null;
    try {
      const whatsappProvider = getWhatsAppProvider();
      whatsappResult = await whatsappProvider.sendPaymentReceived({
        customerName: purchase.customer?.name || 'Customer',
        recipientPhone: purchase.customer?.whatsapp_number || '',
        purchaseId: purchase.id,
        amountReceived: Number(purchase.amount_payable),
        pharmacyName,
        paymentReceivedAt: paymentTimestamp,
      });

      // Record in reminder_logs
      await supabase.from('reminder_logs').insert({
        purchase_id: purchase.id,
        pending_days: 0,
        message_type: 'PAYMENT_RECEIVED',
        whatsapp_message_id: whatsappResult.messageId || null,
        status: whatsappResult.success ? 'SENT' : 'FAILED',
        error_message: whatsappResult.error || null,
      });
    } catch (msgErr: unknown) {
      // Non-blocking: Payment stays PAID even if WhatsApp dispatch encounters an issue
      console.error('WhatsApp thank-you dispatch exception:', msgErr);
      whatsappResult = {
        success: false,
        recipient: purchase.customer?.whatsapp_number || '',
        error: msgErr instanceof Error ? msgErr.message : 'Failed to send WhatsApp thank-you message',
      };
    }

    return NextResponse.json({
      success: true,
      purchase: updatedPurchase,
      whatsapp: whatsappResult,
      message: 'Payment received successfully',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to process payment receipt';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
