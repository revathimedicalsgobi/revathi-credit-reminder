'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Trash2,
  User,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Camera,
  ScanLine,
  Calendar,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { calculatePurchaseSummary, formatINR } from '@/lib/calculations';
import { isValidWhatsAppNumber, normalizeWhatsAppNumber } from '@/lib/validations';
import { maskWhatsAppNumber } from '@/lib/utils';
import { PurchaseSummaryCard } from '@/components/PurchaseSummaryCard';
import { MedicineNameScannerModal, ScannerMode } from '@/components/MedicineNameScannerModal';
import { Purchase } from '@/lib/types';

interface ItemRow {
  id: string;
  itemName: string;
  quantity: string;
  mrp: string;
  discount: string;
}

function EditPurchaseContent() {
  const params = useParams();
  const router = useRouter();
  const purchaseId = params.id as string;

  // Pharmacy Branding Settings
  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');
  const [upiId, setUpiId] = useState<string | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [paidAmount, setPaidAmount] = useState<number>(0);

  // UI state
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Scanner Modal state
  const [scannerModal, setScannerModal] = useState<{ isOpen: boolean; itemIndex: number; mode: ScannerMode }>({
    isOpen: false,
    itemIndex: 0,
    mode: 'all',
  });

  const handleOpenScanner = (index: number, mode: ScannerMode = 'all') => {
    setScannerModal({ isOpen: true, itemIndex: index, mode });
  };

  const handleScannedValue = (scannedValue: string, scannedMode: ScannerMode) => {
    const targetIndex = scannerModal.itemIndex;
    if (targetIndex >= 0 && targetIndex < items.length) {
      const targetId = items[targetIndex].id;
      if (scannedMode === 'name') {
        handleItemChange(targetId, 'itemName', scannedValue);
      } else if (scannedMode === 'mrp') {
        handleItemChange(targetId, 'mrp', scannedValue);
      }

      setTimeout(() => {
        const qtyInput = document.getElementById(`qty-input-${targetIndex}`) as HTMLInputElement | null;
        if (qtyInput) {
          qtyInput.focus();
          qtyInput.select();
        }
      }, 150);
    }
    setScannerModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleSelectBothValues = (brandName: string, mrp: string) => {
    const targetIndex = scannerModal.itemIndex;
    if (targetIndex >= 0 && targetIndex < items.length) {
      const targetId = items[targetIndex].id;
      setItems((prevItems) =>
        prevItems.map((item) => {
          if (item.id === targetId) {
            return {
              ...item,
              itemName: brandName || item.itemName,
              mrp: mrp || item.mrp,
            };
          }
          return item;
        })
      );

      setTimeout(() => {
        const qtyInput = document.getElementById(`qty-input-${targetIndex}`) as HTMLInputElement | null;
        if (qtyInput) {
          qtyInput.focus();
          qtyInput.select();
        }
      }, 150);
    }
    setScannerModal((prev) => ({ ...prev, isOpen: false }));
  };

  // Fetch settings for branding
  useEffect(() => {
    fetch('/api/settings?t=' + Date.now(), { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          if (data.settings.pharmacy_name) setPharmacyName(data.settings.pharmacy_name);
          if (data.settings.upi_id) setUpiId(data.settings.upi_id);
          if (data.settings.payment_qr_url) setPaymentQrUrl(data.settings.payment_qr_url);
        }
      })
      .catch((err) => console.error('Failed to load settings:', err));
  }, []);

  // Fetch existing purchase details to edit
  const fetchPurchaseDetails = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/purchases/${purchaseId}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok || !data.purchase) {
        throw new Error(data?.error || 'Failed to load purchase details');
      }

      const p: Purchase = data.purchase;
      setCustomerName(p.customer?.name || '');
      setWhatsappNumber(p.customer?.whatsapp_number || '');
      setPaidAmount(Number(p.paid_amount || 0));

      if (p.purchase_date) {
        // Format for HTML date input: YYYY-MM-DD
        const d = new Date(p.purchase_date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setPurchaseDate(`${yyyy}-${mm}-${dd}`);
      }

      if (p.items && p.items.length > 0) {
        const loadedRows: ItemRow[] = p.items.map((it, idx) => {
          const qty = Number(it.quantity) || 1;
          const mrp = Number(it.mrp) || 0;
          const gross = qty * mrp;
          const discAmt = Number(it.discount) || 0;
          const discPercent = gross > 0 && discAmt > 0 ? Math.round((discAmt / gross) * 100 * 10) / 10 : 0;

          return {
            id: it.id || `item_loaded_${idx}_${Date.now()}`,
            itemName: it.item_name,
            quantity: String(it.quantity),
            mrp: String(it.mrp),
            discount: String(discPercent),
          };
        });
        setItems(loadedRows);
      } else {
        setItems([
          { id: 'item_initial_1', itemName: '', quantity: '1', mrp: '', discount: '0' },
        ]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch purchase details';
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  useEffect(() => {
    fetchPurchaseDetails();
  }, [fetchPurchaseDetails]);

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

  const remainingBalanceDue = Math.max(0, calculation.amount_payable - paidAmount);

  // Item row handlers
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

  // Submit updated bill
  const handleSubmit = async (e: React.FormEvent) => {
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

    const validItems = items.filter((it) => it.itemName.trim() && Number(it.mrp) > 0);
    if (validItems.length === 0) {
      setFormError('Please add at least one item with a valid name and MRP.');
      return;
    }

    for (const it of items) {
      const discPercent = Number(it.discount) || 0;
      if (discPercent < 0 || discPercent > 100) {
        setFormError(`Discount percentage on "${it.itemName || 'item'}" must be between 0% and 100%.`);
        return;
      }
    }

    setIsProcessing(true);

    try {
      const payload = {
        customer_name: customerName.trim(),
        whatsapp_number: whatsappNumber.trim(),
        purchase_date: purchaseDate ? new Date(purchaseDate).toISOString() : undefined,
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

      const res = await fetch(`/api/purchases/${purchaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update bill');
      }

      router.push(`/purchases/${purchaseId}?updated=true`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while updating bill';
      setFormError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
        <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
        <span>Loading bill details for editing...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/purchases/${purchaseId}`}
            className="p-2 rounded-xl border border-slate-200 hover:bg-white text-slate-600 transition-colors"
            title="Cancel and return to purchase summary"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Edit Purchase Bill
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Modify customer details, change items, adjust discounts, and recalculate totals.
            </p>
          </div>
        </div>
      </div>

      {paidAmount > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl text-orange-900 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-orange-600 flex-shrink-0" />
            <span>
              <strong>Partial Payments Notice:</strong> This bill already has{' '}
              <strong>{formatINR(paidAmount)}</strong> in recorded payments. New remaining balance will automatically adjust.
            </span>
          </div>
        </div>
      )}

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
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Customer Section */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                Customer & Bill Details
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ravi Kumar"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp Number *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bill Date
                  </label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* 2. Purchase Items Section */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Bill Items ({items.length})
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
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-semibold text-slate-600">
                              Item Name #{index + 1}
                            </label>
                            <button
                              type="button"
                              onClick={() => handleOpenScanner(index, 'name')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-emerald-800 bg-emerald-100/90 hover:bg-emerald-200 border border-emerald-300 rounded-md shadow-2xs cursor-pointer"
                              title="Auto-scan tablet name with camera"
                            >
                              <Camera className="w-3 h-3 text-emerald-700" />
                              <span>Scan Name</span>
                            </button>
                          </div>
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
                            id={`qty-input-${index}`}
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
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-semibold text-slate-600">
                              MRP (₹)
                            </label>
                            <button
                              type="button"
                              onClick={() => handleOpenScanner(index, 'mrp')}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 bg-sky-100/90 hover:bg-sky-200 border border-sky-300 rounded-md shadow-2xs cursor-pointer"
                              title="Auto-scan MRP price from strip"
                            >
                              <ScanLine className="w-3 h-3 text-sky-700" />
                              <span>Scan MRP</span>
                            </button>
                          </div>
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

            {/* 3. WhatsApp Re-send & Save CTA */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Send updated Purchase Summary via WhatsApp after saving
                </span>
              </label>

              <div className="flex items-center gap-3">
                <Link
                  href={`/purchases/${purchaseId}`}
                  className="w-1/3 py-3.5 px-4 text-center rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </Link>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-2/3 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-base font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-60"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>SAVE CHANGES ({formatINR(calculation.amount_payable)})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: Live Calculation Preview */}
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
              purchaseDate={purchaseDate ? new Date(purchaseDate) : new Date()}
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
              paidAmount={paidAmount}
              balanceDue={remainingBalanceDue}
              paymentStatus={remainingBalanceDue <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING'}
              upiId={upiId}
              paymentQrUrl={paymentQrUrl}
              showPrintButton={false}
              showShareActions={false}
            />
          </div>
        </div>
      </div>

      {/* Medicine / Tablet Name & MRP Camera Scanner Modal */}
      <MedicineNameScannerModal
        isOpen={scannerModal.isOpen}
        onClose={() => setScannerModal((prev) => ({ ...prev, isOpen: false }))}
        onSelectScannedValue={handleScannedValue}
        onSelectBothValues={handleSelectBothValues}
        itemIndex={scannerModal.itemIndex}
        initialMode={scannerModal.mode}
      />
    </div>
  );
}

export default function EditPurchasePage() {
  return (
    <React.Suspense
      fallback={
        <div className="py-24 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
          <span>Loading editor...</span>
        </div>
      }
    >
      <EditPurchaseContent />
    </React.Suspense>
  );
}
