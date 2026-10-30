import { useAthleteStore } from "@/store/use-athlete-store";
import {
  REAL_ALUMNOS,
  REAL_PLANES,
  REAL_DIAS,
  REAL_EJERCICIOS,
  REAL_EJERCICIOS_RUTINA,
} from "@/services/real-mynter-data";

/** Siembra `planAlumno` con el dataset demo (solo tests): simula lo que cargaría Supabase por RLS. */
export function sembrarPlanAlumno(idONombre: string = REAL_ALUMNOS[0]!.id) {
  const alumno =
    REAL_ALUMNOS.find((a) => a.id === idONombre || a.nombre_completo.toLowerCase().includes(idONombre.toLowerCase())) ??
    REAL_ALUMNOS[0]!;
  const planes = REAL_PLANES.filter((p) => p.alumno_id === alumno.id);
  const plan = planes.find((p) => p.estado === "ACTIVO") ?? planes[0];
  const dias = REAL_DIAS.filter((d) => d.plan_id === plan?.id);
  useAthleteStore.setState({
    planAlumno: {
      alumnos: [alumno],
      planes: plan ? [plan] : [],
      dias,
      ejerciciosEnRutina: REAL_EJERCICIOS_RUTINA.filter((er) => dias.some((d) => d.id === er.dia_id)),
      ejercicios: REAL_EJERCICIOS,
    },
  });
}
