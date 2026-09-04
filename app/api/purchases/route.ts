import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CreatePurchaseSchema, normalizeWhatsAppNumber } from '@/lib/validations';
import { calculatePurchaseSummary } from '@/lib/calculations';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let query = supabase
      .from('purchases')
      .select(`
        *,
        customer:customers(*),
        items:purchase_items(*)
      `)
      .order('purchase_date', { ascending: false })
      .limit(limit);

    if (status && (status === 'PENDING' || status === 'PAID')) {
      query = query.eq('payment_status', status);
    }

    const { data: purchases, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let filtered = purchases || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((p) => {
        const custName = p.customer?.name?.toLowerCase() || '';
        const custPhone = p.customer?.whatsapp_number || '';
        const id = p.id || '';
        return (
          custName.includes(searchLower) ||
          custPhone.includes(search) ||
          id.includes(search)
        );
      });
    }

    return NextResponse.json({ purchases: filtered });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch purchases';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const validationResult = CreatePurchaseSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { customer_name, whatsapp_number, items, send_whatsapp } = validationResult.data;
    const normalizedPhone = normalizeWhatsAppNumber(whatsapp_number);

    const calculated = calculatePurchaseSummary(items);
    if (calculated.items.length === 0) {
      return NextResponse.json({ error: 'At least one valid item is required' }, { status: 400 });
    }

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('*')
      .eq('whatsapp_number', normalizedPhone)
      .maybeSingle();

    let customerId = existingCustomer?.id;

    if (!existingCustomer) {
      const { data: newCustomer, error: customerErr } = await supabase
        .from('customers')
        .insert({
          name: customer_name.trim(),
          whatsapp_number: normalizedPhone,
        })
        .select()
        .single();

      if (customerErr) {
        return NextResponse.json({ error: `Customer creation failed: ${customerErr.message}` }, { status: 500 });
      }
      customerId = newCustomer.id;
    } else if (existingCustomer.name !== customer_name.trim()) {
      await supabase
        .from('customers')
        .update({ name: customer_name.trim() })
        .eq('id', customerId);
    }

    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        customer_id: customerId,
        gross_total: calculated.gross_total,
        total_discount: calculated.total_discount,
        amount_payable: calculated.amount_payable,
        payment_status: 'PENDING',
        whatsapp_status: 'PENDING',
      })
      .select()
      .single();

    if (purchaseErr) {
      return NextResponse.json({ error: `Purchase record creation failed: ${purchaseErr.message}` }, { status: 500 });
    }

    const itemsToInsert = calculated.items.map((item) => ({
      purchase_id: purchase.id,
      item_name: item.item_name,
      quantity: item.quantity,
      mrp: item.mrp,
      discount: item.discount_amount,
      gross_amount: item.gross_amount,
      net_amount: item.net_amount,
    }));

    const { error: itemsErr } = await supabase.from('purchase_items').insert(itemsToInsert);

    if (itemsErr) {
      return NextResponse.json({ error: `Purchase items creation failed: ${itemsErr.message}` }, { status: 500 });
    }

    const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    const pharmacyName = settings?.pharmacy_name || 'Revathi Medicals & Distributors';
    const upiId = settings?.upi_id || null;
    const paymentQrUrl = settings?.payment_qr_url || null;

    let whatsappResult = null;
    if (send_whatsapp) {
      const whatsappProvider = getWhatsAppProvider();
      whatsappResult = await whatsappProvider.sendPurchaseSummary({
        customerName: customer_name,
        recipientPhone: normalizedPhone,
        purchaseId: purchase.id,
        purchaseDate: purchase.purchase_date || new Date().toISOString(),
        amountPayable: calculated.amount_payable,
        grossTotal: calculated.gross_total,
        totalDiscount: calculated.total_discount,
        items: calculated.items.map((i) => ({
          itemName: i.item_name,
          quantity: i.quantity,
          mrp: i.mrp,
          discount: i.discount_amount,
          netAmount: i.net_amount,
        })),
        pharmacyName,
        upiId,
        paymentQrUrl,
      });

      await supabase
        .from('purchases')
        .update({
          whatsapp_status: whatsappResult.success ? 'SENT' : 'FAILED',
          whatsapp_message_id: whatsappResult.messageId || null,
          whatsapp_last_sent_at: new Date().toISOString(),
        })
        .eq('id', purchase.id);

      await supabase.from('reminder_logs').insert({
        purchase_id: purchase.id,
        pending_days: 0,
        message_type: 'PURCHASE_SUMMARY',
        whatsapp_message_id: whatsappResult.messageId || null,
        status: whatsappResult.success ? 'SENT' : 'FAILED',
        error_message: whatsappResult.error || null,
      });
    }

    return NextResponse.json({
      success: true,
      purchaseId: purchase.id,
      purchase: {
        ...purchase,
        items: calculated.items,
        customer: { id: customerId, name: customer_name, whatsapp_number: normalizedPhone },
      },
      whatsapp: whatsappResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'An error occurred during purchase processing';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
