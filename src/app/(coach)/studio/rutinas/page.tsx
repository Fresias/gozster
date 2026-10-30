import { RutinasLibrary } from "@/components/coach/rutinas-library";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudioRutinasPage() {
  const supabase = await createClient();
  const initialDataset = await fetchLiveDatasetFromSupabase(supabase);
  return <RutinasLibrary initialDataset={initialDataset} />;
}
