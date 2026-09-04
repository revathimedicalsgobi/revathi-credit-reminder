-- =============================================================================
-- 001_initial_schema.sql
-- Purchase Summary & Payment Follow-up Manager
-- Initial Schema Definition
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    whatsapp_number TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Purchases Table
-- Statuses: 'PENDING', 'PAID'
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    purchase_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    gross_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (gross_total >= 0),
    total_discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_discount >= 0),
    amount_payable NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount_payable >= 0),
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID')),
    payment_received_at TIMESTAMPTZ NULL,
    whatsapp_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (whatsapp_status IN ('PENDING', 'SENT', 'FAILED')),
    whatsapp_message_id TEXT NULL,
    whatsapp_last_sent_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Purchase Items Table
CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    mrp NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (mrp >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (gross_amount >= 0),
    net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (net_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Reminder Logs Table
CREATE TABLE IF NOT EXISTS public.reminder_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    reminder_date DATE NOT NULL DEFAULT CURRENT_DATE,
    pending_days INTEGER NOT NULL CHECK (pending_days >= 0),
    message_type TEXT NOT NULL DEFAULT 'PAYMENT_REMINDER' CHECK (message_type IN ('PURCHASE_SUMMARY', 'PAYMENT_REMINDER', 'PAYMENT_RECEIVED')),
    whatsapp_message_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT', 'FAILED', 'DELIVERED', 'READ')),
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Pharmacy Settings Table (Single-row configuration)
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_name TEXT NOT NULL DEFAULT 'Pharmacy & Healthcare',
    display_name TEXT NOT NULL DEFAULT 'Purchase Summary Manager',
    logo_url TEXT NULL,
    payment_qr_url TEXT NULL,
    upi_id TEXT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    reminders_enabled BOOLEAN NOT NULL DEFAULT true,
    max_reminder_days INTEGER NOT NULL DEFAULT 30 CHECK (max_reminder_days > 0),
    reminder_frequency TEXT NOT NULL DEFAULT 'daily',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Insert default settings row if table is empty
INSERT INTO public.settings (pharmacy_name, display_name, upi_id, timezone, reminders_enabled, max_reminder_days)
SELECT 'HealthPlus Pharmacy', 'HealthPlus Purchase Summary', 'pharmacy@upi', 'Asia/Kolkata', true, 30
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

-- 6. Audit Logs Table (Lightweight status transition audit)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    notes TEXT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
