import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppProvider } from '@/lib/whatsapp';
import { getPendingDaysCount } from '@/lib/utils';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
  return handleDailyReminders(request);
}

export async function POST(request: NextRequest) {
  return handleDailyReminders(request);
}

async function handleDailyReminders(request: NextRequest) {
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

    const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    const remindersEnabled = settings?.reminders_enabled ?? true;
    const maxReminderDays = settings?.max_reminder_days ?? 30;
    const pharmacyName = settings?.pharmacy_name || 'HealthPlus Pharmacy';
    const upiId = settings?.upi_id || null;
    const paymentQrUrl = settings?.payment_qr_url || null;

    if (!remindersEnabled) {
      return NextResponse.json({
        message: 'Daily reminders are currently disabled in settings',
        processed: 0,
      });
    }

    const { data: pendingPurchases, error: fetchErr } = await supabase
      .from('purchases')
      .select('*, customer:customers(*)')
      .eq('payment_status', 'PENDING');

    if (fetchErr) {
      throw fetchErr;
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const whatsappProvider = getWhatsAppProvider();
    const results = [];

    for (const purchase of pendingPurchases || []) {
      const pendingDays = getPendingDaysCount(purchase.purchase_date);

      if (pendingDays < 1 || pendingDays > maxReminderDays) {
        continue;
      }

      const { data: existingLog } = await supabase
        .from('reminder_logs')
        .select('id')
        .eq('purchase_id', purchase.id)
        .eq('reminder_date', todayStr)
        .eq('message_type', 'PAYMENT_REMINDER')
        .maybeSingle();

      if (existingLog) {
        continue;
      }

      const sendResult = await whatsappProvider.sendPaymentReminder({
        customerName: purchase.customer?.name || 'Customer',
        recipientPhone: purchase.customer?.whatsapp_number || '',
        purchaseId: purchase.id,
        purchaseDate: purchase.purchase_date,
        pendingDays,
        amountPending: Number(purchase.amount_payable),
        pharmacyName,
        upiId,
        paymentQrUrl,
      });

      await supabase.from('reminder_logs').insert({
        purchase_id: purchase.id,
        reminder_date: todayStr,
        pending_days: pendingDays,
        message_type: 'PAYMENT_REMINDER',
        whatsapp_message_id: sendResult.messageId || null,
        status: sendResult.success ? 'SENT' : 'FAILED',
        error_message: sendResult.error || null,
      });

      results.push({
        purchaseId: purchase.id,
        customer: purchase.customer?.name,
        pendingDays,
        success: sendResult.success,
        messageId: sendResult.messageId,
        error: sendResult.error,
      });
    }

    return NextResponse.json({
      success: true,
      executionTime: new Date().toISOString(),
      remindersSentCount: results.filter((r) => r.success).length,
      failuresCount: results.filter((r) => !r.success).length,
      details: results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cron execution failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
