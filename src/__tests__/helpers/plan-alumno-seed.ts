import { useAthleteStore } from "@/store/use-athlete-store";
import {
  SINT_ALUMNOS,
  SINT_PLANES,
  SINT_DIAS,
  SINT_EJERCICIOS,
  SINT_EJERCICIOS_RUTINA,
} from "./datos-sinteticos";

/** Siembra `planAlumno` con el dataset demo (solo tests): simula lo que cargaría Supabase por RLS. */
export function sembrarPlanAlumno(idONombre: string = SINT_ALUMNOS[0]!.id) {
  const alumno =
    SINT_ALUMNOS.find((a) => a.id === idONombre || a.nombre_completo.toLowerCase().includes(idONombre.toLowerCase())) ??
    SINT_ALUMNOS[0]!;
  const planes = SINT_PLANES.filter((p) => p.alumno_id === alumno.id);
  const plan = planes.find((p) => p.estado === "ACTIVO") ?? planes[0];
  const dias = SINT_DIAS.filter((d) => d.plan_id === plan?.id);
  useAthleteStore.setState({
    planAlumno: {
      alumnos: [alumno],
      planes: plan ? [plan] : [],
      dias,
      ejerciciosEnRutina: SINT_EJERCICIOS_RUTINA.filter((er) => dias.some((d) => d.id === er.dia_id)),
      ejercicios: SINT_EJERCICIOS,
    },
  });
}
