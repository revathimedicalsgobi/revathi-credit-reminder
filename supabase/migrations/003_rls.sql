-- =============================================================================
-- 003_rls.sql
-- Row Level Security (RLS) Policies
-- Ensure only authenticated users and service roles can access pharmacy data
-- =============================================================================

-- Enable Row Level Security on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Customers RLS Policies
CREATE POLICY "Allow authenticated users to view customers"
    ON public.customers FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert customers"
    ON public.customers FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update customers"
    ON public.customers FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete customers"
    ON public.customers FOR DELETE
    TO authenticated
    USING (true);

-- 2. Purchases RLS Policies
CREATE POLICY "Allow authenticated users to view purchases"
    ON public.purchases FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert purchases"
    ON public.purchases FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update purchases"
    ON public.purchases FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete purchases"
    ON public.purchases FOR DELETE
    TO authenticated
    USING (true);

-- 3. Purchase Items RLS Policies
CREATE POLICY "Allow authenticated users to view purchase items"
    ON public.purchase_items FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert purchase items"
    ON public.purchase_items FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update purchase items"
    ON public.purchase_items FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete purchase items"
    ON public.purchase_items FOR DELETE
    TO authenticated
    USING (true);

-- 4. Reminder Logs RLS Policies
CREATE POLICY "Allow authenticated users to view reminder logs"
    ON public.reminder_logs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert reminder logs"
    ON public.reminder_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 5. Settings RLS Policies
CREATE POLICY "Allow authenticated users to view settings"
    ON public.settings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to update settings"
    ON public.settings FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 6. Audit Logs RLS Policies
CREATE POLICY "Allow authenticated users to view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);
