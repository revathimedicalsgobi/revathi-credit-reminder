import { createAdminClient } from '../supabase/admin';
import { normalizeWhatsAppNumber, isValidWhatsAppNumber } from '../validations';
import { calculatePurchaseSummary, formatINR, roundToTwoDecimals } from '../calculations';
import { computePurchasePaymentDetails, enrichPurchaseWithPayments } from '../payment-helpers';
import { getWhatsAppProvider } from '../whatsapp';
import { startOfDay, endOfDay } from 'date-fns';

export interface CreateBillItemInput {
  item_name: string;
  quantity: number;
  mrp: number;
  discount_percent?: number;
}

export interface CreateBillInput {
  customer_name: string;
  whatsapp_number?: string;
  items: CreateBillItemInput[];
  send_whatsapp?: boolean;
}

export interface ActionResult {
  type: 'BILL_CREATED' | 'CUSTOMER_BALANCE' | 'PAYMENT_RECORDED' | 'BUSINESS_STATS' | 'REMINDER_SENT' | 'INFO';
  data: any;
  message: string;
}

/**
 * 1. CREATE BILL TOOL
 */
export async function executeCreateBill(input: CreateBillInput): Promise<ActionResult> {
  const supabase = createAdminClient();
  const customerName = (input.customer_name || 'Customer').trim();
  let phone = (input.whatsapp_number || '').trim();

  // If phone not provided, check if customer already exists in Supabase
  if (!phone || !isValidWhatsAppNumber(normalizeWhatsAppNumber(phone))) {
    const { data: existing } = await supabase
      .from('customers')
      .select('whatsapp_number')
      .ilike('name', `%${customerName}%`)
      .limit(1)
      .maybeSingle();

    if (existing?.whatsapp_number) {
      phone = existing.whatsapp_number;
    } else {
      phone = '+919876543210'; // Default placeholder if not specified
    }
  }

  const normalizedPhone = normalizeWhatsAppNumber(phone);

  const rawItems = (input.items && input.items.length > 0)
    ? input.items
    : [{ item_name: 'General Medicine', quantity: 1, mrp: 100, discount_percent: 0 }];

  const calculated = calculatePurchaseSummary(
    rawItems.map((item) => ({
      item_name: item.item_name || 'Item',
      quantity: Math.max(1, Number(item.quantity) || 1),
      mrp: Math.max(0, Number(item.mrp) || 0),
      discount_percent: Math.max(0, Number(item.discount_percent) || 0),
    }))
  );

  // 1. Get or create customer
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('*')
    .eq('whatsapp_number', normalizedPhone)
    .maybeSingle();

  let customerId = existingCustomer?.id;

  if (!existingCustomer) {
    const { data: newCustomer, error: custErr } = await supabase
      .from('customers')
      .insert({
        name: customerName,
        whatsapp_number: normalizedPhone,
      })
      .select()
      .single();

    if (custErr) {
      throw new Error(`Customer creation failed: ${custErr.message}`);
    }
    customerId = newCustomer.id;
  } else if (customerName && existingCustomer.name !== customerName) {
    await supabase.from('customers').update({ name: customerName }).eq('id', customerId);
  }

  // 2. Insert Purchase
  const { data: purchase, error: purchaseErr } = await supabase
    .from('purchases')
    .insert({
      customer_id: customerId,
      gross_total: calculated.gross_total,
      total_discount: calculated.total_discount,
      amount_payable: calculated.amount_payable,
      payment_status: 'PENDING',
      whatsapp_status: 'PENDING',
    })
    .select()
    .single();

  if (purchaseErr) {
    throw new Error(`Purchase insertion failed: ${purchaseErr.message}`);
  }

  // 3. Insert Purchase Items
  const itemsToInsert = calculated.items.map((item) => ({
    purchase_id: purchase.id,
    item_name: item.item_name,
    quantity: item.quantity,
    mrp: item.mrp,
    discount: item.discount_amount,
    gross_amount: item.gross_amount,
    net_amount: item.net_amount,
  }));

  await supabase.from('purchase_items').insert(itemsToInsert);

  // 4. Fetch Previous Unpaid Balance
  const { data: previousPending } = await supabase
    .from('purchases')
    .select('id, amount_payable')
    .eq('customer_id', customerId)
    .eq('payment_status', 'PENDING')
    .neq('id', purchase.id);

  const previousBalance = (previousPending || []).reduce(
    (sum, p) => sum + Number(p.amount_payable || 0),
    0
  );
  const cumulativeTotal = previousBalance + calculated.amount_payable;

  // 5. WhatsApp notification (if enabled)
  let whatsappSent = false;
  let whatsappError: string | null = null;

  if (input.send_whatsapp !== false) {
    try {
      const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      const whatsappProvider = getWhatsAppProvider();

      const res = await whatsappProvider.sendPurchaseSummary({
        customerName,
        recipientPhone: normalizedPhone,
        purchaseId: purchase.id,
        purchaseDate: purchase.purchase_date || new Date().toISOString(),
        amountPayable: calculated.amount_payable,
        grossTotal: calculated.gross_total,
        totalDiscount: calculated.total_discount,
        items: calculated.items.map((i) => ({
          itemName: i.item_name,
          quantity: i.quantity,
          mrp: i.mrp,
          discount: i.discount_amount,
          netAmount: i.net_amount,
        })),
        pharmacyName: settings?.pharmacy_name || 'Revathi Medicals & Distributors',
        upiId: settings?.upi_id || null,
        paymentQrUrl: settings?.payment_qr_url || null,
        previousBalance,
        cumulativeTotal,
      });

      whatsappSent = res.success;
      if (!res.success) {
        whatsappError = res.error || null;
      }
    } catch (err: any) {
      whatsappError = err?.message || 'WhatsApp sending error';
    }
  }

  const cleanPhone = normalizedPhone.replace(/[^\d]/g, '');
  const waShareUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    `வணக்கம் ${customerName}, உங்கள் பில் தொகை: ${formatINR(calculated.amount_payable)}. நன்றி - Revathi Medicals`
  )}`;

  return {
    type: 'BILL_CREATED',
    message: `பில் வெற்றிகரமாக உருவாக்கப்பட்டது! ${customerName}-க்கு மொத்த தொகை ${formatINR(calculated.amount_payable)}.`,
    data: {
      purchase_id: purchase.id,
      customer_name: customerName,
      whatsapp_number: normalizedPhone,
      amount_payable: calculated.amount_payable,
      gross_total: calculated.gross_total,
      total_discount: calculated.total_discount,
      items: calculated.items,
      whatsapp_sent: whatsappSent,
      whatsapp_error: whatsappError,
      previous_balance: previousBalance,
      cumulative_total: cumulativeTotal,
      view_url: `/purchases/${purchase.id}`,
      whatsapp_direct_url: waShareUrl,
    },
  };
}

/**
 * 2. GET CUSTOMER BALANCE TOOL
 */
export async function executeGetCustomerPending(query: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const cleanQuery = (query || '').trim();

  if (!cleanQuery) {
    return {
      type: 'INFO',
      message: 'தயவுசெய்து கஸ்டமரின் பெயர் அல்லது ஃபோன் நம்பரை குறிப்பிடவும்.',
      data: null,
    };
  }

  // Find customers matching name or phone
  const { data: customers, error } = await supabase
    .from('customers')
    .select(`
      id, name, whatsapp_number,
      purchases(
        id, amount_payable, payment_status, purchase_date,
        audit_logs(*)
      )
    `)
    .or(`name.ilike.%${cleanQuery}%,whatsapp_number.ilike.%${cleanQuery}%`)
    .limit(5);

  if (error || !customers || customers.length === 0) {
    return {
      type: 'INFO',
      message: `"${cleanQuery}" என்ற பெயரில் எந்த கஸ்டமரும் கிடைக்கவில்லை.`,
      data: { query: cleanQuery, found: false },
    };
  }

  const results = customers.map((c) => {
    const rawPurchases = c.purchases || [];
    let totalPending = 0;
    const pendingBills: Array<{ id: string; date: string; amount: number; balance: number }> = [];

    for (const p of rawPurchases) {
      const enriched = computePurchasePaymentDetails(p as any, (p as any).audit_logs || []);
      if (enriched.payment_status !== 'PAID' && enriched.balance_due > 0) {
        totalPending += enriched.balance_due;
        pendingBills.push({
          id: p.id,
          date: p.purchase_date,
          amount: Number(p.amount_payable) || 0,
          balance: enriched.balance_due,
        });
      }
    }

    return {
      customer_id: c.id,
      customer_name: c.name,
      whatsapp_number: c.whatsapp_number,
      total_pending: roundToTwoDecimals(totalPending),
      pending_bills_count: pendingBills.length,
      pending_bills: pendingBills,
    };
  });

  const target = results[0];
  const msg = target.total_pending > 0
    ? `${target.customer_name} அவர்களின் நிலுவைத் தொகை: ${formatINR(target.total_pending)} (${target.pending_bills_count} பில்கள்).`
    : `${target.customer_name} அவர்களிடம் எந்த பாக்கியும் இல்லை (முழுமையாக செலுத்தப்பட்டது).`;

  return {
    type: 'CUSTOMER_BALANCE',
    message: msg,
    data: {
      primary: target,
      all_matches: results,
    },
  };
}

/**
 * 3. RECORD PAYMENT TOOL
 */
export async function executeRecordPayment(
  customerQuery: string,
  amount?: number,
  paymentMode: string = 'CASH',
  notes: string = ''
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const cleanQuery = (customerQuery || '').trim();

  // Find customer
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, whatsapp_number')
    .or(`name.ilike.%${cleanQuery}%,whatsapp_number.ilike.%${cleanQuery}%`)
    .limit(1);

  if (!customers || customers.length === 0) {
    return {
      type: 'INFO',
      message: `"${cleanQuery}" என்ற வாடிக்கையாளர் கண்டுபிடிக்கப்படவில்லை.`,
      data: null,
    };
  }

  const customer = customers[0];

  // Fetch their pending purchases ordered by oldest first
  const { data: purchases } = await supabase
    .from('purchases')
    .select('*, audit_logs(*)')
    .eq('customer_id', customer.id)
    .neq('payment_status', 'PAID')
    .order('purchase_date', { ascending: true });

  if (!purchases || purchases.length === 0) {
    return {
      type: 'INFO',
      message: `${customer.name}-க்கு எந்த நிலுவை பில்லும் இல்லை (Already Paid).`,
      data: { customer_name: customer.name },
    };
  }

  // Calculate total pending
  const pendingWithBalances = purchases.map((p) => {
    const details = computePurchasePaymentDetails(p, p.audit_logs || []);
    return { purchase: p, details };
  }).filter((item) => item.details.balance_due > 0);

  if (pendingWithBalances.length === 0) {
    return {
      type: 'INFO',
      message: `${customer.name}-க்கு எந்த நிலுவைத் தொகையும் இல்லை.`,
      data: { customer_name: customer.name },
    };
  }

  const totalOutstanding = pendingWithBalances.reduce((sum, item) => sum + item.details.balance_due, 0);
  const paymentToApply = (amount && amount > 0) ? Math.min(amount, totalOutstanding) : totalOutstanding;

  let remainingToDistribute = paymentToApply;
  const timestamp = new Date().toISOString();
  const updatedPurchases = [];

  for (const item of pendingWithBalances) {
    if (remainingToDistribute <= 0) break;

    const p = item.purchase;
    const due = item.details.balance_due;
    const payThisBill = Math.min(remainingToDistribute, due);
    const newTotalPaid = item.details.paid_amount + payThisBill;
    const isSettled = payThisBill >= due;

    // Update purchase
    await supabase
      .from('purchases')
      .update({
        payment_status: isSettled ? 'PAID' : 'PENDING',
        payment_received_at: isSettled ? timestamp : p.payment_received_at,
        updated_at: timestamp,
      })
      .eq('id', p.id);

    // Insert Audit log
    await supabase.from('audit_logs').insert({
      purchase_id: p.id,
      previous_status: item.details.payment_status,
      new_status: isSettled ? 'PAID' : 'PARTIAL_PAYMENT',
      notes: JSON.stringify({
        type: 'PAYMENT',
        amount: payThisBill,
        payment_mode: paymentMode,
        notes: notes || `AI Agent payment for ${customer.name}`,
        previous_paid: item.details.paid_amount,
        new_total_paid: newTotalPaid,
        remaining_balance: Math.max(0, due - payThisBill),
        paid_at: timestamp,
      }),
    });

    remainingToDistribute -= payThisBill;
    updatedPurchases.push({
      purchase_id: p.id,
      paid_for_bill: payThisBill,
      settled: isSettled,
    });
  }

  const remainingCustomerBalance = roundToTwoDecimals(Math.max(0, totalOutstanding - paymentToApply));

  return {
    type: 'PAYMENT_RECORDED',
    message: `${customer.name}-க்கு ${formatINR(paymentToApply)} பணம் பதிவு செய்யப்பட்டது. மீதமுள்ள பாக்கி: ${formatINR(remainingCustomerBalance)}.`,
    data: {
      customer_name: customer.name,
      amount_paid: paymentToApply,
      remaining_balance: remainingCustomerBalance,
      payment_mode: paymentMode,
      updated_purchases_count: updatedPurchases.length,
    },
  };
}

/**
 * 4. GET BUSINESS STATS TOOL
 */
export async function executeGetBusinessStats(): Promise<ActionResult> {
  const supabase = createAdminClient();
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  // 1. Today's Purchases
  const { data: todayPurchases } = await supabase
    .from('purchases')
    .select('id, amount_payable')
    .gte('purchase_date', todayStart)
    .lte('purchase_date', todayEnd);

  const todaySales = (todayPurchases || []).reduce((sum, p) => sum + Number(p.amount_payable || 0), 0);

  // 2. All pending purchases to calculate total credit outstanding
  const { data: activePurchases } = await supabase
    .from('purchases')
    .select('id, customer_id, amount_payable, payment_status, audit_logs(*)')
    .eq('payment_status', 'PENDING');

  let totalCreditOutstanding = 0;
  const debtorCustomers = new Set<string>();

  for (const p of activePurchases || []) {
    const enriched = computePurchasePaymentDetails(p as any, (p as any).audit_logs || []);
    if (enriched.payment_status !== 'PAID' && enriched.balance_due > 0) {
      totalCreditOutstanding += enriched.balance_due;
      if (p.customer_id) debtorCustomers.add(p.customer_id);
    }
  }

  // 3. Today's collections
  const { data: todayAuditLogs } = await supabase
    .from('audit_logs')
    .select('notes')
    .gte('changed_at', todayStart)
    .lte('changed_at', todayEnd);

  let todayCollections = 0;
  for (const log of todayAuditLogs || []) {
    if (log.notes && log.notes.startsWith('{')) {
      try {
        const parsed = JSON.parse(log.notes);
        if (parsed.type === 'PAYMENT' && parsed.amount) {
          todayCollections += Number(parsed.amount) || 0;
        }
      } catch {}
    }
  }

  return {
    type: 'BUSINESS_STATS',
    message: `இன்றைய விற்பனை: ${formatINR(todaySales)} | வசூல்: ${formatINR(todayCollections)} | மொத்த கடன் பாக்கி: ${formatINR(totalCreditOutstanding)} (${debtorCustomers.size} கஸ்டமர்கள்).`,
    data: {
      today_sales: roundToTwoDecimals(todaySales),
      today_bills_count: (todayPurchases || []).length,
      today_collections: roundToTwoDecimals(todayCollections),
      total_credit_outstanding: roundToTwoDecimals(totalCreditOutstanding),
      active_credit_customers_count: debtorCustomers.size,
    },
  };
}

/**
 * 5. SEND PAYMENT REMINDER TOOL
 */
export async function executeSendReminder(customerQuery: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const cleanQuery = (customerQuery || '').trim();

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, whatsapp_number')
    .or(`name.ilike.%${cleanQuery}%,whatsapp_number.ilike.%${cleanQuery}%`)
    .limit(1);

  if (!customers || customers.length === 0) {
    return {
      type: 'INFO',
      message: `"${cleanQuery}" என்ற வாடிக்கையாளர் கிடைக்கவில்லை.`,
      data: null,
    };
  }

  const customer = customers[0];

  // Fetch oldest pending purchase
  const { data: purchases } = await supabase
    .from('purchases')
    .select('*, audit_logs(*)')
    .eq('customer_id', customer.id)
    .neq('payment_status', 'PAID')
    .order('purchase_date', { ascending: true })
    .limit(1);

  if (!purchases || purchases.length === 0) {
    return {
      type: 'INFO',
      message: `${customer.name}-க்கு எந்த நிலுவை பில்லும் இல்லை. ரிமைண்டர் அனுப்ப தேவையில்லை.`,
      data: null,
    };
  }

  const purchase = purchases[0];
  const enriched = enrichPurchaseWithPayments(purchase, purchase.audit_logs || []);
  const amountDue = enriched.balance_due || Number(purchase.amount_payable) || 0;

  const { data: settings } = await supabase.from('settings').select('*').limit(1).maybeSingle();
  const whatsappProvider = getWhatsAppProvider();

  const res = await whatsappProvider.sendPaymentReminder({
    customerName: customer.name,
    recipientPhone: customer.whatsapp_number,
    purchaseId: purchase.id,
    purchaseDate: purchase.purchase_date,
    amountPending: amountDue,
    pharmacyName: settings?.pharmacy_name || 'Revathi Medicals & Distributors',
    upiId: settings?.upi_id || null,
    paymentQrUrl: settings?.payment_qr_url || null,
    pendingDays: 1,
  });

  return {
    type: 'REMINDER_SENT',
    message: res.success
      ? `${customer.name}-க்கு ${formatINR(amountDue)} பாக்கிக்கான வாட்ஸ்அப் ரிமைண்டர் அனுப்பப்பட்டது!`
      : `${customer.name}-க்கு ரிமைண்டர் அனுப்ப முடியவில்லை: ${res.error || 'WhatsApp Provider Error'}`,
    data: {
      customer_name: customer.name,
      whatsapp_number: customer.whatsapp_number,
      amount_due: amountDue,
      success: res.success,
      error: res.error,
    },
  };
}

/**
 * GEMINI TOOL DECLARATIONS
 */
export const geminiToolDeclarations = [
  {
    name: 'create_bill',
    description: 'Create a new medical/pharmacy purchase bill for a customer and optionally send via WhatsApp. Understands Tamil and English.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customer_name: {
          type: 'STRING',
          description: 'Name of the customer (e.g. Ramesh, Suresh, Priya, etc.)',
        },
        whatsapp_number: {
          type: 'STRING',
          description: '10-digit Indian WhatsApp mobile number of the customer (e.g. 9876543210). If unknown, omit or empty.',
        },
        items: {
          type: 'ARRAY',
          description: 'List of medicine items or products being purchased',
          items: {
            type: 'OBJECT',
            properties: {
              item_name: { type: 'STRING', description: 'Medicine or product name (e.g. Dolo 650, Paracetamol, Gelusil)' },
              quantity: { type: 'NUMBER', description: 'Quantity count (default 1)' },
              mrp: { type: 'NUMBER', description: 'Unit price or MRP per unit in Rupees' },
              discount_percent: { type: 'NUMBER', description: 'Discount percentage 0 to 100 (optional, default 0)' },
            },
            required: ['item_name', 'quantity', 'mrp'],
          },
        },
        send_whatsapp: {
          type: 'BOOLEAN',
          description: 'Whether to dispatch WhatsApp notification immediately (default true)',
        },
      },
      required: ['customer_name', 'items'],
    },
  },
  {
    name: 'get_customer_balance',
    description: 'Check pending credit balance, unpaid bills, and statement for a specific customer by their name or phone number.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Customer name or phone number to look up (e.g. "Ramesh", "Suresh", "9876543210")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'record_payment',
    description: 'Record a cash, UPI, or GPAY payment received from a customer towards their pending credit balance.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customer_query: {
          type: 'STRING',
          description: 'Name or mobile number of the customer making the payment',
        },
        amount: {
          type: 'NUMBER',
          description: 'Amount in Rupees paid by the customer. If full settlement, omit or pass full amount.',
        },
        payment_mode: {
          type: 'STRING',
          description: 'Payment mode: CASH, UPI, GPAY, PHONEPE, or CARD',
        },
        notes: {
          type: 'STRING',
          description: 'Optional note or receipt remarks',
        },
      },
      required: ['customer_query'],
    },
  },
  {
    name: 'get_business_stats',
    description: 'Retrieve today business statistics including today sales, collections, and total credit pending in the shop.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'send_reminder',
    description: 'Send a WhatsApp payment reminder notification to a customer with pending balance.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customer_query: {
          type: 'STRING',
          description: 'Name or phone number of the customer who needs a reminder',
        },
      },
      required: ['customer_query'],
    },
  },
];

/**
 * SMART TAMIL/ENGLISH FALLBACK PARSER
 * Works even when Gemini API Key is missing or network fails!
 */
export async function executeFallbackRuleParser(input: string): Promise<{ reply: string; actionResult: ActionResult | null }> {
  const text = input.trim();
  const lower = text.toLowerCase();

  // 1. Business Stats / Today's Summary
  if (
    lower.includes('stat') ||
    lower.includes('sales') ||
    lower.includes('today') ||
    lower.includes('இன்றைய') ||
    lower.includes('விற்பனை') ||
    lower.includes('வசூல்') ||
    lower.includes('பாக்கி விபரம்')
  ) {
    const result = await executeGetBusinessStats();
    return {
      reply: `📊 **இன்றைய பிசினஸ் நிலவரம்:**\n• இன்றைய விற்பனை: **${formatINR(result.data.today_sales)}** (${result.data.today_bills_count} பில்கள்)\n• இன்றைய வசூல்: **${formatINR(result.data.today_collections)}**\n• மொத்த கடன் பாக்கி: **${formatINR(result.data.total_credit_outstanding)}** (${result.data.active_credit_customers_count} வாடிக்கையாளர்கள்)`,
      actionResult: result,
    };
  }

  // 2. Reminder
  if (lower.includes('reminder') || lower.includes('ரிமைண்டர்') || lower.includes('அனுப்பு')) {
    const cleaned = text.replace(/(reminder|ரிமைண்டர்|அனுப்பு|send|to|ku|-|—)/gi, ' ').trim();
    const nameMatch = cleaned.match(/[a-zA-Z\u0B80-\u0BFF]+/);
    const target = nameMatch ? nameMatch[0] : cleaned;
    if (target) {
      const result = await executeSendReminder(target);
      return {
        reply: result.message,
        actionResult: result,
      };
    }
  }

  // 3. Payment Received
  if (lower.includes('paid') || lower.includes('payment') || lower.includes('பணம்') || lower.includes('வசூலான')) {
    const amountMatch = text.match(/(?:rs\.?|inr|₹|\b)(\d+(?:\.\d{1,2})?)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : undefined;
    const namePart = text.replace(/(?:paid|payment|பணம்|வசூல்|ரூபாய்|rs\.?|₹|\d+)/gi, '').trim();
    const name = namePart.split(/\s+/)[0] || 'Customer';

    const result = await executeRecordPayment(name, amount, 'CASH');
    return {
      reply: result.message,
      actionResult: result,
    };
  }

  // 4. Pending / Balance Check
  if (
    lower.includes('balance') ||
    lower.includes('pending') ||
    lower.includes('பாக்கி') ||
    lower.includes('நிலுவை') ||
    lower.includes('check') ||
    lower.includes('செக்')
  ) {
    const cleaned = text.replace(/(balance|pending|பாக்கி|நிலுவை|check|செக்|evvalavu|எவ்வளவு|ku|-|for)/gi, ' ').trim();
    const name = cleaned.split(/\s+/)[0] || cleaned;
    if (name) {
      const result = await executeGetCustomerPending(name);
      return {
        reply: result.message,
        actionResult: result,
      };
    }
  }

  // 5. Bill Creation Pattern: e.g. "Ramesh ku Dolo 650 2 nos 60 bill podu" or "Bill for Suresh 9876543210 Paracetamol 100"
  if (
    lower.includes('bill') ||
    lower.includes('பில்') ||
    lower.includes('podu') ||
    lower.includes('போடு') ||
    lower.includes('create')
  ) {
    const phoneMatch = text.match(/(?:\+91|0)?[6-9]\d{9}/);
    const phone = phoneMatch ? phoneMatch[0] : '';

    // Extract numbers which could be prices or quantities
    const priceMatch = text.match(/(?:rs\.?|₹|\b)(\d{2,5})(?:\s*roova|\s*rupees)?/i);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 100;

    // Guess customer name
    const words = text.replace(/(bill|பில்|podu|போடு|create|for|ku|₹|rs\.?|\d+)/gi, ' ').trim().split(/\s+/);
    const customerName = words[0] || 'Customer';
    const itemName = words.slice(1).join(' ').trim() || 'General Medicine';

    const result = await executeCreateBill({
      customer_name: customerName,
      whatsapp_number: phone,
      items: [
        {
          item_name: itemName,
          quantity: 1,
          mrp: price,
          discount_percent: 0,
        },
      ],
      send_whatsapp: true,
    });

    return {
      reply: `✅ **பில் உருவாக்கப்பட்டது!**\n• கஸ்டமர்: **${result.data.customer_name}**\n• பொருள்: **${itemName}**\n• தொகை: **${formatINR(result.data.amount_payable)}**\n• வாட்ஸ்அப் மெசேஜ் தயார்!`,
      actionResult: result,
    };
  }

  // General helpful response in Tamil
  return {
    reply: `வணக்கம்! நான் உங்கள் **Revathi Medicals AI அசிஸ்டன்ட்** 🤖\n\nநீங்கள் வாய்ஸ் அல்லது டெக்ஸ்ட் மூலம் என்னை பயன்படுத்தலாம்:\n1. 📝 *"ரமேஷுக்கு Dolo 650 ₹60 பில் போடு"* \n2. 🔍 *"சுரேஷ் பாக்கி எவ்வளவு?"*\n3. 💵 *"ரமேஷ் ₹500 பணம் கொடுத்துட்டார்"* \n4. 📊 *"இன்றைய விற்பனை & வசூல் விபரம்"* \n5. 🔔 *"சுரேஷுக்கு ரிமைண்டர் அனுப்பு"*`,
    actionResult: null,
  };
}
