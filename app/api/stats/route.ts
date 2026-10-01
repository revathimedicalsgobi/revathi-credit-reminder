import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startOfDay, endOfDay } from 'date-fns';
import { computePurchasePaymentDetails, parsePaymentRecord } from '@/lib/payment-helpers';
import { roundToTwoDecimals } from '@/lib/calculations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createAdminClient();
    const todayStart = startOfDay(new Date()).toISOString();
    const todayEnd = endOfDay(new Date()).toISOString();

    // 1. Purchases recorded today
    const { data: todayPurchases, error: pErr } = await supabase
      .from('purchases')
      .select('id, amount_payable')
      .gte('purchase_date', todayStart)
      .lte('purchase_date', todayEnd);

    if (pErr) throw pErr;

    // 2. All pending & partial purchases with their audit logs to compute accurate outstanding balance
    const { data: activePurchases, error: pendErr } = await supabase
      .from('purchases')
      .select(`
        id, customer_id, amount_payable, payment_status, payment_received_at,
        audit_logs(*)
      `)
      .eq('payment_status', 'PENDING');

    if (pendErr) throw pendErr;

    let pendingAmount = 0;
    const pendingCustomersSet = new Set<string>();

    for (const p of activePurchases || []) {
      const { balance_due, payment_status } = computePurchasePaymentDetails(p, p.audit_logs || []);
      if (payment_status !== 'PAID' && balance_due > 0) {
        pendingAmount += balance_due;
        if (p.customer_id) {
          pendingCustomersSet.add(p.customer_id);
        }
      }
    }

    // 3. Payments received today (from today's payment audit logs and today's fully paid purchases)
    const { data: todayAuditLogs } = await supabase
      .from('audit_logs')
      .select('*')
      .gte('changed_at', todayStart)
      .lte('changed_at', todayEnd);

    let paymentsReceivedTodayCount = 0;
    let paymentsReceivedTodayAmount = 0;

    const countedPurchaseIds = new Set<string>();

    for (const log of todayAuditLogs || []) {
      const paymentRec = parsePaymentRecord(log);
      if (paymentRec && paymentRec.amount > 0) {
        paymentsReceivedTodayCount += 1;
        paymentsReceivedTodayAmount += paymentRec.amount;
        countedPurchaseIds.add(log.purchase_id);
      }
    }

    // Also check purchases marked PAID today if not already captured in structured audit logs
    const { data: paidTodayPurchases } = await supabase
      .from('purchases')
      .select('id, amount_payable')
      .eq('payment_status', 'PAID')
      .gte('payment_received_at', todayStart)
      .lte('payment_received_at', todayEnd);

    for (const p of paidTodayPurchases || []) {
      if (!countedPurchaseIds.has(p.id)) {
        paymentsReceivedTodayCount += 1;
        paymentsReceivedTodayAmount += Number(p.amount_payable || 0);
      }
    }

    return NextResponse.json({
      stats: {
        today_purchases_count: todayPurchases?.length || 0,
        pending_customers_count: pendingCustomersSet.size,
        pending_amount: roundToTwoDecimals(pendingAmount),
        payments_received_today_count: paymentsReceivedTodayCount,
        payments_received_today_amount: roundToTwoDecimals(paymentsReceivedTodayAmount),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load statistics';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
