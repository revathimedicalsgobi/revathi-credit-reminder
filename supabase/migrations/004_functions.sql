-- =============================================================================
-- 004_functions.sql
-- Helper Functions, Automation Routines, and Trigger Functions
-- =============================================================================

-- Auto-update timestamp function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS set_customers_updated_at ON public.customers;
CREATE TRIGGER set_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_purchases_updated_at ON public.purchases;
CREATE TRIGGER set_purchases_updated_at
    BEFORE UPDATE ON public.purchases
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_settings_updated_at ON public.settings;
CREATE TRIGGER set_settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Function: 30-Day Paid Purchase Cleanup Function
-- Safely deletes PAID purchases where payment_received_at is older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_expired_paid_purchases()
RETURNS TABLE (deleted_count INTEGER) AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM public.purchases
        WHERE payment_status = 'PAID'
          AND payment_received_at IS NOT NULL
          AND payment_received_at <= (now() - INTERVAL '30 days')
        RETURNING id
    )
    SELECT COUNT(*)::INTEGER INTO v_count FROM deleted;
    
    RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
