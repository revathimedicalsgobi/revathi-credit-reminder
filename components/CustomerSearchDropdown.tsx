'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search,
  ChevronDown,
  X,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Plus,
  Users,
} from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { maskWhatsAppNumber } from '@/lib/utils';

export interface DropdownCustomer {
  id?: string;
  name: string;
  whatsapp_number: string;
  outstanding_balance?: number;
}

interface CustomerSearchDropdownProps {
  selectedCustomerName: string;
  selectedPhone: string;
  onChangeCustomer: (customer: { name: string; phone: string; id?: string | null }) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CustomerSearchDropdown({
  selectedCustomerName,
  selectedPhone,
  onChangeCustomer,
  label = 'Customer (Search or Enter New)',
  placeholder = 'Type name or phone to search registered customers...',
  disabled = false,
}: CustomerSearchDropdownProps) {
  const [customers, setCustomers] = useState<DropdownCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(selectedCustomerName || '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync searchQuery when external selectedCustomerName changes
  useEffect(() => {
    setSearchQuery(selectedCustomerName);
  }, [selectedCustomerName]);

  // Load customers
  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/customers?t=${Date.now()}`);
      const data = await res.json();
      if (data?.customers) {
        setCustomers(data.customers);
      }
    } catch (err) {
      console.warn('Failed to load customers for dropdown:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers.slice(0, 30);

    return customers.filter((c) => {
      const nameMatch = c.name?.toLowerCase().includes(q);
      const phoneMatch = c.whatsapp_number?.includes(q);
      return nameMatch || phoneMatch;
    });
  }, [customers, searchQuery]);

  // Matched customer for badge display
  const matchedCustomer = useMemo(() => {
    if (!selectedCustomerName && !selectedPhone) return null;
    const cleanPhone = selectedPhone.replace(/[^\d]/g, '');
    return customers.find(
      (c) =>
        (cleanPhone && c.whatsapp_number.replace(/[^\d]/g, '').endsWith(cleanPhone.slice(-10))) ||
        (selectedCustomerName && c.name.toLowerCase() === selectedCustomerName.trim().toLowerCase())
    );
  }, [customers, selectedCustomerName, selectedPhone]);

  const handleSelect = (c: DropdownCustomer) => {
    setSearchQuery(c.name);
    setIsOpen(false);
    onChangeCustomer({
      name: c.name,
      phone: c.whatsapp_number,
      id: c.id || null,
    });
  };

  const handleClear = () => {
    setSearchQuery('');
    setIsOpen(false);
    onChangeCustomer({
      name: '',
      phone: '',
      id: null,
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setIsOpen(true);
    onChangeCustomer({
      name: val,
      phone: selectedPhone,
      id: null,
    });
  };

  return (
    <div ref={dropdownRef} className="relative space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-emerald-600" />
          <span>{label}</span>
        </label>

        {matchedCustomer ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold animate-in fade-in">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>
              Saved Customer{' '}
              {matchedCustomer.outstanding_balance && matchedCustomer.outstanding_balance > 0
                ? `(Due: ${formatINR(matchedCustomer.outstanding_balance)})`
                : '(Settled)'}
            </span>
          </span>
        ) : (
          <span className="text-[10px] text-slate-400 font-medium">
            {customers.length} registered
          </span>
        )}
      </div>

      {/* Input bar with search and action icons */}
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={searchQuery}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          className="w-full pl-9 pr-20 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 shadow-2xs placeholder-slate-400 disabled:bg-slate-50"
        />
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {(searchQuery || selectedCustomerName || selectedPhone) && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
              title="Clear customer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-emerald-600' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Floating Dropdown List */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            <span>Registered Customers ({filteredCustomers.length})</span>
            <button
              type="button"
              onClick={() => {
                handleClear();
                setIsOpen(false);
              }}
              className="text-emerald-700 hover:underline font-bold"
            >
              + New Customer
            </button>
          </div>

          {isLoading ? (
            <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-600 rounded-full animate-spin" />
              <span>Loading registered customers...</span>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-4 text-center space-y-2">
              <p className="text-xs text-slate-500">
                No saved customer found matching &quot;{searchQuery}&quot;
              </p>
              <button
                type="button"
                onClick={() => {
                  onChangeCustomer({
                    name: searchQuery,
                    phone: selectedPhone,
                    id: null,
                  });
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-bold hover:bg-emerald-100 border border-emerald-200 transition-colors"
              >
                Use &quot;{searchQuery}&quot; as New Customer
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredCustomers.map((customer, idx) => {
                const isSelected =
                  (selectedCustomerName && customer.name.toLowerCase() === selectedCustomerName.toLowerCase()) ||
                  (selectedPhone && customer.whatsapp_number.endsWith(selectedPhone.slice(-10)));
                const hasDue = customer.outstanding_balance && customer.outstanding_balance > 0;

                return (
                  <button
                    key={customer.id || idx}
                    type="button"
                    onClick={() => handleSelect(customer)}
                    className={`w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-emerald-50/70' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {(customer.name || 'C').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-slate-900 truncate">
                            {customer.name}
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-emerald-600 flex-shrink-0" />
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{maskWhatsAppNumber(customer.whatsapp_number)}</span>
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 ml-2">
                      {hasDue ? (
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 block">
                          Due: {formatINR(customer.outstanding_balance || 0)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 block">
                          ✓ Settled
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
