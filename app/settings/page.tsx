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

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            Official Meta WhatsApp Business Cloud API
          </h2>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Connection Status:</span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  whatsappStatus?.statusText === 'Connected'
                    ? 'bg-emerald-100 text-emerald-800'
                    : whatsappStatus?.statusText === 'Mock Mode'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {whatsappStatus?.statusText || 'Checking...'}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              {whatsappStatus?.message || 'Meta Cloud API configured via environment variables.'}
            </p>

            <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-200">
              🔒 <em>Security note:</em> WhatsApp access tokens and secrets are stored in secure backend environment variables (<code className="text-slate-600 font-mono">.env.local</code>) and are never exposed in browser code.
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
