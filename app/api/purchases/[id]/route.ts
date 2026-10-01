import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { UpdatePurchaseSchema, normalizeWhatsAppNumber } from '@/lib/validations';
import { calculatePurchaseSummary, roundToTwoDecimals } from '@/lib/calculations';
import { enrichPurchaseWithPayments } from '@/lib/payment-helpers';
import { getWhatsAppProvider } from '@/lib/whatsapp';

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
        reminder_logs(*),
        audit_logs(*)
      `)
      .eq('id', purchaseId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // Enrich purchase with computed partial payment details and history
    const enrichedPurchase = enrichPurchaseWithPayments(purchase, purchase.audit_logs || []);

    let previousPendingPurchases: Array<{ id: string; purchase_date: string; amount_payable: number; balance_due?: number }> = [];
    let previousBalance = 0;
    const currentDue = enrichedPurchase.balance_due !== undefined ? enrichedPurchase.balance_due : Number(enrichedPurchase.amount_payable || 0);
    let cumulativeTotal = currentDue;

    if (purchase.customer_id) {
      const { data: others } = await supabase
        .from('purchases')
        .select(`
          id, purchase_date, amount_payable, payment_status,
          audit_logs(*)
        `)
        .eq('customer_id', purchase.customer_id)
        .neq('id', purchase.id)
        .order('purchase_date', { ascending: true });

      if (others && others.length > 0) {
        for (const other of others) {
          const otherEnriched = enrichPurchaseWithPayments(other as any, other.audit_logs || []);
          if (otherEnriched.payment_status !== 'PAID' && (otherEnriched.balance_due || 0) > 0) {
            previousPendingPurchases.push({
              id: other.id,
              purchase_date: other.purchase_date,
              amount_payable: Number(other.amount_payable || 0),
              balance_due: otherEnriched.balance_due,
            });
            previousBalance += Number(otherEnriched.balance_due || 0);
          }
        }
        previousBalance = roundToTwoDecimals(previousBalance);
        cumulativeTotal = roundToTwoDecimals(previousBalance + currentDue);
      }
    }

    return NextResponse.json({
      purchase: enrichedPurchase,
      previousBalance,
      cumulativeTotal,
      dateWisePendingBills: previousPendingPurchases.map((p) => ({
        date: p.purchase_date,
        amount: Number(p.balance_due || p.amount_payable || 0),
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch purchase details';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const purchaseId = params.id;
    const body = await request.json();

    // 1. Validate payload
    const validationResult = UpdatePurchaseSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { customer_name, whatsapp_number, purchase_date, items, send_whatsapp } = validationResult.data;
    const normalizedPhone = normalizeWhatsAppNumber(whatsapp_number);

    // 2. Fetch existing purchase and its audit logs
    const { data: existingPurchase, error: fetchErr } = await supabase
      .from('purchases')
      .select('*, customer:customers(*), audit_logs(*)')
      .eq('id', purchaseId)
      .maybeSingle();

    if (fetchErr || !existingPurchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // 3. Calculate new totals
    const calculated = calculatePurchaseSummary(items);
    if (calculated.items.length === 0) {
      return NextResponse.json({ error: 'At least one valid item is required' }, { status: 400 });
    }

    // 4. Resolve customer
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

    // 5. Determine payment status after bill modification
    const existingEnriched = enrichPurchaseWithPayments(existingPurchase, existingPurchase.audit_logs || []);
    const alreadyPaid = existingEnriched.paid_amount || 0;
    const newAmountPayable = calculated.amount_payable;
    
    // In DB, status is 'PAID' only if alreadyPaid >= newAmountPayable
    const newDbStatus = (alreadyPaid >= newAmountPayable && newAmountPayable > 0) ? 'PAID' : 'PENDING';

    const updateFields: Record<string, unknown> = {
      customer_id: customerId,
      gross_total: calculated.gross_total,
      total_discount: calculated.total_discount,
      amount_payable: calculated.amount_payable,
      payment_status: newDbStatus,
      updated_at: new Date().toISOString(),
    };

    if (purchase_date) {
      updateFields.purchase_date = new Date(purchase_date).toISOString();
    }

    // Try updating purchases table
    const { data: updatedPurchase, error: purchaseUpdateErr } = await supabase
      .from('purchases')
      .update(updateFields)
      .eq('id', purchaseId)
      .select()
      .single();

    if (purchaseUpdateErr) {
      return NextResponse.json({ error: `Failed to update purchase: ${purchaseUpdateErr.message}` }, { status: 500 });
    }

    // 6. Delete old purchase items and insert updated ones
    const { error: deleteItemsErr } = await supabase
      .from('purchase_items')
      .delete()
      .eq('purchase_id', purchaseId);

    if (deleteItemsErr) {
      return NextResponse.json({ error: `Failed to update items: ${deleteItemsErr.message}` }, { status: 500 });
    }

    const itemsToInsert = calculated.items.map((item) => ({
      purchase_id: purchaseId,
      item_name: item.item_name,
      quantity: item.quantity,
      mrp: item.mrp,
      discount: item.discount_amount,
      gross_amount: item.gross_amount,
      net_amount: item.net_amount,
    }));

    const { error: insertItemsErr } = await supabase
      .from('purchase_items')
      .insert(itemsToInsert);

    if (insertItemsErr) {
      return NextResponse.json({ error: `Failed to insert updated items: ${insertItemsErr.message}` }, { status: 500 });
    }

    // 7. Record Audit Log for bill edit
    const prevAmount = existingPurchase.amount_payable;
    const newAmount = calculated.amount_payable;
    await supabase.from('audit_logs').insert({
      purchase_id: purchaseId,
      previous_status: existingPurchase.payment_status,
      new_status: newDbStatus,
      notes: `Bill edited by staff. Amount changed from ₹${prevAmount} to ₹${newAmount}. Items updated (${calculated.items.length} items).`,
    });

    // 8. Fetch complete updated purchase
    const { data: finalPurchase } = await supabase
      .from('purchases')
      .select(`
        *,
        customer:customers(*),
        items:purchase_items(*),
        audit_logs(*),
        reminder_logs(*)
      `)
      .eq('id', purchaseId)
      .single();

    const finalEnriched = finalPurchase ? enrichPurchaseWithPayments(finalPurchase, finalPurchase.audit_logs || []) : updatedPurchase;

    // 9. Optional WhatsApp updated summary dispatch
    let whatsappResult = null;
    if (send_whatsapp) {
      try {
        const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
        const pharmacyName = settings?.pharmacy_name || 'Revathi Medicals & Distributors';
        const upiId = settings?.upi_id || null;
        const paymentQrUrl = settings?.payment_qr_url || null;

        const whatsappProvider = getWhatsAppProvider();
        whatsappResult = await whatsappProvider.sendPurchaseSummary({
          customerName: customer_name,
          recipientPhone: normalizedPhone,
          purchaseId: purchaseId,
          purchaseDate: updatedPurchase.purchase_date || new Date().toISOString(),
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

        await supabase.from('reminder_logs').insert({
          purchase_id: purchaseId,
          pending_days: 0,
          message_type: 'PURCHASE_SUMMARY',
          whatsapp_message_id: whatsappResult.messageId || null,
          status: whatsappResult.success ? 'SENT' : 'FAILED',
          error_message: whatsappResult.error || null,
        });
      } catch (e) {
        console.error('WhatsApp re-dispatch notice on bill edit:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Bill updated successfully',
      purchase: finalEnriched,
      whatsapp: whatsappResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'An error occurred while updating purchase';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const purchaseId = params.id;

    const { error } = await supabase
      .from('purchases')
      .delete()
      .eq('id', purchaseId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Purchase deleted successfully' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete purchase';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
