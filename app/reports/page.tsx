'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  Users,
  Receipt,
  Clock,
  Pill,
  TrendingUp,
  Download,
  Printer,
  Search,
  Filter,
  Calendar,
  ChevronRight,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MessageCircle,
  CreditCard,
  Building,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { formatDisplayDate, formatShortDate, maskWhatsAppNumber } from '@/lib/utils';
import {
  CustomerReportItem,
  BillReportItem,
  PaymentReportItem,
  AgingReportBucket,
  ProductReportItem,
  PaymentMode,
  ReceiptDetails,
} from '@/lib/types';
import { PaymentStatusBadge } from '@/components/StatusBadge';
import { PaymentReceivedModal } from '@/components/PaymentReceivedModal';
import { ReceiptModal } from '@/components/ReceiptModal';
import { buildWhatsAppReminderText, getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

type ReportTab = 'customers' | 'bills' | 'payments' | 'aging' | 'products';
type DatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

export default function ReportsAndStatementsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('customers');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PARTIAL' | 'PAID'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Branding
  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');
  const [upiId, setUpiId] = useState<string | null>(null);

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({
    total_invoices_count: 0,
    total_customers_count: 0,
    total_sales_amount: 0,
    total_collected_amount: 0,
    total_outstanding_amount: 0,
    total_discount_amount: 0,
    total_payments_count: 0,
  });

  const [customers, setCustomers] = useState<CustomerReportItem[]>([]);
  const [bills, setBills] = useState<BillReportItem[]>([]);
  const [payments, setPayments] = useState<PaymentReportItem[]>([]);
  const [aging, setAging] = useState<AgingReportBucket[]>([]);
  const [products, setProducts] = useState<ProductReportItem[]>([]);

  // Modals
  const [activePaymentModal, setActivePaymentModal] = useState<{
    purchaseId: string;
    billNumber?: string;
    customerName: string;
    whatsappNumber: string;
    amount: number;
    paidAmount: number;
    balanceDue: number;
  } | null>(null);

  const [activeReceipt, setActiveReceipt] = useState<ReceiptDetails | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState<string | null>(null);

  // Fetch Pharmacy Settings
  useEffect(() => {
    fetch('/api/settings?t=' + Date.now(), { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          if (data.settings.pharmacy_name) setPharmacyName(data.settings.pharmacy_name);
          if (data.settings.upi_id) setUpiId(data.settings.upi_id);
        }
      })
      .catch(() => {});
  }, []);

  // Compute actual start and end date from presets
  const resolvedDateRange = useMemo(() => {
    if (datePreset === 'all') return { start: '', end: '' };
    if (datePreset === 'custom') return { start: startDate, end: endDate };

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (datePreset === 'today') {
      return { start: todayStr, end: todayStr };
    }

    if (datePreset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      return { start: yStr, end: yStr };
    }

    if (datePreset === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      return { start: w.toISOString().split('T')[0], end: todayStr };
    }

    if (datePreset === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: m.toISOString().split('T')[0], end: todayStr };
    }

    if (datePreset === 'last_month') {
      const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endLast = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: startLast.toISOString().split('T')[0],
        end: endLast.toISOString().split('T')[0],
      };
    }

    return { start: '', end: '' };
  }, [datePreset, startDate, endDate]);

  // Fetch reports data
  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (resolvedDateRange.start) params.set('startDate', resolvedDateRange.start);
      if (resolvedDateRange.end) params.set('endDate', resolvedDateRange.end);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('t', Date.now().toString());

      const res = await fetch(`/api/reports?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();

      if (data?.summary) setSummary(data.summary);
      if (data?.customers) setCustomers(data.customers);
      if (data?.bills) setBills(data.bills);
      if (data?.payments) setPayments(data.payments);
      if (data?.aging) setAging(data.aging);
      if (data?.products) setProducts(data.products);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resolvedDateRange, statusFilter, searchQuery]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  // Export current tab to CSV
  const handleExportCSV = () => {
    let rows: (string | number)[][] = [];
    let filename = `Report_${activeTab}_${Date.now()}.csv`;

    if (activeTab === 'customers') {
      filename = `Customer_Statements_${Date.now()}.csv`;
      rows = [
        ['Customer Name', 'WhatsApp Number', 'Total Bills', 'Total Billed (INR)', 'Total Paid (INR)', 'Outstanding Due (INR)', 'Status', 'Last Bill Date', 'Last Payment Date'],
        ...customers.map((c) => [
          c.name,
          c.whatsapp_number,
          c.total_bills_count,
          c.total_billed,
          c.total_paid,
          c.outstanding_balance,
          c.status,
          c.last_bill_date ? formatShortDate(c.last_bill_date) : '—',
          c.last_payment_date ? formatShortDate(c.last_payment_date) : '—',
        ]),
      ];
    } else if (activeTab === 'bills') {
      filename = `Bill_Wise_Register_${Date.now()}.csv`;
      rows = [
        ['Bill No', 'Date', 'Customer Name', 'Phone', 'Items', 'Gross Total (INR)', 'Discount (INR)', 'Net Amount (INR)', 'Paid (INR)', 'Due (INR)', 'Status'],
        ...bills.map((b) => [
          b.bill_number,
          formatShortDate(b.purchase_date),
          b.customer_name,
          b.whatsapp_number,
          b.items_summary,
          b.gross_total,
          b.total_discount,
          b.amount_payable,
          b.paid_amount,
          b.balance_due,
          b.payment_status,
        ]),
      ];
    } else if (activeTab === 'payments') {
      filename = `Payment_Collections_Register_${Date.now()}.csv`;
      rows = [
        ['Receipt No', 'Date', 'Bill No', 'Customer Name', 'Phone', 'Amount (INR)', 'Payment Mode', 'Notes'],
        ...payments.map((p) => [
          p.receipt_number,
          formatDisplayDate(p.paid_at),
          p.bill_number,
          p.customer_name,
          p.whatsapp_number,
          p.amount,
          p.payment_mode,
          p.notes || '',
        ]),
      ];
    } else if (activeTab === 'aging') {
      filename = `Credit_Aging_Report_${Date.now()}.csv`;
      rows = [
        ['Aging Bracket', 'Bill No', 'Customer Name', 'Phone', 'Bill Date', 'Days Pending', 'Bill Amount (INR)', 'Pending Due (INR)'],
      ];
      aging.forEach((bucket) => {
        bucket.bills.forEach((b) => {
          rows.push([
            bucket.title,
            b.bill_number,
            b.customer_name,
            b.whatsapp_number,
            formatShortDate(b.purchase_date),
            b.days_pending,
            b.amount_payable,
            b.balance_due,
          ]);
        });
      });
    } else if (activeTab === 'products') {
      filename = `Medicine_Sales_Summary_${Date.now()}.csv`;
      rows = [
        ['Medicine / Item Name', 'Quantity Sold', 'Gross Sales (INR)', 'Discount Given (INR)', 'Net Revenue (INR)', 'Total Invoices Count'],
        ...products.map((p) => [
          p.item_name,
          p.total_quantity,
          p.total_gross,
          p.total_discount,
          p.total_net,
          p.bills_count,
        ]),
      ];
    }

    if (rows.length === 0) return;

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      rows.map((e) => e.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Payment Confirmation Handler
  const handleConfirmPayment = async (paymentData: { amount: number; payment_mode: PaymentMode; notes?: string }) => {
    if (!activePaymentModal) return;
    setIsProcessingPayment(true);
    setPaymentModalError(null);

    try {
      const res = await fetch(`/api/purchases/${activePaymentModal.purchaseId}/payment-received`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to record payment');
      }

      setActivePaymentModal(null);
      await fetchReports();

      if (data?.receipt) {
        setActiveReceipt(data.receipt);
      }

      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error processing payment';
      setPaymentModalError(msg);
      throw err;
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            <span>Reports & Statements Hub</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Customer-wise ledgers, bill registers, payment collections, and credit aging analytics.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl border border-slate-200 hover:bg-white text-slate-600 transition-colors"
            title="Refresh reports"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Export active report table to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-900 bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300 border border-emerald-300 rounded-xl transition-all cursor-pointer"
            title="Print report"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-700" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 no-print">
        {/* Total Sales */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Billed Revenue
          </span>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {formatINR(summary.total_sales_amount)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
              {summary.total_invoices_count} invoices generated
            </p>
          </div>
        </div>

        {/* Total Collected */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            Total Payments Collected
          </span>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-emerald-600">
              {formatINR(summary.total_collected_amount)}
            </div>
            <p className="text-[11px] text-emerald-700/70 mt-0.5 font-medium">
              {summary.total_payments_count} payment receipts
            </p>
          </div>
        </div>

        {/* Total Outstanding Due */}
        <div className="bg-rose-50/70 p-4 sm:p-5 rounded-2xl border border-rose-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
            Total Outstanding Credit
          </span>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-rose-700">
              {formatINR(summary.total_outstanding_amount)}
            </div>
            <p className="text-[11px] text-rose-800/80 mt-0.5 font-semibold">
              Pending across customer accounts
            </p>
          </div>
        </div>

        {/* Total Discounts Given */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">
            Total Discounts Saved
          </span>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-teal-700">
              {formatINR(summary.total_discount_amount)}
            </div>
            <p className="text-[11px] text-teal-700/70 mt-0.5 font-medium">
              Passed on to customers
            </p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 sm:px-6 pt-3 no-print">
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none pb-2">
            <button
              onClick={() => setActiveTab('customers')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === 'customers'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Customer-Wise Statement ({customers.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('bills')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === 'bills'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Bill-Wise Sales Register ({bills.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('payments')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === 'payments'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Payment Collections ({payments.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('aging')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === 'aging'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Credit Aging & Overdue</span>
            </button>

            <button
              onClick={() => setActiveTab('products')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === 'products'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Pill className="w-4 h-4" />
              <span>Medicine Sales Summary ({products.length})</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
          {/* Date Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Period:</span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'custom', label: 'Custom' },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDatePreset(preset.id as DatePreset)}
                className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all ${
                  datePreset === preset.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers if selected */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 font-mono"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 font-mono"
              />
            </div>
          )}

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, phone, bill no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>
        </div>

        {/* Content Views */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
            <span>Loading statement report data...</span>
          </div>
        ) : (
          <div>
            {/* -------------------------------------------------------- */}
            {/* 1. CUSTOMER-WISE STATEMENT & LEDGER SUMMARY */}
            {/* -------------------------------------------------------- */}
            {activeTab === 'customers' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-6">Customer Name</th>
                      <th className="py-3.5 px-4">WhatsApp Phone</th>
                      <th className="py-3.5 px-4">Total Bills</th>
                      <th className="py-3.5 px-4">Total Billed</th>
                      <th className="py-3.5 px-4">Total Paid</th>
                      <th className="py-3.5 px-4">Outstanding Due</th>
                      <th className="py-3.5 px-4">Account Status</th>
                      <th className="py-3.5 px-6 text-right no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 text-xs italic">
                          No customer statement records found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      customers.map((cust) => {
                        const hasDue = cust.outstanding_balance > 0;
                        return (
                          <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-4 px-6 font-semibold text-slate-900">
                              <Link
                                href={`/customers/${cust.id}`}
                                className="hover:text-emerald-600 hover:underline inline-flex items-center gap-1.5"
                                title="View Complete Customer Account Statement"
                              >
                                <span>{cust.name}</span>
                              </Link>
                            </td>
                            <td className="py-4 px-4 font-mono text-xs text-slate-600">
                              {maskWhatsAppNumber(cust.whatsapp_number)}
                            </td>
                            <td className="py-4 px-4 text-xs font-bold text-slate-700">
                              {cust.total_bills_count} bills
                            </td>
                            <td className="py-4 px-4 text-xs font-mono font-semibold text-slate-700">
                              {formatINR(cust.total_billed)}
                            </td>
                            <td className="py-4 px-4 text-xs font-mono font-bold text-emerald-700">
                              {formatINR(cust.total_paid)}
                            </td>
                            <td className="py-4 px-4 whitespace-nowrap">
                              <span
                                className={`font-black text-sm ${
                                  hasDue ? 'text-rose-700' : 'text-emerald-700'
                                }`}
                              >
                                {formatINR(cust.outstanding_balance)}
                              </span>
                            </td>
                            <td className="py-4 px-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  cust.status === 'SETTLED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : cust.status === 'OVERDUE'
                                    ? 'bg-rose-100 text-rose-800 animate-pulse'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {cust.status}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right no-print whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <Link
                                  href={`/customers/${cust.id}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold"
                                  title="Open Full Customer Statement & Ledger"
                                >
                                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Statement</span>
                                </Link>

                                <Link
                                  href={`/purchases/new?customerId=${cust.id}&name=${encodeURIComponent(cust.name)}&phone=${encodeURIComponent(cust.whatsapp_number)}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs"
                                >
                                  <span>+ Bill</span>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* -------------------------------------------------------- */}
            {/* 2. BILL-WISE SALES & CREDIT REGISTER */}
            {/* -------------------------------------------------------- */}
            {activeTab === 'bills' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-6">Bill No</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Customer Name</th>
                      <th className="py-3.5 px-4">Gross Total</th>
                      <th className="py-3.5 px-4">Discount</th>
                      <th className="py-3.5 px-4">Net Amount</th>
                      <th className="py-3.5 px-4">Paid Amount</th>
                      <th className="py-3.5 px-4">Pending Due</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-6 text-right no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bills.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400 text-xs italic">
                          No bills found matching your selected filters.
                        </td>
                      </tr>
                    ) : (
                      bills.map((bill) => {
                        const isPending = bill.payment_status === 'PENDING' || bill.payment_status === 'PARTIAL';
                        return (
                          <tr key={bill.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-4 px-6 font-mono font-bold text-xs text-slate-900 whitespace-nowrap">
                              <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {bill.bill_number}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-xs text-slate-600 whitespace-nowrap">
                              {formatShortDate(bill.purchase_date)}
                            </td>
                            <td className="py-4 px-4 font-semibold text-slate-900 whitespace-nowrap">
                              <Link
                                href={`/customers/${bill.customer_id}`}
                                className="hover:text-emerald-600 hover:underline"
                              >
                                {bill.customer_name}
                              </Link>
                            </td>
                            <td className="py-4 px-4 font-mono text-xs text-slate-600">
                              {formatINR(bill.gross_total)}
                            </td>
                            <td className="py-4 px-4 font-mono text-xs text-emerald-700">
                              {bill.total_discount > 0 ? formatINR(bill.total_discount) : '—'}
                            </td>
                            <td className="py-4 px-4 font-mono font-bold text-xs text-slate-900">
                              {formatINR(bill.amount_payable)}
                            </td>
                            <td className="py-4 px-4 font-mono font-bold text-xs text-emerald-700">
                              {formatINR(bill.paid_amount)}
                            </td>
                            <td className="py-4 px-4 font-mono font-black text-xs">
                              <span className={bill.balance_due > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                                {formatINR(bill.balance_due)}
                              </span>
                            </td>
                            <td className="py-4 px-4 whitespace-nowrap">
                              <PaymentStatusBadge status={bill.payment_status} />
                            </td>
                            <td className="py-4 px-6 text-right no-print whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <Link
                                  href={`/purchases/${bill.id}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                                  title="View Bill Card"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View</span>
                                </Link>

                                {isPending ? (
                                  <button
                                    onClick={() =>
                                      setActivePaymentModal({
                                        purchaseId: bill.id,
                                        billNumber: bill.bill_number,
                                        customerName: bill.customer_name,
                                        whatsappNumber: bill.whatsapp_number,
                                        amount: bill.amount_payable,
                                        paidAmount: bill.paid_amount,
                                        balanceDue: bill.balance_due,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Pay</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setActiveReceipt({
                                        receipt_number: `RCP-${bill.id.slice(0, 4).toUpperCase()}`,
                                        receipt_date: bill.payment_received_at || bill.purchase_date,
                                        purchase_id: bill.id,
                                        bill_number: bill.bill_number,
                                        customer_name: bill.customer_name,
                                        whatsapp_number: bill.whatsapp_number,
                                        payment_mode: 'CASH',
                                        amount_received: bill.paid_amount || bill.amount_payable,
                                        total_bill_amount: bill.amount_payable,
                                        previous_paid: 0,
                                        new_total_paid: bill.paid_amount || bill.amount_payable,
                                        remaining_balance: 0,
                                        pharmacy_name: pharmacyName,
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold cursor-pointer"
                                    title="View Payment Receipt"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Receipt</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* -------------------------------------------------------- */}
            {/* 3. PAYMENT COLLECTIONS & RECEIPTS REGISTER */}
            {/* -------------------------------------------------------- */}
            {activeTab === 'payments' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-6">Receipt No</th>
                      <th className="py-3.5 px-4">Payment Date & Time</th>
                      <th className="py-3.5 px-4">Bill No</th>
                      <th className="py-3.5 px-4">Customer</th>
                      <th className="py-3.5 px-4">Amount Received</th>
                      <th className="py-3.5 px-4">Payment Mode</th>
                      <th className="py-3.5 px-4">Remarks</th>
                      <th className="py-3.5 px-6 text-right no-print">Receipt Slip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 text-xs italic">
                          No payment transactions recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-6 font-mono font-black text-xs text-emerald-950 whitespace-nowrap">
                            {p.receipt_number}
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-700 whitespace-nowrap">
                            {formatDisplayDate(p.paid_at)}
                          </td>
                          <td className="py-4 px-4 font-mono font-bold text-xs text-slate-800 whitespace-nowrap">
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {p.bill_number}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            <div>{p.customer_name}</div>
                            {p.whatsapp_number && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {maskWhatsAppNumber(p.whatsapp_number)}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4 font-mono font-black text-base text-emerald-700 whitespace-nowrap">
                            {formatINR(p.amount)}
                          </td>
                          <td className="py-4 px-4 whitespace-nowrap">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                              {p.payment_mode || 'CASH'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-500 italic max-w-xs truncate">
                            {p.notes || 'Payment received'}
                          </td>
                          <td className="py-4 px-6 text-right no-print whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveReceipt({
                                  receipt_number: p.receipt_number,
                                  receipt_date: p.paid_at,
                                  purchase_id: p.purchase_id,
                                  bill_number: p.bill_number,
                                  customer_name: p.customer_name,
                                  whatsapp_number: p.whatsapp_number,
                                  payment_mode: p.payment_mode,
                                  amount_received: p.amount,
                                  total_bill_amount: p.amount,
                                  previous_paid: 0,
                                  new_total_paid: p.amount,
                                  remaining_balance: 0,
                                  pharmacy_name: pharmacyName,
                                  notes: p.notes,
                                });
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                              <span>View Slip</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* -------------------------------------------------------- */}
            {/* 4. CREDIT AGING & OVERDUE ANALYSIS */}
            {/* -------------------------------------------------------- */}
            {activeTab === 'aging' && (
              <div className="p-4 sm:p-6 space-y-6">
                {/* 4 Age Buckets Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {aging.map((bucket, idx) => {
                    const isOverdue = bucket.bracket === '16_30_DAYS' || bucket.bracket === 'OVER_30_DAYS';
                    return (
                      <div
                        key={idx}
                        className={`p-5 rounded-2xl border transition-all ${
                          isOverdue ? 'bg-rose-50/60 border-rose-200' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`text-xs font-bold uppercase tracking-wider ${
                              isOverdue ? 'text-rose-700' : 'text-slate-600'
                            }`}
                          >
                            {bucket.title}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-300">
                            {bucket.bills_count} bills
                          </span>
                        </div>
                        <div className="text-2xl font-black text-slate-900 mt-1">
                          {formatINR(bucket.total_amount)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {bucket.customers_count} customers in this bracket
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Overdue Bill Items List */}
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Overdue Bills Awaiting Follow-up</span>
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Bill No</th>
                          <th className="py-3 px-4">Customer Name</th>
                          <th className="py-3 px-4">Phone</th>
                          <th className="py-3 px-4">Bill Date</th>
                          <th className="py-3 px-4">Overdue Days</th>
                          <th className="py-3 px-4">Pending Due</th>
                          <th className="py-3 px-4 text-right no-print">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {aging.flatMap((b) => b.bills).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400 text-xs italic">
                              🎉 No overdue credit bills! All customer accounts are up to date.
                            </td>
                          </tr>
                        ) : (
                          aging
                            .flatMap((b) => b.bills)
                            .sort((a, b) => b.days_pending - a.days_pending)
                            .map((bill) => (
                              <tr key={bill.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4 font-mono font-bold text-xs text-slate-900">
                                  {bill.bill_number}
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-900">
                                  {bill.customer_name}
                                </td>
                                <td className="py-3 px-4 font-mono text-xs text-slate-600">
                                  {maskWhatsAppNumber(bill.whatsapp_number)}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600">
                                  {formatShortDate(bill.purchase_date)}
                                </td>
                                <td className="py-3 px-4 font-bold text-xs">
                                  <span
                                    className={`px-2 py-0.5 rounded ${
                                      bill.days_pending > 30
                                        ? 'bg-rose-100 text-rose-800'
                                        : bill.days_pending > 15
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {bill.days_pending} days
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono font-black text-sm text-rose-700">
                                  {formatINR(bill.balance_due)}
                                </td>
                                <td className="py-3 px-4 text-right no-print whitespace-nowrap">
                                  <button
                                    onClick={() => {
                                      const text = buildWhatsAppReminderText({
                                        customerName: bill.customer_name,
                                        recipientPhone: bill.whatsapp_number,
                                        purchaseDate: bill.purchase_date,
                                        pendingDays: bill.days_pending,
                                        amountPending: bill.balance_due,
                                        totalBillAmount: bill.amount_payable,
                                        pharmacyName,
                                        upiId,
                                      });
                                      const url = getWhatsAppDirectUrl(bill.whatsapp_number, text);
                                      window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold cursor-pointer"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Remind</span>
                                  </button>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------- */}
            {/* 5. MEDICINE / PRODUCT SALES SUMMARY */}
            {/* -------------------------------------------------------- */}
            {activeTab === 'products' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-6">Rank</th>
                      <th className="py-3.5 px-4">Medicine / Item Name</th>
                      <th className="py-3.5 px-4">Qty Sold</th>
                      <th className="py-3.5 px-4">Gross Sales</th>
                      <th className="py-3.5 px-4">Discount Given</th>
                      <th className="py-3.5 px-4">Net Revenue</th>
                      <th className="py-3.5 px-6 text-right">Bills Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 text-xs italic">
                          No product sales records available for this period.
                        </td>
                      </tr>
                    ) : (
                      products.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-6 text-xs font-bold text-slate-400">
                            #{idx + 1}
                          </td>
                          <td className="py-4 px-4 font-black text-slate-900 text-sm">
                            {item.item_name}
                          </td>
                          <td className="py-4 px-4 font-bold text-xs text-slate-800">
                            {item.total_quantity}
                          </td>
                          <td className="py-4 px-4 font-mono text-xs text-slate-600">
                            {formatINR(item.total_gross)}
                          </td>
                          <td className="py-4 px-4 font-mono text-xs text-teal-700">
                            {item.total_discount > 0 ? formatINR(item.total_discount) : '—'}
                          </td>
                          <td className="py-4 px-4 font-mono font-black text-sm text-emerald-800">
                            {formatINR(item.total_net)}
                          </td>
                          <td className="py-4 px-6 font-semibold text-xs text-slate-600 text-right">
                            {item.bills_count} bills
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bill-Wise Payment Modal (Supports Part Amount & Full Settlement) */}
      {activePaymentModal && (
        <PaymentReceivedModal
          isOpen={true}
          onClose={() => setActivePaymentModal(null)}
          onConfirm={handleConfirmPayment}
          customerName={activePaymentModal.customerName}
          whatsappNumber={activePaymentModal.whatsappNumber}
          billNumber={activePaymentModal.billNumber}
          amountPayable={activePaymentModal.amount}
          paidAmount={activePaymentModal.paidAmount}
          balanceDue={activePaymentModal.balanceDue}
          pharmacyName={pharmacyName}
          isProcessing={isProcessingPayment}
          errorMessage={paymentModalError}
          onShowReceipt={(rcp) => setActiveReceipt(rcp)}
        />
      )}

      {/* Payment Receipt Modal */}
      {activeReceipt && (
        <ReceiptModal
          isOpen={Boolean(activeReceipt)}
          onClose={() => setActiveReceipt(null)}
          receipt={activeReceipt}
          pharmacyName={pharmacyName}
          upiId={upiId}
        />
      )}
    </div>
  );
}
