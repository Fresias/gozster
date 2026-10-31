"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clampSeries, MAX_SERIES_PER_EXERCISE } from "@/lib/routine-helpers";
import { asignarGrupo, moverEjercicio, normalizarSuperseries } from "@/lib/superseries";
import type { Ejercicio, DiaRutina, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

interface BuilderExercise {
  id: string;
  ejercicio_id: string;
  nombre: string;
  series: number;
  repeticiones: string;
  descanso_segundos: number;
  rpe_objetivo: number;
  tempo: string;
  tempo_activo: boolean;
  force_rpe_required: boolean;
  notas: string;
  es_superserie: boolean;
  grupo_superserie: number | null;
  tipo_serie: "NORMAL" | "WARMUP" | "DROPSET";
  url_video?: string | null;
}

interface BuilderDay {
  id: string;
  nombre: string;
  orden: number;
  ejercicios: BuilderExercise[];
}

interface RoutineBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  alumnoId?: string;
  alumnoNombre?: string;
  planInicial?: PlanEntrenamiento | null;
  diasIniciales?: DiaRutina[];
  ejerciciosEnRutinaIniciales?: EjercicioEnRutina[];
  catalogoEjercicios: Ejercicio[];
  onRoutineSaved?: (newPlan: PlanEntrenamiento) => void;
}

const DEFAULT_BUILDER_DAYS: BuilderDay[] = [];

type SaveMode = "guardar" | "version" | "nueva";

const GENERIC_SAVE_ERROR = "No se pudo guardar la rutina. Intenta de nuevo.";
const OFFLINE_SAVE_ERROR = "Sin conexión: tus cambios siguen acá y se guardan cuando vuelva la red";

// Error de red (no de negocio): sin conexión o fetch caído
export function esErrorDeRed(err: any) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err?.message ?? err));
}

export function buildGuardarRutinaPayload(input: {
  planId?: string;
  comoNueva: boolean;
  nombre: string;
  comentarios: string;
  alumnoId?: string;
  days: BuilderDay[];
}) {
  return {
    ...(input.planId ? { plan_id: input.planId } : {}),
    ...(input.comoNueva ? { como_nueva: true } : {}),
    nombre: input.nombre,
    comentarios: input.comentarios,
    ...(input.alumnoId ? { alumno_id: input.alumnoId } : {}),
    dias: input.days.map((d) => ({
      nombre: d.nombre,
      ejercicios: d.ejercicios.map((e) => ({
        ejercicio_id: e.ejercicio_id,
        nombre: e.nombre,
        series: e.series,
        repeticiones: e.repeticiones,
        descanso_segundos: e.descanso_segundos,
        rpe_objetivo: e.rpe_objetivo,
        notas: e.notas || null,
        es_superserie: e.es_superserie,
        grupo_superserie: e.grupo_superserie,
        tempo: e.tempo,
        tempo_activo: e.tempo_activo,
        tipo_serie: e.tipo_serie,
        force_rpe_required: e.force_rpe_required,
      })),
    })),
  };
}

// GZ010 = error de negocio con mensaje ya humano; cualquier otro se oculta tras el genérico
export function clasificarErrorGuardado(err: any, modo: SaveMode) {
  const esNegocio = err?.code === "GZ010";
  const sinRed = !esNegocio && esErrorDeRed(err);
  const mensaje = esNegocio ? String(err.message) : sinRed ? OFFLINE_SAVE_ERROR : GENERIC_SAVE_ERROR;
  return {
    mensaje,
    needsNewVersion: esNegocio && modo === "guardar" && /sesiones registradas/i.test(mensaje),
    detalle: [err?.code, err?.message, err?.details].filter(Boolean).join(" | ") || String(err),
  };
}

// Resumen para errores_app: nunca el payload completo
export function resumenPayload(p: ReturnType<typeof buildGuardarRutinaPayload>) {
  return {
    nombre: p.nombre,
    dias: p.dias.length,
    ejercicios: p.dias.reduce((n, d) => n + d.ejercicios.length, 0),
  };
}

function mapPlanToBuilderDays(
  planId: string,
  dias: DiaRutina[],
  ejerciciosEnRutina: EjercicioEnRutina[],
  catalogo: Ejercicio[],
): BuilderDay[] {
  const planDias = dias
    .filter((d) => d.plan_id === planId)
    .sort((a, b) => a.orden - b.orden);

  if (planDias.length === 0) return DEFAULT_BUILDER_DAYS;

  return planDias.map((d) => {
    const dEjercicios = ejerciciosEnRutina
      .filter((er) => er.dia_id === d.id)
      .sort((a, b) => a.orden - b.orden)
      .map((er) => {
        const ej = catalogo.find((e) => e.id === er.ejercicio_id);
        const grupoNum =
          typeof er.grupo_superserie === "number"
            ? er.grupo_superserie
            : typeof er.grupo_superserie === "string"
            ? parseInt((er.grupo_superserie as string).replace(/\D/g, ""), 10) || null
            : null;
        return {
          id: er.id,
          ejercicio_id: er.ejercicio_id ?? "",
          nombre: (er as any).nombre_ejercicio_custom || ej?.nombre || "Ejercicio",
          series: er.series,
          repeticiones: er.repeticiones,
          descanso_segundos: er.descanso_segundos,
          rpe_objetivo: er.rpe_objetivo ?? 8,
          tempo: er.tempo ?? "2-0-1-0",
          tempo_activo: Boolean((er as any).tempo_activo),
          force_rpe_required: Boolean((er as any).force_rpe_required),
          notas: er.notas ?? "",
          es_superserie: Boolean(er.es_superserie),
          grupo_superserie: grupoNum,
          tipo_serie: er.tipo_serie ?? "NORMAL",
          url_video: ej?.url_video ?? null,
        };
      });

    return {
      id: d.id,
      nombre: d.nombre,
      orden: d.orden,
      ejercicios: dEjercicios,
    };
  });
}

// Input numérico con borrador de texto: permite dejarlo vacío mientras se edita
// y muestra exactamente lo tipeado (sin ceros a la izquierda forzados).
function DraftNumberInput({
  value,
  parse,
  onValue,
  ...props
}: {
  value: number;
  parse: (raw: string) => number;
  onValue: (n: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => {
    setDraft((d) => (parse(d) === value ? d : String(value)));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      {...props}
      type="number"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        const n = parse(raw);
        setDraft(raw !== "" && n !== Number(raw) ? String(n) : raw);
        onValue(n);
      }}
    />
  );
}

export function RoutineBuilderModal({
  isOpen,
  onClose,
  alumnoId,
  alumnoNombre = "Plantilla Maestra",
  planInicial,
  diasIniciales,
  ejerciciosEnRutinaIniciales,
  catalogoEjercicios,
  onRoutineSaved,
}: RoutineBuilderModalProps) {
  const [planName, setPlanName] = React.useState("Bloque de Hipertrofia & Fuerza");
  const [comentarios, setComentarios] = React.useState("Enfocarse en sobrecarga progresiva y control excéntrico.");
  const [days, setDays] = React.useState<BuilderDay[]>(DEFAULT_BUILDER_DAYS);
  const baselineRef = React.useRef("");

  // Candado síncrono (el estado llega tarde al 2º/3er clic) que se mantiene hasta cerrar el modal
  const lockRef = React.useRef(false);
  // Guardado pendiente por falta de red: se reintenta una sola vez al volver `online`
  const pendienteRef = React.useRef<SaveMode | null>(null);
  const guardarRef = React.useRef<(modo: SaveMode) => Promise<void>>(async () => {});

  React.useEffect(() => {
    if (!isOpen) {
      lockRef.current = false;
      pendienteRef.current = null;
      return;
    }
    if (lockRef.current) return; // guardando o ya guardado: no pisar lo que hay en pantalla
    setNeedsNewVersion(false);
    setAsignarAlumno(false);
    setErrorMessage(null);
    if (planInicial) {
      setPlanName(planInicial.nombre);
      setComentarios(planInicial.comentarios ?? "");
      const mapped = mapPlanToBuilderDays(
        planInicial.id,
        diasIniciales ?? [],
        ejerciciosEnRutinaIniciales ?? [],
        catalogoEjercicios,
      );
      setDays(mapped);
      baselineRef.current = JSON.stringify([planInicial.nombre, planInicial.comentarios ?? "", mapped]);
    } else {
      setPlanName("Bloque de Hipertrofia & Fuerza");
      setComentarios("Enfocarse en sobrecarga progresiva y control excéntrico.");
      setDays(DEFAULT_BUILDER_DAYS);
      baselineRef.current = JSON.stringify([
        "Bloque de Hipertrofia & Fuerza",
        "Enfocarse en sobrecarga progresiva y control excéntrico.",
        DEFAULT_BUILDER_DAYS,
      ]);
    }
  }, [isOpen, planInicial, diasIniciales, ejerciciosEnRutinaIniciales, catalogoEjercicios]);

  const [selectedDayIdx, setSelectedDayIdx] = React.useState(0);
  // Grupo del circuito de superserie abierto: los ejercicios nuevos entran hasta cerrarlo
  const [openCircuit, setOpenCircuit] = React.useState<number | null>(null);
  const [showCatalogModal, setShowCatalogModal] = React.useState(false);
  const [catalogSearch, setCatalogSearch] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [needsNewVersion, setNeedsNewVersion] = React.useState(false);
  const [asignarAlumno, setAsignarAlumno] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const alVolverRed = () => {
      const modo = pendienteRef.current;
      pendienteRef.current = null;
      if (modo) void guardarRef.current(modo);
    };
    window.addEventListener("online", alVolverRed);
    return () => window.removeEventListener("online", alVolverRed);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentDay = days[selectedDayIdx] || days[0];

  // Toda acción sobre el día actual termina normalizando: ningún grupo queda de 1 ni partido
  const actualizarDiaActual = (fn: (lista: BuilderExercise[]) => BuilderExercise[]) => {
    setDays((prev) =>
      normalizarSuperseries(
        prev.map((d, idx) => (idx === selectedDayIdx ? { ...d, ejercicios: fn(d.ejercicios) } : d)),
        openCircuit
      )
    );
  };

  // Cambiar de día cierra el circuito abierto (no puede cruzar días)
  const irADia = (idx: number) => {
    setOpenCircuit(null);
    setDays((prev) => normalizarSuperseries(prev, null));
    setSelectedDayIdx(idx);
  };

  const handleClose = () => {
    const dirty = JSON.stringify([planName, comentarios, days]) !== baselineRef.current;
    if (dirty && !window.confirm("Tenés cambios sin guardar. ¿Descartarlos y salir?")) return;
    onClose();
  };

  const handleAddDay = () => {
    const nextOrder = days.length + 1;
    const newDay: BuilderDay = {
      id: `builder-day-${Date.now()}`,
      nombre: `Día ${nextOrder}`,
      orden: nextOrder,
      ejercicios: [],
    };
    setOpenCircuit(null);
    setDays(normalizarSuperseries([...days, newDay], null));
    setSelectedDayIdx(days.length);
  };

  const handleAddExerciseToCurrentDay = (ej: Ejercicio) => {
    if (!currentDay) return;
    const newExercise: BuilderExercise = {
      id: `be-${Date.now()}`,
      ejercicio_id: ej.id,
      nombre: ej.nombre,
      series: 0,
      repeticiones: "0",
      descanso_segundos: 90,
      rpe_objetivo: 0,
      tempo: "0",
      tempo_activo: false,
      force_rpe_required: false,
      notas: "",
      es_superserie: openCircuit !== null,
      grupo_superserie: openCircuit,
      tipo_serie: "NORMAL",
      url_video: ej.url_video,
    };

    // Entra al final del día; con un circuito abierto queda en él y se acomoda con ▲/▼ o al guardar
    actualizarDiaActual((lista) => [...lista, newExercise]);
    setShowCatalogModal(false);
  };

  const handleUpdateExercise = (
    exId: string,
    field: keyof BuilderExercise,
    value: any
  ) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === selectedDayIdx
          ? {
              ...d,
              ejercicios: d.ejercicios.map((e) =>
                e.id === exId ? { ...e, [field]: value } : e
              ),
            }
          : d
      )
    );
  };

  const handleRemoveExercise = (exId: string) => {
    actualizarDiaActual((lista) => lista.filter((e) => e.id !== exId));
  };

  const handleMoveExercise = (index: number, direction: "UP" | "DOWN") => {
    actualizarDiaActual((lista) => moverEjercicio(lista, index, direction));
  };

  // Superserie como circuito: tocar abre uno nuevo, tocar de nuevo lo cierra
  const handleToggleSuperset = (exId: string) => {
    if (!currentDay) return;
    const ex = currentDay.ejercicios.find((e) => e.id === exId);
    if (!ex) return;

    if (openCircuit !== null) {
      if (ex.grupo_superserie === openCircuit) {
        // Cerrar circuito: si quedó de 1 pasa a ser normal
        setOpenCircuit(null);
        setDays((prev) => normalizarSuperseries(prev, null));
      } else {
        // Un ejercicio existente (suelto o de otra superserie) se une al circuito abierto
        actualizarDiaActual((lista) => asignarGrupo(lista, exId, openCircuit));
      }
      return;
    }
    if (ex.es_superserie) {
      actualizarDiaActual((lista) => asignarGrupo(lista, exId, null));
      return;
    }
    const group = Math.max(0, ...days.flatMap((d) => d.ejercicios.map((e) => e.grupo_superserie ?? 0))) + 1;
    setOpenCircuit(group);
    setDays((prev) =>
      normalizarSuperseries(
        prev.map((d, idx) =>
          idx === selectedDayIdx
            ? { ...d, ejercicios: d.ejercicios.map((e) => (e.id === exId ? { ...e, es_superserie: true, grupo_superserie: group } : e)) }
            : d
        ),
        group
      )
    );
  };

  // Mover a otra superserie del mismo día (select nativo)
  const handleMoveToGroup = (exId: string, value: string) => {
    actualizarDiaActual((lista) => asignarGrupo(lista, exId, value === "" ? null : Number(value)));
  };

  const handleToggleTipoSerie = (exId: string, tipo: "WARMUP" | "DROPSET") => {
    const ex = currentDay?.ejercicios.find((e) => e.id === exId);
    handleUpdateExercise(exId, "tipo_serie", ex?.tipo_serie === tipo ? "NORMAL" : tipo);
  };

  // Guardado transaccional vía RPC guardar_rutina; los errores se registran en errores_app
  const handleSaveToSupabase = async (modo: SaveMode = "guardar") => {
    if (lockRef.current) return;
    lockRef.current = true;
    pendienteRef.current = null;
    let liberar = true;
    setIsSaving(true);
    setErrorMessage(null);
    const payload = buildGuardarRutinaPayload({
      planId: planInicial?.id,
      comoNueva: modo !== "guardar",
      nombre: planName,
      comentarios,
      alumnoId: modo === "nueva" && !asignarAlumno ? undefined : alumnoId,
      days: normalizarSuperseries(days, null, true),
    });

    try {
      const { data: planId, error } = await supabase.rpc("guardar_rutina", { p_payload: payload });
      if (error) throw error;

      const { data: planData, error: planErr } = await supabase
        .from("planes_entrenamiento")
        .select("*")
        .eq("id", planId)
        .single();
      if (planErr) throw planErr;

      setNeedsNewVersion(false);
      setSaveSuccess(true);
      liberar = false; // tras éxito el candado sigue hasta cerrar: ningún clic re-guarda
      if (onRoutineSaved && planData) {
        onRoutineSaved(planData as PlanEntrenamiento);
      }
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      const { mensaje, detalle, needsNewVersion: nueva } = clasificarErrorGuardado(err, modo);
      if (err?.code !== "GZ010" && esErrorDeRed(err)) pendienteRef.current = modo;
      setErrorMessage(mensaje);
      setNeedsNewVersion(nueva);
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          await supabase.from("errores_app").insert({
            usuario_id: authData.user.id,
            contexto: "guardar_rutina",
            mensaje_humano: mensaje,
            detalle_tecnico: detalle,
            payload_resumen: resumenPayload(payload),
          });
        }
      } catch {
        // el registro de errores nunca debe tapar el error original
      }
    } finally {
      if (liberar) lockRef.current = false;
      setIsSaving(false);
    }
  };
  guardarRef.current = handleSaveToSupabase;

  const normalizar = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const termino = normalizar(catalogSearch.trim());
  const filteredCatalog = catalogoEjercicios.filter(
    (e) =>
      normalizar(e.nombre).includes(termino) ||
      e.musculos_principales.some((m) => normalizar(m).includes(termino))
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 sm:p-6 backdrop-blur-sm animate-in fade-in"
      data-testid="routine-builder-modal"
    >
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-border/60 p-4 bg-secondary/10">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary text-xl">
              🛠️
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Constructor Visual de Rutinas (Coach Studio)
              </h2>
              <p className="text-xs text-muted-foreground">
                Asignando a: <span className="font-semibold text-foreground">{alumnoNombre}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1 rounded-md"
          >
            ✕
          </button>
        </div>

        {/* Formulario de Metadatos del Plan */}
        <div className="p-4 border-b border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-secondary/20">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Nombre de la Rutina:
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Comentarios Globales / Recomendaciones:
            </label>
            <input
              type="text"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Pestañas de Días */}
        <div className="flex items-center justify-between px-4 pt-3 border-b border-border/40 overflow-x-auto scrollbar-none">
          <div className="flex gap-2">
            {days.map((d, idx) => (
              <button
                key={d.id}
                type="button"
                onClick={() => irADia(idx)}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
                  idx === selectedDayIdx
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {d.nombre} ({d.ejercicios.length})
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddDay}
            className="text-xs font-semibold h-7"
          >
            + Agregar Día
          </Button>
        </div>

        {/* Contenido del Día Seleccionado */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {days.length === 0 ? (
            <div
              className="rounded-xl border border-dashed border-border p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center space-y-3 my-auto"
              data-testid="no-days-message"
            >
              <p className="text-sm font-medium text-foreground">No hay días precargados en la rutina.</p>
              <p className="text-xs text-muted-foreground">Crea un día para comenzar a diseñar las sesiones de entrenamiento.</p>
              <Button
                size="sm"
                onClick={handleAddDay}
                className="bg-primary text-primary-foreground font-bold text-xs"
                data-testid="add-first-day-btn"
              >
                + Agregar Día
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between pb-1 gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <label htmlFor="day-name-input" className="text-xs font-bold text-muted-foreground shrink-0">
                    Nombre del día:
                  </label>
                  <input
                    id="day-name-input"
                    type="text"
                    value={currentDay?.nombre || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDays((prev) =>
                        prev.map((d, idx) =>
                          idx === selectedDayIdx ? { ...d, nombre: val } : d
                        )
                      );
                    }}
                    placeholder="Ej. Día 1 - Torso"
                    data-testid="day-name-input"
                    aria-label="Nombre del día"
                    className="text-sm font-bold text-foreground bg-transparent border-b border-input hover:border-foreground/50 focus:border-primary focus:outline-none px-1 py-0.5 w-full transition-colors"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowCatalogModal(true)}
                  className="bg-primary text-primary-foreground font-bold text-xs"
                  data-testid="open-exercise-catalog-btn"
                >
                  + Añadir Ejercicio del Catálogo
                </Button>
              </div>

              {currentDay?.ejercicios.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                  No hay ejercicios cargados en este día. Haz clic en "+ Añadir Ejercicio" para armar la estación.
                </div>
          ) : (
            <div className="space-y-3">
              {currentDay?.ejercicios.map((ej, index) => {
                const isSuperset = ej.es_superserie;
                const groupLabel = isSuperset
                  ? `Superserie A${ej.grupo_superserie || 1}`
                  : null;

                return (
                  <div
                    key={ej.id}
                    className={`rounded-xl border p-3.5 space-y-3 transition-colors ${
                      isSuperset
                        ? "border-purple-500/40 bg-purple-500/5 border-l-4 border-l-purple-500"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-secondary text-secondary-foreground font-mono font-bold text-xs border border-border/60">
                          #{index + 1}
                        </span>
                        <h4 className="text-sm font-bold text-foreground">
                          {ej.nombre}
                        </h4>
                        {isSuperset && (
                          <Badge className="bg-purple-600 text-white text-[10px] font-bold">
                            {groupLabel}
                          </Badge>
                        )}
                        {ej.tipo_serie !== "NORMAL" && (
                          <Badge
                            className={`text-white text-[10px] font-bold ${
                              ej.tipo_serie === "DROPSET" ? "bg-rose-600" : "bg-amber-600"
                            }`}
                          >
                            {ej.tipo_serie === "DROPSET" ? "Dropset" : "Warmup"}
                          </Badge>
                        )}
                        {ej.tempo_activo && (
                          <Badge
                            variant="outline"
                            className="border-sky-500 text-sky-400 text-[10px] font-bold"
                            data-testid={`tempo-badge-${ej.id}`}
                          >
                            Tempo {ej.tempo || "3-0-1-0"}
                          </Badge>
                        )}
                        {ej.force_rpe_required && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-400 text-[10px] font-bold"
                            data-testid={`rpe-badge-${ej.id}`}
                          >
                            RPE Obligatorio
                          </Badge>
                        )}
                        {ej.url_video && (
                          <span className="text-[10px] font-semibold text-primary inline-flex items-center gap-1">
                            <span>🎬</span> Video OK
                          </span>
                        )}
                      </div>

                      {/* Botones de ordenamiento y borrado con mayor ergonomía táctil */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveExercise(index, "UP")}
                          aria-label={`Subir orden de ${ej.nombre}`}
                          className="h-8 w-8 rounded-xl bg-secondary text-xs disabled:opacity-30 hover:bg-secondary/80 flex items-center justify-center transition-colors cursor-pointer border border-border/40 font-bold"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === currentDay.ejercicios.length - 1}
                          onClick={() => handleMoveExercise(index, "DOWN")}
                          aria-label={`Bajar orden de ${ej.nombre}`}
                          className="h-8 w-8 rounded-xl bg-secondary text-xs disabled:opacity-30 hover:bg-secondary/80 flex items-center justify-center transition-colors cursor-pointer border border-border/40 font-bold"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(ej.id)}
                          aria-label={`Eliminar ${ej.nombre}`}
                          className="h-8 w-8 rounded-xl bg-destructive/15 text-destructive text-xs hover:bg-destructive/30 font-bold ml-1 flex items-center justify-center transition-colors cursor-pointer border border-destructive/30"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Banner de Superserie Conectada */}
                    {isSuperset && (
                      <div className="rounded-lg bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                        <span>🔗</span>
                        <span>Bloque de Superserie A{ej.grupo_superserie || 1} • Ejecutar consecutivamente sin descanso previo</span>
                      </div>
                    )}

                    {/* Parámetros de Entrenamiento con tipografía tabular */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          Series:
                        </label>
                        <DraftNumberInput
                          min="0"
                          max={MAX_SERIES_PER_EXERCISE}
                          value={ej.series}
                          parse={(raw) => {
                            const num = parseInt(raw, 10);
                            return isNaN(num) || num <= 0 ? 0 : clampSeries(num);
                          }}
                          onValue={(n) => handleUpdateExercise(ej.id, "series", n)}
                          data-testid="exercise-series-input"
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span
                          className={`text-[9px] block text-center mt-0.5 font-medium ${
                            ej.series >= MAX_SERIES_PER_EXERCISE
                              ? "text-amber-500 dark:text-amber-400"
                              : "text-muted-foreground"
                          }`}
                          aria-live="polite"
                        >
                          {ej.series >= MAX_SERIES_PER_EXERCISE
                            ? "Límite máximo: 10 series"
                            : "Máximo: 10 series"}
                        </span>
                      </div>

                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          Repeticiones:
                        </label>
                        <input
                          type="text"
                          value={ej.repeticiones}
                          onChange={(e) =>
                            handleUpdateExercise(ej.id, "repeticiones", e.target.value)
                          }
                          data-testid="exercise-reps-input"
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          Descanso (s):
                        </label>
                        <DraftNumberInput
                          step="15"
                          min="0"
                          value={ej.descanso_segundos}
                          parse={(raw) => {
                            const val = parseInt(raw, 10);
                            return isNaN(val) ? 0 : val;
                          }}
                          onValue={(n) => handleUpdateExercise(ej.id, "descanso_segundos", n)}
                          data-testid="exercise-rest-input"
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          RPE Objetivo:
                        </label>
                        <DraftNumberInput
                          step="0.5"
                          min="0"
                          max="10"
                          value={ej.rpe_objetivo}
                          parse={(raw) => {
                            const val = parseFloat(raw);
                            return isNaN(val) ? 0 : val;
                          }}
                          onValue={(n) => handleUpdateExercise(ej.id, "rpe_objetivo", n)}
                          data-testid="exercise-rpe-input"
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Tempo:
                          </label>
                          <label className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={ej.tempo_activo}
                              onChange={(e) =>
                                handleUpdateExercise(ej.id, "tempo_activo", e.target.checked)
                              }
                              className="rounded accent-primary h-3 w-3"
                              data-testid={`tempo-active-checkbox-${ej.id}`}
                              aria-label={`Activar tempo para ${ej.nombre}`}
                            />
                            <span>On</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          placeholder="0"
                          value={ej.tempo}
                          disabled={!ej.tempo_activo}
                          onChange={(e) =>
                            handleUpdateExercise(ej.id, "tempo", e.target.value)
                          }
                          data-testid={`tempo-input-${ej.id}`}
                          className={`w-full min-h-[38px] rounded-xl border border-input px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                            !ej.tempo_activo
                              ? "opacity-40 bg-muted cursor-not-allowed"
                              : "bg-background"
                          }`}
                        />
                      </div>

                      <div className="flex flex-col justify-end">
                        <button
                          type="button"
                          onClick={() => handleToggleSuperset(ej.id)}
                          className={`w-full min-h-[38px] text-xs font-bold rounded-xl border transition-all active:scale-95 cursor-pointer ${
                            isSuperset
                              ? "bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shadow-sm"
                              : "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80"
                          }`}
                        >
                          {openCircuit !== null && openCircuit === ej.grupo_superserie
                            ? "Cerrar circuito"
                            : isSuperset
                            ? "✓ Superserie A"
                            : "+ Superserie"}
                        </button>
                        {openCircuit === null && (() => {
                          const otros = [...new Set(currentDay.ejercicios.map((e) => e.grupo_superserie).filter((g): g is number => g !== null && g !== ej.grupo_superserie))];
                          return otros.length > 0 ? (
                            <select
                              aria-label="Mover a otra superserie"
                              value=""
                              onChange={(ev) => handleMoveToGroup(ej.id, ev.target.value)}
                              className="mt-1 w-full min-h-[34px] text-xs rounded-xl border border-border bg-secondary text-secondary-foreground"
                            >
                              <option value="">Mover a…</option>
                              {otros.map((g) => (
                                <option key={g} value={g}>{`Superserie A${g}`}</option>
                              ))}
                            </select>
                          ) : null;
                        })()}
                        <div className="flex gap-1 mt-1">
                          {(["WARMUP", "DROPSET"] as const).map((tipo) => (
                            <button
                              key={tipo}
                              type="button"
                              aria-pressed={ej.tipo_serie === tipo}
                              onClick={() => handleToggleTipoSerie(ej.id, tipo)}
                              className={`flex-1 min-h-[30px] text-[10px] font-bold rounded-lg border cursor-pointer ${
                                ej.tipo_serie === tipo
                                  ? tipo === "DROPSET"
                                    ? "bg-rose-600 text-white border-rose-500"
                                    : "bg-amber-600 text-white border-amber-500"
                                  : "bg-secondary text-secondary-foreground border-border"
                              }`}
                            >
                              {tipo === "DROPSET" ? "Dropset" : "Warmup"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Fila inferior: Notas del coach, switch de Tempo y switch de RPE obligatorio */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 border-t border-border/40 text-xs">
                      <div className="flex-1 w-full">
                        <input
                          type="text"
                          placeholder="Notas técnicas del coach para el atleta..."
                          value={ej.notas}
                          onChange={(e) =>
                            handleUpdateExercise(ej.id, "notas", e.target.value)
                          }
                          className="w-full rounded border border-input bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={ej.tempo_activo}
                            onChange={(e) =>
                              handleUpdateExercise(
                                ej.id,
                                "tempo_activo",
                                e.target.checked
                              )
                            }
                            data-testid={`tempo-toggle-${ej.id}`}
                            className="rounded accent-primary h-3.5 w-3.5"
                          />
                          <span>Activar Tempo</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={ej.force_rpe_required}
                            onChange={(e) =>
                              handleUpdateExercise(
                                ej.id,
                                "force_rpe_required",
                                e.target.checked
                              )
                            }
                            data-testid={`force-rpe-checkbox-${ej.id}`}
                            className="rounded accent-primary h-3.5 w-3.5"
                          />
                          <span>RPE obligatorio</span>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
            </>
          )}
        </div>

        {/* Modal de selección de ejercicios del catálogo */}
        {showCatalogModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h3 className="text-sm font-bold text-foreground">
                  Catálogo Maestro de Ejercicios ({catalogoEjercicios.length})
                </h3>
                <button
                  onClick={() => setShowCatalogModal(false)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <input
                type="text"
                placeholder="Buscar ejercicio por nombre o músculo..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />

              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {filteredCatalog.map((ej) => (
                  <div
                    key={ej.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/50 bg-secondary/10 hover:bg-secondary/30 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-xs text-foreground block">
                        {ej.nombre}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {ej.musculos_principales.join(", ")}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="h-7 text-xs font-semibold"
                      onClick={() => handleAddExerciseToCurrentDay(ej)}
                    >
                      + Agregar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pie de modal con botón de guardado a Supabase */}
        <div className="p-4 border-t border-border/60 bg-secondary/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          {errorMessage && (
            <p className="text-xs text-destructive font-medium">{errorMessage}</p>
          )}
          {saveSuccess && (
            <p className="text-xs text-emerald-400 font-bold">
              ✓ ¡Rutina guardada y sincronizada en Supabase con éxito!
            </p>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" onClick={handleClose} disabled={isSaving}>
              Cancelar
            </Button>
            {alumnoId && !planInicial && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={asignarAlumno}
                  onChange={(e) => setAsignarAlumno(e.target.checked)}
                  disabled={isSaving}
                />
                Nueva para {alumnoNombre}
              </label>
            )}
            <Button
              variant="outline"
              onClick={() => handleSaveToSupabase("nueva")}
              disabled={isSaving || saveSuccess}
              data-testid="save-routine-as-new-btn"
            >
              Guardar como rutina nueva
            </Button>
            {needsNewVersion && (
              <Button
                variant="outline"
                onClick={() => handleSaveToSupabase("version")}
                disabled={isSaving || saveSuccess}
                data-testid="save-routine-new-version-btn"
              >
                Guardar como nueva versión
              </Button>
            )}
            <Button
              className="bg-primary text-primary-foreground font-bold shadow-md hover:opacity-90"
              onClick={() => handleSaveToSupabase()}
              disabled={isSaving || saveSuccess}
              data-testid="save-routine-to-supabase-btn"
            >
              {isSaving || saveSuccess ? "Guardando…" : "✓ Guardar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
