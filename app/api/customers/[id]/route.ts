import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeWhatsAppNumber } from '@/lib/validations';
import { computePurchasePaymentDetails } from '@/lib/payment-helpers';
import { roundToTwoDecimals } from '@/lib/calculations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const customerId = params.id;

    // 1. Fetch customer profile
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .maybeSingle();

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // 2. Fetch all purchases with items, audit_logs, and reminder_logs
    const { data: purchases, error: purchErr } = await supabase
      .from('purchases')
      .select(`
        *,
        items:purchase_items(*),
        audit_logs(*),
        reminder_logs(*)
      `)
      .eq('customer_id', customerId)
      .order('purchase_date', { ascending: false });

    if (purchErr) {
      return NextResponse.json({ error: purchErr.message }, { status: 500 });
    }

    // 3. Compute ledger statement aggregates with partial payments
    let totalGross = 0;
    let totalDiscount = 0;
    let totalBilled = 0;
    let totalPaid = 0;
    let outstandingBalance = 0;
    let pendingBillsCount = 0;
    let settledBillsCount = 0;

    const enrichedPurchases = (purchases || []).map((p) => {
      const details = computePurchasePaymentDetails(p, p.audit_logs || []);
      const gross = Number(p.gross_total) || 0;
      const disc = Number(p.total_discount) || 0;
      const payable = Number(p.amount_payable) || 0;

      totalGross += gross;
      totalDiscount += disc;
      totalBilled += payable;
      totalPaid += details.paid_amount;
      outstandingBalance += details.balance_due;

      if (details.balance_due === 0 || details.payment_status === 'PAID') {
        settledBillsCount += 1;
      } else {
        pendingBillsCount += 1;
      }

      return {
        ...p,
        paid_amount: details.paid_amount,
        balance_due: details.balance_due,
        payment_status: details.payment_status,
        payments: details.payments,
      };
    });

    const statement = {
      customer,
      purchases: enrichedPurchases,
      summary: {
        total_purchases_count: enrichedPurchases.length,
        total_gross: roundToTwoDecimals(totalGross),
        total_discount: roundToTwoDecimals(totalDiscount),
        total_billed: roundToTwoDecimals(totalBilled),
        total_paid: roundToTwoDecimals(totalPaid),
        outstanding_balance: roundToTwoDecimals(outstandingBalance),
        pending_bills_count: pendingBillsCount,
        settled_bills_count: settledBillsCount,
        first_purchase_date: enrichedPurchases.length > 0 ? enrichedPurchases[enrichedPurchases.length - 1].purchase_date : null,
        latest_purchase_date: enrichedPurchases.length > 0 ? enrichedPurchases[0].purchase_date : null,
      },
    };

    return NextResponse.json(statement);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch customer statement';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const customerId = params.id;
    const body = await request.json();

    const name = body.name?.trim();
    const whatsapp_number = body.whatsapp_number?.trim();

    if (!name || !whatsapp_number) {
      return NextResponse.json(
        { error: 'Customer name and WhatsApp number are required' },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizeWhatsAppNumber(whatsapp_number);

    // Check if phone number is taken by another customer
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('whatsapp_number', normalizedPhone)
      .neq('id', customerId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `Another customer with phone number ${normalizedPhone} already exists` },
        { status: 400 }
      );
    }

    const { data: updatedCustomer, error } = await supabase
      .from('customers')
      .update({
        name,
        whatsapp_number: normalizedPhone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, customer: updatedCustomer });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update customer';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const customerId = params.id;

    // Check if customer has purchases
    const { data: purchases, error: fetchErr } = await supabase
      .from('purchases')
      .select('id, payment_status')
      .eq('customer_id', customerId);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (purchases && purchases.length > 0) {
      const hasPending = purchases.some((p) => p.payment_status === 'PENDING');
      if (hasPending) {
        return NextResponse.json(
          { error: 'Cannot delete customer with pending credit balance. Please settle or delete unpaid bills first.' },
          { status: 400 }
        );
      }
    }

    const { error } = await supabase.from('customers').delete().eq('id', customerId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Customer deleted successfully' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete customer';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
