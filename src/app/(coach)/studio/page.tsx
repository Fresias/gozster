import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { fetchAlumnosEstancados, fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CoachStudioPage({
  searchParams,
}: {
  searchParams?: Promise<{ estado?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialEstado = resolvedParams?.estado;

  // Cliente de servidor autenticado: PostgREST recibe el JWT del entrenador y RLS
  // devuelve únicamente a sus alumnos y rutinas asignados.
  const supabase = await createClient();
  const [initialDataset, estancados, authUser] = await Promise.all([
    fetchLiveDatasetFromSupabase(supabase),
    fetchAlumnosEstancados(supabase),
    supabase.auth.getUser().catch(() => ({ data: { user: null } })),
  ]);

  // El rol sale solo de perfiles.rol; sin perfil se degrada a ENTRENADOR (sin privilegios de admin).
  let userRole: string = "ENTRENADOR";
  let coachName = "";
  if (authUser?.data?.user) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol, nombre_completo")
      .eq("id", authUser.data.user.id)
      .maybeSingle();
    if (perfil?.rol) {
      userRole = perfil.rol;
    }
    if (perfil?.nombre_completo) {
      coachName = perfil.nombre_completo;
    }
  }

  return (
    <CoachStudioView
      coachName={coachName}
      initialDataset={initialDataset}
      estancados={estancados}
      userRole={userRole}
      userId={authUser?.data?.user?.id ?? null}
      initialEstado={initialEstado}
    />
  );
}
