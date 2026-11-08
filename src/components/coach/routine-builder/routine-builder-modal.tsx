"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { nombreUnico } from "@/lib/rutinas-biblioteca";
import { validarRutina, claveRutina, claveDia, claveEjercicio } from "@/lib/validar-rutina";
import { asignarGrupo, moverEjercicio, normalizarSuperseries } from "@/lib/superseries";
import { parsePyramidSeriesCount } from "@/lib/routine-helpers";
import type { Ejercicio, DiaRutina, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

export const TAGS_RUTINA_PREDEFINIDAS = [
  "Fuerza",
  "Hipertrofia",
  "Rehabilitación",
  "Potencia",
  "Peso Corporal",
] as const;

export type TagRutina = typeof TAGS_RUTINA_PREDEFINIDAS[number];

interface BuilderExercise {
  id: string;
  ejercicio_id: string;
  nombre: string;
  series: number | null;
  repeticiones: string;
  descanso_segundos: number | null;
  rpe_objetivo: number | null;
  tempo: string;
  tempo_activo: boolean;
  force_rpe_required: boolean;
  notas: string;
  es_superserie: boolean;
  grupo_superserie: number | null;
  tipo_serie: "NORMAL" | "WARMUP" | "DROPSET";
  url_video?: string | null;
  tipo_medicion?: "REPS" | "TIEMPO";
  tiempo_objetivo_segundos?: number | null;
  es_unilateral?: boolean;
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
  /** Nombres ya usados: "Guardar como rutina nueva" los evita con sufijo "(copia N)". */
  nombresExistentes?: string[];
  diasIniciales?: DiaRutina[];
  ejerciciosEnRutinaIniciales?: EjercicioEnRutina[];
  catalogoEjercicios: Ejercicio[];
  onRoutineSaved?: (newPlan: PlanEntrenamiento) => void;
  /** Plan archivado con versión sucesora: se consulta, no se guarda. */
  soloLectura?: boolean;
  /** Modo incrustado a pantalla completa sin backdrop fijo (GOZS-345) */
  embedded?: boolean;
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
  version?: string;
  comoNueva: boolean;
  nombre: string;
  comentarios: string;
  alumnoId?: string;
  estado?: "BORRADOR" | "ACTIVO";
  tags?: string[];
  days: BuilderDay[];
}) {
  return {
    ...(input.planId ? { plan_id: input.planId } : {}),
    ...(input.planId && input.version ? { version: input.version } : {}),
    ...(input.comoNueva ? { como_nueva: true } : {}),
    nombre: input.nombre,
    comentarios: input.comentarios,
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.alumnoId ? { alumno_id: input.alumnoId } : {}),
    ...(input.estado ? { estado: input.estado } : {}),
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
        tipo_medicion: e.tipo_medicion ?? "REPS",
        tiempo_objetivo_segundos: e.tiempo_objetivo_segundos ?? null,
        es_unilateral: Boolean(e.es_unilateral),
      })),
    })),
  };
}

// GZ010/GZ011 (conflicto de versión) = error de negocio con mensaje ya humano; cualquier otro se oculta tras el genérico
export function clasificarErrorGuardado(err: any, modo: SaveMode) {
  const esNegocio = err?.code === "GZ010" || err?.code === "GZ011";
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
          rpe_objetivo: er.rpe_objetivo ?? null,
          tempo: er.tempo ?? "2-0-1-0",
          tempo_activo: Boolean((er as any).tempo_activo),
          force_rpe_required: Boolean((er as any).force_rpe_required),
          notas: er.notas ?? "",
          es_superserie: Boolean(er.es_superserie),
          grupo_superserie: grupoNum,
          tipo_serie: er.tipo_serie ?? "NORMAL",
          url_video: ej?.url_video ?? null,
          tipo_medicion: (er as any).tipo_medicion ?? "REPS",
          tiempo_objetivo_segundos:
            typeof (er as any).tiempo_objetivo_segundos === "number"
              ? (er as any).tiempo_objetivo_segundos
              : null,
          es_unilateral: Boolean((er as any).es_unilateral),
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

// Input numérico que muestra exactamente lo tipeado (no corrige: la validación lo marca)
// y reporta null cuando está vacío.
function DraftNumberInput({
  value,
  onValue,
  ...props
}: {
  value: number | null;
  onValue: (n: number | null) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = React.useState(value === null ? "" : String(value));
  // Chromium a veces entrega "" sin badInput al reemplazar el contenido por letras: se recuerda la tecla
  const letraRef = React.useRef(false);
  React.useEffect(() => {
    if (value !== null && Number.isNaN(value)) return; // texto no numérico tipeado: se queda como está
    setDraft((d) => ((d === "" ? null : Number(d)) === value ? d : value === null ? "" : String(value)));
  }, [value]);
  return (
    <input
      {...props}
      type="number"
      value={draft}
      onKeyDown={(e) => {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) letraRef.current = !/[\d.,+-]/.test(e.key);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // "abc" en un input numérico llega como "" (con o sin badInput): es inválido, no vacío
        onValue(raw === "" ? (e.target.validity.badInput || letraRef.current ? NaN : null) : Number(raw));
        if (raw !== "") letraRef.current = false;
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
  nombresExistentes,
  soloLectura = false,
  diasIniciales,
  ejerciciosEnRutinaIniciales,
  catalogoEjercicios,
  onRoutineSaved,
  embedded = false,
}: RoutineBuilderModalProps) {
  const [planName, setPlanName] = React.useState(() => planInicial?.nombre ?? "");
  const [comentarios, setComentarios] = React.useState(() => planInicial?.comentarios ?? "");
  const [selectedTags, setSelectedTags] = React.useState<string[]>(() => (planInicial as any)?.tags ?? []);
  const [days, setDays] = React.useState<BuilderDay[]>(() => {
    if (planInicial) {
      return mapPlanToBuilderDays(
        planInicial.id,
        diasIniciales ?? [],
        ejerciciosEnRutinaIniciales ?? [],
        catalogoEjercicios
      );
    }
    return DEFAULT_BUILDER_DAYS;
  });
  const baselineRef = React.useRef("");
  // Hasta que el efecto de abajo fija la línea base, el estado puede ser el de la apertura anterior
  const [baselineLista, setBaselineLista] = React.useState(false);

  // Candado síncrono (el estado llega tarde al 2º/3er clic) que se mantiene hasta cerrar el modal
  const lockRef = React.useRef(false);
  // Guardado pendiente por falta de red: se reintenta una sola vez al volver `online`
  const pendienteRef = React.useRef<SaveMode | null>(null);
  const guardarRef = React.useRef<(modo: SaveMode) => Promise<void>>(async () => {});
  const [estado, setEstado] = React.useState<"BORRADOR" | "ACTIVO">("BORRADOR");
  // El selector de estado solo aplica a plantillas (sin alumno): en planes de alumno la RPC lo ignora
  const esPlantilla = planInicial ? !planInicial.alumno_id : !alumnoId;

  // updated_at que leyó este cliente; se refresca tras cada guardado (GOZS-318)
  const versionRef = React.useRef<string | undefined>(planInicial?.updated_at);

  React.useEffect(() => {
    if (!isOpen) {
      setBaselineLista(false);
      lockRef.current = false;
      pendienteRef.current = null;
      return;
    }
    if (lockRef.current) return; // guardando o ya guardado: no pisar lo que hay en pantalla
    versionRef.current = planInicial?.updated_at;
    setNeedsNewVersion(false);
    setAsignarAlumno(false);
    setErrorMessage(null);
    setTocados(new Set());
    setVerErrores(false);
    if (planInicial) {
      setPlanName(planInicial.nombre);
      setComentarios(planInicial.comentarios ?? "");
      setEstado(planInicial.estado === "ACTIVO" ? "ACTIVO" : "BORRADOR");
      const initTags = Array.isArray((planInicial as any).tags) ? (planInicial as any).tags : [];
      setSelectedTags(initTags);
      const mapped = mapPlanToBuilderDays(
        planInicial.id,
        diasIniciales ?? [],
        ejerciciosEnRutinaIniciales ?? [],
        catalogoEjercicios,
      );
      setDays(mapped);
      baselineRef.current = JSON.stringify([planInicial.nombre, planInicial.comentarios ?? "", initTags, mapped]);
    } else {
      setPlanName("");
      setComentarios("");
      setSelectedTags([]);
      setEstado("BORRADOR");
      setDays(DEFAULT_BUILDER_DAYS);
      baselineRef.current = JSON.stringify([
        "",
        "",
        [],
        DEFAULT_BUILDER_DAYS,
      ]);
    }
    setBaselineLista(true);
  }, [isOpen, planInicial, diasIniciales, ejerciciosEnRutinaIniciales, catalogoEjercicios]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

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
  // Errores visibles: por campo al salir de él (blur) y todos tras intentar guardar
  const [tocados, setTocados] = React.useState<Set<string>>(new Set());
  const [verErrores, setVerErrores] = React.useState(false);
  const { errores, avisos } = validarRutina({ nombre: planName, days });
  const errorDe = (clave: string) => (verErrores || tocados.has(clave) ? errores[clave] : undefined);
  const tocar = (clave: string) => setTocados((prev) => (prev.has(clave) ? prev : new Set(prev).add(clave)));
  const propsCampo = (clave: string) => ({
    required: true,
    "aria-invalid": errorDe(clave) ? true : undefined,
    "aria-describedby": errorDe(clave) ? `${clave}.error` : undefined,
    onBlur: () => tocar(clave),
  });
  const claseCampo = (clave: string) => (errorDe(clave) ? "border-destructive ring-1 ring-destructive" : "border-input");
  const mensajeCampo = (clave: string) =>
    errorDe(clave) ? (
      <span id={`${clave}.error`} role="alert" className="block text-[10px] font-medium text-destructive mt-0.5">
        {errorDe(clave)}
      </span>
    ) : null;

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

  const isDirty =
    isOpen &&
    baselineLista &&
    !saveSuccess &&
    JSON.stringify([planName, comentarios, selectedTags, days]) !== baselineRef.current;

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  // Con cambios sin guardar: aviso nativo al recargar/cerrar la pestaña y, al volver atrás, la misma
  // confirmación que "Cancelar". El modal no vive en la URL, así que se empuja una entrada centinela
  // (conservando el state de Next) para poder interceptar el "atrás" sin salir de la página.
  React.useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const empujarCentinela = () =>
      window.history.pushState({ ...window.history.state, constructorSinGuardar: true }, "");
    let centinela = true;
    empujarCentinela();
    const onPopState = () => {
      centinela = false;
      if (window.confirm("Tenés cambios sin guardar. ¿Descartarlos y salir?")) {
        onCloseRef.current();
        window.history.back(); // el "atrás" que el coach pidió: la centinela ya se consumió
      } else {
        empujarCentinela();
        centinela = true;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      if (centinela) window.history.back(); // se cerró por otra vía (guardar/cancelar): no dejar la entrada
    };
  }, [isDirty]);

  if (!isOpen) return null;

  const currentDay = days[selectedDayIdx] || days[0];
  const diaId = currentDay?.id ?? "";

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
    const dirty = JSON.stringify([planName, comentarios, selectedTags, days]) !== baselineRef.current;
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

  const handleMoveDay = (index: number, direction: "UP" | "DOWN") => {
    const targetIdx = direction === "UP" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= days.length) return;
    const list = [...days];
    const [moved] = list.splice(index, 1);
    if (!moved) return;
    list.splice(targetIdx, 0, moved);
    setDays(list.map((d, i) => ({ ...d, orden: i + 1 })));
    setSelectedDayIdx(targetIdx);
  };

  const handleRemoveDay = (index: number = selectedDayIdx) => {
    const dia = days[index];
    if (!dia || days.length <= 1) return;
    if (
      dia.ejercicios.length > 0 &&
      !window.confirm(
        `¿Borrar "${dia.nombre}" y sus ${dia.ejercicios.length} ejercicio(s)? Esta acción no se puede deshacer.`
      )
    )
      return;
    setOpenCircuit(null);
    setDays(days.filter((_, i) => i !== index).map((d, i) => ({ ...d, orden: i + 1 })));
    setSelectedDayIdx(Math.min(selectedDayIdx > index ? selectedDayIdx - 1 : selectedDayIdx, days.length - 2));
  };

  const handleAddExerciseToCurrentDay = (ej: Ejercicio) => {
    if (!currentDay) return;
    const newExercise: BuilderExercise = {
      id: `be-${Date.now()}`,
      ejercicio_id: ej.id,
      nombre: ej.nombre,
      series: openCircuit !== null ? 0 : null,
      repeticiones: "",
      descanso_segundos: 90,
      rpe_objetivo: null,
      tempo: "0",
      tempo_activo: false,
      force_rpe_required: false,
      notas: "",
      es_superserie: openCircuit !== null,
      grupo_superserie: openCircuit,
      tipo_serie: "NORMAL",
      url_video: ej.url_video,
      tipo_medicion: "REPS",
      tiempo_objetivo_segundos: null,
      es_unilateral: false,
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

  const handleUpdateSeries = (exId: string, value: number | null) => {
    setDays((prev) =>
      prev.map((d, idx) => {
        if (idx !== selectedDayIdx) return d;
        const targetEx = d.ejercicios.find((e) => e.id === exId);
        if (!targetEx) return d;

        // Propagación en superseries: si es el primer ejercicio del circuito, propaga a todos los demás del grupo
        if (targetEx.es_superserie && targetEx.grupo_superserie !== null) {
          const circuito = d.ejercicios.filter(
            (e) => e.es_superserie && e.grupo_superserie === targetEx.grupo_superserie
          );
          const esPrimero = circuito.length > 0 && circuito[0]!.id === exId;
          if (esPrimero) {
            return {
              ...d,
              ejercicios: d.ejercicios.map((e) =>
                e.es_superserie && e.grupo_superserie === targetEx.grupo_superserie
                  ? { ...e, series: value }
                  : e
              ),
            };
          }
        }

        return {
          ...d,
          ejercicios: d.ejercicios.map((e) => (e.id === exId ? { ...e, series: value } : e)),
        };
      })
    );
  };

  const handleUpdateReps = (exId: string, value: string) => {
    const pyramidCount = parsePyramidSeriesCount(value);

    setDays((prev) =>
      prev.map((d, idx) => {
        if (idx !== selectedDayIdx) return d;
        const targetEx = d.ejercicios.find((e) => e.id === exId);
        if (!targetEx) return d;

        const nuevoSeries = pyramidCount !== null ? pyramidCount : targetEx.series;

        if (
          pyramidCount !== null &&
          targetEx.es_superserie &&
          targetEx.grupo_superserie !== null
        ) {
          const circuito = d.ejercicios.filter(
            (e) => e.es_superserie && e.grupo_superserie === targetEx.grupo_superserie
          );
          const esPrimero = circuito.length > 0 && circuito[0]!.id === exId;
          if (esPrimero) {
            return {
              ...d,
              ejercicios: d.ejercicios.map((e) => {
                if (e.id === exId) {
                  return { ...e, repeticiones: value, series: nuevoSeries };
                }
                if (e.es_superserie && e.grupo_superserie === targetEx.grupo_superserie) {
                  return { ...e, series: nuevoSeries };
                }
                return e;
              }),
            };
          }
        }

        return {
          ...d,
          ejercicios: d.ejercicios.map((e) =>
            e.id === exId
              ? {
                  ...e,
                  repeticiones: value,
                  ...(pyramidCount !== null ? { series: pyramidCount } : {}),
                }
              : e
          ),
        };
      })
    );
  };

  const handleUpdateMedicion = (exId: string, tipo: "REPS" | "TIEMPO") => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === selectedDayIdx
          ? {
              ...d,
              ejercicios: d.ejercicios.map((e) => {
                if (e.id !== exId) return e;
                if (tipo === "TIEMPO") {
                  const seg = e.tiempo_objetivo_segundos ?? 30;
                  return {
                    ...e,
                    tipo_medicion: "TIEMPO",
                    tiempo_objetivo_segundos: seg,
                    repeticiones: String(seg),
                  };
                } else {
                  return {
                    ...e,
                    tipo_medicion: "REPS",
                    tiempo_objetivo_segundos: null,
                    repeticiones:
                      e.repeticiones && !isNaN(Number(e.repeticiones))
                        ? e.repeticiones
                        : "10",
                  };
                }
              }),
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
            ? {
                ...d,
                ejercicios: d.ejercicios.map((e) =>
                  e.id === exId
                    ? {
                        ...e,
                        es_superserie: true,
                        grupo_superserie: group,
                        series: e.series ?? 0,
                      }
                    : e
                ),
              }
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
    const nuevoTipo = ex?.tipo_serie === tipo ? "NORMAL" : tipo;
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === selectedDayIdx
          ? {
              ...d,
              ejercicios: d.ejercicios.map((e) => {
                if (e.id !== exId) return e;
                if (nuevoTipo === "DROPSET") {
                  return {
                    ...e,
                    tipo_serie: "DROPSET",
                    repeticiones: "AL FALLO",
                    descanso_segundos: 0,
                  };
                }
                if (e.tipo_serie === "DROPSET" && nuevoTipo === "NORMAL") {
                  return {
                    ...e,
                    tipo_serie: "NORMAL",
                    repeticiones: e.repeticiones === "AL FALLO" ? "10" : e.repeticiones,
                    descanso_segundos: e.descanso_segundos === 0 ? 90 : e.descanso_segundos,
                  };
                }
                return { ...e, tipo_serie: nuevoTipo };
              }),
            }
          : d
      )
    );
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
      version: versionRef.current,
      comoNueva: modo !== "guardar",
      nombre: modo === "nueva" && nombresExistentes ? nombreUnico(planName, nombresExistentes) : planName,
      comentarios,
      tags: selectedTags,
      alumnoId: modo === "nueva" && !asignarAlumno ? undefined : alumnoId,
      // guardar_rutina solo aplica payload.estado a plantillas; INACTIVO se conserva y una versión nueva no cambia el estado
      estado: modo === "version" || !esPlantilla || planInicial?.estado === "INACTIVO" ? undefined : estado,
      days: normalizarSuperseries(days, null, true),
    });

    try {
      // Un campo inválido se rechaza acá, sin llamar a la RPC, y deja su fila en errores_app (catch)
      const claves = Object.keys(errores);
      if (claves.length > 0) {
        setVerErrores(true);
        // Llevar al coach al primer día con un error
        const diaIdx = days.findIndex((d) => errores[claveDia(d.id)] || d.ejercicios.some((e) => claves.some((c) => c.startsWith(`ej.${e.id}.`))));
        if (diaIdx >= 0 && diaIdx !== selectedDayIdx) irADia(diaIdx);
        throw { code: "GZ010", message: `Revisá los campos marcados en rojo (${claves.length}).`, details: claves.join(", ") };
      }
      const { data: planId, error } = await supabase.rpc("guardar_rutina", { p_payload: payload });
      if (error) throw error;

      const { data: planData, error: planErr } = await supabase
        .from("planes_entrenamiento")
        .select("*")
        .eq("id", planId)
        .single();
      if (planErr) throw planErr;

      if (planData?.updated_at) versionRef.current = planData.updated_at;
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
      className={
        embedded
          ? "w-full flex flex-col rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
          : "fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 sm:p-6 backdrop-blur-sm animate-in fade-in"
      }
      data-testid="routine-builder-modal"
    >
      <div
        className={
          embedded
            ? "w-full flex flex-col"
            : "w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        }
      >
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
          <div className="flex items-center gap-2">
            {embedded && (
              <button
                type="button"
                onClick={handleClose}
                className="text-xs font-bold text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg border border-border/70 hover:bg-secondary transition-colors"
                data-testid="routine-builder-back-btn"
              >
                ← Volver a Biblioteca
              </button>
            )}
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground text-sm font-bold p-1 rounded-md"
              aria-label="Cerrar constructor"
            >
              ✕
            </button>
          </div>
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
              placeholder="Ej. Bloque de Hipertrofia y Fuerza"
              data-testid="plan-name-input"
              {...propsCampo(claveRutina)}
              className={`w-full rounded-lg border ${claseCampo(claveRutina)} bg-background px-3 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary`}
            />
            {mensajeCampo(claveRutina)}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Comentarios Globales / Recomendaciones:
            </label>
            <input
              type="text"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              placeholder="Ej. Enfocarse en sobrecarga progresiva y control excéntrico"
              className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {/* Selector de Etiquetas del Plan (GOZS-360) */}
          <div className="sm:col-span-2 space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-muted-foreground block">
              Etiquetas del Plan (Multi-select):
            </label>
            <div className="flex items-center gap-1.5 flex-wrap" data-testid="routine-tags-selector">
              {TAGS_RUTINA_PREDEFINIDAS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    aria-pressed={isSelected}
                    data-testid={`tag-${tag.toLowerCase().replace(/\s+/g, "-")}`}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer select-none ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {isSelected ? `✓ ${tag}` : `+ ${tag}`}
                  </button>
                );
              })}
            </div>
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
                {d.nombre.trim() || "Sin nombre"} ({d.ejercicios.length})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 pb-1 pl-2 shrink-0">
            <button
              type="button"
              disabled={selectedDayIdx === 0}
              onClick={() => handleMoveDay(selectedDayIdx, "UP")}
              aria-label="Mover día a la izquierda"
              data-testid="move-day-up"
              className="h-8 w-8 rounded-xl bg-secondary text-xs disabled:opacity-30 hover:bg-secondary/80 flex items-center justify-center border border-border/40 font-bold"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={selectedDayIdx >= days.length - 1}
              onClick={() => handleMoveDay(selectedDayIdx, "DOWN")}
              aria-label="Mover día a la derecha"
              data-testid="move-day-down"
              className="h-8 w-8 rounded-xl bg-secondary text-xs disabled:opacity-30 hover:bg-secondary/80 flex items-center justify-center border border-border/40 font-bold"
            >
              ▼
            </button>
            <button
              type="button"
              disabled={days.length <= 1}
              title={days.length <= 1 ? "Una rutina necesita al menos un día" : undefined}
              onClick={() => handleRemoveDay(selectedDayIdx)}
              aria-label="Borrar día"
              data-testid="remove-day"
              className="h-8 w-8 rounded-xl bg-destructive/15 text-destructive text-xs disabled:opacity-30 hover:bg-destructive/30 flex items-center justify-center border border-destructive/30 font-bold"
            >
              ✕
            </button>
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
                    {...propsCampo(claveDia(diaId))}
                    className={`text-sm font-bold text-foreground bg-transparent border-b ${claseCampo(claveDia(diaId))} hover:border-foreground/50 focus:border-primary focus:outline-none px-1 py-0.5 w-full transition-colors`}
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
                  <p className="mt-2 font-medium text-amber-500 dark:text-amber-400" data-testid="dia-vacio-aviso">
                    {avisos[claveDia(diaId)]}.{" "}
                    <button type="button" onClick={() => handleRemoveDay()} className="underline min-h-11 px-2" data-testid="quitar-dia-btn">
                      Quitar este día
                    </button>
                  </p>
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
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateExercise(
                              ej.id,
                              "es_unilateral",
                              !ej.es_unilateral
                            )
                          }
                          className={`text-[10px] font-bold rounded-lg px-2 py-0.5 border transition-colors cursor-pointer select-none ${
                            ej.es_unilateral
                              ? "bg-indigo-600 text-white border-indigo-500 shadow-xs"
                              : "bg-secondary text-muted-foreground border-border/60 hover:text-foreground"
                          }`}
                          data-testid={`unilateral-toggle-${ej.id}`}
                          aria-pressed={ej.es_unilateral}
                          title="Indicar si el ejercicio se realiza de forma unilateral (ambos lados se registrarán unificados en la app)"
                        >
                          {ej.es_unilateral ? "⚡ Unilateral" : "Bilateral"}
                        </button>
                      </div>

                      {/* Botones de ordenamiento y borrado con mayor ergonomía táctil */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveExercise(index, "UP")}
                          aria-label={`Subir orden de ${ej.nombre}`}
                          className="h-11 w-11 rounded-xl bg-secondary text-xs disabled:opacity-30 hover:bg-secondary/80 flex items-center justify-center transition-colors cursor-pointer border border-border/40 font-bold"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === currentDay.ejercicios.length - 1}
                          onClick={() => handleMoveExercise(index, "DOWN")}
                          aria-label={`Bajar orden de ${ej.nombre}`}
                          className="h-11 w-11 rounded-xl bg-secondary text-xs disabled:opacity-30 hover:bg-secondary/80 flex items-center justify-center transition-colors cursor-pointer border border-border/40 font-bold"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(ej.id)}
                          aria-label={`Eliminar ${ej.nombre}`}
                          className="h-11 w-11 rounded-xl bg-destructive/15 text-destructive text-xs hover:bg-destructive/30 font-bold ml-1 flex items-center justify-center transition-colors cursor-pointer border border-destructive/30"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Banner de Superserie Conectada */}
                    {isSuperset && (
                      <div className="space-y-1">
                        <div className="rounded-lg bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                          <span>🔗</span>
                          <span>Bloque de Superserie A{ej.grupo_superserie || 1} • Ejecutar consecutivamente sin descanso previo</span>
                        </div>
                        <div
                          className="rounded-lg bg-secondary/60 border border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground flex items-center gap-1.5"
                          data-testid="superserie-hint"
                        >
                          <span>💡</span>
                          <span>
                            <strong>Recomendación:</strong> Agregá todos los ejercicios a la superserie antes de fijar las series; al definir el valor en el primero se propagará automáticamente a todo el circuito.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Parámetros de Entrenamiento con tipografía tabular */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          Series:
                        </label>
                        <DraftNumberInput
                          min="1"
                          max="20"
                          step="1"
                          value={ej.series}
                          onValue={(n) => handleUpdateSeries(ej.id, n)}
                          data-testid="exercise-series-input"
                          {...propsCampo(claveEjercicio(ej.id, "series"))}
                          className={`w-full min-h-[38px] rounded-xl border ${claseCampo(claveEjercicio(ej.id, "series"))} bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary`}
                        />
                        {mensajeCampo(claveEjercicio(ej.id, "series"))}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            {ej.tipo_medicion === "TIEMPO" ? "Tiempo (s):" : "Reps:"}
                          </label>
                          <div className="flex items-center rounded-md bg-secondary p-0.5 text-[9px] font-bold">
                            <button
                              type="button"
                              onClick={() => handleUpdateMedicion(ej.id, "REPS")}
                              className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer select-none ${
                                (ej.tipo_medicion ?? "REPS") === "REPS"
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`medicion-reps-${ej.id}`}
                            >
                              Reps
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateMedicion(ej.id, "TIEMPO")}
                              className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer select-none ${
                                ej.tipo_medicion === "TIEMPO"
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`medicion-tiempo-${ej.id}`}
                            >
                              Tiempo
                            </button>
                          </div>
                        </div>

                        {ej.tipo_medicion === "TIEMPO" ? (
                          <DraftNumberInput
                            min="1"
                            max="900"
                            step="1"
                            value={ej.tiempo_objetivo_segundos ?? null}
                            onValue={(n) => {
                              handleUpdateExercise(ej.id, "tiempo_objetivo_segundos", n);
                              handleUpdateExercise(ej.id, "repeticiones", n !== null ? String(n) : "");
                            }}
                            data-testid="exercise-time-input"
                            placeholder="30"
                            {...propsCampo(claveEjercicio(ej.id, "reps"))}
                            className={`w-full min-h-[38px] rounded-xl border ${claseCampo(claveEjercicio(ej.id, "reps"))} bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary`}
                          />
                        ) : (
                          <input
                            type="text"
                            value={ej.repeticiones}
                            readOnly={ej.tipo_serie === "DROPSET"}
                            onChange={(e) =>
                              handleUpdateReps(ej.id, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === " " && ej.tipo_serie !== "DROPSET") {
                                e.preventDefault();
                              }
                            }}
                            placeholder="10 · 10-8-6 · 8/12"
                            maxLength={20}
                            pattern="^\d{1,3}(-\d{1,3})*$|^\d{1,2}x\d{1,3}$|^\d{1,3}\/\d{1,3}$|^AL FALLO$|^al fallo$"
                            data-testid="exercise-reps-input"
                            {...propsCampo(claveEjercicio(ej.id, "reps"))}
                            className={`w-full min-h-[38px] rounded-xl border ${claseCampo(claveEjercicio(ej.id, "reps"))} ${
                              ej.tipo_serie === "DROPSET"
                                ? "bg-muted font-bold text-rose-500 cursor-not-allowed"
                                : "bg-background"
                            } px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary`}
                          />
                        )}
                        {mensajeCampo(claveEjercicio(ej.id, "reps"))}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Descanso (s):
                          </label>
                          {ej.tipo_serie === "DROPSET" && (
                            <span className="text-[9px] font-bold text-rose-500">0s (bloqueado)</span>
                          )}
                        </div>
                        <DraftNumberInput
                          step="1"
                          min="0"
                          max="900"
                          disabled={ej.tipo_serie === "DROPSET"}
                          value={ej.tipo_serie === "DROPSET" ? 0 : ej.descanso_segundos}
                          onValue={(n) => handleUpdateExercise(ej.id, "descanso_segundos", n)}
                          data-testid="exercise-rest-input"
                          {...propsCampo(claveEjercicio(ej.id, "descanso"))}
                          className={`w-full min-h-[38px] rounded-xl border ${claseCampo(claveEjercicio(ej.id, "descanso"))} ${
                            ej.tipo_serie === "DROPSET"
                              ? "opacity-60 bg-muted cursor-not-allowed text-muted-foreground"
                              : "bg-background"
                          } px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary`}
                        />
                        {mensajeCampo(claveEjercicio(ej.id, "descanso"))}
                      </div>

                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          RPE Objetivo:
                        </label>
                        <DraftNumberInput
                          step="0.5"
                          min="1"
                          max="10"
                          value={ej.rpe_objetivo}
                          onValue={(n) => handleUpdateExercise(ej.id, "rpe_objetivo", n)}
                          data-testid="exercise-rpe-input"
                          {...propsCampo(claveEjercicio(ej.id, "rpe"))}
                          required={false}
                          className={`w-full min-h-[38px] rounded-xl border ${claseCampo(claveEjercicio(ej.id, "rpe"))} bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary`}
                        />
                        {mensajeCampo(claveEjercicio(ej.id, "rpe"))}
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

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCatalogModal(true)}
                className="w-full min-h-11 py-2.5 rounded-lg border-dashed border-border hover:border-primary/50 hover:bg-muted/60 text-foreground font-semibold text-sm transition-colors"
                data-testid="add-another-exercise-btn"
              >
                + Añadir otro ejercicio
              </Button>
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
            {!soloLectura && (
              <>
            {esPlantilla && (<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Estado
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as "BORRADOR" | "ACTIVO")}
                disabled={isSaving || planInicial?.estado === "INACTIVO"}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                data-testid="routine-estado-select"
              >
                <option value="BORRADOR">Borrador</option>
                <option value="ACTIVO">Activo</option>
              </select>
            </label>)}
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
