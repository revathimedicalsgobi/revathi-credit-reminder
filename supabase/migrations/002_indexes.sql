-- =============================================================================
-- 002_indexes.sql
-- Performance Indexes for Quick Filtering and Retention Operations
-- =============================================================================

-- Customer indexes
CREATE INDEX IF NOT EXISTS idx_customers_whatsapp ON public.customers (whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers (name);

-- Purchase indexes
CREATE INDEX IF NOT EXISTS idx_purchases_customer_id ON public.purchases (customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases (payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases (purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_received_at ON public.purchases (payment_received_at);

-- Partial index for active PENDING payments (hot query path)
CREATE INDEX IF NOT EXISTS idx_purchases_pending_active ON public.purchases (purchase_date DESC)
WHERE payment_status = 'PENDING';

-- Partial index for 30-day paid cleanup candidates
CREATE INDEX IF NOT EXISTS idx_purchases_paid_cleanup ON public.purchases (payment_received_at)
WHERE payment_status = 'PAID' AND payment_received_at IS NOT NULL;

-- Purchase items indexes
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items (purchase_id);

-- Reminder logs indexes
CREATE INDEX IF NOT EXISTS idx_reminder_logs_purchase_id ON public.reminder_logs (purchase_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_date ON public.reminder_logs (reminder_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_logs_idempotency ON public.reminder_logs (purchase_id, reminder_date, message_type);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_purchase_id ON public.audit_logs (purchase_id);
