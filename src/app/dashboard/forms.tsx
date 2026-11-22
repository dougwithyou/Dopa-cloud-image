"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { addClientToProject, createClient, createProject, updateBusinessName } from "./actions";

export function CreateProjectForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createProject, null);
  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="label" htmlFor="title">Título del proyecto</label>
        <input className="input" id="title" name="title" placeholder="Contenido de diciembre" required maxLength={160} />
      </div>
      <fieldset>
        <legend className="label">Plantilla para el cliente</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["monthly_content", "Feed de Instagram", "Publicaciones, carruseles y copies, como un perfil de Instagram."],
              ["photo_session", "Galería de fotos", "Portada y mosaico de fotos, estilo galería profesional."],
            ] as const
          ).map(([value, title, help]) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-xl border border-neutral-200 p-4 transition has-[:checked]:border-neutral-900 has-[:checked]:ring-2 has-[:checked]:ring-neutral-900/10"
            >
              <input type="radio" name="type" value={value} defaultChecked={value === "monthly_content"} className="mt-1" />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-neutral-500">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="clientId">Cliente (opcional)</label>
        <select className="input" id="clientId" name="clientId" defaultValue="">
          <option value="">Sin cliente por ahora</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500">Puedes agregarlo o cambiarlo después desde el proyecto.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary" pendingLabel="Creando…">
        Crear proyecto
      </SubmitButton>
    </form>
  );
}

export function CreateClientForm({ disabledReason }: { disabledReason?: string }) {
  const [state, action] = useActionState(createClient, null);
  return (
    <form key={state?.message ?? "form"} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Nombre</label>
          <input className="input" id="name" name="name" placeholder="Café Aurora" required maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="email">Correo</label>
          <input className="input" id="email" name="email" type="email" placeholder="hola@cafeaurora.com" required />
        </div>
      </div>
      {disabledReason ? <p className="text-sm text-amber-700">{disabledReason}</p> : null}
      <FormMessage state={state} />
      <SubmitButton className="btn-primary" pendingLabel="Agregando…">
        Agregar cliente
      </SubmitButton>
    </form>
  );
}

/**
 * Agregar cliente al proyecto: elegir uno existente o crear uno nuevo
 * (nombre + correo) en el mismo formulario.
 */
export function AddClientToProjectForm({
  projectId,
  clients,
  currentClientId,
  disabledReason,
  submitLabel = "Agregar cliente",
}: {
  projectId: string;
  clients: { id: string; name: string; email: string }[];
  currentClientId?: string | null;
  disabledReason?: string;
  submitLabel?: string;
}) {
  const [state, action] = useActionState(addClientToProject, null);
  const options = clients.filter((c) => c.id !== currentClientId);
  const [choice, setChoice] = useState<string>(options[0]?.id ?? "new");
  const isNew = choice === "new";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label className="label" htmlFor="clientId">Cliente</label>
        <select
          className="input"
          id="clientId"
          name="clientId"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.email}
            </option>
          ))}
          <option value="new">+ Nuevo cliente</option>
        </select>
      </div>

      {isNew ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Nombre</label>
            <input className="input" id="name" name="name" placeholder="Café Aurora" required maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="email">Correo</label>
            <input className="input" id="email" name="email" type="email" placeholder="hola@cafeaurora.com" required />
          </div>
        </div>
      ) : null}

      {isNew && disabledReason ? <p className="text-sm text-amber-700">{disabledReason}</p> : null}
      <FormMessage state={state} />
      <SubmitButton className="btn-primary" pendingLabel="Agregando…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

export function BusinessNameForm({ value }: { value: string }) {
  const [state, action] = useActionState(updateBusinessName, null);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="label" htmlFor="businessName">Nombre del negocio</label>
        <input className="input" id="businessName" name="businessName" defaultValue={value} required maxLength={120} />
      </div>
      <SubmitButton className="btn-secondary" pendingLabel="Guardando…">
        Guardar
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
