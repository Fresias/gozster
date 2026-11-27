import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { fetchAlumnosEstancados, fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";
import { crearKpisNegocioVacios, obtenerKpisNegocio, type KpisNegocio } from "@/lib/kpis-negocio";

export const dynamic = "force-dynamic";

export default async function CoachDashboardPage() {
  const supabase = await createClient();
  const [initialDataset, estancados, authUser] = await Promise.all([
    fetchLiveDatasetFromSupabase(supabase),
    fetchAlumnosEstancados(supabase),
    supabase.auth.getUser().catch(() => ({ data: { user: null } })),
  ]);

  let userRole: string = "ENTRENADOR";
  if (authUser?.data?.user) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", authUser.data.user.id)
      .maybeSingle();
    if (perfil?.rol) {
      userRole = perfil.rol;
    }
  }

  let kpis: KpisNegocio = crearKpisNegocioVacios(userRole);
  let errorKpis: string | null = null;
  try {
    const liveKpis = await obtenerKpisNegocio(supabase, { rol: userRole });
    if (liveKpis) {
      kpis = liveKpis;
    }
  } catch {
    // Sin fallback a DEMO_KPIS_NEGOCIO: KPIs en ceros + aviso sin error crudo (GOZS-912)
    errorKpis = "No pudimos cargar los KPIs del negocio.";
  }

  return (
    <CoachDashboardView
      initialDataset={initialDataset}
      estancados={estancados}
      kpis={kpis}
      errorKpis={errorKpis}
    />
  );
}
