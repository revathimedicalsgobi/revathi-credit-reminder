import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PharmacySettingsSchema } from '@/lib/validations';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: settings, error } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Settings GET warning:', error.message);
    }

    const whatsappProvider = getWhatsAppProvider();
    const whatsappStatus = await whatsappProvider.getStatus();

    return NextResponse.json({
      settings: settings || {
        pharmacy_name: 'Revathi Medicals & Distributors',
        display_name: 'Purchase Summary & Payment Manager',
        upi_id: 'revathimedicals@upi',
        timezone: 'Asia/Kolkata',
        reminders_enabled: true,
        max_reminder_days: 30,
        reminder_frequency: 'daily',
      },
      whatsappStatus,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch settings';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const validationResult = PharmacySettingsSchema.safeParse(body);
    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      const errorMsg = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs?.join(', ')}`)
        .join('; ');

      return NextResponse.json(
        {
          error: `Validation error: ${errorMsg}`,
          details: fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      pharmacy_name,
      display_name,
      logo_url,
      payment_qr_url,
      upi_id,
      timezone,
      reminders_enabled,
      max_reminder_days,
      reminder_frequency,
    } = validationResult.data;

    // Check if a row already exists in settings
    const { data: existing } = await supabase.from('settings').select('id').limit(1).maybeSingle();

    let updated;
    if (existing?.id) {
      const { data, error } = await supabase
        .from('settings')
        .update({
          pharmacy_name: pharmacy_name.trim(),
          display_name: display_name.trim(),
          logo_url: logo_url?.trim() || null,
          payment_qr_url: payment_qr_url?.trim() || null,
          upi_id: upi_id?.trim() || null,
          timezone: timezone || 'Asia/Kolkata',
          reminders_enabled: Boolean(reminders_enabled),
          max_reminder_days: Number(max_reminder_days) || 30,
          reminder_frequency: reminder_frequency || 'daily',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      updated = data;
    } else {
      const { data, error } = await supabase
        .from('settings')
        .insert({
          pharmacy_name: pharmacy_name.trim(),
          display_name: display_name.trim(),
          logo_url: logo_url?.trim() || null,
          payment_qr_url: payment_qr_url?.trim() || null,
          upi_id: upi_id?.trim() || null,
          timezone: timezone || 'Asia/Kolkata',
          reminders_enabled: Boolean(reminders_enabled),
          max_reminder_days: Number(max_reminder_days) || 30,
          reminder_frequency: reminder_frequency || 'daily',
        })
        .select()
        .single();

      if (error) throw error;
      updated = data;
    }

    return NextResponse.json({ success: true, settings: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update settings';
    console.error('Settings update error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
