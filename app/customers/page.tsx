'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileText,
  MessageCircle,
  RefreshCw,
  Phone,
  ArrowUpDown,
  X,
  UserCheck,
  ChevronRight,
} from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { maskWhatsAppNumber } from '@/lib/utils';
import { buildWhatsAppCustomerStatementText, getWhatsAppDirectUrl } from '@/lib/whatsapp-share';

interface CustomerMasterItem {
  id: string;
  name: string;
  whatsapp_number: string;
  created_at: string;
  updated_at: string;
  total_purchases_count: number;
  total_billed: number;
  total_paid: number;
  outstanding_balance: number;
  pending_purchases_count: number;
  last_purchase_date: string | null;
}

interface CustomerKPIs {
  total_customers: number;
  total_outstanding_amount: number;
  total_pending_customers: number;
  total_settled_customers: number;
}

export default function CustomerMasterPage() {
  const [customers, setCustomers] = useState<CustomerMasterItem[]>([]);
  const [kpis, setKpis] = useState<CustomerKPIs>({
    total_customers: 0,
    total_outstanding_amount: 0,
    total_pending_customers: 0,
    total_settled_customers: 0,
  });
  const [pharmacyName, setPharmacyName] = useState('Revathi Medicals & Distributors');
  const [upiId, setUpiId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING_BALANCE' | 'SETTLED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'balance' | 'name' | 'recent'>('balance');

  // Add Customer Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);
  const [addCustomerError, setAddCustomerError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const timestamp = Date.now();
      const filterParam = filter === 'ALL' ? '' : `filter=${filter}`;
      const searchParam = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : '';
      const res = await fetch(`/api/customers?t=${timestamp}&${filterParam}${searchParam}`, {
        cache: 'no-store',
      });
      const data = await res.json();

      if (data?.customers) {
        setCustomers(data.customers);
      }
      if (data?.kpis) {
        setKpis(data.kpis);
      }
    } catch (err) {
      console.error('Failed to fetch customers', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, searchTerm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load pharmacy branding
  useEffect(() => {
    fetch(`/api/settings?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          if (data.settings.pharmacy_name) setPharmacyName(data.settings.pharmacy_name);
          if (data.settings.upi_id) setUpiId(data.settings.upi_id);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      setAddCustomerError('Please fill in both name and phone number');
      return;
    }

    setIsSubmittingCustomer(true);
    setAddCustomerError(null);

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          whatsapp_number: newCustomerPhone.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create customer');
      }

      setNewCustomerName('');
      setNewCustomerPhone('');
      setIsAddModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating customer';
      setAddCustomerError(msg);
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleSendWhatsAppStatement = (customer: CustomerMasterItem) => {
    const text = buildWhatsAppCustomerStatementText({
      customerName: customer.name,
      recipientPhone: customer.whatsapp_number,
      totalPurchasesCount: customer.total_purchases_count,
      totalBilled: customer.total_billed,
      totalPaid: customer.total_paid,
      outstandingBalance: customer.outstanding_balance,
      pendingBills: [],
      pharmacyName,
      upiId,
    });

    const chatUrl = getWhatsAppDirectUrl(customer.whatsapp_number, text);
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    if (sortBy === 'balance') {
      return b.outstanding_balance - a.outstanding_balance;
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'recent') {
      const dateA = a.last_purchase_date ? new Date(a.last_purchase_date).getTime() : 0;
      const dateB = b.last_purchase_date ? new Date(b.last_purchase_date).getTime() : 0;
      return dateB - dateA;
    }
    return 0;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-7 h-7 text-emerald-600" />
            Customer Master & Statements
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage customer accounts, maintain statement ledgers, and track credit balances in one place.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              setAddCustomerError(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md shadow-emerald-600/30 transition-all transform hover:-translate-y-0.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Customers
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              {kpis.total_customers}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Registered in master</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-rose-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Outstanding
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-rose-600">
              {formatINR(kpis.total_outstanding_amount)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Across all accounts</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pending Balances
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-amber-600">
              {kpis.total_pending_customers}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Customers with credit</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Settled Accounts
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-600">
              {kpis.total_settled_customers}
            </div>
            <p className="text-[11px] text-emerald-700/70 mt-0.5 font-medium">
              Zero balance accounts
            </p>
          </div>
        </div>
      </div>

      {/* Main Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Control Header & Filters */}
        <div className="p-4 sm:p-6 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center p-1 bg-slate-200/60 rounded-xl max-w-fit">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Customers ({kpis.total_customers})
            </button>
            <button
              onClick={() => setFilter('PENDING_BALANCE')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === 'PENDING_BALANCE'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending Balance ({kpis.total_pending_customers})
            </button>
            <button
              onClick={() => setFilter('SETTLED')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === 'SETTLED'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Settled Accounts ({kpis.total_settled_customers})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search customer, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'balance' | 'name' | 'recent')}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="balance">Sort: Balance (High → Low)</option>
              <option value="name">Sort: Name (A → Z)</option>
              <option value="recent">Sort: Most Recent Bill</option>
            </select>
          </div>
        </div>

        {/* Content View */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
            <span>Loading customer master records...</span>
          </div>
        ) : sortedCustomers.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No customers found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {searchTerm
                ? 'No matching customer records for your search query.'
                : filter === 'PENDING_BALANCE'
                ? 'All customer accounts are currently settled!'
                : 'No customer master records created yet.'}
            </p>
            <div className="mt-4">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add First Customer</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-6">Customer Master</th>
                    <th className="py-3.5 px-4">WhatsApp Contact</th>
                    <th className="py-3.5 px-4 text-center">Invoices</th>
                    <th className="py-3.5 px-4">Total Billed</th>
                    <th className="py-3.5 px-4">Total Paid</th>
                    <th className="py-3.5 px-4">Outstanding Balance</th>
                    <th className="py-3.5 px-6 text-right">Statement & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedCustomers.map((customer) => {
                    const hasPending = customer.outstanding_balance > 0;

                    return (
                      <tr
                        key={customer.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        <td className="py-4 px-6">
                          <Link
                            href={`/customers/${customer.id}`}
                            className="font-bold text-slate-900 hover:text-emerald-700 flex items-center gap-2 group-hover:underline"
                          >
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold uppercase">
                              {customer.name.slice(0, 2)}
                            </div>
                            <span>{customer.name}</span>
                          </Link>
                        </td>
                        <td className="py-4 px-4 text-xs font-mono text-slate-600">
                          {maskWhatsAppNumber(customer.whatsapp_number)}
                        </td>
                        <td className="py-4 px-4 text-xs text-center font-bold text-slate-700">
                          <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                            {customer.total_purchases_count}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-semibold text-slate-800 whitespace-nowrap text-xs">
                          {formatINR(customer.total_billed)}
                        </td>
                        <td className="py-4 px-4 font-semibold text-emerald-700 whitespace-nowrap text-xs">
                          {formatINR(customer.total_paid)}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          {hasPending ? (
                            <span className="font-extrabold text-xs text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                              {formatINR(customer.outstanding_balance)} ({customer.pending_purchases_count} due)
                            </span>
                          ) : (
                            <span className="font-bold text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                              ✓ Settled (₹0.00)
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleSendWhatsAppStatement(customer)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-all shadow-2xs"
                              title="Send account summary to WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>WhatsApp</span>
                            </button>

                            <Link
                              href={`/purchases/new?customerId=${customer.id}&name=${encodeURIComponent(customer.name)}&phone=${encodeURIComponent(customer.whatsapp_number)}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                              title="Create new bill for this customer"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                              <span>+ Bill</span>
                            </Link>

                            <Link
                              href={`/customers/${customer.id}`}
                              className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                              title="View Full Customer Account Statement & Ledger"
                            >
                              <FileText className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Statement</span>
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-slate-100">
              {sortedCustomers.map((customer) => {
                const hasPending = customer.outstanding_balance > 0;

                return (
                  <div key={customer.id} className="p-4 space-y-3 bg-white">
                    <div className="flex items-start justify-between">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold uppercase">
                          {customer.name.slice(0, 2)}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-base hover:text-emerald-700">
                            {customer.name}
                          </h4>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{maskWhatsAppNumber(customer.whatsapp_number)}</span>
                          </div>
                        </div>
                      </Link>

                      {hasPending ? (
                        <span className="font-black text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          Due: {formatINR(customer.outstanding_balance)}
                        </span>
                      ) : (
                        <span className="font-bold text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          ✓ Settled
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Invoices
                        </span>
                        <span className="font-bold text-slate-800">
                          {customer.total_purchases_count}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Total Billed
                        </span>
                        <span className="font-bold text-slate-800">
                          {formatINR(customer.total_billed)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Total Paid
                        </span>
                        <span className="font-bold text-emerald-700">
                          {formatINR(customer.total_paid)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                      <button
                        onClick={() => handleSendWhatsAppStatement(customer)}
                        className="px-2.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <MessageCircle className="w-3 h-3 text-emerald-600" />
                        <span>WhatsApp</span>
                      </button>

                      <Link
                        href={`/purchases/new?customerId=${customer.id}&name=${encodeURIComponent(customer.name)}&phone=${encodeURIComponent(customer.whatsapp_number)}`}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                      >
                        + Bill
                      </Link>

                      <Link
                        href={`/customers/${customer.id}`}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3 text-emerald-400" />
                        <span>Statement</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                Add New Customer Master
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Customer Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  WhatsApp Mobile Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Accepts 10-digit mobile number or full format with country code.
                </span>
              </div>

              {addCustomerError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs border border-rose-200">
                  {addCustomerError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmittingCustomer}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingCustomer}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md disabled:opacity-60"
                >
                  {isSubmittingCustomer ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Save Customer</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
