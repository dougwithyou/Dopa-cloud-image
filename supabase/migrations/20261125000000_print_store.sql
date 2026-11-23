-- =============================================================================
-- Tienda de impresiones (Plan A: laboratorio de la plataforma, EE.UU.)
--
--  * print_products: catálogo del laboratorio (WHCC), una fila por producto y
--    tamaño, con las opciones completas para pedirlo y su costo mayorista.
--    Lo escribe solo el servidor (sincronización diaria).
--  * creators: cuenta de cobros (Stripe Connect Express) y margen por defecto.
--  * creator_product_prices: margen propio por producto y activar/desactivar.
--  * projects.store_enabled: tienda activada por galería.
--  * print_orders / print_order_items: pedidos de los clientes. Los escribe
--    solo el servidor; el creador los lee.
--  * lab_events: registro idempotente de los webhooks del laboratorio.
-- Migración no destructiva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table if not exists public.print_products (
  id             uuid primary key default gen_random_uuid(),
  lab            text not null,
  product_ref    text not null,
  product_name   text not null,
  category_ref   text not null,
  category_name  text not null,
  size_id        text not null,
  size_label     text not null,
  width_in       numeric,
  height_in      numeric,
  -- Opciones completas que se envían al laboratorio para este producto/tamaño.
  selections     jsonb not null default '{}'::jsonb,
  -- Costo mayorista por unidad (sin envío ni impuestos), en centavos de USD.
  cost_cents     integer not null check (cost_cents > 0),
  resolution     integer,
  description    text,
  sort           integer not null default 0,
  active         boolean not null default true,
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint print_products_variant_key unique (lab, product_ref, size_id)
);

revoke all on public.print_products from anon, authenticated;
grant all on public.print_products to service_role;
grant select on public.print_products to authenticated;
alter table public.print_products enable row level security;

-- Solo los creadores ven el catálogo (con costos mayoristas); los clientes no.
create policy print_products_creator_read on public.print_products
  for select to authenticated
  using ((select public.current_creator_id()) is not null);

-- -----------------------------------------------------------------------------
-- Creador: cobros y margen
-- -----------------------------------------------------------------------------
alter table public.creators
  add column if not exists stripe_connect_account_id text,
  add column if not exists connect_payouts_enabled boolean not null default false,
  add column if not exists store_markup_percent integer not null default 100
    check (store_markup_percent between 20 and 1000);

create unique index if not exists creators_stripe_connect_account_key
  on public.creators (stripe_connect_account_id) where stripe_connect_account_id is not null;

-- El creador solo puede cambiar su margen; la cuenta de cobros la fija el servidor.
grant update (store_markup_percent) on public.creators to authenticated;

create table if not exists public.creator_product_prices (
  creator_id     uuid not null references public.creators (id) on delete cascade,
  product_id     uuid not null references public.print_products (id) on delete cascade,
  -- null = usa el margen por defecto del creador.
  markup_percent integer check (markup_percent between 20 and 1000),
  enabled        boolean not null default true,
  updated_at     timestamptz not null default now(),
  primary key (creator_id, product_id)
);

revoke all on public.creator_product_prices from anon, authenticated;
grant all on public.creator_product_prices to service_role;
grant select, insert, update, delete on public.creator_product_prices to authenticated;
alter table public.creator_product_prices enable row level security;

create policy creator_product_prices_own on public.creator_product_prices
  for all to authenticated
  using (creator_id = (select public.current_creator_id()))
  with check (creator_id = (select public.current_creator_id()));

-- -----------------------------------------------------------------------------
-- Tienda por galería
-- -----------------------------------------------------------------------------
alter table public.projects
  add column if not exists store_enabled boolean not null default false;

grant update (store_enabled) on public.projects to authenticated;

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table if not exists public.print_orders (
  id                          uuid primary key default gen_random_uuid(),
  -- Identificador corto: va en la etiqueta del laboratorio y en los correos.
  reference                   text not null unique check (char_length(reference) <= 32),
  creator_id                  uuid not null references public.creators (id) on delete restrict,
  project_id                  uuid references public.projects (id) on delete set null,
  buyer_email                 text not null check (char_length(buyer_email) <= 254),
  buyer_name                  text not null check (char_length(buyer_name) <= 120),
  buyer_user_id               uuid,
  shipping_address            jsonb not null,
  status                      text not null default 'pending_payment' check (status in (
                                'pending_payment', 'paid', 'submitting', 'in_production',
                                'shipped', 'canceled', 'refunded', 'failed')),
  subtotal_cents              integer not null check (subtotal_cents >= 0),
  shipping_cents              integer not null check (shipping_cents >= 0),
  tax_cents                   integer not null default 0 check (tax_cents >= 0),
  total_cents                 integer not null default 0 check (total_cents >= 0),
  lab_cost_cents              integer not null check (lab_cost_cents >= 0),
  platform_fee_percent        integer not null,
  platform_fee_cents          integer not null default 0,
  processing_fee_cents        integer not null default 0,
  creator_earnings_cents      integer not null default 0,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  stripe_charge_id            text,
  stripe_transfer_id          text,
  lab                         text not null,
  lab_submission_id           text,
  lab_confirmation_ids        text[] not null default '{}',
  tracking                    jsonb not null default '[]'::jsonb,
  failure_reason              text,
  paid_at                     timestamptz,
  submitted_at                timestamptz,
  shipped_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists print_orders_creator_created_idx on public.print_orders (creator_id, created_at desc);
create index if not exists print_orders_status_idx on public.print_orders (status, updated_at);

create trigger print_orders_updated_at
  before update on public.print_orders
  for each row execute function public.set_updated_at();

revoke all on public.print_orders from anon, authenticated;
grant all on public.print_orders to service_role;
grant select on public.print_orders to authenticated;
alter table public.print_orders enable row level security;

create policy print_orders_creator_select on public.print_orders
  for select to authenticated
  using (creator_id = (select public.current_creator_id()));

create table if not exists public.print_order_items (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null references public.print_orders (id) on delete cascade,
  creator_id                uuid not null references public.creators (id) on delete restrict,
  product_id                uuid references public.print_products (id) on delete set null,
  asset_id                  uuid references public.assets (id) on delete set null,
  -- Copia de lo comprado, por si el catálogo o el archivo cambian después.
  product_name              text not null,
  size_label                text not null,
  file_name                 text not null,
  selections                jsonb not null,
  quantity                  integer not null check (quantity between 1 and 100),
  unit_price_cents          integer not null check (unit_price_cents > 0),
  unit_cost_cents           integer not null check (unit_cost_cents > 0),
  lab_configured_product_id text,
  created_at                timestamptz not null default now()
);

create index if not exists print_order_items_order_idx on public.print_order_items (order_id);

revoke all on public.print_order_items from anon, authenticated;
grant all on public.print_order_items to service_role;
grant select on public.print_order_items to authenticated;
alter table public.print_order_items enable row level security;

create policy print_order_items_creator_select on public.print_order_items
  for select to authenticated
  using (creator_id = (select public.current_creator_id()));

-- -----------------------------------------------------------------------------
-- Webhooks del laboratorio (idempotencia)
-- -----------------------------------------------------------------------------
create table if not exists public.lab_events (
  id           text primary key,
  lab          text not null,
  event_type   text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

revoke all on public.lab_events from anon, authenticated;
grant all on public.lab_events to service_role;
alter table public.lab_events enable row level security;
