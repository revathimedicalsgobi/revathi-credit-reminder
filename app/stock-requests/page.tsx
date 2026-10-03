'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Boxes,
  PlusCircle,
  Search,
  RefreshCw,
  Phone,
  MessageCircle,
  CheckCircle2,
  Clock,
  Package,
  PackageCheck,
  AlertCircle,
  Trash2,
  Edit2,
  X,
  Upload,
  Camera,
  Image as ImageIcon,
  ExternalLink,
  ReceiptText,
  Eye,
  Check,
} from 'lucide-react';
import { StockRequest, StockRequestStatus } from '@/lib/types';
import { formatShortDate, formatDisplayDate, maskWhatsAppNumber } from '@/lib/utils';
import { buildWhatsAppStockArrivalText, getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

export default function StockRequestsPage() {
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    requested: 0,
    arrived: 0,
    notified: 0,
    fulfilled: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REQUESTED' | 'ARRIVED' | 'NOTIFIED' | 'FULFILLED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<StockRequest | null>(null);
  const [arrivedModalItem, setArrivedModalItem] = useState<StockRequest | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form state
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [formQuantity, setFormQuantity] = useState('1');
  const [formNotes, setFormNotes] = useState('');
  const [formImageData, setFormImageData] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Existing Customers Autocomplete
  const [customerSuggestions, setCustomerSuggestions] = useState<Array<{ name: string; whatsapp_number: string }>>([]);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchStockRequests = useCallback(async () => {
    try {
      const filterParam = statusFilter === 'ALL' ? '' : `status=${statusFilter}`;
      const searchParam = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : '';
      const res = await fetch(`/api/stock-requests?${filterParam}${searchParam}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data?.stock_requests) {
        setRequests(data.stock_requests);
      }
      if (data?.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load stock requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    fetchStockRequests();
  }, [fetchStockRequests]);

  // Load pharmacy settings & customers for autocomplete
  useEffect(() => {
    fetch(`/api/settings?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings?.pharmacy_name) {
          setPharmacyName(data.settings.pharmacy_name);
        }
      })
      .catch(() => {});

    fetch(`/api/customers?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.customers) {
          setCustomerSuggestions(
            data.customers.map((c: any) => ({ name: c.name, whatsapp_number: c.whatsapp_number }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleOpenCreateModal = (itemToEdit?: StockRequest) => {
    setFormError(null);
    if (itemToEdit) {
      setEditingRequest(itemToEdit);
      setFormCustomerName(itemToEdit.customer_name);
      setFormPhone(itemToEdit.whatsapp_number);
      setFormProductName(itemToEdit.product_name);
      setFormQuantity(itemToEdit.quantity || '1');
      setFormNotes(itemToEdit.notes || '');
      setFormImageData(itemToEdit.image_url || null);
    } else {
      setEditingRequest(null);
      setFormCustomerName('');
      setFormPhone('');
      setFormProductName('');
      setFormQuantity('1');
      setFormNotes('');
      setFormImageData(null);
    }
    setIsCreateModalOpen(true);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError('Image size exceeds 5MB limit. Please select a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormImageData(reader.result as string);
      setFormError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveStockRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formCustomerName.trim()) {
      setFormError('Customer name is required.');
      return;
    }

    if (!formPhone.trim() || formPhone.replace(/[^\d]/g, '').length < 10) {
      setFormError('Valid 10-digit WhatsApp phone number is required.');
      return;
    }

    if (!formProductName.trim()) {
      setFormError('Product / Medicine name is required.');
      return;
    }

    setFormSubmitting(true);

    try {
      const payload = {
        customer_name: formCustomerName.trim(),
        whatsapp_number: formPhone.trim(),
        product_name: formProductName.trim(),
        quantity: formQuantity.trim(),
        notes: formNotes.trim() || undefined,
        image_url: formImageData || undefined,
      };

      const url = editingRequest
        ? `/api/stock-requests/${editingRequest.id}`
        : '/api/stock-requests';
      const method = editingRequest ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save stock request');
      }

      showToast('success', editingRequest ? '✅ Stock request updated!' : '✅ Stock request recorded successfully!');
      setIsCreateModalOpen(false);
      fetchStockRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving request';
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteRequest = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete this stock request for "${name}"?`)) return;

    try {
      const res = await fetch(`/api/stock-requests/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('success', 'Stock request removed');
        fetchStockRequests();
      } else {
        showToast('error', 'Failed to delete request');
      }
    } catch {
      showToast('error', 'Network error deleting request');
    }
  };

  const handleMarkArrivedAndNotify = async (item: StockRequest, sendWhatsAppDirect: boolean = true) => {
    try {
      const res = await fetch(`/api/stock-requests/${item.id}/mark-arrived`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_whatsapp: true }),
      });

      const data = await res.json();

      if (res.ok) {
        showToast('success', `📦 Stock marked as Arrived for ${item.customer_name}!`);
        if (data.whatsapp?.success) {
          showToast('success', `✅ WhatsApp arrival alert sent automatically!`);
        }
        
        // Open WhatsApp Web if direct requested
        if (sendWhatsAppDirect && data.whatsapp_url) {
          window.open(data.whatsapp_url, '_blank', 'noopener,noreferrer');
        }

        setArrivedModalItem(null);
        fetchStockRequests();
      } else {
        showToast('error', `❌ Failed: ${data?.error || 'Server error'}`);
      }
    } catch (err: any) {
      showToast('error', `❌ Network error: ${err?.message || 'Please check connection'}`);
    }
  };

  const handleSendWhatsAppOnly = async (item: StockRequest) => {
    const textMessage = buildWhatsAppStockArrivalText({
      customerName: item.customer_name,
      recipientPhone: item.whatsapp_number,
      productName: item.product_name,
      quantity: item.quantity,
      requestedDate: item.requested_date,
      notes: item.notes,
      pharmacyName,
      imageUrl: item.image_url,
    });

    try {
      const res = await fetch(`/api/stock-requests/${item.id}/send-whatsapp`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast('success', `✅ WhatsApp arrival notification sent to ${item.customer_name}!`);
        fetchStockRequests();
      } else {
        // Fallback to wa.me
        const url = getWhatsAppDirectUrl(item.whatsapp_number, textMessage);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      const url = getWhatsAppDirectUrl(item.whatsapp_number, textMessage);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleMarkFulfilled = async (item: StockRequest) => {
    try {
      const res = await fetch(`/api/stock-requests/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FULFILLED' }),
      });
      if (res.ok) {
        showToast('success', 'Order marked as Completed / Fulfilled');
        fetchStockRequests();
      }
    } catch {
      showToast('error', 'Failed to update status');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 p-4 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2.5 animate-in slide-in-from-top-4 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 shadow-emerald-500/20'
              : 'bg-rose-50 text-rose-900 border-rose-300 shadow-rose-500/20'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 border border-teal-200/80 rounded-full text-[11px] font-bold text-teal-800 uppercase tracking-wider mb-2">
            <Boxes className="w-3.5 h-3.5 text-teal-600" />
            <span>Customer Pre-Orders & Alerts</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Stock Requests (Unavailable Medicines)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Record customer orders for out-of-stock items, attach product photos, and notify them instantly when stock arrives.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setRefreshing(true);
              fetchStockRequests();
            }}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            title="Refresh Stock Requests"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            onClick={() => handleOpenCreateModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ New Stock Request</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Awaiting Stock
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-amber-600">
              {stats.requested}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Pending fulfillment</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Stock Arrived
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-blue-600">
              {stats.arrived}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Ready for pickup</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Customer Notified
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-600">
              {stats.notified}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Alert dispatched</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Pre-Orders
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              {stats.total}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Recorded requests</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { key: 'ALL', label: 'All Requests' },
            { key: 'REQUESTED', label: '⏳ Awaiting Stock' },
            { key: 'ARRIVED', label: '📦 Stock Arrived' },
            { key: 'NOTIFIED', label: '✅ Notified' },
            { key: 'FULFILLED', label: '🏁 Completed' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === tab.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search medicine, customer, phone..."
            className="w-full pl-9 pr-4 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
          <span>Loading stock requests...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
            <Boxes className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">No Stock Requests Found</h3>
            <p className="text-xs text-slate-500 mt-1">
              {searchTerm || statusFilter !== 'ALL'
                ? 'No requests match your search or filter criteria.'
                : 'When a customer requests an unavailable product, record it here to notify them when stock arrives.'}
            </p>
          </div>
          <button
            onClick={() => handleOpenCreateModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Record First Stock Request</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {requests.map((item) => {
            const isRequested = item.status === 'REQUESTED';
            const isArrived = item.status === 'ARRIVED';
            const isNotified = item.status === 'NOTIFIED';
            const isFulfilled = item.status === 'FULFILLED';

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/80 hover:border-slate-300 shadow-sm transition-all hover:shadow-md flex flex-col justify-between overflow-hidden"
              >
                {/* Card Top: Image & Header */}
                <div className="p-4 space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* Product Thumbnail (or placeholder) */}
                      {item.image_url ? (
                        <div
                          onClick={() => setPreviewImage(item.image_url || null)}
                          className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden cursor-pointer relative group flex-shrink-0"
                          title="Click to view full image"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.image_url}
                            alt={item.product_name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <Eye className="w-4 h-4" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl border border-slate-100 bg-teal-50/70 text-teal-600 flex items-center justify-center flex-shrink-0">
                          <Package className="w-6 h-6" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-sm font-extrabold text-slate-900 truncate" title={item.product_name}>
                            {item.product_name}
                          </h3>
                        </div>
                        {item.quantity && (
                          <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-md text-[10px]">
                            Qty: {item.quantity}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 block mt-1">
                          Ordered: {formatShortDate(item.requested_date)}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isRequested && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Awaiting Stock
                        </span>
                      )}
                      {isArrived && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200">
                          <PackageCheck className="w-3 h-3 text-blue-600" />
                          Stock Arrived
                        </span>
                      )}
                      {isNotified && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Notified
                        </span>
                      )}
                      {isFulfilled && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200">
                          <Check className="w-3 h-3" />
                          Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Customer details bar */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 block truncate">{item.customer_name}</span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {maskWhatsAppNumber(item.whatsapp_number)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <a
                        href={`tel:${item.whatsapp_number}`}
                        title="Call Customer"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleSendWhatsAppOnly(item)}
                        title="Direct WhatsApp"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      </button>
                    </div>
                  </div>

                  {/* Notes if any */}
                  {item.notes && (
                    <p className="text-xs text-slate-600 bg-amber-50/40 p-2 rounded-lg border border-amber-100 italic">
                      &quot;{item.notes}&quot;
                    </p>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenCreateModal(item)}
                      title="Edit Request"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRequest(item.id, item.product_name)}
                      title="Delete Request"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {/* Convert to new bill */}
                    <Link
                      href={`/purchases/new?customer_name=${encodeURIComponent(item.customer_name)}&phone=${encodeURIComponent(
                        item.whatsapp_number
                      )}&item=${encodeURIComponent(item.product_name)}`}
                      title="Create Sale Bill for this Customer"
                      className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors inline-flex items-center gap-1"
                    >
                      <ReceiptText className="w-3 h-3 text-emerald-600" />
                      <span>New Bill</span>
                    </Link>

                    {/* If Requested -> Mark Arrived */}
                    {isRequested && (
                      <button
                        onClick={() => setArrivedModalItem(item)}
                        className="px-3 py-1.5 text-[11px] font-extrabold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm shadow-blue-500/20 transition-all inline-flex items-center gap-1"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Stock Arrived</span>
                      </button>
                    )}

                    {/* If Arrived or Notified -> WhatsApp button */}
                    {(isArrived || isNotified) && (
                      <button
                        onClick={() => handleSendWhatsAppOnly(item)}
                        className="px-3 py-1.5 text-[11px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm shadow-emerald-500/20 transition-all inline-flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{isNotified ? 'Resend Alert' : 'Send Alert'}</span>
                      </button>
                    )}

                    {/* If Notified -> Mark Fulfilled */}
                    {isNotified && (
                      <button
                        onClick={() => handleMarkFulfilled(item)}
                        title="Mark Completed / Delivered"
                        className="px-2 py-1.5 text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Create / Edit Stock Request Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 transform transition-all max-h-[92vh] overflow-y-auto"
            role="dialog"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-teal-600" />
                {editingRequest ? 'Edit Stock Request' : 'Record Unavailable Stock Order'}
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockRequest} className="py-4 space-y-4">
              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={formCustomerName}
                  onChange={(e) => setFormCustomerName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Customer Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  WhatsApp Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Product Name & Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Medicine / Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formProductName}
                    onChange={(e) => setFormProductName(e.target.value)}
                    placeholder="e.g. Glycomet GP 1/500mg"
                    className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Qty / Unit
                  </label>
                  <input
                    type="text"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    placeholder="e.g. 2 Strips"
                    className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Notes / Dosage remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Remarks / Special Notes (Optional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Brand specific / Needs by Friday"
                  className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Optional Product Image Upload */}
              <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-bold text-slate-800">
                      Product Image (Optional)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full">
                    Not Mandatory
                  </span>
                </div>

                <p className="text-[11px] text-slate-500">
                  You can attach a prescription or box photo. If attached, it will be included when alerting the customer of stock arrival.
                </p>

                {formImageData ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-48 bg-white flex items-center justify-center group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={formImageData}
                      alt="Product preview"
                      className="max-h-48 w-auto object-contain rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setFormImageData(null)}
                      className="absolute top-2 right-2 p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md transition-colors"
                      title="Remove image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-sm"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>Upload Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.setAttribute('capture', 'environment');
                            fileInputRef.current.click();
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-sm"
                      >
                        <Camera className="w-3.5 h-3.5 text-slate-500" />
                        <span>Camera</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-start gap-2 border border-rose-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={formSubmitting}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md shadow-emerald-600/30 transition-all disabled:opacity-60"
                >
                  {formSubmitting ? 'Saving...' : editingRequest ? 'Update Request' : 'Save Stock Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Stock Arrival Confirmation & WhatsApp Notification Modal */}
      {arrivedModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 transform transition-all max-h-[92vh] overflow-y-auto space-y-4"
            role="dialog"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-blue-600" />
                Confirm Stock Arrival & Notify
              </h3>
              <button
                onClick={() => setArrivedModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2">
              <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider block">
                Product Details
              </span>
              <h4 className="text-base font-extrabold text-slate-900">{arrivedModalItem.product_name}</h4>
              <p className="text-xs text-slate-600">
                Customer: <strong className="text-slate-900">{arrivedModalItem.customer_name}</strong> (
                {arrivedModalItem.whatsapp_number})
              </p>
              {arrivedModalItem.image_url && (
                <div className="pt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={arrivedModalItem.image_url}
                    alt="Product"
                    className="w-12 h-12 rounded-lg object-cover border border-blue-200"
                  />
                  <span className="text-xs font-semibold text-blue-800">
                    ✓ Attached product photo will be sent with notification
                  </span>
                </div>
              )}
            </div>

            {/* Live Message Preview */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                WhatsApp Notification Preview:
              </label>
              <pre className="p-3.5 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {buildWhatsAppStockArrivalText({
                  customerName: arrivedModalItem.customer_name,
                  recipientPhone: arrivedModalItem.whatsapp_number,
                  productName: arrivedModalItem.product_name,
                  quantity: arrivedModalItem.quantity,
                  requestedDate: arrivedModalItem.requested_date,
                  notes: arrivedModalItem.notes,
                  pharmacyName,
                  imageUrl: arrivedModalItem.image_url,
                })}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleMarkArrivedAndNotify(arrivedModalItem, false)}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Mark Arrived (No WhatsApp)
              </button>

              <button
                type="button"
                onClick={() => handleMarkArrivedAndNotify(arrivedModalItem, true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/30 transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Mark Arrived + WhatsApp Alert</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Fullscreen Image Lightbox Preview */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl max-h-[85vh] bg-white rounded-2xl p-2 overflow-hidden shadow-2xl"
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full z-10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Medicine / Product photo"
              className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
