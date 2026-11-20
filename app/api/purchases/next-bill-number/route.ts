import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNextSeriesBillNumberFromList, extractBillSequenceNumber } from '@/lib/payment-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get('prefix') || 'BILL';

    // 1. Fetch all purchases to count and check sequence
    const { data: purchases, error: pErr } = await supabase
      .from('purchases')
      .select('id, created_at, bill_number')
      .order('created_at', { ascending: true });

    if (pErr) {
      console.warn('Notice querying purchases for bill sequence:', pErr.message);
    }

    // 2. Fetch audit logs with bill numbers
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('id, purchase_id, new_status, notes')
      .eq('new_status', 'BILL_NUMBER');

    const nextBillNumber = getNextSeriesBillNumberFromList(purchases || [], auditLogs || [], prefix);
    const sequence = extractBillSequenceNumber(nextBillNumber) || ((purchases?.length || 0) + 1);

    return NextResponse.json({
      success: true,
      nextBillNumber,
      sequence,
      totalExistingBills: purchases?.length || 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate next bill number';
    return NextResponse.json({ error: msg, nextBillNumber: 'BILL-0001' }, { status: 500 });
  }
}
