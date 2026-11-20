-- =============================================================================
-- 007_add_bill_number_and_reports.sql
-- Support for Bill Number Option, Payments Register, and Reports
-- =============================================================================

-- 1. Add bill_number column to purchases table
ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS bill_number TEXT;

-- 2. Index for quick bill number searches and lookups
CREATE INDEX IF NOT EXISTS idx_purchases_bill_number ON public.purchases (bill_number);

-- 3. Backfill existing purchases with readable sequential bill numbers
UPDATE public.purchases
SET bill_number = 'BILL-' || TO_CHAR(purchase_date, 'YYMM') || '-' || UPPER(SUBSTRING(id::text FROM 1 FOR 4))
WHERE bill_number IS NULL;

-- 4. Create dedicated Payments table for blazingly fast collection reports and receipts
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    receipt_number TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_mode TEXT NOT NULL DEFAULT 'CASH',
    notes TEXT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payments_purchase_id ON public.payments (purchase_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments (paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_receipt_number ON public.payments (receipt_number);

-- Enable RLS for payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated and service_role full access to payments"
    ON public.payments
    FOR ALL
    USING (true)
    WITH CHECK (true);
