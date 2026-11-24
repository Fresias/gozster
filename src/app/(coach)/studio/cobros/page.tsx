import { CobrosPanel } from "@/components/coach/cobros-panel";
import { createClient } from "@/lib/supabase/server";
import { fetchCobrosDatasetFromSupabase, type CobrosSupabaseDataset } from "@/services/cobros-service";
import { crearKpisNegocioVacios, obtenerKpisNegocio, type KpisNegocio } from "@/lib/kpis-negocio";
import { puedeVerFinanzasAlumno } from "@/lib/entrenador-apoyo";
import type { Perfil } from "@/types/database.types";

export const dynamic = "force-dynamic";

export default async function CobrosPage() {
  const supabase = await createClient();
  const authUser = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

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

  let dataset: CobrosSupabaseDataset = {
    cobros: [],
    contrataciones: [],
    planesMembresia: [],
    pagos: [],
    alumnoActividades: [],
  };
  let perfiles: Array<
    Pick<
      Perfil,
      | "id"
      | "nombre_completo"
      | "email"
      | "telefono"
      | "profesor_asignado_id"
      | "profesor_apoyo_id"
      | "apoyo_acceso_financiero"
    >
  > = [];
  let kpis: KpisNegocio = crearKpisNegocioVacios(userRole);

  if (authUser?.data?.user) {
    const viewer = { userId: authUser.data.user.id, rol: userRole };
    const [cobrosRes, perfilesRes, kpisRes] = await Promise.all([
      fetchCobrosDatasetFromSupabase(supabase).catch(() => dataset),
      supabase
        .from("perfiles")
        .select(
          "id, nombre_completo, email, telefono, profesor_asignado_id, profesor_apoyo_id, apoyo_acceso_financiero",
        ),
      obtenerKpisNegocio(supabase, { rol: userRole }).catch(() => kpis),
    ]);
    dataset = cobrosRes;
    if (!perfilesRes.error && Array.isArray(perfilesRes.data)) {
      const todos = perfilesRes.data as typeof perfiles;
      perfiles = todos.filter((p) => puedeVerFinanzasAlumno(p, viewer));
    }
    if (kpisRes) {
      kpis = kpisRes;
    }
  }

  return (
    <CobrosPanel
      initialDataset={dataset}
      initialPerfiles={perfiles}
      kpis={kpis}
      isLiveMode={true}
      currentUserId={authUser?.data?.user?.id ?? null}
      userRole={userRole}
    />
  );
}
