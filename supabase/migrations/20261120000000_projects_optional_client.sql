-- =============================================================================
-- Proyectos sin cliente obligatorio
--
-- Flujo nuevo: el creador crea el proyecto y después le agrega un cliente.
--   * projects.client_id pasa a ser opcional.
--   * Al eliminar un cliente, sus proyectos se conservan (client_id = NULL)
--     en lugar de borrarse en cascada.
--   * El creador puede asignar o cambiar el cliente de un proyecto. La FK
--     compuesta (creator_id, client_id) sigue impidiendo usar un cliente de
--     otro creador.
-- La ruta de los archivos en R2 ya no incluye el cliente
-- (creators/{creator_id}/projects/{project_id}/...), así que cambiar de
-- cliente no requiere mover archivos.
-- =============================================================================

alter table public.projects drop constraint projects_client_fk;

alter table public.projects alter column client_id drop not null;

-- ON DELETE SET NULL (client_id): solo vacía client_id, nunca creator_id.
alter table public.projects
  add constraint projects_client_fk foreign key (creator_id, client_id)
  references public.clients (creator_id, id)
  on delete set null (client_id);

grant update (client_id) on public.projects to authenticated;
