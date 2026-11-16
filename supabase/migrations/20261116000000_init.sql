-- =============================================================================
-- Hi Dopa Cloud — esquema inicial
-- Multi-tenant: creadores (tenants) -> clientes -> proyectos -> assets.
--
-- Principios:
--   * RLS activado en TODAS las tablas.
--   * Privilegios por columna: el rol `authenticated` solo puede escribir las
--     columnas "inofensivas". Plan, límites, estado de suscripción, tamaños y
--     estados de subida solo los escribe el servidor con la service role.
--   * FKs compuestas (creator_id, id) para que un proyecto/asset nunca pueda
--     apuntar a un cliente/proyecto de otro creador, ni siquiera por error.
--   * Límites de almacenamiento y clientes verificados dentro de Postgres con
--     bloqueo de fila (sin condiciones de carrera entre subidas paralelas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- creators (tenant)
-- -----------------------------------------------------------------------------
create table public.creators (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references auth.users (id) on delete cascade,
  business_name          text not null check (char_length(btrim(business_name)) between 1 and 120),
  plan                   text not null default 'entry' check (plan in ('entry', 'medium', 'high')),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  subscription_status    text not null default 'incomplete'
                         check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  trial_ends_at          timestamptz,
  -- Fin del periodo de gracia: mientras now() < portal_access_until, los
  -- clientes siguen viendo su portal aunque la suscripción no esté al día.
  -- NULL cuando la suscripción está en 'trialing' o 'active'.
  portal_access_until    timestamptz,
  storage_limit_bytes    bigint not null default 0 check (storage_limit_bytes >= 0),
  client_limit           integer check (client_limit is null or client_limit >= 0), -- NULL = ilimitado
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger creators_set_updated_at
  before update on public.creators
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null, -- NULL hasta aceptar la invitación
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  email       text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  invited_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint clients_creator_email_key unique (creator_id, email),
  constraint clients_creator_user_key unique (creator_id, user_id),
  constraint clients_creator_id_id_key unique (creator_id, id)
);

create index clients_user_id_idx on public.clients (user_id) where user_id is not null;

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  client_id  uuid not null,
  title      text not null check (char_length(btrim(title)) between 1 and 160),
  type       text not null check (type in ('photo_session', 'monthly_content')),
  -- draft: solo lo ve el creador · published: visible para el cliente · archived: oculto
  status     text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_client_fk foreign key (creator_id, client_id)
    references public.clients (creator_id, id) on delete cascade,
  constraint projects_creator_id_id_key unique (creator_id, id)
);

create index projects_client_id_idx on public.projects (client_id);
create index projects_creator_created_idx on public.projects (creator_id, created_at desc);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- assets
-- -----------------------------------------------------------------------------
create table public.assets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null,
  creator_id    uuid not null references public.creators (id) on delete cascade,
  kind          text not null check (kind in ('photo', 'video', 'copy')),
  r2_key        text unique,
  r2_upload_id  text,            -- id del multipart upload mientras está 'pending'
  file_name     text check (file_name is null or char_length(file_name) between 1 and 255),
  mime_type     text,
  size_bytes    bigint not null default 0 check (size_bytes >= 0),
  copy_text     text check (copy_text is null or char_length(copy_text) <= 10000),
  upload_status text not null default 'pending' check (upload_status in ('pending', 'complete')),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint assets_project_fk foreign key (creator_id, project_id)
    references public.projects (creator_id, id) on delete cascade,
  constraint assets_kind_fields check (
    (kind = 'copy' and r2_key is null and size_bytes = 0
       and copy_text is not null and upload_status = 'complete')
    or
    (kind in ('photo', 'video') and r2_key is not null
       and file_name is not null and mime_type is not null)
  )
);

create index assets_project_position_idx on public.assets (project_id, position, created_at);
create index assets_creator_media_idx on public.assets (creator_id) where kind in ('photo', 'video');
create index assets_pending_idx on public.assets (created_at) where upload_status = 'pending';

-- -----------------------------------------------------------------------------
-- stripe_events (idempotencia de webhooks)
-- -----------------------------------------------------------------------------
create table public.stripe_events (
  id           text primary key,          -- id del evento de Stripe (evt_...)
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz                -- NULL mientras se procesa
);

-- =============================================================================
-- Funciones auxiliares para RLS (SECURITY DEFINER para evitar recursión de RLS)
-- =============================================================================

-- creators.id del usuario autenticado (NULL si no es creador)
create or replace function public.current_creator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.creators c where c.user_id = auth.uid()
$$;

-- ¿Pueden los clientes de este creador ver su portal? (suscripción al día o
-- dentro del periodo de gracia)
create or replace function public.creator_portal_open(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.creators c
    where c.id = p_creator_id
      and (
        c.subscription_status in ('trialing', 'active')
        or (c.portal_access_until is not null and c.portal_access_until > now())
      )
  )
$$;

-- Proyectos publicados visibles para el cliente autenticado
create or replace function public.client_visible_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  join public.clients cl
    on cl.id = p.client_id
   and cl.creator_id = p.creator_id
  where cl.user_id = auth.uid()
    and p.status = 'published'
    and public.creator_portal_open(p.creator_id)
$$;

-- Nombre comercial de los creadores que han invitado al cliente autenticado.
-- (Los clientes no tienen SELECT sobre `creators` porque esa tabla contiene
-- datos de facturación.)
create or replace function public.my_creators()
returns table (id uuid, business_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.business_name
  from public.creators c
  join public.clients cl on cl.creator_id = c.id
  where cl.user_id = auth.uid()
$$;

-- Bytes usados por el creador autenticado (respeta RLS: SECURITY INVOKER)
create or replace function public.my_storage_used()
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(a.size_bytes), 0)::bigint
  from public.assets a
  where a.creator_id = public.current_creator_id()
    and a.kind in ('photo', 'video')
$$;

-- =============================================================================
-- Límites por plan (verificados dentro de la base con bloqueo de fila)
-- =============================================================================

-- Impide crear clientes por encima de client_limit.
create or replace function public.enforce_client_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  -- Serializa altas concurrentes del mismo creador.
  select c.client_limit into v_limit
  from public.creators c
  where c.id = new.creator_id
  for update;

  if v_limit is not null then
    select count(*) into v_count from public.clients where creator_id = new.creator_id;
    if v_count >= v_limit then
      raise exception 'client_limit_exceeded' using errcode = 'P0001',
        hint = format('El plan actual permite %s clientes.', v_limit);
    end if;
  end if;

  return new;
end;
$$;

create trigger clients_enforce_limit
  before insert on public.clients
  for each row execute function public.enforce_client_limit();

-- Reserva espacio y crea el asset 'pending' de forma atómica.
-- Solo la llama el servidor (service role) tras validar MIME y tamaño.
create or replace function public.reserve_asset_upload(
  p_asset_id   uuid,
  p_creator_id uuid,
  p_project_id uuid,
  p_kind       text,
  p_r2_key     text,
  p_file_name  text,
  p_mime_type  text,
  p_size_bytes bigint
)
returns public.assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator public.creators%rowtype;
  v_used    bigint;
  v_clients integer;
  v_pos     integer;
  v_asset   public.assets%rowtype;
begin
  if p_kind not in ('photo', 'video') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'invalid_size' using errcode = 'P0001';
  end if;

  -- Bloquea la fila del creador: serializa reservas concurrentes.
  select * into v_creator from public.creators where id = p_creator_id for update;
  if not found then
    raise exception 'creator_not_found' using errcode = 'P0001';
  end if;

  if v_creator.subscription_status not in ('trialing', 'active') then
    raise exception 'subscription_inactive' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.projects where id = p_project_id and creator_id = p_creator_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0001';
  end if;

  if v_creator.client_limit is not null then
    select count(*) into v_clients from public.clients where creator_id = p_creator_id;
    if v_clients > v_creator.client_limit then
      raise exception 'client_limit_exceeded' using errcode = 'P0001';
    end if;
  end if;

  -- Incluye las subidas 'pending': el espacio queda reservado hasta completar o abortar.
  select coalesce(sum(size_bytes), 0) into v_used
  from public.assets
  where creator_id = p_creator_id and kind in ('photo', 'video');

  if v_used + p_size_bytes > v_creator.storage_limit_bytes then
    raise exception 'storage_limit_exceeded' using errcode = 'P0001';
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
  from public.assets where project_id = p_project_id;

  insert into public.assets (
    id, project_id, creator_id, kind, r2_key, file_name, mime_type,
    size_bytes, upload_status, position
  ) values (
    p_asset_id, p_project_id, p_creator_id, p_kind, p_r2_key, p_file_name, p_mime_type,
    p_size_bytes, 'pending', v_pos
  )
  returning * into v_asset;

  return v_asset;
end;
$$;

-- =============================================================================
-- Privilegios (por tabla y por columna)
-- =============================================================================
revoke all on public.creators, public.clients, public.projects, public.assets, public.stripe_events
  from anon, authenticated;

grant all on public.creators, public.clients, public.projects, public.assets, public.stripe_events
  to service_role;

-- creators: el creador lee su fila y solo puede cambiar el nombre comercial.
grant select on public.creators to authenticated;
grant update (business_name) on public.creators to authenticated;

-- clients: el creador gestiona nombre/email; user_id/invited_at/accepted_at los fija el servidor.
grant select, delete on public.clients to authenticated;
grant insert (creator_id, name, email) on public.clients to authenticated;
grant update (name) on public.clients to authenticated;

-- projects: client_id no se puede cambiar (forma parte de la ruta en R2).
grant select, delete on public.projects to authenticated;
grant insert (creator_id, client_id, title, type, status) on public.projects to authenticated;
grant update (title, type, status) on public.projects to authenticated;

-- assets: las subidas de media pasan por reserve_asset_upload (servidor).
-- El creador solo puede crear textos ('copy') y editar texto/orden.
grant select, delete on public.assets to authenticated;
grant insert (project_id, creator_id, kind, copy_text, upload_status, position) on public.assets to authenticated;
grant update (copy_text, position) on public.assets to authenticated;

-- stripe_events: solo service role.

-- Funciones
revoke execute on function public.current_creator_id() from public, anon;
revoke execute on function public.creator_portal_open(uuid) from public, anon;
revoke execute on function public.client_visible_project_ids() from public, anon;
revoke execute on function public.my_creators() from public, anon;
revoke execute on function public.my_storage_used() from public, anon;
revoke execute on function public.enforce_client_limit() from public, anon, authenticated;
revoke execute on function public.reserve_asset_upload(uuid, uuid, uuid, text, text, text, text, bigint)
  from public, anon, authenticated;

grant execute on function public.current_creator_id() to authenticated, service_role;
grant execute on function public.creator_portal_open(uuid) to authenticated, service_role;
grant execute on function public.client_visible_project_ids() to authenticated, service_role;
grant execute on function public.my_creators() to authenticated, service_role;
grant execute on function public.my_storage_used() to authenticated, service_role;
grant execute on function public.reserve_asset_upload(uuid, uuid, uuid, text, text, text, text, bigint)
  to service_role;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.creators      enable row level security;
alter table public.clients       enable row level security;
alter table public.projects      enable row level security;
alter table public.assets        enable row level security;
alter table public.stripe_events enable row level security;

-- ---------- creators ----------
create policy creators_select_own on public.creators
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy creators_update_own on public.creators
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- clients ----------
create policy clients_creator_select on public.clients
  for select to authenticated
  using (creator_id = (select public.current_creator_id()));

create policy clients_creator_insert on public.clients
  for insert to authenticated
  with check (creator_id = (select public.current_creator_id()));

create policy clients_creator_update on public.clients
  for update to authenticated
  using (creator_id = (select public.current_creator_id()))
  with check (creator_id = (select public.current_creator_id()));

create policy clients_creator_delete on public.clients
  for delete to authenticated
  using (creator_id = (select public.current_creator_id()));

-- El cliente final ve su propia ficha.
create policy clients_self_select on public.clients
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------- projects ----------
create policy projects_creator_select on public.projects
  for select to authenticated
  using (creator_id = (select public.current_creator_id()));

create policy projects_creator_insert on public.projects
  for insert to authenticated
  with check (creator_id = (select public.current_creator_id()));

create policy projects_creator_update on public.projects
  for update to authenticated
  using (creator_id = (select public.current_creator_id()))
  with check (creator_id = (select public.current_creator_id()));

create policy projects_creator_delete on public.projects
  for delete to authenticated
  using (creator_id = (select public.current_creator_id()));

-- El cliente final solo lee proyectos publicados de su ficha, mientras el
-- portal del creador esté abierto (suscripción al día o periodo de gracia).
create policy projects_client_select on public.projects
  for select to authenticated
  using (id in (select public.client_visible_project_ids()));

-- ---------- assets ----------
create policy assets_creator_select on public.assets
  for select to authenticated
  using (creator_id = (select public.current_creator_id()));

-- Solo textos; la media entra por reserve_asset_upload (service role).
create policy assets_creator_insert_copy on public.assets
  for insert to authenticated
  with check (
    creator_id = (select public.current_creator_id())
    and kind = 'copy'
    and upload_status = 'complete'
  );

create policy assets_creator_update on public.assets
  for update to authenticated
  using (creator_id = (select public.current_creator_id()))
  with check (creator_id = (select public.current_creator_id()));

create policy assets_creator_delete on public.assets
  for delete to authenticated
  using (creator_id = (select public.current_creator_id()));

create policy assets_client_select on public.assets
  for select to authenticated
  using (
    upload_status = 'complete'
    and project_id in (select public.client_visible_project_ids())
  );

-- stripe_events: sin políticas => inaccesible para anon/authenticated.
