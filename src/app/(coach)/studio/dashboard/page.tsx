import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { fetchAlumnosEstancados, fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";
import { obtenerKpisNegocio, type KpisNegocio } from "@/lib/kpis-negocio";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";

export const dynamic = "force-dynamic";

export default async function CoachDashboardPage() {
  const supabase = await createClient();
  const [initialDataset, estancados, authUser] = await Promise.all([
    fetchLiveDatasetFromSupabase(supabase),
    fetchAlumnosEstancados(supabase),
    supabase.auth.getUser().catch(() => ({ data: { user: null } })),
  ]);

  let userRole: string = "ADMIN";
  if (authUser?.data?.user) {
    const metaRol = (authUser.data.user.user_metadata as Record<string, unknown> | undefined)?.rol;
    if (typeof metaRol === "string" && metaRol) {
      userRole = metaRol;
    } else {
      const { data: perfil } = await supabase
        .from("perfiles")
        .select("rol")
        .eq("id", authUser.data.user.id)
        .maybeSingle();
      if (perfil?.rol) {
        userRole = perfil.rol;
      }
    }
  }

  let kpis: KpisNegocio = DEMO_KPIS_NEGOCIO;
  if (initialDataset && initialDataset.alumnos.length > 0) {
    try {
      const liveKpis = await obtenerKpisNegocio(supabase, { rol: userRole });
      if (liveKpis) {
        kpis = liveKpis;
      }
    } catch {
      // Fallback a DEMO_KPIS_NEGOCIO
    }
  }

  return (
    <CoachDashboardView
      initialDataset={initialDataset}
      estancados={estancados}
      kpis={kpis}
    />
  );
}
