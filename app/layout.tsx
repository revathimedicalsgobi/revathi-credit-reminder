import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Purchase Summary & Payment Follow-up Manager',
  description: 'Pharmacy purchase summary, pending payment tracking, and WhatsApp follow-up manager.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400 no-print">
          <p>© {new Date().getFullYear()} Purchase Summary & Payment Follow-up Manager. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
