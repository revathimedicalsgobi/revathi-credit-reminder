import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppProvider } from '@/lib/whatsapp';
import { RecordPaymentSchema } from '@/lib/validations';
import { roundToTwoDecimals } from '@/lib/calculations';
import { enrichPurchaseWithPayments } from '@/lib/payment-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const purchaseId = params.id;
    const body = await request.json().catch(() => ({}));

    // 1. Validate payment input
    const validationResult = RecordPaymentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { amount: inputAmount, payment_mode = 'CASH', notes = '' } = validationResult.data;

    // 2. Fetch current purchase with audit logs
    const { data: purchase, error: fetchErr } = await supabase
      .from('purchases')
      .select('*, customer:customers(*), audit_logs(*)')
      .eq('id', purchaseId)
      .maybeSingle();

    if (fetchErr || !purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const totalPayable = roundToTwoDecimals(Number(purchase.amount_payable) || 0);
    const existingEnriched = enrichPurchaseWithPayments(purchase, purchase.audit_logs || []);
    const previousPaid = existingEnriched.paid_amount || 0;
    const remainingBefore = existingEnriched.balance_due !== undefined ? existingEnriched.balance_due : totalPayable;

    if (remainingBefore <= 0 || purchase.payment_status === 'PAID') {
      return NextResponse.json(
        { error: 'This bill is already fully PAID' },
        { status: 400 }
      );
    }

    // 3. Determine payment amount (default to full remaining balance if not specified)
    const paymentAmount = roundToTwoDecimals(
      inputAmount !== undefined && inputAmount > 0 ? Math.min(inputAmount, remainingBefore) : remainingBefore
    );

    if (paymentAmount <= 0) {
      return NextResponse.json(
        { error: 'Payment amount must be greater than 0' },
        { status: 400 }
      );
    }

    const newTotalPaid = roundToTwoDecimals(previousPaid + paymentAmount);
    const newRemainingBalance = roundToTwoDecimals(Math.max(0, totalPayable - newTotalPaid));
    const isFullyPaid = newRemainingBalance <= 0 || newTotalPaid >= totalPayable;
    const paymentTimestamp = new Date().toISOString();

    // 4. Update purchase status in database
    // In DB, status is 'PAID' if fully paid, otherwise remains 'PENDING' (compatible with DB CHECK constraint)
    const updatePayload: Record<string, unknown> = {
      payment_status: isFullyPaid ? 'PAID' : 'PENDING',
      updated_at: paymentTimestamp,
    };

    if (isFullyPaid) {
      updatePayload.payment_received_at = paymentTimestamp;
    }

    const { error: updateErr } = await supabase
      .from('purchases')
      .update(updatePayload)
      .eq('id', purchaseId);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update payment status: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 5. Record structured Payment in Audit Logs
    const paymentData = {
      type: 'PAYMENT',
      amount: paymentAmount,
      payment_mode: payment_mode,
      notes: notes || (isFullyPaid ? 'Full payment received' : `Partial payment of ₹${paymentAmount}`),
      previous_paid: previousPaid,
      new_total_paid: newTotalPaid,
      remaining_balance: newRemainingBalance,
      paid_at: paymentTimestamp,
    };

    await supabase.from('audit_logs').insert({
      purchase_id: purchaseId,
      previous_status: existingEnriched.payment_status,
      new_status: isFullyPaid ? 'PAID' : 'PARTIAL_PAYMENT',
      notes: JSON.stringify(paymentData),
    });

    // 6. Fetch Pharmacy Settings
    const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    const pharmacyName = settings?.pharmacy_name || 'Revathi Medicals & Distributors';

    // 7. Calculate customer's overall remaining balance across ALL pending bills
    let otherPendingBalance = 0;
    let otherPendingBillsCount = 0;
    if (purchase.customer_id) {
      const { data: otherPurchases } = await supabase
        .from('purchases')
        .select('id, amount_payable, payment_status, paid_amount, audit_logs(*)')
        .eq('customer_id', purchase.customer_id)
        .neq('id', purchaseId)
        .neq('payment_status', 'PAID');

      if (otherPurchases && otherPurchases.length > 0) {
        for (const op of otherPurchases) {
          const opEnriched = enrichPurchaseWithPayments(op as any, op.audit_logs || []);
          if (opEnriched.balance_due && opEnriched.balance_due > 0) {
            otherPendingBalance += opEnriched.balance_due;
            otherPendingBillsCount++;
          }
        }
      }
    }
    otherPendingBalance = roundToTwoDecimals(otherPendingBalance);
    const totalOutstandingBalance = roundToTwoDecimals(newRemainingBalance + otherPendingBalance);

    // 8. Trigger WhatsApp Receipt / Thank-You
    let whatsappResult = null;
    try {
      const whatsappProvider = getWhatsAppProvider();
      whatsappResult = await whatsappProvider.sendPaymentReceived({
        customerName: purchase.customer?.name || 'Customer',
        recipientPhone: purchase.customer?.whatsapp_number || '',
        purchaseId: purchase.id,
        amountReceived: paymentAmount,
        totalBillAmount: totalPayable,
        remainingBalance: newRemainingBalance,
        isPartial: !isFullyPaid,
        totalOutstandingBalance,
        otherPendingBillsCount,
        pharmacyName,
        paymentReceivedAt: paymentTimestamp,
        upiId: settings?.upi_id || null,
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
      console.error('WhatsApp thank-you dispatch exception:', msgErr);
      whatsappResult = {
        success: false,
        recipient: purchase.customer?.whatsapp_number || '',
        error: msgErr instanceof Error ? msgErr.message : 'Failed to send WhatsApp message',
      };
    }

    // 9. Fetch updated purchase and enrich
    const { data: finalPurchase } = await supabase
      .from('purchases')
      .select('*, customer:customers(*), items:purchase_items(*), audit_logs(*), reminder_logs(*)')
      .eq('id', purchaseId)
      .single();

    const enrichedFinal = finalPurchase ? enrichPurchaseWithPayments(finalPurchase, finalPurchase.audit_logs || []) : null;

    return NextResponse.json({
      success: true,
      message: isFullyPaid
        ? (totalOutstandingBalance > 0
            ? `Bill settled! Customer has remaining balance of ₹${totalOutstandingBalance} on other bills.`
            : 'Payment received and all dues fully cleared!')
        : `Partial payment of ₹${paymentAmount} recorded. Remaining balance: ₹${newRemainingBalance}`,
      purchase: enrichedFinal,
      paymentAmount,
      remainingBalance: newRemainingBalance,
      totalOutstandingBalance,
      otherPendingBillsCount,
      isFullyPaid,
      whatsapp: whatsappResult,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to process payment receipt';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
