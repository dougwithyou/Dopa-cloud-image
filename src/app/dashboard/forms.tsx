"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { addClientToProject, addCopy, createProject, updateBusinessName } from "./actions";

function useResetOnSuccess(state: { message?: string } | null) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);
  return ref;
}

export function CreateProjectForm() {
  const [state, action] = useActionState(createProject, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="title">Título</label>
          <input className="input" id="title" name="title" placeholder="Contenido de diciembre" required maxLength={160} />
        </div>
        <div>
          <label className="label" htmlFor="type">Tipo</label>
          <select className="input" id="type" name="type" defaultValue="monthly_content">
            <option value="monthly_content">Contenido mensual</option>
            <option value="photo_session">Sesión de fotos</option>
          </select>
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary" pendingLabel="Creando…">
        Crear proyecto
      </SubmitButton>
      <p className="text-xs text-neutral-500">Después podrás subir el contenido y agregar al cliente.</p>
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

export function AddCopyForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(addCopy, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <textarea
        className="input min-h-28"
        name="text"
        placeholder="Escribe un texto para redes (caption, hashtags, guion…)"
        maxLength={10000}
        required
      />
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary" pendingLabel="Guardando…">
        Añadir texto
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
