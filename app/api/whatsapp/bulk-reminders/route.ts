import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computePurchasePaymentDetails } from '@/lib/payment-helpers';
import { sendWhatsAppGatewayMessage } from '@/lib/whatsapp-gateway';
import { buildWhatsAppReminderText, buildWhatsAppCustomerStatementText } from '@/lib/whatsapp-share';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const {
      customerIds,
      minDays = 0,
      minBalance = 1,
      previewOnly = false,
      delaySeconds = 3,
      instanceId,
      token,
    } = body;

    // 1. Fetch all pending purchases with customers and audit logs
    const { data: purchases, error: purchErr } = await supabase
      .from('purchases')
      .select(`
        *,
        customer:customers(*),
        items:purchase_items(*),
        audit_logs(*)
      `)
      .eq('payment_status', 'PENDING')
      .order('purchase_date', { ascending: true });

    if (purchErr) {
      return NextResponse.json({ error: purchErr.message }, { status: 500 });
    }

    // 2. Group pending bills by customer
    const customerMap = new Map<string, {
      customer: any;
      pendingBills: Array<any>;
      totalOutstanding: number;
      oldestPurchaseDate: string;
      maxPendingDays: number;
    }>();

    const now = new Date();

    for (const p of purchases || []) {
      if (!p.customer) continue;
      const custId = p.customer.id;

      // Filter by customerIds if specific list provided
      if (customerIds && Array.isArray(customerIds) && customerIds.length > 0 && !customerIds.includes(custId)) {
        continue;
      }

      const paymentDetails = computePurchasePaymentDetails(p, p.audit_logs || []);
      if (paymentDetails.balance_due <= 0) continue;

      const pDate = new Date(p.purchase_date);
      const diffTime = Math.abs(now.getTime() - pDate.getTime());
      const pendingDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (!customerMap.has(custId)) {
        customerMap.set(custId, {
          customer: p.customer,
          pendingBills: [],
          totalOutstanding: 0,
          oldestPurchaseDate: p.purchase_date,
          maxPendingDays: pendingDays,
        });
      }

      const custEntry = customerMap.get(custId)!;
      custEntry.pendingBills.push({
        ...p,
        balance_due: paymentDetails.balance_due,
        paid_amount: paymentDetails.paid_amount,
        pending_days: pendingDays,
      });
      custEntry.totalOutstanding += paymentDetails.balance_due;
      if (pendingDays > custEntry.maxPendingDays) {
        custEntry.maxPendingDays = pendingDays;
      }
    }

    // 3. Filter customers by minDays and minBalance
    const targetCustomers: Array<{
      customer: any;
      pendingBills: Array<any>;
      totalOutstanding: number;
      oldestPurchaseDate: string;
      maxPendingDays: number;
      messageText: string;
    }> = [];

    for (const entry of Array.from(customerMap.values())) {
      if (entry.totalOutstanding < minBalance) continue;
      if (entry.maxPendingDays < minDays) continue;

      // Generate message text
      let messageText = '';
      if (entry.pendingBills.length === 1) {
        const single = entry.pendingBills[0];
        messageText = buildWhatsAppReminderText({
          customerName: entry.customer.name,
          recipientPhone: entry.customer.whatsapp_number,
          purchaseDate: single.purchase_date,
          pendingDays: single.pending_days,
          amountPending: single.balance_due,
          totalBillAmount: single.amount_payable,
          paidAmount: single.paid_amount,
        });
      } else {
        messageText = buildWhatsAppCustomerStatementText({
          customerName: entry.customer.name,
          recipientPhone: entry.customer.whatsapp_number,
          totalPurchasesCount: entry.pendingBills.length,
          totalBilled: entry.pendingBills.reduce((s, b) => s + Number(b.amount_payable || 0), 0),
          totalPaid: entry.pendingBills.reduce((s, b) => s + Number(b.paid_amount || 0), 0),
          outstandingBalance: entry.totalOutstanding,
          pendingBills: entry.pendingBills.map((b) => ({
            date: b.purchase_date,
            amount: b.balance_due,
          })),
        });
      }

      targetCustomers.push({
        ...entry,
        messageText,
      });
    }

    // If preview requested, return list with messages
    if (previewOnly) {
      return NextResponse.json({
        total: targetCustomers.length,
        customers: targetCustomers.map((c) => ({
          customerId: c.customer.id,
          name: c.customer.name,
          phone: c.customer.whatsapp_number,
          pendingBillsCount: c.pendingBills.length,
          totalOutstanding: c.totalOutstanding,
          maxPendingDays: c.maxPendingDays,
          messagePreview: c.messageText,
        })),
      });
    }

    // 4. Send messages sequentially with safe delay
    const results: Array<{
      customerId: string;
      customerName: string;
      phone: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

    const delayMs = Math.max(1000, delaySeconds * 1000);

    for (let i = 0; i < targetCustomers.length; i++) {
      const target = targetCustomers[i];
      const phone = target.customer.whatsapp_number;

      try {
        const sendRes = await sendWhatsAppGatewayMessage({
          to: phone,
          body: target.messageText,
          config: instanceId && token ? { instanceId, token } : undefined,
        });

        if (sendRes.success) {
          results.push({
            customerId: target.customer.id,
            customerName: target.customer.name,
            phone,
            success: true,
            messageId: sendRes.messageId,
          });

          // Log reminder to database for the purchases
          for (const bill of target.pendingBills) {
            await supabase.from('reminder_logs').insert({
              purchase_id: bill.id,
              recipient_number: phone,
              message_id: sendRes.messageId || 'gateway_bulk_auto',
              days_pending: bill.pending_days,
              amount_due: bill.balance_due,
              delivery_status: 'SENT',
            });
          }
        } else {
          results.push({
            customerId: target.customer.id,
            customerName: target.customer.name,
            phone,
            success: false,
            error: sendRes.error || 'Failed to dispatch via gateway',
          });
        }
      } catch (sendErr: any) {
        results.push({
          customerId: target.customer.id,
          customerName: target.customer.name,
          phone,
          success: false,
          error: sendErr?.message || 'Exception during sending',
        });
      }

      // Add safe throttle delay if not the last item
      if (i < targetCustomers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const sentCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      total: targetCustomers.length,
      sent: sentCount,
      failed: failedCount,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal error processing bulk reminders' },
      { status: 500 }
    );
  }
}
