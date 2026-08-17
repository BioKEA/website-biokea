-- 0007_shopify.sql
--
-- The payment rail moved from Stripe Invoices to Shopify Draft Orders before
-- anything reached production, so the Stripe-specific column names are
-- renamed to provider-neutral ones rather than duplicated. Apply after 0006.
-- Supabase Dashboard → SQL Editor, paste, run.

alter table public.quote_payments rename column stripe_invoice_id   to external_id;   -- Shopify DraftOrder GID
alter table public.quote_payments rename column hosted_invoice_url  to hosted_url;    -- draft invoiceUrl (Shopify checkout)
alter table public.quote_payments rename column invoice_pdf         to pdf_url;       -- unused for Shopify; kept nullable
alter table public.quote_payments
  add column if not exists provider          text not null default 'shopify' check (provider in ('shopify')),
  add column if not exists order_ref         text,   -- Shopify order name once paid, e.g. #1042
  add column if not exists external_order_id text;   -- numeric Shopify order id as text, for webhook lookups
alter table public.quotes rename column stripe_customer_id to external_customer_id;

alter table public.stripe_events rename to webhook_events;
alter table public.webhook_events add column if not exists provider text not null default 'shopify';
-- Grows unbounded; safe to prune rows older than ~90 days.
