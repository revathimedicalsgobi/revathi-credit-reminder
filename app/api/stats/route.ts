import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startOfDay, endOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createAdminClient();
    const todayStart = startOfDay(new Date()).toISOString();
    const todayEnd = endOfDay(new Date()).toISOString();

    // 1. Purchases today
    const { data: todayPurchases, error: pErr } = await supabase
      .from('purchases')
      .select('id, amount_payable')
      .gte('purchase_date', todayStart)
      .lte('purchase_date', todayEnd);

    if (pErr) throw pErr;

    // 2. Pending purchases
    const { data: pendingPurchases, error: pendErr } = await supabase
      .from('purchases')
      .select('id, customer_id, amount_payable')
      .eq('payment_status', 'PENDING');

    if (pendErr) throw pendErr;

    // 3. Payments received today
    const { data: receivedToday, error: rErr } = await supabase
      .from('purchases')
      .select('id, amount_payable')
      .eq('payment_status', 'PAID')
      .gte('payment_received_at', todayStart)
      .lte('payment_received_at', todayEnd);

    if (rErr) throw rErr;

    const todayPurchasesCount = todayPurchases?.length || 0;
    const pendingCustomersCount = new Set((pendingPurchases || []).map((p) => p.customer_id)).size;
    const pendingAmount = (pendingPurchases || []).reduce(
      (acc, curr) => acc + (Number(curr.amount_payable) || 0),
      0
    );
    const paymentsReceivedTodayCount = receivedToday?.length || 0;
    const paymentsReceivedTodayAmount = (receivedToday || []).reduce(
      (acc, curr) => acc + (Number(curr.amount_payable) || 0),
      0
    );

    return NextResponse.json({
      stats: {
        today_purchases_count: todayPurchasesCount,
        pending_customers_count: pendingCustomersCount,
        pending_amount: Math.round(pendingAmount * 100) / 100,
        payments_received_today_count: paymentsReceivedTodayCount,
        payments_received_today_amount: Math.round(paymentsReceivedTodayAmount * 100) / 100,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load statistics';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
