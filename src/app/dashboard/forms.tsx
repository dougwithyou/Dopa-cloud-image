"use client";

import { useI18n } from "@/i18n/client";
import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { addClientToProject, createClient, createProject, renameProject, updateBusinessName } from "./actions";
import { PencilIcon } from "@/components/icons";

export function CreateProjectForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createProject, null);
  const { t } = useI18n();
  const f = t.forms;
  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="label" htmlFor="title">{f.projectTitle}</label>
        <input className="input" id="title" name="title" placeholder={f.projectTitlePlaceholder} required maxLength={160} />
      </div>
      <fieldset>
        <legend className="label">{f.template}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["monthly_content", "photo_session"] as const).map((value) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-xl border border-neutral-200 p-4 transition has-[:checked]:border-neutral-900 has-[:checked]:ring-2 has-[:checked]:ring-neutral-900/10"
            >
              <input type="radio" name="type" value={value} defaultChecked={value === "monthly_content"} className="mt-1" />
              <span>
                <span className="block text-sm font-semibold">{t.labels.projectType[value]}</span>
                <span className="block text-xs text-neutral-500">{f.templateHelp[value]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="clientId">{f.clientOptional}</label>
        <select className="input" id="clientId" name="clientId" defaultValue="">
          <option value="">{f.noClientYet}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500">{f.clientLater}</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary" pendingLabel={f.creating}>
        {f.createProject}
      </SubmitButton>
    </form>
  );
}

export function CreateClientForm({ disabledReason }: { disabledReason?: string }) {
  const [state, action] = useActionState(createClient, null);
  const f = useI18n().t.forms;
  return (
    <form key={state?.message ?? "form"} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">{f.name}</label>
          <input className="input" id="name" name="name" placeholder={f.namePlaceholder} required maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="email">{f.email}</label>
          <input className="input" id="email" name="email" type="email" placeholder={f.emailPlaceholder} required />
        </div>
      </div>
      {disabledReason ? <p className="text-sm text-amber-700">{disabledReason}</p> : null}
      <FormMessage state={state} />
      <SubmitButton className="btn-primary" pendingLabel={f.adding}>
        {f.addClient}
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
  submitLabel,
}: {
  projectId: string;
  clients: { id: string; name: string; email: string }[];
  currentClientId?: string | null;
  disabledReason?: string;
  submitLabel?: string;
}) {
  const [state, action] = useActionState(addClientToProject, null);
  const f = useI18n().t.forms;
  const options = clients.filter((c) => c.id !== currentClientId);
  const [choice, setChoice] = useState<string>(options[0]?.id ?? "new");
  const isNew = choice === "new";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label className="label" htmlFor="clientId">{f.client}</label>
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
          <option value="new">{f.newClient}</option>
        </select>
      </div>

      {isNew ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">{f.name}</label>
            <input className="input" id="name" name="name" placeholder={f.namePlaceholder} required maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="email">{f.email}</label>
            <input className="input" id="email" name="email" type="email" placeholder={f.emailPlaceholder} required />
          </div>
        </div>
      ) : null}

      {isNew && disabledReason ? <p className="text-sm text-amber-700">{disabledReason}</p> : null}
      <FormMessage state={state} />
      <SubmitButton className="btn-primary" pendingLabel={f.adding}>
        {submitLabel ?? f.addClient}
      </SubmitButton>
    </form>
  );
}

export function BusinessNameForm({ value }: { value: string }) {
  const [state, action] = useActionState(updateBusinessName, null);
  const f = useI18n().t.forms;
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="label" htmlFor="businessName">{f.businessName}</label>
        <input className="input" id="businessName" name="businessName" defaultValue={value} required maxLength={120} />
      </div>
      <SubmitButton className="btn-secondary" pendingLabel={f.saving}>
        {f.save}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** Título del proyecto editable: lápiz para editar, Enter o "Guardar" para confirmar. */
export function ProjectTitleEditor({ projectId, title }: { projectId: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const f = useI18n().t.forms;
  const [state, action] = useActionState(async (prev: { error?: string; message?: string } | null, formData: FormData) => {
    const result = await renameProject(prev, formData);
    if (!result?.error) setEditing(false);
    return result;
  }, null);

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] sm:text-[2rem]">{title}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-full p-2 text-black/45 transition hover:bg-black/10 hover:text-neutral-950"
          aria-label={f.editTitle}
          title={f.editTitle}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="title"
          defaultValue={title}
          maxLength={160}
          required
          autoFocus
          className="input max-w-md bg-white text-lg font-semibold"
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          aria-label={f.projectTitle}
        />
        <SubmitButton className="btn-primary" pendingLabel={f.saving}>
          {f.save}
        </SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
          {f.cancel}
        </button>
      </div>
      {state?.error ? <FormMessage state={state} /> : null}
    </form>
  );
}
