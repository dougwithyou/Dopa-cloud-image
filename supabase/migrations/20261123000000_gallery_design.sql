-- =============================================================================
-- Diseño de galería y escenas
--
--  * projects.design (jsonb): estilo, paleta, tipografía, portada, tamaño de
--    cuadrícula y espaciado de la plantilla "Galería de fotos". La valida la app.
--  * En proyectos "Galería de fotos" las publicaciones funcionan como ESCENAS
--    (secciones con título): no tienen el límite de 20 archivos del carrusel.
-- Migración no destructiva: solo añade una columna y reemplaza una función.
-- =============================================================================

alter table public.projects add column if not exists design jsonb not null default '{}'::jsonb;

grant update (design) on public.projects to authenticated;

create or replace function public.enforce_carousel_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_type  text;
begin
  if new.post_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.post_id is not distinct from old.post_id then
    return new;
  end if;

  -- Serializa asignaciones concurrentes a la misma publicación.
  perform 1 from public.posts where id = new.post_id for update;

  -- Las escenas de una galería no son carruseles: sin límite.
  select p.type into v_type
  from public.posts po
  join public.projects p on p.id = po.project_id
  where po.id = new.post_id;
  if v_type = 'photo_session' then
    return new;
  end if;

  select count(*) into v_count
  from public.assets
  where post_id = new.post_id and id <> new.id;

  if v_count >= 20 then
    raise exception 'carousel_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
