-- =============================================================================
-- Publicaciones (posts) y carruseles
--
-- Un proyecto contiene publicaciones. Cada publicación tiene UN copy (caption)
-- y uno o más archivos:
--   * 1 archivo   -> publicación individual
--   * 2..20       -> carrusel de Instagram (máximo 20 elementos)
-- El copy ya no vive en cada archivo ni como "texto suelto": vive en la
-- publicación, así el cliente sabe qué texto corresponde a qué contenido.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- posts
-- -----------------------------------------------------------------------------
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  project_id uuid not null,
  caption    text check (caption is null or char_length(caption) <= 10000),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_project_fk foreign key (creator_id, project_id)
    references public.projects (creator_id, id) on delete cascade,
  constraint posts_creator_project_id_key unique (creator_id, project_id, id)
);

create index posts_project_position_idx on public.posts (project_id, position, created_at);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Migrar datos existentes: cada archivo pasa a ser su propia publicación
-- (reutilizando su id), con su copy_text como caption. Los textos sueltos
-- ('copy') pasan a publicaciones sin archivos y luego se eliminan como asset.
-- -----------------------------------------------------------------------------
insert into public.posts (id, creator_id, project_id, caption, position, created_at)
select id, creator_id, project_id, copy_text, position, created_at
from public.assets;

alter table public.assets add column post_id uuid;

update public.assets set post_id = id, position = 0 where kind in ('photo', 'video');
delete from public.assets where kind = 'copy';

-- -----------------------------------------------------------------------------
-- assets: ahora siempre son media y siempre pertenecen a una publicación
-- -----------------------------------------------------------------------------
alter table public.assets drop constraint assets_kind_fields;
alter table public.assets drop constraint assets_kind_check;
alter table public.assets drop column copy_text;

alter table public.assets
  alter column post_id set not null,
  alter column r2_key set not null,
  alter column file_name set not null,
  alter column mime_type set not null,
  add constraint assets_kind_check check (kind in ('photo', 'video')),
  -- La FK triple garantiza que el archivo y su publicación son del mismo
  -- creador y del mismo proyecto.
  add constraint assets_post_fk foreign key (creator_id, project_id, post_id)
    references public.posts (creator_id, project_id, id) on delete cascade;

create index assets_post_position_idx on public.assets (post_id, position, created_at);

drop policy assets_creator_insert_copy on public.assets;
revoke insert on public.assets from authenticated;
-- (El privilegio de UPDATE sobre copy_text desapareció con la columna;
--  queda UPDATE (position).)

-- -----------------------------------------------------------------------------
-- Privilegios y RLS de posts
-- -----------------------------------------------------------------------------
revoke all on public.posts from anon, authenticated;
grant all on public.posts to service_role;
grant select, delete on public.posts to authenticated;
grant insert (creator_id, project_id, caption, position) on public.posts to authenticated;
grant update (caption, position) on public.posts to authenticated;

alter table public.posts enable row level security;

create policy posts_creator_select on public.posts
  for select to authenticated
  using (creator_id = (select public.current_creator_id()));

create policy posts_creator_insert on public.posts
  for insert to authenticated
  with check (creator_id = (select public.current_creator_id()));

create policy posts_creator_update on public.posts
  for update to authenticated
  using (creator_id = (select public.current_creator_id()))
  with check (creator_id = (select public.current_creator_id()));

create policy posts_creator_delete on public.posts
  for delete to authenticated
  using (creator_id = (select public.current_creator_id()));

-- El cliente lee las publicaciones de sus proyectos publicados (portal abierto).
create policy posts_client_select on public.posts
  for select to authenticated
  using (project_id in (select public.client_visible_project_ids()));

-- -----------------------------------------------------------------------------
-- reserve_asset_upload: ahora recibe la publicación (y deduce el proyecto)
-- -----------------------------------------------------------------------------
drop function public.reserve_asset_upload(uuid, uuid, uuid, text, text, text, text, bigint);

create or replace function public.reserve_asset_upload(
  p_asset_id   uuid,
  p_creator_id uuid,
  p_post_id    uuid,
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
  v_creator    public.creators%rowtype;
  v_project_id uuid;
  v_used       bigint;
  v_clients    integer;
  v_in_post    integer;
  v_pos        integer;
  v_asset      public.assets%rowtype;
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

  select project_id into v_project_id
  from public.posts
  where id = p_post_id and creator_id = p_creator_id;
  if v_project_id is null then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;

  if v_creator.client_limit is not null then
    select count(*) into v_clients from public.clients where creator_id = p_creator_id;
    if v_clients > v_creator.client_limit then
      raise exception 'client_limit_exceeded' using errcode = 'P0001';
    end if;
  end if;

  -- Instagram admite hasta 20 elementos por carrusel.
  select count(*) into v_in_post from public.assets where post_id = p_post_id;
  if v_in_post >= 20 then
    raise exception 'carousel_limit_exceeded' using errcode = 'P0001';
  end if;

  -- Incluye las subidas 'pending': el espacio queda reservado hasta completar o abortar.
  select coalesce(sum(size_bytes), 0) into v_used
  from public.assets
  where creator_id = p_creator_id;

  if v_used + p_size_bytes > v_creator.storage_limit_bytes then
    raise exception 'storage_limit_exceeded' using errcode = 'P0001';
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
  from public.assets where post_id = p_post_id;

  insert into public.assets (
    id, project_id, post_id, creator_id, kind, r2_key, file_name, mime_type,
    size_bytes, upload_status, position
  ) values (
    p_asset_id, v_project_id, p_post_id, p_creator_id, p_kind, p_r2_key, p_file_name, p_mime_type,
    p_size_bytes, 'pending', v_pos
  )
  returning * into v_asset;

  return v_asset;
end;
$$;

revoke execute on function public.reserve_asset_upload(uuid, uuid, uuid, text, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_asset_upload(uuid, uuid, uuid, text, text, text, text, bigint)
  to service_role;

-- my_storage_used: ya no hay assets 'copy', se simplifica el filtro.
create or replace function public.my_storage_used()
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(a.size_bytes), 0)::bigint
  from public.assets a
  where a.creator_id = public.current_creator_id()
$$;
