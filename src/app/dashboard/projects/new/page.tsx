import { requireCreator } from "@/lib/auth";
import { CreateProjectForm } from "../../forms";

export const metadata = { title: "Nuevo proyecto" };

export default async function NewProjectPage() {
  const { supabase } = await requireCreator();
  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo proyecto</h1>
        <p className="text-neutral-500">Después podrás subir el material, armar las publicaciones y ver la vista previa.</p>
      </div>
      <section className="card p-6">
        <CreateProjectForm clients={clients ?? []} />
      </section>
    </div>
  );
}
