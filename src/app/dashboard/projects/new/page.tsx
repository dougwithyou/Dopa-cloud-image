import { requireCreator } from "@/lib/auth";
import { CreateProjectForm } from "../../forms";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dash.newProject.meta };
}

export default async function NewProjectPage() {
  const { supabase } = await requireCreator();
  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  const n = (await getI18n()).t.dash.newProject;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="dash-title">{n.title}</h1>
        <p className="mt-2 text-neutral-500">{n.lead}</p>
      </div>
      <section className="card p-6">
        <CreateProjectForm clients={clients ?? []} />
      </section>
    </div>
  );
}
