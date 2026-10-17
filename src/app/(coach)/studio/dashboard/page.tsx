import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";

export const dynamic = "force-dynamic";

export default async function CoachDashboardPage() {
  const initialDataset = await fetchLiveDatasetFromSupabase();
  return <CoachDashboardView initialDataset={initialDataset} />;
}
