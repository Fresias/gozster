import { ClassAgenda } from "@/components/coach/class-agenda";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import type { ProfesorClaseInfo, ReservaAgenda } from "@/store/use-clases-store";
import type { Clase } from "@/types/database.types";

export const dynamic = "force-dynamic";

export default async function StudioAgendaPage() {
  const supabase = await createClient();
  const authUser = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  let initialClases: Clase[] = [];
  let initialReservas: ReservaAgenda[] = [];
  const initialProfesoresPorClase: Record<string, ProfesorClaseInfo[]> = {};
  let alumnosDisponibles = [] as Awaited<ReturnType<typeof fetchLiveDatasetFromSupabase>>["alumnos"];

  if (authUser?.data?.user) {
    const [clasesRes, reservasRes, profesoresRes, dataset] = await Promise.all([
      supabase.from("clases").select("*").order("inicio", { ascending: true }),
      supabase.from("reservas").select("*, perfiles(nombre_completo)").order("created_at", { ascending: true }),
      supabase.from("clases_profesores").select("clase_id, profesor_id, perfiles(nombre_completo)"),
      fetchLiveDatasetFromSupabase(supabase),
    ]);

    alumnosDisponibles = dataset.alumnos;
    if (!clasesRes.error && Array.isArray(clasesRes.data)) {
      initialClases = clasesRes.data as Clase[];
    }
    if (!reservasRes.error && Array.isArray(reservasRes.data)) {
      const alumnosMap = new Map(dataset.alumnos.map((a) => [a.id, a.nombre_completo]));
      initialReservas = (reservasRes.data as any[])
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
    if (!profesoresRes.error && Array.isArray(profesoresRes.data)) {
      for (const row of profesoresRes.data as any[]) {
        if (!row?.clase_id || !row?.profesor_id) continue;
        const perfilJoin = Array.isArray(row.perfiles) ? row.perfiles[0] : row.perfiles;
        const nombre =
          perfilJoin && typeof perfilJoin.nombre_completo === "string" && perfilJoin.nombre_completo.trim()
            ? perfilJoin.nombre_completo.trim()
            : "Entrenador asignado";
        const lista = initialProfesoresPorClase[row.clase_id] ?? [];
        if (!lista.some((p) => p.id === row.profesor_id)) {
          lista.push({ id: row.profesor_id, nombre_completo: nombre });
        }
        initialProfesoresPorClase[row.clase_id] = lista;
      }
    }
  }

  return (
    <ClassAgenda
      isLiveMode={true}
      initialClases={initialClases}
      initialReservas={initialReservas}
      initialProfesoresPorClase={initialProfesoresPorClase}
      alumnosDisponibles={alumnosDisponibles}
    />
  );
}
