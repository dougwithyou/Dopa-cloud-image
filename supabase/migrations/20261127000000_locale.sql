-- =============================================================================
-- Idioma (inglés / español)
--  * creators.locale: idioma del fotógrafo, para sus correos. Lo fija el
--    servidor (al usar el panel o elegir idioma).
--  * print_orders.locale: idioma del comprador al pagar, para los correos del
--    pedido y Stripe Checkout.
-- Migración no destructiva.
-- =============================================================================

alter table public.creators
  add column if not exists locale text not null default 'en' check (locale in ('en', 'es'));

alter table public.print_orders
  add column if not exists locale text not null default 'en' check (locale in ('en', 'es'));
