import { AuditoriaCambiosPanel } from "@/components/coach/auditoria-cambios-panel";
import { createClient } from "@/lib/supabase/server";
import {
  listarAuditoriaCambios,
  normalizarFiltroAuditoria,
  type RegistroAuditoria,
} from "@/services/auditoria-service";

export const dynamic = "force-dynamic";

// El middleware ya exige rol ENTRENADOR/ADMIN leído de `perfiles.rol` para /studio;
// la RLS `auditoria_cambios_select_staff` acota qué filas ve cada uno.
export default async function StudioAuditoriaPage({
  searchParams,
}: {
  searchParams?: Promise<{ entidad?: string; accion?: string }>;
}) {
  const filtro = normalizarFiltroAuditoria(await searchParams);
  const supabase = await createClient();
  const authUser = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  let registros: RegistroAuditoria[] = [];
  let error: string | null = null;
  if (authUser?.data?.user) {
    try {
      registros = await listarAuditoriaCambios(supabase, filtro);
    } catch (e) {
      error = e instanceof Error ? e.message : "No pudimos cargar el historial de cambios.";
    }
  }

  return <AuditoriaCambiosPanel registros={registros} filtro={filtro} error={error} />;
}
