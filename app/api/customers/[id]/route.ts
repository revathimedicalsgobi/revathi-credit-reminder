import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeWhatsAppNumber } from '@/lib/validations';

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

    // 2. Fetch all purchases with items for this customer
    const { data: purchases, error: purchErr } = await supabase
      .from('purchases')
      .select(`
        *,
        items:purchase_items(*),
        reminder_logs(*)
      `)
      .eq('customer_id', customerId)
      .order('purchase_date', { ascending: false });

    if (purchErr) {
      return NextResponse.json({ error: purchErr.message }, { status: 500 });
    }

    // 3. Compute ledger statement aggregates
    let totalGross = 0;
    let totalDiscount = 0;
    let totalBilled = 0;
    let totalPaid = 0;
    let outstandingBalance = 0;
    let pendingBillsCount = 0;
    let settledBillsCount = 0;

    const purchaseList = purchases || [];

    for (const p of purchaseList) {
      const gross = Number(p.gross_total) || 0;
      const disc = Number(p.total_discount) || 0;
      const payable = Number(p.amount_payable) || 0;

      totalGross += gross;
      totalDiscount += disc;
      totalBilled += payable;

      if (p.payment_status === 'PAID') {
        totalPaid += payable;
        settledBillsCount += 1;
      } else {
        outstandingBalance += payable;
        pendingBillsCount += 1;
      }
    }

    const statement = {
      customer,
      purchases: purchaseList,
      summary: {
        total_purchases_count: purchaseList.length,
        total_gross: Math.round(totalGross * 100) / 100,
        total_discount: Math.round(totalDiscount * 100) / 100,
        total_billed: Math.round(totalBilled * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        outstanding_balance: Math.round(outstandingBalance * 100) / 100,
        pending_bills_count: pendingBillsCount,
        settled_bills_count: settledBillsCount,
        first_purchase_date: purchaseList.length > 0 ? purchaseList[purchaseList.length - 1].purchase_date : null,
        latest_purchase_date: purchaseList.length > 0 ? purchaseList[0].purchase_date : null,
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
