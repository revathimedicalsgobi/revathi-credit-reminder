import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    return NextResponse.json({ purchase });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch purchase details';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
