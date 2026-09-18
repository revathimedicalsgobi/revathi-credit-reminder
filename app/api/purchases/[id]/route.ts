import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const purchaseId = params.id;

    const { data: purchase, error } = await supabase
      .from('purchases')
      .select(`
        *,
        customer:customers(*),
        items:purchase_items(*),
        reminder_logs(*)
      `)
      .eq('id', purchaseId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 400 });
    }

    let previousPendingPurchases: Array<{ id: string; purchase_date: string; amount_payable: number }> = [];
    let previousBalance = 0;
    let cumulativeTotal = Number(purchase.amount_payable || 0);

    if (purchase.customer_id) {
      const { data: others } = await supabase
        .from('purchases')
        .select('id, purchase_date, amount_payable')
        .eq('customer_id', purchase.customer_id)
        .eq('payment_status', 'PENDING')
        .neq('id', purchase.id)
        .order('purchase_date', { ascending: true });

      if (others && others.length > 0) {
        previousPendingPurchases = others;
        previousBalance = others.reduce((sum, p) => sum + Number(p.amount_payable || 0), 0);
        cumulativeTotal = previousBalance + Number(purchase.amount_payable || 0);
      }
    }

    return NextResponse.json({
      purchase,
      previousBalance,
      cumulativeTotal,
      dateWisePendingBills: previousPendingPurchases.map((p) => ({
        date: p.purchase_date,
        amount: Number(p.amount_payable || 0),
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch purchase details';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
