import { supabase } from "@/lib/supabase/client";
import { DEMO_CRITICAL_ALERTS } from "@/services/coach-demo-dataset";

export type AlertaEstado = "PENDIENTE" | "ATENDIDO" | "CERRADO" | "RESUELTO";
export type AlertaSeveridad = "BAJA" | "MEDIA" | "ALTA" | "CRITICA";

export interface CriticalAlert {
  id: string;
  type: "DOLOR";
  alumnoId: string;
  alumnoNombre: string;
  ejercicioNombre: string;
  ejercicioId?: string;
  ejercicioEnRutinaId?: string;
  setNumber: number;
  detalle: string;
  fecha: string;
  resolved: boolean;
  zona?: string;
  severidad?: AlertaSeveridad;
  estado?: AlertaEstado;
  sintomasAlarma?: string[];
  esSintomaAlarma?: boolean;
  reporteDolorId?: string;
  momentoAparicion?: string;
}

/** Alertas de dolor desde Supabase (alertas_entrenador → registro_series → fallback demo). */
export async function fetchCriticalAlerts(): Promise<CriticalAlert[]> {
  // 1. Intentar consultar alertas_entrenador y alumno_historial_dolor
  const { data: dbAlerts } = await supabase
    .from("alertas_entrenador")
    .select(`
      id,
      alumno_id,
      profesor_id,
      ejercicio_id,
      serie_id,
      tipo_alerta,
      severidad,
      titulo,
      detalle,
      estado,
      accion_tomada,
      created_at,
      ejercicios (id, nombre),
      perfiles!alertas_entrenador_alumno_id_fkey (id, nombre_completo)
    `)
    .eq("tipo_alerta", "DOLOR_ARTICULAR")
    .order("created_at", { ascending: false })
    .limit(30);

  if (dbAlerts && dbAlerts.length > 0) {
    const mapped: CriticalAlert[] = dbAlerts.map((a: any) => {
      const alumno = a.perfiles?.nombre_completo || "Alumno GOZSter";
      const alumnoId = a.alumno_id || "";
      const ejNombre = a.ejercicios?.nombre || "Ejercicio de Fuerza";
      const notes = a.detalle || a.titulo || "Molestia articular informada";
      const isCritical = a.severidad === "CRITICA" || /RED FLAG/i.test(a.titulo || "");

      // Detectar zona articular
      let zona = "Articular";
      if (/rodilla/i.test(notes) || /rodilla/i.test(a.titulo || "")) zona = "Rodilla";
      else if (/hombro/i.test(notes) || /hombro/i.test(a.titulo || "")) zona = "Hombro";
      else if (/lumbar|espalda/i.test(notes) || /lumbar/i.test(a.titulo || "")) zona = "Lumbar";
      else if (/codo/i.test(notes)) zona = "Codo";
      else if (/muñeca/i.test(notes)) zona = "Muñeca";

      // Detectar síntomas de alarma en texto si existen
      const sintomas: string[] = [];
      if (/punzante|súbito/i.test(notes)) sintomas.push("Dolor punzante/súbito");
      if (/irradiación|adormecimiento/i.test(notes)) sintomas.push("Irradiación/adormecimiento");
      if (/mareo|aire/i.test(notes)) sintomas.push("Mareo/falta de aire");
      if (/inestabilidad/i.test(notes)) sintomas.push("Inestabilidad articular");

      const normalizedEstado: AlertaEstado =
        a.estado === "ATENDIDO"
          ? "ATENDIDO"
          : a.estado === "CERRADO" || a.estado === "RESUELTO"
          ? "CERRADO"
          : "PENDIENTE";

      return {
        id: a.id,
        type: "DOLOR",
        alumnoId,
        alumnoNombre: alumno,
        ejercicioNombre: ejNombre,
        ejercicioId: a.ejercicio_id || undefined,
        setNumber: 1,
        detalle: notes,
        fecha: new Date(a.created_at).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        resolved: normalizedEstado === "CERRADO",
        zona,
        severidad: isCritical ? "CRITICA" : ((a.severidad as AlertaSeveridad) || "ALTA"),
        estado: normalizedEstado,
        esSintomaAlarma: isCritical || sintomas.length > 0,
        sintomasAlarma: sintomas,
      };
    });
    return mapped;
  }

  // 2. Fallback a series con pain_reported
  const { data: seriesData } = await supabase
    .from("registro_series")
    .select(`
      id,
      sesion_id,
      ejercicio_id,
      numero_serie,
      pain_reported,
      pain_notes,
      created_at,
      ejercicios (id, nombre),
      registro_sesiones (alumno_id, perfiles (nombre_completo))
    `)
    .eq("pain_reported", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (seriesData && seriesData.length > 0) {
    const mapped: CriticalAlert[] = seriesData.map((s: any) => {
      const alumno = s.registro_sesiones?.perfiles?.nombre_completo || "Alumno GOZSter";
      const alumnoId = s.registro_sesiones?.alumno_id || "";
      const ejNombre = s.ejercicios?.nombre || "Ejercicio de Fuerza";
      const notes = s.pain_notes || "Molestia articular informada en serie";
      const isCritical = /AGUDO/i.test(notes) || /RED FLAG/i.test(notes);

      let zona = "Articular";
      if (/rodilla/i.test(notes)) zona = "Rodilla";
      else if (/hombro/i.test(notes)) zona = "Hombro";
      else if (/lumbar|espalda/i.test(notes)) zona = "Lumbar";
      else if (/codo/i.test(notes)) zona = "Codo";
      else if (/muñeca/i.test(notes)) zona = "Muñeca";

      const sintomas: string[] = [];
      if (/punzante|súbito/i.test(notes)) sintomas.push("Dolor punzante/súbito");
      if (/irradiación|adormecimiento/i.test(notes)) sintomas.push("Irradiación/adormecimiento");
      if (/mareo|aire/i.test(notes)) sintomas.push("Mareo/falta de aire");
      if (/inestabilidad/i.test(notes)) sintomas.push("Inestabilidad articular");

      return {
        id: s.id,
        type: "DOLOR",
        alumnoId,
        alumnoNombre: alumno,
        ejercicioNombre: ejNombre,
        ejercicioId: s.ejercicio_id || undefined,
        setNumber: s.numero_serie,
        detalle: notes,
        fecha: new Date(s.created_at).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        resolved: false,
        zona,
        severidad: isCritical ? "CRITICA" : "ALTA",
        estado: "PENDIENTE",
        esSintomaAlarma: isCritical || sintomas.length > 0,
        sintomasAlarma: sintomas,
      };
    });
    return mapped;
  }

  // Fallback demo inicial enriquecido con estados y severidad
  return [
    {
      id: "alert-demo-dolor-1",
      type: "DOLOR",
      alumnoId: "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7",
      alumnoNombre: "Celeste Gerardi",
      ejercicioNombre: "Sentadilla Trasera con Barra",
      ejercicioId: "e1111111-1111-4111-8111-111111111101",
      setNumber: 3,
      detalle: "[Dolor: AGUDO] Rodilla - Pinchazo súbito e inestabilidad articular al subir",
      fecha: "Hoy, 10:45",
      resolved: false,
      zona: "Rodilla",
      severidad: "CRITICA",
      estado: "PENDIENTE",
      esSintomaAlarma: true,
      sintomasAlarma: ["Dolor punzante/súbito", "Inestabilidad articular"],
      momentoAparicion: "EN_SERIE",
    },
    {
      id: "alert-demo-dolor-2",
      type: "DOLOR",
      alumnoId: "a1111111-1111-4111-8111-111111111101",
      alumnoNombre: "Lucas Giménez",
      ejercicioNombre: "Press de Banca Plano",
      ejercicioId: "e2222222-2222-4222-8222-222222222202",
      setNumber: 2,
      detalle: "[Dolor: MODERADO] Hombro - Molestia anterior al descender la barra",
      fecha: "Hoy, 12:15",
      resolved: false,
      zona: "Hombro",
      severidad: "MEDIA",
      estado: "PENDIENTE",
      esSintomaAlarma: false,
      sintomasAlarma: [],
      momentoAparicion: "EN_SERIE",
    },
  ];
}

/** Alertas de dolor del dataset demo (Modo Testeo), con estados y severidad normalizados. */
export function getDemoCriticalAlerts(): CriticalAlert[] {
  const mappedDemo: CriticalAlert[] = DEMO_CRITICAL_ALERTS.map((d, idx) => ({
    ...d,
    severidad: idx === 0 || idx === 4 ? "CRITICA" : "ALTA",
    estado: (d.estado as AlertaEstado) || "PENDIENTE",
    esSintomaAlarma: idx === 0 || idx === 4 || Boolean(d.esSintomaAlarma),
    sintomasAlarma:
      d.sintomasAlarma ||
      (idx === 0
        ? ["Dolor punzante/súbito", "Inestabilidad articular"]
        : idx === 4
        ? ["Irradiación/adormecimiento"]
        : []),
    zona: d.zona || (/rodilla/i.test(d.detalle) ? "Rodilla" : "Hombro"),
  }));
  return mappedDemo;
}

/** Persiste el estado del reporte (PENDIENTE, ATENDIDO, CERRADO). */
export async function persistAlertEstado(alertId: string, nuevoEstado: AlertaEstado) {
  try {
    await supabase
      .from("alertas_entrenador")
      .update({
        estado: nuevoEstado,
        resuelto_at: nuevoEstado === "CERRADO" || nuevoEstado === "RESUELTO" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", alertId);
  } catch {
    // Silencioso en modo local o mock
  }
}

/** Aplica el nuevo estado a una alerta en memoria. */
export function withAlertEstado(a: CriticalAlert, nuevoEstado: AlertaEstado): CriticalAlert {
  return {
    ...a,
    estado: nuevoEstado,
    resolved: nuevoEstado === "CERRADO" || nuevoEstado === "RESUELTO",
  };
}
