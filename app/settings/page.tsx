'use client';

import React, { useState, useEffect } from 'react';
import {
  Save,
  Building,
  QrCode,
  Bell,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Send,
} from 'lucide-react';
import { PharmacySettings } from '@/lib/types';
import { WhatsAppProviderStatus } from '@/lib/whatsapp/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<PharmacySettings>({
    pharmacy_name: '',
    display_name: '',
    logo_url: '',
    payment_qr_url: '',
    upi_id: '',
    timezone: 'Asia/Kolkata',
    reminders_enabled: true,
    max_reminder_days: 30,
    reminder_frequency: 'daily',
  });

  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          setSettings({
            pharmacy_name: data.settings.pharmacy_name || '',
            display_name: data.settings.display_name || '',
            logo_url: data.settings.logo_url || '',
            payment_qr_url: data.settings.payment_qr_url || '',
            upi_id: data.settings.upi_id || '',
            timezone: data.settings.timezone || 'Asia/Kolkata',
            reminders_enabled: data.settings.reminders_enabled ?? true,
            max_reminder_days: data.settings.max_reminder_days || 30,
            reminder_frequency: data.settings.reminder_frequency || 'daily',
          });
        }
        if (data?.whatsappStatus) {
          setWhatsappStatus(data.whatsappStatus);
        }
      })
      .catch((err) => {
        setErrorMessage('Failed to load settings.');
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save settings.');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings.';
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
        <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
        <span>Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Application Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Configure pharmacy branding, UPI payment details, reminder policies, and WhatsApp integration status.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-semibold">Settings updated successfully!</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building className="w-4 h-4 text-emerald-600" />
            Pharmacy Branding & Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pharmacy Name *
              </label>
              <input
                type="text"
                required
                value={settings.pharmacy_name}
                onChange={(e) => setSettings({ ...settings, pharmacy_name: e.target.value })}
                placeholder="e.g. HealthPlus Pharmacy"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Display Title *
              </label>
              <input
                type="text"
                required
                value={settings.display_name}
                onChange={(e) => setSettings({ ...settings, display_name: e.target.value })}
                placeholder="e.g. Purchase Summary Manager"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
            <QrCode className="w-4 h-4 text-emerald-600" />
            UPI & Payment Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                UPI ID (VPA)
              </label>
              <input
                type="text"
                value={settings.upi_id || ''}
                onChange={(e) => setSettings({ ...settings, upi_id: e.target.value })}
                placeholder="e.g. healthplus@okhdfcbank"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Shown on Purchase Summaries and included in WhatsApp messages.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment QR Code Image URL
              </label>
              <input
                type="text"
                value={settings.payment_qr_url || ''}
                onChange={(e) => setSettings({ ...settings, payment_qr_url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Static QR image displayed on printed and web summaries.
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
            <Bell className="w-4 h-4 text-emerald-600" />
            Daily Payment Reminder Policy
          </h2>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.reminders_enabled}
                onChange={(e) => setSettings({ ...settings, reminders_enabled: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <span className="text-sm font-semibold text-slate-800">
                Enable Automated Daily WhatsApp Reminders
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Maximum Reminder Duration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={settings.max_reminder_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      max_reminder_days: parseInt(e.target.value, 10) || 30,
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Reminders stop automatically once this age limit is reached or when payment is received.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Timezone
                </label>
                <input
                  type="text"
                  readOnly
                  value={settings.timezone}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Automated Gateway (UltraMsg) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              WhatsApp Automated Gateway (UltraMsg)
            </h2>
            
            {whatsappStatus?.statusText === 'Connected' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span>Connected ({whatsappStatus.phoneNumberId || 'instance193144'})</span>
              </span>
            ) : whatsappStatus?.message?.toLowerCase().includes('stopped') || whatsappStatus?.message?.toLowerCase().includes('non-payment') ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600" />
                <span>Stopped: Subscription Expired ({whatsappStatus?.phoneNumberId || 'instance193144'})</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-600" />
                <span>{whatsappStatus?.statusText || 'Checking Gateway...'}</span>
              </span>
            )}
          </div>

          {/* Subscription Expired Alert Banner */}
          {(whatsappStatus?.message?.toLowerCase().includes('stopped') || whatsappStatus?.message?.toLowerCase().includes('non-payment')) && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-start gap-2.5 text-rose-900">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-xs font-black uppercase tracking-wider text-rose-900">
                    UltraMsg Instance Stopped Due to Non-Payment
                  </h3>
                  <p className="text-xs text-rose-800 leading-relaxed">
                    Your UltraMsg automated gateway subscription for <strong className="font-mono">instance193144</strong> has expired. UltraMsg halts automated API messaging until the instance plan is extended. Payment updates on UltraMsg every 5 minutes.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <a
                  href="https://ultramsg.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                >
                  <span>Renew Subscription on UltraMsg.com</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch('/api/settings?t=' + Date.now());
                    const data = await res.json();
                    if (data?.whatsappStatus) {
                      setWhatsappStatus(data.whatsappStatus);
                      alert(data.whatsappStatus.statusText === 'Connected' ? '✅ UltraMsg is now active and connected!' : 'Status: ' + (data.whatsappStatus.message || 'Still stopped. Please allow 5 minutes after payment.'));
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recheck Connection</span>
                </button>
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Active Gateway Provider:</span>
              <span className="font-bold text-slate-900 font-mono">UltraMsg REST Gateway</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Instance ID:</span>
              <span className="font-bold text-slate-900 font-mono">instance193144</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Automated Dispatch Mode:</span>
              <span className="font-bold text-emerald-700">100% Fully Automated (Zero Manual Clicks)</span>
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                📲 Send Live Test WhatsApp Message
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="tel"
                  id="testPhoneInput"
                  placeholder="Enter 10-digit WhatsApp phone (e.g. 9698455732)"
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const input = document.getElementById('testPhoneInput') as HTMLInputElement;
                      const phone = input?.value?.trim();
                      if (!phone || phone.replace(/[^\d]/g, '').length < 10) {
                        alert('Please enter a valid 10-digit phone number.');
                        return;
                      }

                      const btn = document.getElementById('sendTestBtn') as HTMLButtonElement;
                      if (btn) btn.disabled = true;

                      try {
                        const res = await fetch('/api/whatsapp/send', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            to: phone,
                            message: `━━━━━━━━━━━━━━━━━━━━━━━\n🏥 *REVATHI MEDICALS & DISTRIBUTORS*\n✅ *WHATSAPP GATEWAY TEST SUCCESSFUL*\n━━━━━━━━━━━━━━━━━━━━━━━\n\nHello! This is a test message from your automated WhatsApp credit manager. Your UltraMsg Gateway (instance193144) is active and running perfectly!\n\nThank you! 🙏`,
                          }),
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          alert('✅ Test message sent successfully! Check WhatsApp on ' + phone);
                        } else {
                          const err = data.error || 'Check gateway connection';
                          if (err.toLowerCase().includes('stopped') || err.toLowerCase().includes('non-payment')) {
                            alert('❌ UltraMsg Instance Stopped: Your subscription has expired on UltraMsg.com.\n\nYou can renew your subscription at ultramsg.com, or use the "Open in WhatsApp Web" button next to this to send messages for free!');
                          } else {
                            alert('❌ Failed: ' + err);
                          }
                        }
                      } catch (e: any) {
                        alert('Error: ' + e.message);
                      } finally {
                        if (btn) btn.disabled = false;
                      }
                    }}
                    id="sendTestBtn"
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Test (UltraMsg)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('testPhoneInput') as HTMLInputElement;
                      const phone = input?.value?.trim();
                      if (!phone || phone.replace(/[^\d]/g, '').length < 10) {
                        alert('Please enter a valid 10-digit phone number.');
                        return;
                      }
                      const cleanPhone = phone.replace(/[^\d]/g, '').slice(-10);
                      const text = encodeURIComponent(`━━━━━━━━━━━━━━━━━━━━━━━\n🏥 *REVATHI MEDICALS & DISTRIBUTORS*\n✅ *WHATSAPP TEST MESSAGE*\n━━━━━━━━━━━━━━━━━━━━━━━\n\nHello! This is a test message from Revathi Medicals. WhatsApp messaging is working! 🙏`);
                      window.open(`https://wa.me/91${cleanPhone}?text=${text}`, '_blank');
                    }}
                    className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
                    title="100% Free fallback via WhatsApp Web or WhatsApp Business app"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
                    <span>Open in WhatsApp Web (Free)</span>
                  </button>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 block">
                UltraMsg sends automated messages in the background. WhatsApp Web is 100% free with zero monthly subscription cost.
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-60"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}
