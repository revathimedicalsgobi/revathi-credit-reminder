'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  Trash2,
  User,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Users,
  UserPlus,
  CheckCircle2,
  BookmarkPlus,
} from 'lucide-react';
import { calculatePurchaseSummary, formatINR } from '@/lib/calculations';
import { isValidWhatsAppNumber, normalizeWhatsAppNumber } from '@/lib/validations';
import { PurchaseSummaryCard } from '@/components/PurchaseSummaryCard';
import { ProcessPurchaseModal } from '@/components/ProcessPurchaseModal';

interface ItemRow {
  id: string;
  itemName: string;
  quantity: string;
  mrp: string;
  discount: string;
}

interface SavedCustomer {
  id: string;
  name: string;
  whatsapp_number: string;
  outstanding_balance: number;
}

function NewPurchaseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pharmacy Branding Settings
  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');
  const [upiId, setUpiId] = useState<string | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);

  // Saved Customers List
  const [savedCustomers, setSavedCustomers] = useState<SavedCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);

  // Customer Form State
  const [customerName, setCustomerName] = useState(searchParams.get('name') || '');
  const [whatsappNumber, setWhatsappNumber] = useState(searchParams.get('phone') || '');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);

  // Instant Save to Master state
  const [isSavingToMaster, setIsSavingToMaster] = useState(false);
  const [saveToMasterMessage, setSaveToMasterMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Item Rows State with unique IDs
  const [items, setItems] = useState<ItemRow[]>([
    { id: 'item_initial_1', itemName: '', quantity: '1', mrp: '', discount: '0' },
  ]);

  // UI state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch saved customers list
  const fetchSavedCustomers = useCallback(async () => {
    try {
      setIsLoadingCustomers(true);
      const res = await fetch(`/api/customers?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data?.customers) {
        setSavedCustomers(data.customers);
      }
    } catch (err) {
      console.error('Failed to load saved customers:', err);
    } finally {
      setIsLoadingCustomers(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedCustomers();
  }, [fetchSavedCustomers]);

  // Auto-populate from URL query params if user clicked "+ Bill" from customer master
  useEffect(() => {
    const paramName = searchParams.get('name');
    const paramPhone = searchParams.get('phone');
    const paramId = searchParams.get('customerId');
    if (paramName && !customerName) setCustomerName(paramName);
    if (paramPhone && !whatsappNumber) setWhatsappNumber(paramPhone);
    if (paramId) setSelectedCustomerId(paramId);
  }, [searchParams, customerName, whatsappNumber]);

  // Handle Dropdown Selection of Saved Customer
  const handleSelectSavedCustomer = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedCustomerId(val);
    setSaveToMasterMessage(null);

    if (!val || val === 'NEW') {
      if (val === 'NEW') {
        setCustomerName('');
        setWhatsappNumber('');
      }
      return;
    }

    const matched = savedCustomers.find((c) => c.id === val);
    if (matched) {
      setCustomerName(matched.name);
      setWhatsappNumber(matched.whatsapp_number);
    }
  };

  // Check if current name/phone matches an existing customer
  const matchedCustomer = useMemo(() => {
    if (!whatsappNumber.trim()) return null;
    const cleanCurrent = normalizeWhatsAppNumber(whatsappNumber);
    return savedCustomers.find(
      (c) => normalizeWhatsAppNumber(c.whatsapp_number) === cleanCurrent
    );
  }, [whatsappNumber, savedCustomers]);

  // Instant Save to Master handler
  const handleSaveToMasterNow = async () => {
    if (!customerName.trim()) {
      setSaveToMasterMessage({ type: 'error', text: 'Please enter customer name first' });
      return;
    }
    if (!isValidWhatsAppNumber(whatsappNumber)) {
      setSaveToMasterMessage({ type: 'error', text: 'Please enter a valid 10-digit WhatsApp number' });
      return;
    }

    setIsSavingToMaster(true);
    setSaveToMasterMessage(null);

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customerName.trim(),
          whatsapp_number: whatsappNumber.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save customer');
      }

      setSaveToMasterMessage({
        type: 'success',
        text: `✓ "${customerName.trim()}" saved to Customer Master!`,
      });

      // Refresh customers and select the new customer
      await fetchSavedCustomers();
      if (data?.customer?.id) {
        setSelectedCustomerId(data.customer.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save customer';
      setSaveToMasterMessage({ type: 'error', text: msg });
    } finally {
      setIsSavingToMaster(false);
    }
  };

  // Fetch saved settings for branding
  useEffect(() => {
    fetch('/api/settings?t=' + Date.now(), { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          if (data.settings.pharmacy_name) {
            setPharmacyName(data.settings.pharmacy_name);
          }
          if (data.settings.upi_id) {
            setUpiId(data.settings.upi_id);
          }
          if (data.settings.payment_qr_url) {
            setPaymentQrUrl(data.settings.payment_qr_url);
          }
        }
      })
      .catch((err) => console.error('Failed to load settings in new purchase page:', err));
  }, []);

  // Real-time calculation engine with Round-off
  const calculation = useMemo(() => {
    const formatted = items.map((it) => ({
      item_name: it.itemName,
      quantity: Number(it.quantity) || 0,
      mrp: Number(it.mrp) || 0,
      discount_percent: Number(it.discount) || 0,
    }));
    return calculatePurchaseSummary(formatted);
  }, [items]);

  // Item row handlers with unique IDs
  const handleAddItem = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const newId = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    setItems((prev) => [
      ...prev,
      { id: newId, itemName: '', quantity: '1', mrp: '', discount: '0' },
    ]);
  };

  const handleRemoveItem = (idToRemove: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== idToRemove));
  };

  const handleItemChange = (id: string, field: keyof Omit<ItemRow, 'id'>, value: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  };

  // Validate before showing confirmation modal
  const handleOpenProcessModal = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customerName.trim()) {
      setFormError('Please enter customer name.');
      return;
    }

    if (!isValidWhatsAppNumber(whatsappNumber)) {
      setFormError('Please enter a valid WhatsApp number (e.g. 9876543210 or +919876543210).');
      return;
    }

    // Check items
    const validItems = items.filter((it) => it.itemName.trim() && Number(it.mrp) > 0);
    if (validItems.length === 0) {
      setFormError('Please add at least one item with a valid name and MRP.');
      return;
    }

    // Check discount percentage validity (0% to 100%)
    for (const it of items) {
      const discPercent = Number(it.discount) || 0;
      if (discPercent < 0 || discPercent > 100) {
        setFormError(`Discount percentage on "${it.itemName || 'item'}" must be between 0% and 100%.`);
        return;
      }
    }

    setShowConfirmModal(true);
  };

  // Submit purchase to backend API
  const handleProcessPurchase = async () => {
    setIsProcessing(true);
    setFormError(null);

    try {
      const payload = {
        customer_name: customerName.trim(),
        whatsapp_number: whatsappNumber.trim(),
        send_whatsapp: sendWhatsApp,
        items: items
          .filter((it) => it.itemName.trim())
          .map((it) => ({
            item_name: it.itemName.trim(),
            quantity: Math.max(1, Number(it.quantity) || 1),
            mrp: Math.max(0, Number(it.mrp) || 0),
            discount: Math.min(100, Math.max(0, Number(it.discount) || 0)),
          })),
      };

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to process purchase.');
      }

      setShowConfirmModal(false);
      router.push(`/purchases/${data.purchaseId}?created=true`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while creating purchase.';
      setFormError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Record New Purchase
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Enter purchase items, auto-calculate summary, and send WhatsApp reminder.
          </p>
        </div>
      </div>

      {formError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="font-semibold">{formError}</span>
        </div>
      )}

      {/* Grid: 2 Columns on desktop (Form on left, Live Purchase Summary Preview on right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Purchase Entry Form */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleOpenProcessModal} className="space-y-6">
            {/* 1. Customer Section */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-600" />
                  Customer Details
                </h2>

                {matchedCustomer && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Saved Customer {matchedCustomer.outstanding_balance > 0 ? `(Due: ${formatINR(matchedCustomer.outstanding_balance)})` : `(Settled)`}</span>
                  </span>
                )}
              </div>

              {/* Saved Customers Dropdown Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Select Saved Customer (Dropdown)</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal lowercase">
                    {savedCustomers.length} saved in Master
                  </span>
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={handleSelectSavedCustomer}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-2xs font-medium text-slate-800"
                >
                  <option value="">-- Choose from Saved Customers ({savedCustomers.length}) or type below --</option>
                  {savedCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.whatsapp_number}) {c.outstanding_balance > 0 ? `— Due: ${formatINR(c.outstanding_balance)}` : '— Settled'}
                    </option>
                  ))}
                  <option value="NEW">+ Enter New Customer Manually</option>
                </select>
              </div>

              {/* Customer Name & WhatsApp Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ravi Kumar"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        setSaveToMasterMessage(null);
                      }}
                      className="w-full pl-3 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp Number *
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210 or +91..."
                      value={whatsappNumber}
                      onChange={(e) => {
                        setWhatsappNumber(e.target.value);
                        setSaveToMasterMessage(null);
                      }}
                      className="w-full pl-3 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white font-mono"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Normalized: {whatsappNumber ? normalizeWhatsAppNumber(whatsappNumber) : '+91...'}
                  </span>
                </div>
              </div>

              {/* New Customer Detected Prompt & Save Button */}
              {!matchedCustomer && customerName.trim() && whatsappNumber.trim() && (
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-start gap-2 text-xs text-blue-900">
                    <UserPlus className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">New Customer Detected: </span>
                      <span className="text-slate-700">
                        &quot;{customerName.trim()}&quot; is not saved in Customer Master.
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveToMasterNow}
                    disabled={isSavingToMaster}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-60 whitespace-nowrap"
                  >
                    {isSavingToMaster ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Save to Master Now</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Save Feedback Banner */}
              {saveToMasterMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 border animate-in fade-in ${
                    saveToMasterMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {saveToMasterMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{saveToMasterMessage.text}</span>
                </div>
              )}
            </div>

            {/* 2. Purchase Items Section */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Purchase Items ({items.length})
                </h2>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Item</span>
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {items.map((item, index) => {
                  const qty = Math.max(0, Number(item.quantity) || 0);
                  const mrp = Math.max(0, Number(item.mrp) || 0);
                  const discPercent = Math.min(100, Math.max(0, Number(item.discount) || 0));
                  const itemGross = qty * mrp;
                  const itemDiscountAmt = Math.round((itemGross * (discPercent / 100)) * 100) / 100;
                  const itemNet = Math.max(0, itemGross - itemDiscountAmt);

                  return (
                    <div
                      key={item.id}
                      className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 transition-all hover:border-emerald-200"
                    >
                      <div className="grid grid-cols-12 gap-3 items-center">
                        {/* Item Name */}
                        <div className="col-span-12 sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Item Name #{index + 1}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Paracetamol 500mg"
                            value={item.itemName}
                            onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                          />
                        </div>

                        {/* Quantity */}
                        <div className="col-span-4 sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Qty
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-center font-semibold"
                          />
                        </div>

                        {/* MRP */}
                        <div className="col-span-4 sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            MRP (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            placeholder="100.00"
                            value={item.mrp}
                            onChange={(e) => handleItemChange(item.id, 'mrp', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-right font-semibold"
                          />
                        </div>

                        {/* Discount (%) */}
                        <div className="col-span-4 sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                            <span>Discount</span>
                            <span className="text-rose-600 font-bold">(%)</span>
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              placeholder="0"
                              value={item.discount}
                              onChange={(e) => handleItemChange(item.id, 'discount', e.target.value)}
                              className="w-full pl-2 pr-6 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-right text-rose-600 font-semibold"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-rose-500 font-bold pointer-events-none">
                              %
                            </span>
                          </div>
                        </div>

                        {/* Remove Action */}
                        <div className="col-span-12 sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            disabled={items.length <= 1}
                            onClick={(e) => handleRemoveItem(item.id, e)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30 transition-colors"
                            title="Remove Item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Row calculated subtotal */}
                      <div className="flex justify-between items-center text-xs text-slate-500 pt-2 border-t border-slate-200/60">
                        <span>Gross: {formatINR(itemGross)}</span>
                        {discPercent > 0 && (
                          <span className="text-rose-600 font-medium">
                            Discount ({discPercent}%): -{formatINR(itemDiscountAmt)}
                          </span>
                        )}
                        <span className="font-bold text-slate-800">
                          Net: {formatINR(itemNet)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Add Row Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full py-2.5 border-2 border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50/50 text-emerald-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Another Item Row</span>
                </button>
              </div>
            </div>

            {/* 3. Delivery Option & Process CTA */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Send Purchase Summary via WhatsApp upon confirmation
                </span>
              </label>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-base font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-lg shadow-emerald-600/30 transition-all transform hover:-translate-y-0.5"
              >
                <Sparkles className="w-5 h-5" />
                <span>PROCESS PURCHASE ({formatINR(calculation.amount_payable)})</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Colorful Purchase Summary Card Preview */}
        <div className="lg:col-span-5 space-y-4">
          <div className="sticky top-20">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Live Preview
              </span>
              <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                Auto-calculated
              </span>
            </div>

            <PurchaseSummaryCard
              pharmacyName={pharmacyName}
              customerName={customerName || 'Customer'}
              whatsappNumber={whatsappNumber ? normalizeWhatsAppNumber(whatsappNumber) : ''}
              purchaseDate={new Date()}
              items={calculation.items.map((i) => ({
                itemName: i.item_name,
                quantity: i.quantity,
                mrp: i.mrp,
                discount_percent: i.discount_percent,
                discount_amount: i.discount_amount,
                grossAmount: i.gross_amount,
                netAmount: i.net_amount,
              }))}
              grossTotal={calculation.gross_total}
              totalDiscount={calculation.total_discount}
              roundOff={calculation.round_off}
              amountPayable={calculation.amount_payable}
              paymentStatus="PENDING"
              upiId={upiId}
              paymentQrUrl={paymentQrUrl}
              showPrintButton={true}
            />
          </div>
        </div>
      </div>

      {/* Process Purchase Confirmation Modal */}
      <ProcessPurchaseModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleProcessPurchase}
        customerName={customerName || 'Customer'}
        whatsappNumber={normalizeWhatsAppNumber(whatsappNumber)}
        amountPayable={calculation.amount_payable}
        sendWhatsApp={sendWhatsApp}
        isProcessing={isProcessing}
        errorMessage={formError}
      />
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <React.Suspense
      fallback={
        <div className="py-24 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
          <span>Loading purchase form...</span>
        </div>
      }
    >
      <NewPurchaseContent />
    </React.Suspense>
  );
}
