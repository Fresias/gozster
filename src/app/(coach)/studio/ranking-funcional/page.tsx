import { RankingFuncional } from "@/components/coach/ranking-funcional";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";
import type { ReservaAgenda } from "@/store/use-clases-store";
import { prsDeClasesDesdeVista } from "@/lib/ranking-prs";
import type { Clase, PrView, RankingPR } from "@/types/database.types";

export const dynamic = "force-dynamic";

export default async function StudioRankingFuncionalPage({
  searchParams,
}: {
  searchParams?: Promise<{ claseId?: string; ejercicioId?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [initialDataset, authUser] = await Promise.all([
    fetchLiveDatasetFromSupabase(supabase),
    supabase.auth.getUser().catch(() => ({ data: { user: null } })),
  ]);

  let clasesDisponibles: Clase[] = [];
  let reservasDisponibles: ReservaAgenda[] = [];
  let prsIniciales: RankingPR[] = [];

  if (authUser?.data?.user) {
    const [clasesRes, reservasRes, prsRes] = await Promise.all([
      supabase.from("clases").select("*").order("inicio", { ascending: true }),
      supabase.from("reservas").select("*, perfiles(nombre_completo)").order("created_at", { ascending: true }),
      supabase.from("v_prs").select("*"),
    ]);

    if (!clasesRes.error && Array.isArray(clasesRes.data)) {
      clasesDisponibles = clasesRes.data as Clase[];
    }
    if (!reservasRes.error && Array.isArray(reservasRes.data)) {
      const alumnosMap = new Map(initialDataset.alumnos.map((a) => [a.id, a.nombre_completo]));
      reservasDisponibles = (reservasRes.data as any[])
        .filter((r) => r.estado !== "CANCELADO")
        .map((r) => {
          const perfilJoin = Array.isArray(r.perfiles) ? r.perfiles[0] : r.perfiles;
          return {
            id: r.id,
            clase_id: r.clase_id,
            alumno_id: r.alumno_id,
            estado: r.estado,
            created_at: r.created_at,
            updated_at: r.updated_at,
            alumno_nombre:
              (perfilJoin && typeof perfilJoin.nombre_completo === "string" && perfilJoin.nombre_completo) ||
              alumnosMap.get(r.alumno_id) ||
              "Alumno",
          };
        });
    }
    if (!prsRes.error && Array.isArray(prsRes.data)) {
      prsIniciales = prsDeClasesDesdeVista(prsRes.data as PrView[], reservasDisponibles);
    }
  }

  return (
    <RankingFuncional
      initialClaseId={params?.claseId}
      initialEjercicioId={params?.ejercicioId}
      alumnosDisponibles={initialDataset.alumnos}
      ejerciciosDisponibles={initialDataset.ejercicios}
      clasesDisponibles={clasesDisponibles}
      reservasDisponibles={reservasDisponibles}
      prsIniciales={prsIniciales}
      isLiveMode={true}
    />
  );
}
