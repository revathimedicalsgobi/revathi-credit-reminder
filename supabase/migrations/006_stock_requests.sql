-- =============================================================================
-- 006_stock_requests.sql
-- Customer Unavailable Stock / Medicine Pre-Orders & Arrival Notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.stock_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    whatsapp_number TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity TEXT NULL DEFAULT '1',
    notes TEXT NULL,
    image_url TEXT NULL,
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'ARRIVED', 'NOTIFIED', 'FULFILLED', 'CANCELLED')),
    requested_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    arrived_at TIMESTAMPTZ NULL,
    notified_at TIMESTAMPTZ NULL,
    whatsapp_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (whatsapp_status IN ('PENDING', 'SENT', 'FAILED')),
    whatsapp_message_id TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON public.stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_stock_requests_customer ON public.stock_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_phone ON public.stock_requests(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_stock_requests_created_at ON public.stock_requests(created_at DESC);

-- Updated_at trigger
DROP TRIGGER IF EXISTS set_stock_requests_updated_at ON public.stock_requests;
CREATE TRIGGER set_stock_requests_updated_at
    BEFORE UPDATE ON public.stock_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated and service_role full access to stock_requests"
    ON public.stock_requests
    FOR ALL
    USING (true)
    WITH CHECK (true);
