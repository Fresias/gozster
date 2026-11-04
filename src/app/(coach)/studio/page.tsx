import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { fetchAlumnosEstancados, fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CoachStudioPage() {
  // Cliente de servidor autenticado: PostgREST recibe el JWT del entrenador y RLS
  // devuelve únicamente a sus alumnos y rutinas asignados.
  const supabase = await createClient();
  const [initialDataset, estancados] = await Promise.all([
    fetchLiveDatasetFromSupabase(supabase),
    fetchAlumnosEstancados(supabase),
  ]);
  return <CoachStudioView initialDataset={initialDataset} estancados={estancados} />;
}
