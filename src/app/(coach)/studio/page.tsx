import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CoachStudioPage() {
  // Cliente de servidor autenticado: PostgREST recibe el JWT del entrenador y RLS
  // devuelve únicamente a sus alumnos y rutinas asignados.
  const supabase = await createClient();
  const initialDataset = await fetchLiveDatasetFromSupabase(supabase);
  // Solo el ADMIN ve la franja de negocio en Producción (obtener_kpis_negocio es ADMIN-only).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle()
    : { data: null };
  return <CoachStudioView initialDataset={initialDataset} esAdmin={perfil?.rol === "ADMIN"} />;
}
