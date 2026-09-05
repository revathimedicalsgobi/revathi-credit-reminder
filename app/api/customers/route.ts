import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeWhatsAppNumber } from '@/lib/validations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const filter = searchParams.get('filter') || 'ALL'; // ALL, PENDING_BALANCE, SETTLED

    // 1. Fetch customers and their purchases
    const { data: customers, error } = await supabase
      .from('customers')
      .select(`
        *,
        purchases:purchases(
          id,
          gross_total,
          total_discount,
          amount_payable,
          payment_status,
          purchase_date,
          payment_received_at
        )
      `)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. Compute aggregate metrics for each customer
    const customerList = (customers || []).map((c) => {
      const purchases = c.purchases || [];
      const totalPurchasesCount = purchases.length;

      let totalBilled = 0;
      let totalPaid = 0;
      let outstandingBalance = 0;
      let pendingCount = 0;
      let lastPurchaseDate: string | null = null;

      for (const p of purchases) {
        const amt = Number(p.amount_payable) || 0;
        totalBilled += amt;

        if (p.payment_status === 'PAID') {
          totalPaid += amt;
        } else {
          outstandingBalance += amt;
          pendingCount += 1;
        }

        if (!lastPurchaseDate || new Date(p.purchase_date) > new Date(lastPurchaseDate)) {
          lastPurchaseDate = p.purchase_date;
        }
      }

      return {
        id: c.id,
        name: c.name,
        whatsapp_number: c.whatsapp_number,
        created_at: c.created_at,
        updated_at: c.updated_at,
        total_purchases_count: totalPurchasesCount,
        total_billed: Math.round(totalBilled * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        outstanding_balance: Math.round(outstandingBalance * 100) / 100,
        pending_purchases_count: pendingCount,
        last_purchase_date: lastPurchaseDate,
      };
    });

    // 3. Apply filters & search
    let filtered = customerList;
    if (search) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.whatsapp_number.includes(search)
      );
    }

    if (filter === 'PENDING_BALANCE') {
      filtered = filtered.filter((c) => c.outstanding_balance > 0);
    } else if (filter === 'SETTLED') {
      filtered = filtered.filter((c) => c.outstanding_balance === 0);
    }

    // 4. Compute overall directory KPIs
    const totalCustomers = customerList.length;
    const totalOutstandingAmount = customerList.reduce((acc, c) => acc + c.outstanding_balance, 0);
    const totalPendingCustomers = customerList.filter((c) => c.outstanding_balance > 0).length;
    const totalSettledCustomers = customerList.filter((c) => c.outstanding_balance === 0 && c.total_purchases_count > 0).length;

    return NextResponse.json({
      customers: filtered,
      kpis: {
        total_customers: totalCustomers,
        total_outstanding_amount: Math.round(totalOutstandingAmount * 100) / 100,
        total_pending_customers: totalPendingCustomers,
        total_settled_customers: totalSettledCustomers,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch customers';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
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

    // Check if customer with same phone already exists
    const { data: existing } = await supabase
      .from('customers')
      .select('*')
      .eq('whatsapp_number', normalizedPhone)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `A customer with phone number ${normalizedPhone} already exists (${existing.name})` },
        { status: 400 }
      );
    }

    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert({
        name,
        whatsapp_number: normalizedPhone,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, customer: newCustomer }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create customer';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
