import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enrichPurchaseWithPayments } from '@/lib/payment-helpers';
import { roundToTwoDecimals } from '@/lib/calculations';
import { getPendingDaysCount } from '@/lib/utils';
import {
  CustomerReportItem,
  BillReportItem,
  PaymentReportItem,
  AgingReportBucket,
  ProductReportItem,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const statusParam = searchParams.get('status')?.toUpperCase() || 'ALL';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const searchParam = searchParams.get('search')?.toLowerCase().trim() || '';

    // 1. Fetch all purchases with customer, items, and audit logs
    const { data: rawPurchases, error: purchErr } = await supabase
      .from('purchases')
      .select(`
        *,
        customer:customers(*),
        items:purchase_items(*),
        audit_logs(*)
      `)
      .order('purchase_date', { ascending: false });

    if (purchErr) {
      return NextResponse.json({ error: purchErr.message }, { status: 500 });
    }

    // 2. Fetch all customers
    const { data: rawCustomers } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    // 3. Enrich all purchases with partial payments and bill numbers
    const allEnrichedPurchases = (rawPurchases || []).map((p) =>
      enrichPurchaseWithPayments(p as any, p.audit_logs || [])
    );

    // Filter by date range if provided
    let filteredPurchases = allEnrichedPurchases;
    if (startDateParam) {
      const start = new Date(startDateParam).getTime();
      filteredPurchases = filteredPurchases.filter((p) => new Date(p.purchase_date).getTime() >= start);
    }
    if (endDateParam) {
      // Set end date to end of the day 23:59:59.999
      const end = new Date(endDateParam);
      end.setHours(23, 59, 59, 999);
      filteredPurchases = filteredPurchases.filter((p) => new Date(p.purchase_date).getTime() <= end.getTime());
    }

    // Filter by status if requested
    if (statusParam === 'PENDING') {
      filteredPurchases = filteredPurchases.filter((p) => p.payment_status === 'PENDING');
    } else if (statusParam === 'PARTIAL') {
      filteredPurchases = filteredPurchases.filter((p) => p.payment_status === 'PARTIAL');
    } else if (statusParam === 'PAID') {
      filteredPurchases = filteredPurchases.filter((p) => p.payment_status === 'PAID');
    } else if (statusParam === 'PENDING_OR_PARTIAL') {
      filteredPurchases = filteredPurchases.filter((p) => p.payment_status !== 'PAID');
    }

    // Filter by search term
    if (searchParam) {
      filteredPurchases = filteredPurchases.filter((p) => {
        const cName = p.customer?.name?.toLowerCase() || '';
        const cPhone = p.customer?.whatsapp_number || '';
        const bNo = (p.bill_number || '').toLowerCase();
        return cName.includes(searchParam) || cPhone.includes(searchParam) || bNo.includes(searchParam);
      });
    }

    // -------------------------------------------------------------
    // A. BILLS REPORT ITEMS
    // -------------------------------------------------------------
    const billsReport: BillReportItem[] = filteredPurchases.map((p) => {
      const items = p.items || [];
      const itemsSummary = items.map((i) => `${i.item_name} (×${i.quantity})`).join(', ');

      return {
        id: p.id,
        bill_number: p.bill_number || `BILL-${p.id.slice(0, 4).toUpperCase()}`,
        purchase_date: p.purchase_date,
        customer_id: p.customer_id,
        customer_name: p.customer?.name || 'Customer',
        whatsapp_number: p.customer?.whatsapp_number || '',
        items_count: items.length,
        items_summary: itemsSummary,
        gross_total: Number(p.gross_total) || 0,
        total_discount: Number(p.total_discount) || 0,
        amount_payable: Number(p.amount_payable) || 0,
        paid_amount: Number(p.paid_amount || 0),
        balance_due: Number(p.balance_due !== undefined ? p.balance_due : p.amount_payable),
        payment_status: p.payment_status,
        payment_received_at: p.payment_received_at,
      };
    });

    // -------------------------------------------------------------
    // B. CUSTOMERS REPORT ITEMS
    // -------------------------------------------------------------
    const customerMap = new Map<string, CustomerReportItem>();
    for (const c of rawCustomers || []) {
      customerMap.set(c.id, {
        id: c.id,
        name: c.name,
        whatsapp_number: c.whatsapp_number,
        total_bills_count: 0,
        total_billed: 0,
        total_paid: 0,
        outstanding_balance: 0,
        last_bill_date: null,
        last_payment_date: null,
        status: 'SETTLED',
      });
    }

    for (const p of allEnrichedPurchases) {
      if (!p.customer_id) continue;
      let cust = customerMap.get(p.customer_id);
      if (!cust && p.customer) {
        cust = {
          id: p.customer.id,
          name: p.customer.name,
          whatsapp_number: p.customer.whatsapp_number,
          total_bills_count: 0,
          total_billed: 0,
          total_paid: 0,
          outstanding_balance: 0,
          last_bill_date: null,
          last_payment_date: null,
          status: 'SETTLED',
        };
        customerMap.set(p.customer_id, cust);
      }

      if (cust) {
        cust.total_bills_count += 1;
        cust.total_billed += Number(p.amount_payable) || 0;
        cust.total_paid += Number(p.paid_amount) || 0;
        cust.outstanding_balance += Number(p.balance_due !== undefined ? p.balance_due : 0);

        if (!cust.last_bill_date || new Date(p.purchase_date) > new Date(cust.last_bill_date)) {
          cust.last_bill_date = p.purchase_date;
        }

        // Check latest payment
        if (p.payments && p.payments.length > 0) {
          const latestPay = p.payments[p.payments.length - 1];
          if (!cust.last_payment_date || new Date(latestPay.paid_at) > new Date(cust.last_payment_date)) {
            cust.last_payment_date = latestPay.paid_at;
          }
        }
      }
    }

    const customersReport: CustomerReportItem[] = Array.from(customerMap.values()).map((c) => {
      const outstanding = roundToTwoDecimals(c.outstanding_balance);
      const daysSinceLastBill = c.last_bill_date ? getPendingDaysCount(c.last_bill_date) : 0;
      let status: 'SETTLED' | 'PENDING' | 'OVERDUE' = 'SETTLED';
      if (outstanding > 0) {
        status = daysSinceLastBill > 15 ? 'OVERDUE' : 'PENDING';
      }

      return {
        ...c,
        total_billed: roundToTwoDecimals(c.total_billed),
        total_paid: roundToTwoDecimals(c.total_paid),
        outstanding_balance: outstanding,
        status,
      };
    });

    // -------------------------------------------------------------
    // C. PAYMENTS REPORT ITEMS (Itemized payment collections)
    // -------------------------------------------------------------
    const paymentsReport: PaymentReportItem[] = [];
    for (const p of allEnrichedPurchases) {
      if (p.payments && p.payments.length > 0) {
        for (const pay of p.payments) {
          // If date range active, check against payment date
          if (startDateParam && new Date(pay.paid_at).getTime() < new Date(startDateParam).getTime()) {
            continue;
          }
          if (endDateParam) {
            const end = new Date(endDateParam);
            end.setHours(23, 59, 59, 999);
            if (new Date(pay.paid_at).getTime() > end.getTime()) continue;
          }

          paymentsReport.push({
            id: pay.id,
            receipt_number: pay.receipt_number || `RCP-${pay.id.slice(0, 4).toUpperCase()}`,
            paid_at: pay.paid_at,
            purchase_id: p.id,
            bill_number: p.bill_number || `BILL-${p.id.slice(0, 4).toUpperCase()}`,
            customer_name: p.customer?.name || 'Customer',
            whatsapp_number: p.customer?.whatsapp_number || '',
            amount: Number(pay.amount) || 0,
            payment_mode: pay.payment_mode || 'CASH',
            notes: pay.notes || null,
          });
        }
      }
    }

    // Sort payments newest first
    paymentsReport.sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());

    // -------------------------------------------------------------
    // D. AGING & OVERDUE REPORT
    // -------------------------------------------------------------
    const agingReport: AgingReportBucket[] = [
      {
        bracket: '0_7_DAYS',
        title: '0 - 7 Days (Fresh Credit)',
        description: 'Recently issued credit bills within the normal grace period.',
        bills_count: 0,
        customers_count: 0,
        total_amount: 0,
        bills: [],
      },
      {
        bracket: '8_15_DAYS',
        title: '8 - 15 Days (Follow-up Due)',
        description: 'Payment reminder due; customer should be gently reminded.',
        bills_count: 0,
        customers_count: 0,
        total_amount: 0,
        bills: [],
      },
      {
        bracket: '16_30_DAYS',
        title: '16 - 30 Days (Overdue Warning)',
        description: 'Pending for more than 2 weeks. Action recommended.',
        bills_count: 0,
        customers_count: 0,
        total_amount: 0,
        bills: [],
      },
      {
        bracket: 'OVER_30_DAYS',
        title: '30+ Days (Critical Overdue)',
        description: 'Long outstanding credit bills requiring immediate collection.',
        bills_count: 0,
        customers_count: 0,
        total_amount: 0,
        bills: [],
      },
    ];

    const agingCustomerSets = {
      '0_7_DAYS': new Set<string>(),
      '8_15_DAYS': new Set<string>(),
      '16_30_DAYS': new Set<string>(),
      OVER_30_DAYS: new Set<string>(),
    };

    for (const p of allEnrichedPurchases) {
      const bal = Number(p.balance_due !== undefined ? p.balance_due : (p.payment_status === 'PAID' ? 0 : p.amount_payable));
      if (bal <= 0 || p.payment_status === 'PAID') continue;

      const days = getPendingDaysCount(p.purchase_date);
      let targetIndex = 0;
      let bracketKey: '0_7_DAYS' | '8_15_DAYS' | '16_30_DAYS' | 'OVER_30_DAYS' = '0_7_DAYS';

      if (days <= 7) {
        targetIndex = 0;
        bracketKey = '0_7_DAYS';
      } else if (days <= 15) {
        targetIndex = 1;
        bracketKey = '8_15_DAYS';
      } else if (days <= 30) {
        targetIndex = 2;
        bracketKey = '16_30_DAYS';
      } else {
        targetIndex = 3;
        bracketKey = 'OVER_30_DAYS';
      }

      agingReport[targetIndex].bills_count += 1;
      agingReport[targetIndex].total_amount = roundToTwoDecimals(agingReport[targetIndex].total_amount + bal);
      agingCustomerSets[bracketKey].add(p.customer_id);

      agingReport[targetIndex].bills.push({
        id: p.id,
        bill_number: p.bill_number || `BILL-${p.id.slice(0, 4).toUpperCase()}`,
        customer_name: p.customer?.name || 'Customer',
        whatsapp_number: p.customer?.whatsapp_number || '',
        purchase_date: p.purchase_date,
        days_pending: days,
        amount_payable: Number(p.amount_payable) || 0,
        balance_due: bal,
      });
    }

    agingReport[0].customers_count = agingCustomerSets['0_7_DAYS'].size;
    agingReport[1].customers_count = agingCustomerSets['8_15_DAYS'].size;
    agingReport[2].customers_count = agingCustomerSets['16_30_DAYS'].size;
    agingReport[3].customers_count = agingCustomerSets['OVER_30_DAYS'].size;

    // -------------------------------------------------------------
    // E. PRODUCT / MEDICINE SALES REPORT
    // -------------------------------------------------------------
    const productMap = new Map<string, ProductReportItem>();
    for (const p of filteredPurchases) {
      for (const item of p.items || []) {
        const rawName = (item.item_name || '').trim();
        if (!rawName) continue;
        const normKey = rawName.toUpperCase();

        const current = productMap.get(normKey) || {
          item_name: rawName,
          total_quantity: 0,
          total_gross: 0,
          total_discount: 0,
          total_net: 0,
          bills_count: 0,
        };

        const qty = Number(item.quantity) || 1;
        const gross = Number(item.gross_amount) || (qty * (Number(item.mrp) || 0));
        const disc = Number(item.discount) || 0;
        const net = Number(item.net_amount) || (gross - disc);

        current.total_quantity += qty;
        current.total_gross = roundToTwoDecimals(current.total_gross + gross);
        current.total_discount = roundToTwoDecimals(current.total_discount + disc);
        current.total_net = roundToTwoDecimals(current.total_net + net);
        current.bills_count += 1;

        productMap.set(normKey, current);
      }
    }

    const productsReport = Array.from(productMap.values()).sort((a, b) => b.total_net - a.total_net);

    // -------------------------------------------------------------
    // F. OVERALL SUMMARY METRICS
    // -------------------------------------------------------------
    let totalSales = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let totalDiscountGiven = 0;

    for (const b of billsReport) {
      totalSales += b.amount_payable;
      totalCollected += b.paid_amount;
      totalOutstanding += b.balance_due;
      totalDiscountGiven += b.total_discount;
    }

    const summary = {
      total_invoices_count: billsReport.length,
      total_customers_count: customerMap.size,
      total_sales_amount: roundToTwoDecimals(totalSales),
      total_collected_amount: roundToTwoDecimals(totalCollected),
      total_outstanding_amount: roundToTwoDecimals(totalOutstanding),
      total_discount_amount: roundToTwoDecimals(totalDiscountGiven),
      total_payments_count: paymentsReport.length,
    };

    return NextResponse.json({
      success: true,
      summary,
      bills: billsReport,
      customers: customersReport,
      payments: paymentsReport,
      aging: agingReport,
      products: productsReport,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate reports';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
