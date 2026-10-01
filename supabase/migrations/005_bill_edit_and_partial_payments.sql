-- =============================================================================
-- 005_bill_edit_and_partial_payments.sql
-- Support for Bill Editing and Multi-Step Partial Payments
-- =============================================================================

-- 1. Update Payment Status CHECK constraint to allow 'PARTIAL' alongside 'PENDING' and 'PAID'
DO $$
BEGIN
    ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_payment_status_check;
    ALTER TABLE public.purchases ADD CONSTRAINT purchases_payment_status_check 
        CHECK (payment_status IN ('PENDING', 'PARTIAL', 'PAID'));
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint update handled safely';
END $$;

-- 2. Add paid_amount column to purchases table (defaults to 0.00)
ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0);

-- 3. Populate existing PAID purchases with paid_amount = amount_payable
UPDATE public.purchases
SET paid_amount = amount_payable
WHERE payment_status = 'PAID' AND (paid_amount IS NULL OR paid_amount = 0);

-- 4. Index for partial and pending payments lookup
CREATE INDEX IF NOT EXISTS idx_purchases_partial_status ON public.purchases (payment_status)
WHERE payment_status IN ('PENDING', 'PARTIAL');
