import { RankingFuncional } from "@/components/coach/ranking-funcional";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudioRankingFuncionalPage({
  searchParams,
}: {
  searchParams?: Promise<{ claseId?: string; ejercicioId?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const initialDataset = await fetchLiveDatasetFromSupabase(supabase);

  return (
    <RankingFuncional
      initialClaseId={params?.claseId}
      initialEjercicioId={params?.ejercicioId}
      alumnosDisponibles={initialDataset.alumnos}
      ejerciciosDisponibles={initialDataset.ejercicios}
    />
  );
}
