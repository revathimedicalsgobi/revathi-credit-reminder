'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  PlusCircle,
  LayoutDashboard,
  Settings as SettingsIcon,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Users,
  Menu,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pharmacyName, setPharmacyName] = useState<string>('Revathi Medicals & Distributors');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email);
      }
    });

    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings?.pharmacy_name) {
          setPharmacyName(data.settings.pharmacy_name);
        }
      })
      .catch(() => {});
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  if (pathname === '/login') {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Pharmacy Name */}
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform flex-shrink-0">
                <ReceiptText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate block">
                  {pharmacyName}
                </span>
                <span className="text-[10px] sm:text-xs font-medium text-emerald-600 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Purchase & Credit Manager
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            <Link
              href="/"
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/customers"
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith('/customers')
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Customers Master</span>
            </Link>

            <Link
              href="/settings"
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/settings'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Settings</span>
            </Link>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Link
              href="/purchases/new"
              className="flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-sm shadow-emerald-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Bill</span>
            </Link>

            {userEmail && (
              <div className="hidden md:flex items-center space-x-2 border-l border-slate-200 pl-3">
                <span className="text-xs text-slate-500 hidden lg:inline max-w-[140px] truncate" title={userEmail}>
                  {userEmail}
                </span>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mobile Hamburger Menu Toggle Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 md:hidden text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-slate-800" />
              ) : (
                <Menu className="w-5 h-5 text-slate-800" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-slate-200/80 space-y-1.5 animate-in slide-in-from-top-2 duration-200">
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                pathname === '/'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-emerald-600" />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/customers"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                pathname.startsWith('/customers')
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600" />
              <span>Customers Master & Statements</span>
            </Link>

            <Link
              href="/settings"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                pathname === '/settings'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SettingsIcon className="w-4 h-4 text-slate-500" />
              <span>Settings & Branding</span>
            </Link>

            <Link
              href="/purchases/new"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-bold text-emerald-800 bg-emerald-50/70 border border-emerald-200"
            >
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              <span>+ Record New Purchase</span>
            </Link>

            {userEmail && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between px-3.5 py-2 text-xs text-slate-500">
                <span className="truncate max-w-[200px]">{userEmail}</span>
                <button
                  onClick={handleLogout}
                  className="text-rose-600 font-bold hover:underline flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
