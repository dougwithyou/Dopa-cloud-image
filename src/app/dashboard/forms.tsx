"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { addCopy, createProject, inviteClient, updateBusinessName } from "./actions";

function useResetOnSuccess(state: { message?: string } | null) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);
  return ref;
}

export function InviteClientForm({ disabledReason }: { disabledReason?: string }) {
  const [state, action] = useActionState(inviteClient, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
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
      <SubmitButton className="btn-primary" pendingLabel="Enviando invitación…">
        Invitar cliente
      </SubmitButton>
    </form>
  );
}

export function CreateProjectForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createProject, null);
  if (clients.length === 0) {
    return <p className="text-sm text-neutral-500">Primero invita a un cliente.</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className="label" htmlFor="clientId">Cliente</label>
          <select className="input" id="clientId" name="clientId" required>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <label className="label" htmlFor="title">Título</label>
          <input className="input" id="title" name="title" placeholder="Contenido de diciembre" required maxLength={160} />
        </div>
        <div className="sm:col-span-1">
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
