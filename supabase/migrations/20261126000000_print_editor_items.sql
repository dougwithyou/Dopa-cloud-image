-- =============================================================================
-- Tienda: productos que se diseñan en el editor de WHCC (photobooks y tarjetas)
--
--  * print_products: tipo de producto (impresión, canvas, libro, tarjeta), si
--    se arma con una foto ("api") o en el editor ("editor"), y la cantidad
--    mínima y el paso (tarjetas: 25, de 5 en 5).
--  * print_editor_items: los diseños de los clientes en el editor de WHCC.
--    Solo los escribe el servidor; el creador puede leerlos.
-- Migración no destructiva.
-- =============================================================================

alter table public.print_products
  add column if not exists completion text not null default 'api' check (completion in ('api', 'editor')),
  add column if not exists kind text not null default 'print' check (kind in ('print', 'canvas', 'book', 'card')),
  add column if not exists min_quantity integer not null default 1 check (min_quantity >= 1),
  add column if not exists quantity_step integer not null default 1 check (quantity_step >= 1);

create table if not exists public.print_editor_items (
  id                    uuid primary key default gen_random_uuid(),
  creator_id            uuid not null references public.creators (id) on delete cascade,
  project_id            uuid not null references public.projects (id) on delete cascade,
  product_id            uuid not null references public.print_products (id) on delete cascade,
  -- El producto armado en WHCC (lo que se edita y después se pide).
  configured_product_id text not null unique,
  design_id             text,
  -- Token de un solo uso para aceptar el regreso desde el editor.
  return_token          text,
  finished              boolean not null default false,
  preview_url           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists print_editor_items_project_idx on public.print_editor_items (project_id, created_at desc);

create trigger print_editor_items_updated_at
  before update on public.print_editor_items
  for each row execute function public.set_updated_at();

revoke all on public.print_editor_items from anon, authenticated;
grant all on public.print_editor_items to service_role;
grant select on public.print_editor_items to authenticated;
alter table public.print_editor_items enable row level security;

create policy print_editor_items_creator_select on public.print_editor_items
  for select to authenticated
  using (creator_id = (select public.current_creator_id()));

-- Una línea de pedido puede venir de un diseño del editor.
alter table public.print_order_items
  add column if not exists editor_item_id uuid references public.print_editor_items (id) on delete set null;

-- Las tarjetas se piden por decenas o cientos (mínimo 25).
alter table public.print_order_items drop constraint if exists print_order_items_quantity_check;
alter table public.print_order_items add constraint print_order_items_quantity_check check (quantity between 1 and 5000);
