import { supabase } from "@/lib/supabase/client";
import { DEMO_CRITICAL_ALERTS } from "@/services/coach-demo-dataset";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useAthleteStore } from "@/store/use-athlete-store";

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

/** Cache en memoria de alertas activas para respuesta reactiva inmediata */
let _cachedDbAlerts: CriticalAlert[] = [];

export function setCachedDbAlerts(alerts: CriticalAlert[]): void {
  _cachedDbAlerts = alerts;
}

export function getCachedDbAlerts(): CriticalAlert[] {
  return _cachedDbAlerts;
}

/** Prioridad de la alerta: 0 = roja (crítica / síntoma de alarma, incl. dolor >= 7), 1 = amarilla, 2 = resto. */
export function prioridadAlerta(a: Pick<CriticalAlert, "severidad" | "esSintomaAlarma">): 0 | 1 | 2 {
  if (a.severidad === "CRITICA" || a.esSintomaAlarma) return 0;
  return a.severidad === "BAJA" ? 2 : 1;
}

/** Ordena rojas, amarillas y resto; conserva el orden original (más recientes primero) dentro de cada nivel. */
export function ordenarAlertasPorPrioridad<T extends Pick<CriticalAlert, "severidad" | "esSintomaAlarma">>(
  alerts: T[]
): T[] {
  return [...alerts].sort((x, y) => prioridadAlerta(x) - prioridadAlerta(y));
}

/** Normaliza el nombre de la zona articular a mayúscula inicial */
function normalizarZona(rawZona?: string | null): string {
  if (!rawZona) return "Articular";
  const z = String(rawZona).toUpperCase().trim();
  if (z === "RODILLA") return "Rodilla";
  if (z === "HOMBRO") return "Hombro";
  if (z === "LUMBAR" || z === "ESPALDA") return "Lumbar";
  if (z === "CODO") return "Codo";
  if (z === "CUELLO") return "Cuello";
  if (z === "CADERA") return "Cadera";
  if (z === "TOBILLO") return "Tobillo";
  if (z === "MUÑECA") return "Muñeca";
  return rawZona.charAt(0).toUpperCase() + rawZona.slice(1).toLowerCase();
}

/** Extrae alertas reactivas pendientes en memoria (offline queue + sesión activa + cache db) */
export function getReactiveCriticalAlerts(): CriticalAlert[] {
  const result: CriticalAlert[] = [];
  const seen = new Set<string>();

  // 1. Alertas persistidas o en caché
  for (const a of _cachedDbAlerts) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      result.push(a);
    }
  }

  // 2. Reportes en cola offline pendientes (action = PAIN_REPORT_SUBMITTED)
  try {
    const queueEvents = useOfflineQueueStore.getState().pendingEvents;
    for (const ev of queueEvents) {
      if (ev.action === "PAIN_REPORT_SUBMITTED" && ev.payload) {
        const p = ev.payload as Record<string, any>;
        const alertId = ev.id;
        if (seen.has(alertId)) continue;
        seen.add(alertId);

        const isFernando =
          p.studentId === "66b92b9a-1ce7-4e2e-a47c-7c5600000000" ||
          /fernando/i.test(p.studentName || "");
        const alumnoNombre = isFernando ? "Fernando Rosales" : p.studentName || "Alumno GOZSter";
        const isCritical = p.esSintomaAlarma === true || p.severidad === "AGUDO";
        const zona = normalizarZona(p.zonaArticular);
        const sintomas: string[] = Array.isArray(p.sintomasAlarma) ? p.sintomasAlarma : [];

        const detalle = `[Dolor: ${p.severidad || "MODERADO"}] ${zona}${
          sintomas.length > 0 ? ` (Síntomas: ${sintomas.join(", ")})` : ""
        }${p.notasAlumno ? ` - ${p.notasAlumno}` : ""}`;

        result.push({
          id: alertId,
          type: "DOLOR",
          alumnoId: p.studentId || (isFernando ? "66b92b9a-1ce7-4e2e-a47c-7c5600000000" : ""),
          alumnoNombre,
          ejercicioNombre: p.exerciseName || "Ejercicio de Fuerza",
          ejercicioId: p.exerciseId,
          setNumber: p.setNumber || 1,
          detalle,
          fecha: "Ahora (offline)",
          resolved: false,
          zona,
          severidad: isCritical ? "CRITICA" : p.severidad === "LEVE" ? "BAJA" : "ALTA",
          estado: "PENDIENTE",
          esSintomaAlarma: isCritical,
          sintomasAlarma: sintomas,
          reporteDolorId: alertId,
          momentoAparicion: p.momentoAparicion,
        });
      }
    }
  } catch {
    // Entorno sin Zustand o SSR
  }

  // 3. Sesión activa en useAthleteStore
  try {
    const session = useAthleteStore.getState().currentSession;
    if (session && Array.isArray(session.ejercicios)) {
      for (const ej of session.ejercicios) {
        if (!ej.series) continue;
        for (const s of ej.series) {
          if (s.pain_reported) {
            const painId = `session-pain-${ej.id}-${s.numero_serie}`;
            if (seen.has(painId)) continue;
            seen.add(painId);

            const notes = s.pain_notes || "Molestia reportada en serie activa";
            const isCritical = /AGUDO/i.test(notes) || /RED FLAG/i.test(notes);
            let zona = "Articular";
            if (/rodilla/i.test(notes)) zona = "Rodilla";
            else if (/hombro/i.test(notes)) zona = "Hombro";
            else if (/lumbar|espalda/i.test(notes)) zona = "Lumbar";
            else if (/codo/i.test(notes)) zona = "Codo";

            result.push({
              id: painId,
              type: "DOLOR",
              alumnoId: session.studentId || "66b92b9a-1ce7-4e2e-a47c-7c5600000000",
              alumnoNombre: session.studentName || "Fernando Rosales",
              ejercicioNombre: ej.nombre || "Ejercicio de Fuerza",
              ejercicioId: ej.ejercicio_id || ej.id,
              setNumber: s.numero_serie,
              detalle: notes,
              fecha: "En sesión activa",
              resolved: false,
              zona,
              severidad: isCritical ? "CRITICA" : "ALTA",
              estado: "PENDIENTE",
              esSintomaAlarma: isCritical,
              sintomasAlarma: [],
            });
          }
        }
      }
    }
  } catch {
    // Entorno sin Zustand o SSR
  }

  return result;
}

/** Alertas de dolor desde Supabase (alumno_historial_dolor → alertas_entrenador → registro_series → fallback demo). */
export async function fetchCriticalAlerts(): Promise<CriticalAlert[]> {
  const alerts: CriticalAlert[] = [];
  const seenIds = new Set<string>();

  // 1. Cargar primero reportes reactivos locales (cola offline y sesión activa)
  const reactive = getReactiveCriticalAlerts();
  for (const r of reactive) {
    if (!seenIds.has(r.id)) {
      seenIds.add(r.id);
      alerts.push(r);
    }
  }

  // 2. Consultar public.alumno_historial_dolor (Ficha Biomecánica / reportes de la Athlete App)
  try {
    const { data: historialData } = await supabase
      .from("alumno_historial_dolor")
      .select(`
        id,
        alumno_id,
        ejercicio_id,
        zona_articular,
        severidad,
        momento_aparicion,
        es_sintoma_alarma,
        sintomas_alarma,
        notas_alumno,
        estado,
        created_at,
        ejercicios (id, nombre),
        perfiles!alumno_historial_dolor_alumno_id_fkey (id, nombre_completo)
      `)
      .order("created_at", { ascending: false })
      .limit(30);

    if (historialData && historialData.length > 0) {
      for (const h of (historialData as any[])) {
        if (seenIds.has(h.id)) continue;
        seenIds.add(h.id);

        const isFernando =
          h.alumno_id === "66b92b9a-1ce7-4e2e-a47c-7c5600000000" ||
          /fernando/i.test(h.perfiles?.nombre_completo || "");
        const alumnoNombre = isFernando
          ? "Fernando Rosales"
          : h.perfiles?.nombre_completo || "Alumno GOZSter";
        const ejNombre = h.ejercicios?.nombre || "Ejercicio de Fuerza";
        const isCritical = h.es_sintoma_alarma === true || h.severidad === "AGUDO";
        const zona = normalizarZona(h.zona_articular);
        const sintomas: string[] = Array.isArray(h.sintomas_alarma) ? h.sintomas_alarma : [];

        const normalizedEstado: AlertaEstado =
          h.estado === "ATENDIDO"
            ? "ATENDIDO"
            : h.estado === "CERRADO" || h.estado === "RESUELTO"
            ? "CERRADO"
            : "PENDIENTE";

        const detalle = `[Dolor: ${h.severidad || "MODERADO"}] ${zona}${
          sintomas.length > 0 ? ` (Síntomas: ${sintomas.join(", ")})` : ""
        }${h.notas_alumno ? ` - ${h.notas_alumno}` : ""}`;

        alerts.push({
          id: h.id,
          type: "DOLOR",
          alumnoId: h.alumno_id || "",
          alumnoNombre,
          ejercicioNombre: ejNombre,
          ejercicioId: h.ejercicio_id || undefined,
          setNumber: 1,
          detalle,
          fecha: new Date(h.created_at).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
          resolved: normalizedEstado === "CERRADO",
          zona,
          severidad: isCritical ? "CRITICA" : h.severidad === "LEVE" ? "BAJA" : "ALTA",
          estado: normalizedEstado,
          esSintomaAlarma: isCritical,
          sintomasAlarma: sintomas,
          reporteDolorId: h.id,
          momentoAparicion: h.momento_aparicion || undefined,
        });
      }
    }
  } catch {
    // Silencioso en modo local o mock
  }

  // 3. Consultar public.alertas_entrenador
  try {
    const { data: dbAlerts } = await supabase
      .from("alertas_entrenador")
      .select(`
        id,
        alumno_id,
        profesor_id,
        ejercicio_id,
        serie_id,
        reporte_dolor_id,
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
      for (const a of (dbAlerts as any[])) {
        if (a.reporte_dolor_id && seenIds.has(a.reporte_dolor_id)) continue;
        if (seenIds.has(a.id)) continue;
        seenIds.add(a.id);

        const alumno = a.perfiles?.nombre_completo || "Alumno GOZSter";
        const alumnoId = a.alumno_id || "";
        const ejNombre = a.ejercicios?.nombre || "Ejercicio de Fuerza";
        const notes = a.detalle || a.titulo || "Molestia articular informada";
        const isCritical = a.severidad === "CRITICA" || /RED FLAG/i.test(a.titulo || "");

        let zona = "Articular";
        if (/rodilla/i.test(notes) || /rodilla/i.test(a.titulo || "")) zona = "Rodilla";
        else if (/hombro/i.test(notes) || /hombro/i.test(a.titulo || "")) zona = "Hombro";
        else if (/lumbar|espalda/i.test(notes) || /lumbar/i.test(a.titulo || "")) zona = "Lumbar";
        else if (/codo/i.test(notes)) zona = "Codo";
        else if (/muñeca/i.test(notes)) zona = "Muñeca";

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

        alerts.push({
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
          reporteDolorId: a.reporte_dolor_id || undefined,
        });
      }
    }
  } catch {
    // Silencioso
  }

  // 4. Fallback a registro_series con pain_reported
  if (alerts.length === 0) {
    try {
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
        for (const s of (seriesData as any[])) {
          if (seenIds.has(s.id)) continue;
          seenIds.add(s.id);

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

          alerts.push({
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
          });
        }
      }
    } catch {
      // Silencioso
    }
  }

  // Guardar en caché y actualizar store si se encontraron alertas reales
  if (alerts.length > 0) {
    setCachedDbAlerts(alerts);
    return alerts;
  }

  // 5. Fallback demo inicial enriquecido con estados y severidad
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

/** Alertas de dolor del dataset demo, con estados y severidad normalizados y unión con reactivas. */
export function getDemoCriticalAlerts(): CriticalAlert[] {
  const reactive = getReactiveCriticalAlerts();
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

  if (reactive.length > 0) {
    const ids = new Set(reactive.map((r) => r.id));
    return [...reactive, ...mappedDemo.filter((d) => !ids.has(d.id))];
  }

  return mappedDemo;
}

/** Persiste el estado del reporte (PENDIENTE, ATENDIDO, CERRADO) en ambas tablas. */
export async function persistAlertEstado(alertId: string, nuevoEstado: AlertaEstado) {
  // Actualizar cache en memoria
  _cachedDbAlerts = _cachedDbAlerts.map((a) =>
    a.id === alertId || a.reporteDolorId === alertId ? withAlertEstado(a, nuevoEstado) : a
  );

  try {
    await Promise.allSettled([
      supabase
        .from("alertas_entrenador")
        .update({
          estado: nuevoEstado,
          resuelto_at: nuevoEstado === "CERRADO" || nuevoEstado === "RESUELTO" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .or(`id.eq.${alertId},reporte_dolor_id.eq.${alertId}`),
      supabase
        .from("alumno_historial_dolor")
        .update({
          estado: nuevoEstado === "RESUELTO" ? "CERRADO" : nuevoEstado,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId),
    ]);
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
