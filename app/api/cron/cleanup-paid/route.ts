import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { subDays } from 'date-fns';

export async function GET(request: NextRequest) {
  return handlePaidCleanup(request);
}

export async function POST(request: NextRequest) {
  return handlePaidCleanup(request);
}

async function handlePaidCleanup(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const secretHeader = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret) {
      const isBearerValid = authHeader === `Bearer ${expectedSecret}`;
      const isHeaderValid = secretHeader === expectedSecret;
      if (!isBearerValid && !isHeaderValid) {
        return NextResponse.json({ error: 'Unauthorized cron invocation' }, { status: 401 });
      }
    }

    const supabase = createAdminClient();
    const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

    const { data: expiredPurchases, error: fetchErr } = await supabase
      .from('purchases')
      .select('id, payment_received_at')
      .eq('payment_status', 'PAID')
      .not('payment_received_at', 'is', null)
      .lte('payment_received_at', thirtyDaysAgo);

    if (fetchErr) {
      throw fetchErr;
    }

    if (!expiredPurchases || expiredPurchases.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired paid records found for cleanup',
        deletedCount: 0,
        cutoffDate: thirtyDaysAgo,
      });
    }

    const expiredIds = expiredPurchases.map((p) => p.id);

    await supabase.from('reminder_logs').delete().in('purchase_id', expiredIds);
    await supabase.from('purchase_items').delete().in('purchase_id', expiredIds);
    await supabase.from('audit_logs').delete().in('purchase_id', expiredIds);

    const { error: deleteErr } = await supabase
      .from('purchases')
      .delete()
      .in('id', expiredIds);

    if (deleteErr) {
      throw deleteErr;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully cleaned ${expiredIds.length} paid records older than 30 days`,
      deletedCount: expiredIds.length,
      cutoffDate: thirtyDaysAgo,
      cleanedPurchaseIds: expiredIds,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cleanup cron failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
