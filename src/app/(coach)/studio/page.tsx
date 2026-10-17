import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";

export const dynamic = "force-dynamic";

export default async function CoachStudioPage() {
  const initialDataset = await fetchLiveDatasetFromSupabase();
  return <CoachStudioView initialDataset={initialDataset} />;
}
