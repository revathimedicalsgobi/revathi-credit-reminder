'use client';

import React, { useState } from 'react';
import { formatINR } from '@/lib/calculations';
import { formatShortDate, numberToIndianRupeeWords } from '@/lib/utils';
import { PaymentStatusBadge } from '@/components/StatusBadge';
import { PaymentStatus } from '@/lib/types';
import { Printer, QrCode, ShieldCheck, Download, MessageCircle, Check } from 'lucide-react';
import {
  buildWhatsAppSummaryText,
  getWhatsAppDirectUrl,
  downloadReceiptAsJpeg,
  copyReceiptImageToClipboard,
} from '@/lib/whatsapp-share';

export interface PurchaseSummaryItem {
  itemName: string;
  quantity: number;
  mrp: number;
  discount?: number;
  discount_percent?: number;
  discount_amount?: number;
  grossAmount?: number;
  netAmount: number;
}

interface PurchaseSummaryCardProps {
  pharmacyName?: string;
  customerName: string;
  whatsappNumber?: string;
  purchaseDate: string | Date;
  items: PurchaseSummaryItem[];
  grossTotal: number;
  totalDiscount: number;
  roundOff?: number;
  amountPayable: number;
  paymentStatus: PaymentStatus;
  upiId?: string | null;
  paymentQrUrl?: string | null;
  showPrintButton?: boolean;
  showShareActions?: boolean;
  cardId?: string;
  className?: string;
}

export function PurchaseSummaryCard({
  pharmacyName = 'Revathi Medicals & Distributors',
  customerName,
  whatsappNumber,
  purchaseDate,
  items,
  grossTotal,
  totalDiscount,
  roundOff = 0,
  amountPayable,
  paymentStatus,
  upiId,
  paymentQrUrl,
  showPrintButton = true,
  showShareActions = true,
  cardId = 'purchase-summary-card-capture',
  className = '',
}: PurchaseSummaryCardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJpeg = async () => {
    const cardEl = document.getElementById(cardId);
    if (!cardEl) return;
    try {
      setIsExporting(true);
      const safeName = (customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
      await downloadReceiptAsJpeg(cardEl, `Purchase_${safeName}_${Date.now()}.jpg`);
      setToastMsg('Receipt JPEG downloaded successfully!');
      setTimeout(() => setToastMsg(null), 4000);
    } catch (err) {
      console.error(err);
      setToastMsg('Failed to generate image');
    } finally {
      setIsExporting(false);
    }
  };

  const handleWhatsAppWebDirect = async () => {
    const cardEl = document.getElementById(cardId);
    const phone = whatsappNumber || '';

    // 1. Build message text (polite greeting with total only)
    const textMsg = buildWhatsAppSummaryText({
      customerName,
      recipientPhone: phone,
      purchaseDate,
      items,
      grossTotal,
      totalDiscount,
      roundOff,
      amountPayable,
      pharmacyName,
      upiId,
    });

    // 2. Download JPEG and try copy to clipboard
    if (cardEl) {
      try {
        setIsExporting(true);
        const safeName = (customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
        await downloadReceiptAsJpeg(cardEl, `Bill_${safeName}.jpg`);
        const copied = await copyReceiptImageToClipboard(cardEl);
        if (copied) {
          setCopiedSuccess(true);
          setTimeout(() => setCopiedSuccess(false), 5000);
        }
      } catch (e) {
        console.warn('Image capture notice:', e);
      } finally {
        setIsExporting(false);
      }
    }

    // 3. Open WhatsApp Web / App
    const chatUrl = getWhatsAppDirectUrl(phone, textMsg);
    window.open(chatUrl, '_blank', 'noopener,noreferrer');

    setToastMsg('WhatsApp opened! Bill JPEG downloaded. Press Ctrl+V in WhatsApp to paste image!');
    setTimeout(() => setToastMsg(null), 6000);
  };

  const amountInWords = numberToIndianRupeeWords(amountPayable);

  return (
    <div className="space-y-3">
      {/* Toast Notification for manual actions */}
      {toastMsg && (
        <div className="no-print p-3 bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-between shadow-md animate-in fade-in">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-200" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-emerald-200 hover:text-white font-bold text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Main Card (Rendered & Captured as JPEG) */}
      <div
        id={cardId}
        className={`bg-white rounded-3xl border-2 border-slate-200 shadow-xl overflow-hidden print-container text-slate-900 ${className}`}
      >
        {/* Top Brand Banner */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 px-6 py-5 text-white text-center relative shadow-sm">
          <div className="inline-flex items-center justify-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-emerald-300" />
            <h2 className="text-xl sm:text-2xl font-black tracking-wide uppercase">
              {pharmacyName}
            </h2>
          </div>
          <p className="text-xs sm:text-sm font-extrabold tracking-widest text-emerald-200 uppercase">
            PURCHASE SUMMARY
          </p>

          {/* Top Quick Print Action */}
          {showPrintButton && (
            <button
              onClick={handlePrint}
              type="button"
              className="no-print absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold backdrop-blur-sm transition-all shadow-sm"
              title="Print Purchase Summary"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
          )}
        </div>

        {/* Customer Details Header (with Highlighted Customer Name) */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Customer Name:
              </span>
              <span className="text-base sm:text-lg font-black text-emerald-950 bg-emerald-100/90 border border-emerald-300 px-3 py-0.5 rounded-lg shadow-2xs">
                {customerName || 'Customer'}
              </span>
            </div>
            {whatsappNumber && (
              <div className="text-xs text-slate-600 font-mono font-medium flex items-center gap-1">
                <span className="text-slate-400 font-sans">WhatsApp:</span>
                <span>{whatsappNumber}</span>
              </div>
            )}
          </div>

          <div className="text-left sm:text-right space-y-1">
            <span className="text-xs text-slate-500 font-semibold block">
              {formatShortDate(purchaseDate)}
            </span>
            <div className="inline-block">
              <PaymentStatusBadge status={paymentStatus} />
            </div>
          </div>
        </div>

        {/* Purchase Items List (Matching Reference Format with Highlighted Discount %) */}
        <div className="px-6 py-5 divide-y divide-slate-200">
          {items.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm italic">
              No items added yet.
            </div>
          ) : (
            items.map((item, idx) => {
              const qty = item.quantity || 1;
              const mrp = item.mrp || 0;
              const gross = item.grossAmount ?? (qty * mrp);
              const net = item.netAmount;
              const discAmt = item.discount_amount !== undefined ? item.discount_amount : (item.discount || 0);
              
              // Calculate actual discount percentage (e.g. 18%)
              const discPercent = item.discount_percent !== undefined
                ? item.discount_percent
                : (gross > 0 && discAmt > 0 ? Math.round((discAmt / gross) * 100 * 10) / 10 : 0);

              return (
                <div key={idx} className="py-4 first:pt-1 last:pb-1 space-y-2">
                  {/* Item Name Header */}
                  <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    {item.itemName || `Item ${idx + 1}`}
                  </div>

                  {/* Item Details Grid */}
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: Qty, MRP, Discount % */}
                    <div className="flex items-center gap-4 sm:gap-6 text-xs">
                      <div>
                        <span className="text-slate-400 block font-semibold uppercase text-[10px]">QTY</span>
                        <span className="text-sm font-black text-slate-900">{qty}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-semibold uppercase text-[10px]">MRP</span>
                        <span className="text-sm font-bold text-slate-800">{formatINR(mrp)}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-semibold uppercase text-[10px]">DISC (%)</span>
                        {discPercent > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-500 text-white font-black text-xs shadow-xs">
                            {discPercent}%
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold text-xs">—</span>
                        )}
                      </div>
                    </div>

                    {/* Right: Total Gross & Net Total */}
                    <div className="text-right space-y-0.5">
                      {discPercent > 0 && (
                        <div className="text-xs text-slate-400 line-through">
                          Total: {formatINR(gross)}
                        </div>
                      )}
                      <div className="text-base sm:text-lg font-black text-slate-950">
                        {formatINR(net)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Financial Subtotals & Savings */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span className="font-medium">Gross Total:</span>
            <span className="font-bold text-slate-900 text-sm">{formatINR(grossTotal)}</span>
          </div>

          {totalDiscount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span className="font-bold">Total Discount Savings:</span>
              <span className="font-extrabold text-sm">-{formatINR(totalDiscount)}</span>
            </div>
          )}

          {Math.abs(roundOff) > 0.001 && (
            <div className="flex justify-between text-slate-500">
              <span>Round Off:</span>
              <span className="font-semibold">
                {roundOff > 0 ? `+${formatINR(roundOff)}` : `-${formatINR(Math.abs(roundOff))}`}
              </span>
            </div>
          )}
        </div>

        {/* BOX SHAPE FOR GRAND TOTAL (As requested) */}
        <div className="px-6 py-5 bg-white border-t border-slate-200">
          <div className="border-3 border-emerald-600 bg-gradient-to-br from-emerald-50 via-teal-50/60 to-emerald-100/70 rounded-2xl p-5 text-center shadow-md">
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-emerald-900 block">
              GRAND TOTAL
            </span>
            <div className="text-3xl sm:text-4xl font-black text-emerald-800 tracking-tight my-1">
              {formatINR(amountPayable)}
            </div>
            <p className="text-xs sm:text-sm font-bold text-emerald-950/80 italic">
              {amountInWords}
            </p>
          </div>
        </div>

        {/* Large Scanable UPI QR Code Section */}
        {(upiId || paymentQrUrl) && (
          <div className="px-6 py-5 bg-gradient-to-b from-emerald-50/60 to-teal-50/40 border-t border-emerald-100 flex flex-col items-center justify-center text-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900 uppercase tracking-wider">
              <QrCode className="w-4 h-4 text-emerald-700" />
              <span>Scan to Pay via Any UPI App</span>
            </div>

            {paymentQrUrl && (
              <div className="p-3 bg-white rounded-2xl border-2 border-emerald-400 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={paymentQrUrl}
                  alt="Payment UPI QR Code"
                  className="w-40 h-40 object-contain rounded-xl"
                />
              </div>
            )}

            {upiId && (
              <div className="bg-white/90 backdrop-blur-sm border border-emerald-300 px-4 py-1.5 rounded-xl shadow-xs">
                <span className="text-[11px] text-slate-500 font-medium block">UPI ID:</span>
                <span className="text-sm font-mono font-black text-emerald-900 select-all">{upiId}</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Friendly Note */}
        <div className="px-6 py-3 bg-slate-50 text-center border-t border-slate-200">
          <p className="text-xs text-slate-500 font-semibold">
            Thank you for choosing {pharmacyName}! We appreciate your trust.
          </p>
        </div>
      </div>

      {/* Dedicated Share & Manual Send Actions Toolbar */}
      {showShareActions && (
        <div className="no-print bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleWhatsAppWebDirect}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
              title="Open customer chat on WhatsApp Web with summary preloaded & JPEG downloaded"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Open in WhatsApp Web</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJpeg}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
              title="Download high-resolution JPEG receipt image"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Generating...' : 'Download JPEG'}</span>
            </button>
          </div>

          {copiedSuccess && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Image Copied! Press Ctrl+V in WhatsApp
            </span>
          )}
        </div>
      )}
    </div>
  );
}

