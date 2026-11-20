-- =============================================================================
-- Biblioteca de material del proyecto
--
-- Flujo: el creador sube todo el material a la biblioteca del proyecto y
-- después arma las publicaciones eligiendo archivos ya subidos.
--   * assets.post_id pasa a ser opcional: NULL = archivo en la biblioteca, sin usar.
--   * Eliminar una publicación devuelve sus archivos a la biblioteca.
--   * El límite de 20 archivos por carrusel lo aplica un trigger.
--   * Clientes: en proyectos "Feed de Instagram" solo ven archivos que están en
--     una publicación; en "Galería de fotos" ven toda la biblioteca.
-- =============================================================================

alter table public.assets alter column post_id drop not null;

alter table public.assets drop constraint assets_post_fk;
alter table public.assets
  add constraint assets_post_fk foreign key (creator_id, project_id, post_id)
  references public.posts (creator_id, project_id, id)
  on delete set null (post_id);

create index if not exists assets_project_created_idx on public.assets (project_id, created_at);

-- El creador asigna archivos a publicaciones y los ordena.
grant update (post_id, position) on public.assets to authenticated;

-- -----------------------------------------------------------------------------
-- Límite de carrusel (20) al asignar archivos a una publicación
-- -----------------------------------------------------------------------------
create or replace function public.enforce_carousel_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.post_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.post_id is not distinct from old.post_id then
    return new;
  end if;

  -- Serializa asignaciones concurrentes a la misma publicación.
  perform 1 from public.posts where id = new.post_id for update;

  select count(*) into v_count
  from public.assets
  where post_id = new.post_id and id <> new.id;

  if v_count >= 20 then
    raise exception 'carousel_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_carousel_limit() from public, anon, authenticated;

create trigger assets_enforce_carousel_limit
  before insert or update of post_id on public.assets
  for each row execute function public.enforce_carousel_limit();

-- -----------------------------------------------------------------------------
-- reserve_asset_upload: sube a la biblioteca del proyecto (post opcional)
-- -----------------------------------------------------------------------------
drop function public.reserve_asset_upload(uuid, uuid, uuid, text, text, text, text, bigint);

create or replace function public.reserve_asset_upload(
  p_asset_id   uuid,
  p_creator_id uuid,
  p_project_id uuid,
  p_kind       text,
  p_r2_key     text,
  p_file_name  text,
  p_mime_type  text,
  p_size_bytes bigint,
  p_post_id    uuid default null
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
  v_pos     integer := 0;
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

  if p_post_id is not null then
    if not exists (
      select 1 from public.posts
      where id = p_post_id and project_id = p_project_id and creator_id = p_creator_id
    ) then
      raise exception 'post_not_found' using errcode = 'P0001';
    end if;
    select coalesce(max(position), -1) + 1 into v_pos from public.assets where post_id = p_post_id;
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
  where creator_id = p_creator_id;

  if v_used + p_size_bytes > v_creator.storage_limit_bytes then
    raise exception 'storage_limit_exceeded' using errcode = 'P0001';
  end if;

  insert into public.assets (
    id, project_id, post_id, creator_id, kind, r2_key, file_name, mime_type,
    size_bytes, upload_status, position
  ) values (
    p_asset_id, p_project_id, p_post_id, p_creator_id, p_kind, p_r2_key, p_file_name, p_mime_type,
    p_size_bytes, 'pending', v_pos
  )
  returning * into v_asset;

  return v_asset;
end;
$$;

revoke execute on function public.reserve_asset_upload(uuid, uuid, uuid, text, text, text, text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_asset_upload(uuid, uuid, uuid, text, text, text, text, bigint, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- Qué archivos ve el cliente
-- -----------------------------------------------------------------------------
alter policy assets_client_select on public.assets
  using (
    upload_status = 'complete'
    and project_id in (select public.client_visible_project_ids())
    and (
      post_id is not null
      or exists (
        select 1 from public.projects p
        where p.id = assets.project_id and p.type = 'photo_session'
      )
    )
  );
