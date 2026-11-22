-- =============================================================================
-- Enlace público de galería + captación de contactos
--
--  * projects.share_enabled / share_token: enlace /g/{token} para compartir una
--    galería sin invitar clientes. Quien entra deja nombre, apellido y correo.
--  * gallery_leads: los contactos registrados (base para email marketing), con
--    el consentimiento de marketing y su fecha.
--  * register_gallery_lead(): registra la visita de forma atómica; solo la
--    llama el servidor (service role) y solo si el enlace está activo.
-- Migración no destructiva.
-- =============================================================================

alter table public.projects
  add column if not exists share_enabled boolean not null default false,
  add column if not exists share_token text;

create unique index if not exists projects_share_token_key on public.projects (share_token) where share_token is not null;

grant update (share_enabled, share_token) on public.projects to authenticated;

create table if not exists public.gallery_leads (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null references public.creators (id) on delete cascade,
  -- Si se borra el proyecto, el contacto se conserva.
  project_id        uuid references public.projects (id) on delete set null,
  first_name        text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name         text not null check (char_length(btrim(last_name)) between 1 and 80),
  email             text not null check (email = lower(btrim(email)) and email like '%_@_%' and char_length(email) <= 254),
  marketing_consent boolean not null default false,
  consent_at        timestamptz,
  visits            integer not null default 1,
  created_at        timestamptz not null default now(),
  last_visit_at     timestamptz not null default now(),
  constraint gallery_leads_project_email_key unique (project_id, email)
);

create index if not exists gallery_leads_creator_created_idx on public.gallery_leads (creator_id, created_at desc);
create index if not exists gallery_leads_creator_email_idx on public.gallery_leads (creator_id, email);

revoke all on public.gallery_leads from anon, authenticated;
grant all on public.gallery_leads to service_role;
grant select, delete on public.gallery_leads to authenticated;

alter table public.gallery_leads enable row level security;

create policy gallery_leads_creator_select on public.gallery_leads
  for select to authenticated
  using (creator_id = (select public.current_creator_id()));

create policy gallery_leads_creator_delete on public.gallery_leads
  for delete to authenticated
  using (creator_id = (select public.current_creator_id()));

-- -----------------------------------------------------------------------------
-- Registro de visitante (atómico)
-- -----------------------------------------------------------------------------
create or replace function public.register_gallery_lead(
  p_token      text,
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_consent    boolean
)
returns table (lead_id uuid, project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_project public.projects%rowtype;
  v_lead    uuid;
begin
  select * into v_project
  from public.projects p
  where p.share_token = p_token and p.share_enabled and p.type = 'photo_session';
  if not found then
    raise exception 'share_link_not_found' using errcode = 'P0001';
  end if;

  if not public.creator_portal_open(v_project.creator_id) then
    raise exception 'gallery_unavailable' using errcode = 'P0001';
  end if;

  insert into public.gallery_leads as l (
    creator_id, project_id, first_name, last_name, email, marketing_consent, consent_at
  ) values (
    v_project.creator_id, v_project.id, btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)),
    coalesce(p_consent, false), case when p_consent then now() end
  )
  on conflict (project_id, email) do update set
    first_name        = excluded.first_name,
    last_name         = excluded.last_name,
    visits            = l.visits + 1,
    last_visit_at     = now(),
    -- El consentimiento solo se añade; retirarlo se gestiona aparte.
    marketing_consent = l.marketing_consent or excluded.marketing_consent,
    consent_at        = coalesce(l.consent_at, excluded.consent_at)
  returning l.id into v_lead;

  return query select v_lead, v_project.id;
end;
$$;

revoke execute on function public.register_gallery_lead(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_gallery_lead(text, text, text, text, boolean) to service_role;
