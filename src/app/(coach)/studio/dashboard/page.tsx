import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { fetchAlumnosEstancados, fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CoachDashboardPage() {
  const supabase = await createClient();
  const [initialDataset, estancados] = await Promise.all([
    fetchLiveDatasetFromSupabase(supabase),
    fetchAlumnosEstancados(supabase),
  ]);
  return <CoachDashboardView initialDataset={initialDataset} estancados={estancados} />;
}
