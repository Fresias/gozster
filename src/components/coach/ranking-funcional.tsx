"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { claveDia, horaLocal } from "@/lib/clases";
import { cn } from "@/lib/utils";
import { useClasesStore } from "@/store/use-clases-store";
import {
  ResultadoRanking,
  useRankingStore,
} from "@/store/use-ranking-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { Ejercicio, Perfil } from "@/types/database.types";
import { DEMO_ALUMNOS, DEMO_ALUMNOS_CLASES, generarDemoReservasIniciales } from "@/services/coach-demo-dataset";
import { REAL_EJERCICIOS } from "@/services/real-mynter-data";

/**
 * Chip semántico neutro de categoría (Masculino / Femenino).
 * Garantiza contraste de color >= 4.5:1 (WCAG AA) en modo claro y oscuro,
 * sin recurrir a tonalidades pastel inaccesibles.
 */
export function CategoryChip({
  categoria,
  className,
}: {
  categoria: "Masculino" | "Femenino" | "M" | "F";
  className?: string;
}) {
  const isMale = categoria === "Masculino" || categoria === "M";
  const label = isMale ? "Masculino" : "Femenino";
  return (
    <span
      data-testid={`chip-categoria-${isMale ? "masculino" : "femenino"}`}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold select-none border",
        "bg-zinc-100 text-zinc-900 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700",
        className,
      )}
    >
      {label}
    </span>
  );
}

interface RankingFuncionalProps {
  initialClaseId?: string | null;
  initialEjercicioId?: string | null;
  alumnosDisponibles?: Perfil[];
  ejerciciosDisponibles?: Ejercicio[];
}

type SortCol = "posicion" | "atleta" | "carga" | "peso_corporal" | "ratio";
type SortDir = "asc" | "desc";

const DEMO_PREFILL_DATA: Record<
  string,
  { peso_kg: string; reps: string; peso_corporal_kg: string; sexo: "M" | "F" }
> = {
  "demo-alumno-08-camila": {
    peso_kg: "10",
    reps: "3",
    peso_corporal_kg: "62",
    sexo: "F",
  },
  "demo-alumno-01-lucas": {
    peso_kg: "20",
    reps: "3",
    peso_corporal_kg: "78",
    sexo: "M",
  },
  "demo-alumno-05-mateo": {
    peso_kg: "15",
    reps: "4",
    peso_corporal_kg: "84",
    sexo: "M",
  },
  "demo-alumno-ext-mie-4": {
    peso_kg: "5",
    reps: "5",
    peso_corporal_kg: "58",
    sexo: "F",
  },
  "demo-alumno-ext-mie-5": {
    peso_kg: "12.5",
    reps: "3",
    peso_corporal_kg: "65",
    sexo: "F",
  },
};

export function RankingFuncional({
  initialClaseId,
  initialEjercicioId,
  alumnosDisponibles,
  ejerciciosDisponibles,
}: RankingFuncionalProps) {
  const { isOnline } = useOfflineQueueStore();

  const {
    clases,
    agendaReservas,
    anotarAlumnoCoach,
  } = useClasesStore();

  const {
    claseIdSeleccionada,
    ejercicioIdSeleccionado,
    prs,
    perfilesActualizados,
    guardandoPrId,
    aviso,
    error,
    setClaseId,
    setEjercicioId,
    cargarPrsClase,
    registrarPr,
    guardarFilaRegistro,
    actualizarPerfilAlumno,
    calcularRanking,
    limpiarAviso,
  } = useRankingStore();

  // Alumnos y ejercicios combinados (props o fallback demo/real)
  const todosAlumnos: Perfil[] = React.useMemo(() => {
    const defaultList = [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES];
    if (alumnosDisponibles && alumnosDisponibles.length > 0) {
      const mapa = new Map(defaultList.map((a) => [a.id, a]));
      for (const a of alumnosDisponibles) {
        mapa.set(a.id, a);
      }
      return Array.from(mapa.values());
    }
    return defaultList;
  }, [alumnosDisponibles]);

  const listaEjercicios: Ejercicio[] = React.useMemo(() => {
    if (ejerciciosDisponibles && ejerciciosDisponibles.length > 0) {
      return ejerciciosDisponibles;
    }
    return REAL_EJERCICIOS;
  }, [ejerciciosDisponibles]);

  const listaClases = React.useMemo(() => {
    if (clases && clases.length > 0) {
      return clases;
    }
    return [
      {
        id: "demo-clase-func-miercoles",
        horario_id: "demo-horario-miercoles",
        actividad: "FUNCIONAL" as const,
        inicio: new Date().toISOString(),
        duracion_minutos: 60,
        capacidad: 8,
        estado: "PROGRAMADA" as const,
        motivo_cancelacion: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }, [clases]);

  // Selección de IDs activos (con fallback para SSR y primer render)
  const activeClaseId =
    claseIdSeleccionada ??
    initialClaseId ??
    (listaClases.find((c) => c.actividad === "FUNCIONAL" && c.estado === "PROGRAMADA")?.id ||
      listaClases[0]?.id ||
      null);

  const activeEjercicioId =
    ejercicioIdSeleccionado ??
    initialEjercicioId ??
    (listaEjercicios.find((e) => e.nombre.toLowerCase().includes("dominadas con carga") || e.id === "ej-dominadas-c-carga")?.id ||
      listaEjercicios.find((e) => e.nombre.toLowerCase().includes("dominadas"))?.id ||
      listaEjercicios[0]?.id ||
      null);

  // Sincronizar en store si aún no estaban seteados
  React.useEffect(() => {
    if (activeClaseId && claseIdSeleccionada !== activeClaseId) {
      setClaseId(activeClaseId);
    }
  }, [activeClaseId, claseIdSeleccionada, setClaseId]);

  React.useEffect(() => {
    if (activeEjercicioId && ejercicioIdSeleccionado !== activeEjercicioId) {
      setEjercicioId(activeEjercicioId);
    }
  }, [activeEjercicioId, ejercicioIdSeleccionado, setEjercicioId]);

  // Cargar datos si hay clase seleccionada
  React.useEffect(() => {
    if (activeClaseId) {
      cargarPrsClase(activeClaseId, activeEjercicioId ?? undefined);
    }
  }, [activeClaseId, activeEjercicioId, cargarPrsClase]);

  // Clase activa
  const claseActiva = React.useMemo(() => {
    return listaClases.find((c) => c.id === activeClaseId) ?? listaClases[0] ?? null;
  }, [listaClases, activeClaseId]);

  // Ejercicio activo
  const ejercicioActivo = React.useMemo(() => {
    return (
      listaEjercicios.find((e) => e.id === activeEjercicioId) ??
      listaEjercicios[0] ??
      null
    );
  }, [listaEjercicios, activeEjercicioId]);

  const reservasClase = React.useMemo(() => {
    if (agendaReservas && agendaReservas.length > 0) {
      return agendaReservas;
    }
    return generarDemoReservasIniciales();
  }, [agendaReservas]);

  // Participantes anotados en la clase seleccionada
  const participantes = React.useMemo(() => {
    if (!activeClaseId) return [];
    return reservasClase.filter(
      (r) => r.clase_id === activeClaseId && (r.estado === "ANOTADO" || r.estado === "AUSENTE"),
    );
  }, [reservasClase, activeClaseId]);

  // Alumnos que aún no participan para poder agregarlos
  const alumnosNoParticipantes = React.useMemo(() => {
    const idsEnClase = new Set(participantes.map((p) => p.alumno_id));
    return todosAlumnos.filter((a) => !idsEnClase.has(a.id));
  }, [todosAlumnos, participantes]);

  // Estado local para agregar alumno
  const [alumnoAnotarId, setAlumnoAnotarId] = React.useState<string>("");
  const [agregandoAlumno, setAgregandoAlumno] = React.useState<boolean>(false);

  // Estados locales para inputs de PR por alumno
  const [prInputs, setPrInputs] = React.useState<
    Record<string, { peso_kg: string; reps: string }>
  >({});

  // Estados locales para actualizar peso y sexo de alumno inline
  const [perfilInputs, setPerfilInputs] = React.useState<
    Record<string, { peso_corporal_kg: string; sexo: "M" | "F" }>
  >({});

  // Estado de tracking de fila guardada localmente
  const [filasGuardadasLocal, setFilasGuardadasLocal] = React.useState<Record<string, boolean>>({});

  // Sincronizar inputs de PR y perfil con valores existentes o prefill
  React.useEffect(() => {
    if (!activeClaseId || !activeEjercicioId) return;
    const nuevoMapPr: Record<string, { peso_kg: string; reps: string }> = {};
    const nuevoMapPerfil: Record<string, { peso_corporal_kg: string; sexo: "M" | "F" }> = {};

    for (const part of participantes) {
      const prExistente = prs.find(
        (p) =>
          p.clase_id === activeClaseId &&
          p.alumno_id === part.alumno_id &&
          p.ejercicio_id === activeEjercicioId,
      );

      const prefill = DEMO_PREFILL_DATA[part.alumno_id];
      const alumno = todosAlumnos.find((a) => a.id === part.alumno_id);
      const perfilStore = perfilesActualizados[part.alumno_id];

      // PR input
      if (prExistente) {
        nuevoMapPr[part.alumno_id] = {
          peso_kg: String(prExistente.peso_kg),
          reps: String(prExistente.reps),
        };
      } else if (prefill) {
        nuevoMapPr[part.alumno_id] = {
          peso_kg: prefill.peso_kg,
          reps: prefill.reps,
        };
      }

      // Perfil input
      const pesoCorp =
        perfilStore?.peso_corporal_kg ??
        alumno?.peso_corporal_kg ??
        (prefill ? parseFloat(prefill.peso_corporal_kg) : undefined);
      const sexoVal =
        perfilStore?.sexo ??
        alumno?.sexo ??
        prefill?.sexo ??
        "M";

      nuevoMapPerfil[part.alumno_id] = {
        peso_corporal_kg: pesoCorp ? String(pesoCorp) : "",
        sexo: sexoVal,
      };
    }

    setPrInputs((prev) => ({ ...nuevoMapPr, ...prev }));
    setPerfilInputs((prev) => ({ ...nuevoMapPerfil, ...prev }));
  }, [activeClaseId, activeEjercicioId, participantes, prs, todosAlumnos, perfilesActualizados]);

  // Fila unificada de guardado rápido: persiste peso corporal, carga y reps simultáneamente
  const handleGuardarFila = async (alumnoId: string) => {
    if (!activeClaseId || !activeEjercicioId) return;

    const inputVal = prInputs[alumnoId] ?? { peso_kg: "", reps: "1" };
    const perfilInput = perfilInputs[alumnoId] ?? { peso_corporal_kg: "", sexo: "M" };

    const pesoPr = parseFloat(inputVal.peso_kg);
    const repsPr = parseInt(inputVal.reps, 10) || 1;
    const pesoCorporal = perfilInput.peso_corporal_kg
      ? parseFloat(perfilInput.peso_corporal_kg)
      : undefined;
    const sexo = perfilInput.sexo;

    if (isNaN(pesoPr) || pesoPr < 0) {
      alert("Por favor ingresá una carga válida (mayor o igual a 0 kg).");
      return;
    }

    if (
      pesoCorporal !== undefined &&
      (isNaN(pesoCorporal) || pesoCorporal <= 0 || pesoCorporal > 500)
    ) {
      alert("El peso corporal debe ser un número positivo (ej: 75.5 kg).");
      return;
    }

    const res = await guardarFilaRegistro({
      clase_id: activeClaseId,
      alumno_id: alumnoId,
      ejercicio_id: activeEjercicioId,
      peso_kg: pesoPr,
      reps: repsPr,
      peso_corporal_kg: pesoCorporal,
      sexo,
    });

    if (res.ok) {
      setFilasGuardadasLocal((prev) => ({ ...prev, [alumnoId]: true }));
    }
  };

  // Manejo de agregar participante a la clase
  const handleAgregarParticipante = async () => {
    if (!activeClaseId || !alumnoAnotarId) return;
    setAgregandoAlumno(true);
    await anotarAlumnoCoach(activeClaseId, alumnoAnotarId, true);
    setAlumnoAnotarId("");
    setAgregandoAlumno(false);
  };

  // Cálculo del ranking relativo
  const ranking: ResultadoRanking = React.useMemo(() => {
    if (!activeClaseId || !activeEjercicioId) {
      return { hombres: [], mujeres: [], sinClasificar: [] };
    }
    return calcularRanking({
      claseId: activeClaseId,
      ejercicioId: activeEjercicioId,
      alumnos: todosAlumnos,
      reservas: participantes,
    });
  }, [activeClaseId, activeEjercicioId, calcularRanking, todosAlumnos, participantes, prs, perfilesActualizados]);

  // Conteo de participantes con récord cargado
  const participantesConRecord = React.useMemo(() => {
    if (!activeClaseId || !activeEjercicioId) return 0;
    const idsConPr = new Set(
      prs
        .filter((p) => p.clase_id === activeClaseId && p.ejercicio_id === activeEjercicioId)
        .map((p) => p.alumno_id),
    );
    return participantes.filter((p) => idsConPr.has(p.alumno_id)).length;
  }, [activeClaseId, activeEjercicioId, prs, participantes]);

  // Estado y accesibilidad por teclado en ordenamiento de columnas
  const [sortColHombres, setSortColHombres] = React.useState<SortCol>("ratio");
  const [sortDirHombres, setSortDirHombres] = React.useState<SortDir>("desc");

  const [sortColMujeres, setSortColMujeres] = React.useState<SortCol>("ratio");
  const [sortDirMujeres, setSortDirMujeres] = React.useState<SortDir>("desc");

  const handleSortHombres = (col: SortCol) => {
    if (sortColHombres === col) {
      setSortDirHombres((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColHombres(col);
      setSortDirHombres(col === "atleta" ? "asc" : "desc");
    }
  };

  const handleSortMujeres = (col: SortCol) => {
    if (sortColMujeres === col) {
      setSortDirMujeres((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColMujeres(col);
      setSortDirMujeres(col === "atleta" ? "asc" : "desc");
    }
  };

  const rankingHombresOrdenados = React.useMemo(() => {
    const list = [...ranking.hombres];
    list.sort((a, b) => {
      let diff = 0;
      if (sortColHombres === "ratio") diff = (a.ratio ?? 0) - (b.ratio ?? 0);
      else if (sortColHombres === "carga") diff = a.peso_kg - b.peso_kg;
      else if (sortColHombres === "peso_corporal") diff = (a.peso_corporal_kg ?? 0) - (b.peso_corporal_kg ?? 0);
      else if (sortColHombres === "atleta") diff = a.nombre_completo.localeCompare(b.nombre_completo);
      else if (sortColHombres === "posicion") diff = (a.posicion ?? 0) - (b.posicion ?? 0);
      return sortDirHombres === "asc" ? diff : -diff;
    });
    return list;
  }, [ranking.hombres, sortColHombres, sortDirHombres]);

  const rankingMujeresOrdenadas = React.useMemo(() => {
    const list = [...ranking.mujeres];
    list.sort((a, b) => {
      let diff = 0;
      if (sortColMujeres === "ratio") diff = (a.ratio ?? 0) - (b.ratio ?? 0);
      else if (sortColMujeres === "carga") diff = a.peso_kg - b.peso_kg;
      else if (sortColMujeres === "peso_corporal") diff = (a.peso_corporal_kg ?? 0) - (b.peso_corporal_kg ?? 0);
      else if (sortColMujeres === "atleta") diff = a.nombre_completo.localeCompare(b.nombre_completo);
      else if (sortColMujeres === "posicion") diff = (a.posicion ?? 0) - (b.posicion ?? 0);
      return sortDirMujeres === "asc" ? diff : -diff;
    });
    return list;
  }, [ranking.mujeres, sortColMujeres, sortDirMujeres]);

  // Buscador de ejercicios (combobox)
  const [filtroEjercicio, setFiltroEjercicio] = React.useState<string>("");
  const [comboboxAbierto, setComboboxAbierto] = React.useState<boolean>(false);
  const comboboxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setComboboxAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const ejerciciosFiltrados = React.useMemo(() => {
    const q = filtroEjercicio.toLowerCase().trim();
    if (!q) return listaEjercicios.slice(0, 50);
    return listaEjercicios
      .filter((e) => e.nombre.toLowerCase().includes(q))
      .slice(0, 50);
  }, [listaEjercicios, filtroEjercicio]);

  return (
    <div className="space-y-6 pb-12" data-testid="ranking-funcional-view">
      {/* Cabecera y Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🏆</span>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Ranking Funcional</h1>
            <Badge variant="secondary" className="ml-2 font-semibold uppercase tracking-wider border border-border/80 text-foreground">
              PR / Peso Corporal
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cargá el récord de cada alumno; el ranking compara kg levantados por kg de peso corporal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isOnline && (
            <Badge variant="warning">
              ⚡ Modo Offline
            </Badge>
          )}
        </div>
      </div>

      {/* Avisos y Errores */}
      {aviso && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400 font-medium"
        >
          <span>✓ {aviso}</span>
          <button
            type="button"
            onClick={limpiarAviso}
            className="text-xs hover:underline text-emerald-300 ml-3"
          >
            Descartar
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300 font-medium"
        >
          <span>⚠ {error}</span>
          <button
            type="button"
            onClick={limpiarAviso}
            className="text-xs hover:underline text-rose-200 ml-3"
          >
            Descartar
          </button>
        </div>
      )}

      {/* Barra superior de Clase, Ejercicio y Sumar Alumno (Página 9) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 items-end">
        {/* Selector de Clase */}
        <div className="lg:col-span-5 space-y-1.5">
          <label htmlFor="select-clase" className="text-xs font-bold text-foreground">
            Clase
          </label>
          <select
            id="select-clase"
            data-testid="clase-select"
            value={activeClaseId ?? ""}
            onChange={(e) => setClaseId(e.target.value || null)}
            className="w-full min-h-[42px] rounded-xl border border-border/80 bg-background px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none transition-colors"
          >
            <option value="">-- Seleccionar una clase --</option>
            {listaClases.map((c) => {
              const fecha = claveDia(c.inicio);
              const hora = horaLocal(c.inicio);
              const insc = agendaReservas.filter((r) => r.clase_id === c.id && r.estado === "ANOTADO").length;
              return (
                <option key={c.id} value={c.id}>
                  {fecha} · {hora} · {c.actividad} ({insc})
                </option>
              );
            })}
          </select>
        </div>

        {/* Selector de Ejercicio */}
        <div className="lg:col-span-5 space-y-1.5">
          <label htmlFor="select-ejercicio" className="text-xs font-bold text-foreground">
            Ejercicio de Prueba
          </label>
          <div className="relative" ref={comboboxRef} data-testid="ejercicio-combobox">
            <button
              type="button"
              id="select-ejercicio"
              data-testid="ejercicio-select"
              aria-haspopup="listbox"
              aria-expanded={comboboxAbierto}
              onClick={() => setComboboxAbierto((prev) => !prev)}
              className="w-full min-h-[42px] rounded-xl border border-border/80 bg-background px-3 py-2 text-sm font-medium flex items-center justify-between text-left focus:ring-2 focus:ring-primary focus:outline-none shadow-xs transition-colors hover:border-primary/50"
            >
              <span className={ejercicioActivo ? "text-foreground font-semibold truncate" : "text-muted-foreground truncate"}>
                {ejercicioActivo ? ejercicioActivo.nombre : "-- Seleccionar ejercicio --"}
              </span>
              <span className="text-xs text-muted-foreground ml-2 shrink-0">
                {comboboxAbierto ? "▲" : "▼"}
              </span>
            </button>

            {comboboxAbierto && (
              <div
                className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border/80 bg-card p-2 shadow-xl animate-in fade-in-0 zoom-in-95"
                data-testid="ejercicio-combobox-dropdown"
              >
                <div className="p-1 pb-2 border-b border-border/60">
                  <input
                    type="text"
                    placeholder="Buscar ejercicio..."
                    value={filtroEjercicio}
                    onChange={(e) => setFiltroEjercicio(e.target.value)}
                    data-testid="ejercicio-combobox-input"
                    className="w-full min-h-[38px] rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-y-auto py-1 space-y-0.5" role="listbox">
                  <button
                    type="button"
                    onClick={() => {
                      setEjercicioId(null);
                      setComboboxAbierto(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted"
                  >
                    -- Ninguno / Deseleccionar --
                  </button>
                  {ejerciciosFiltrados.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No se encontraron ejercicios
                    </div>
                  ) : (
                    ejerciciosFiltrados.map((ej) => (
                      <button
                        key={ej.id}
                        type="button"
                        onClick={() => {
                          setEjercicioId(ej.id);
                          setComboboxAbierto(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                          ej.id === activeEjercicioId
                            ? "bg-primary text-primary-foreground font-bold"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <span className="truncate">{ej.nombre}</span>
                        {ej.musculos_principales?.[0] && (
                          <span className="text-[10px] opacity-70 ml-2 shrink-0">
                            {ej.musculos_principales[0]}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Botón / Selector Sumar Alumno */}
        <div className="lg:col-span-2 flex justify-end">
          {alumnosNoParticipantes.length > 0 ? (
            <div className="flex items-center gap-1.5 w-full">
              <select
                data-testid="add-student-select"
                aria-label="Sumar alumno"
                value={alumnoAnotarId}
                onChange={(e) => setAlumnoAnotarId(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-border/80 bg-background px-2.5 py-1.5 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="">+ Sumar alumno...</option>
                {alumnosNoParticipantes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre_completo}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!alumnoAnotarId || agregandoAlumno}
                onClick={handleAgregarParticipante}
                data-testid="add-student-btn"
                className="min-h-[42px] text-xs px-3 shrink-0"
              >
                {agregandoAlumno ? "..." : "Sumar"}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled
              data-testid="add-student-btn"
              className="w-full min-h-[42px] text-xs"
            >
              Sumar alumno
            </Button>
          )}
        </div>
      </div>

      {/* SECCIÓN PARTICIPANTES: Fila Unificada de Guardado Rápido */}
      {claseActiva && ejercicioActivo && (
        <Card className="border-border/80 bg-card overflow-hidden shadow-xs">
          <CardHeader className="border-b border-border/60 py-4 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Participantes
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {participantesConRecord} de {participantes.length} con récord cargado
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {participantes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground m-4">
                <p>Todavía no hay alumnos anotados en esta clase.</p>
                <p className="text-xs mt-1">Usá el selector superior para sumar alumnos y registrar sus marcas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm" data-testid="participants-table">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="py-2.5 px-4">Alumno</th>
                      <th className="py-2.5 px-3">Categoría</th>
                      <th className="py-2.5 px-3">Peso corporal</th>
                      <th className="py-2.5 px-3">Carga</th>
                      <th className="py-2.5 px-3">Reps</th>
                      <th className="py-2.5 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {participantes.map((part) => {
                      const alumno = todosAlumnos.find((a) => a.id === part.alumno_id);
                      const prExistente = prs.find(
                        (p) =>
                          p.clase_id === claseActiva.id &&
                          p.alumno_id === part.alumno_id &&
                          p.ejercicio_id === ejercicioActivo.id,
                      );

                      const inputVal = prInputs[part.alumno_id] ?? {
                        peso_kg: prExistente ? String(prExistente.peso_kg) : "",
                        reps: prExistente ? String(prExistente.reps) : "1",
                      };

                      const perfilInput = perfilInputs[part.alumno_id] ?? {
                        peso_corporal_kg: alumno?.peso_corporal_kg ? String(alumno.peso_corporal_kg) : "",
                        sexo: alumno?.sexo ?? "M",
                      };

                      // Determinar estado de guardado
                      const estaGuardado =
                        filasGuardadasLocal[part.alumno_id] ||
                        Boolean(
                          prExistente &&
                            String(prExistente.peso_kg) === inputVal.peso_kg &&
                            String(prExistente.reps) === inputVal.reps,
                        );

                      const isSaving = guardandoPrId === part.alumno_id;

                      return (
                        <tr
                          key={part.id}
                          className="hover:bg-secondary/20 transition-colors"
                          data-testid={`student-row-${part.alumno_id}`}
                        >
                          {/* Alumno */}
                          <td className="py-3 px-4">
                            <span className="font-semibold block text-foreground">
                              {part.alumno_nombre}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {part.estado}
                            </span>
                          </td>

                          {/* Categoría (Select neutro de Masculino / Femenino) */}
                          <td className="py-3 px-3">
                            <select
                              aria-label={`Categoría de ${part.alumno_nombre}`}
                              data-testid={`select-categoria-${part.alumno_id}`}
                              value={perfilInput.sexo}
                              onChange={(e) => {
                                const nuevoSexo = e.target.value as "M" | "F";
                                setPerfilInputs((prev) => ({
                                  ...prev,
                                  [part.alumno_id]: {
                                    ...perfilInput,
                                    sexo: nuevoSexo,
                                  },
                                }));
                                setFilasGuardadasLocal((prev) => ({
                                  ...prev,
                                  [part.alumno_id]: false,
                                }));
                              }}
                              className="h-9 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                            >
                              <option value="M">Masculino</option>
                              <option value="F">Femenino</option>
                            </select>
                          </td>

                          {/* Peso Corporal */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.5"
                                min="1"
                                placeholder="65"
                                aria-label={`Peso corporal de ${part.alumno_nombre}`}
                                data-testid={`input-peso-corporal-${part.alumno_id}`}
                                value={perfilInput.peso_corporal_kg}
                                onChange={(e) => {
                                  const nuevoVal = e.target.value;
                                  setPerfilInputs((prev) => ({
                                    ...prev,
                                    [part.alumno_id]: {
                                      ...perfilInput,
                                      peso_corporal_kg: nuevoVal,
                                    },
                                  }));
                                  setFilasGuardadasLocal((prev) => ({
                                    ...prev,
                                    [part.alumno_id]: false,
                                  }));
                                }}
                                className="h-9 w-20 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-semibold text-right text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                              />
                              <span className="text-xs text-muted-foreground font-semibold">kg</span>
                            </div>
                          </td>

                          {/* Carga (PR peso en kg) */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                placeholder="0"
                                aria-label={`Carga de ${part.alumno_nombre} en kg`}
                                data-testid={`input-pr-peso-${part.alumno_id}`}
                                value={inputVal.peso_kg}
                                onChange={(e) => {
                                  const nuevoVal = e.target.value;
                                  setPrInputs((prev) => ({
                                    ...prev,
                                    [part.alumno_id]: {
                                      ...inputVal,
                                      peso_kg: nuevoVal,
                                    },
                                  }));
                                  setFilasGuardadasLocal((prev) => ({
                                    ...prev,
                                    [part.alumno_id]: false,
                                  }));
                                }}
                                className="h-9 w-20 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-bold text-right text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                              />
                              <span className="text-xs text-muted-foreground font-semibold">kg</span>
                            </div>
                          </td>

                          {/* Reps */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="1"
                                min="1"
                                placeholder="1"
                                aria-label={`Reps de ${part.alumno_nombre}`}
                                data-testid={`input-pr-reps-${part.alumno_id}`}
                                value={inputVal.reps}
                                onChange={(e) => {
                                  const nuevoVal = e.target.value;
                                  setPrInputs((prev) => ({
                                    ...prev,
                                    [part.alumno_id]: {
                                      ...inputVal,
                                      reps: nuevoVal,
                                    },
                                  }));
                                  setFilasGuardadasLocal((prev) => ({
                                    ...prev,
                                    [part.alumno_id]: false,
                                  }));
                                }}
                                className="h-9 w-14 rounded-lg border border-border/80 bg-background px-2 text-xs font-semibold text-center text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                              />
                            </div>
                          </td>

                          {/* Botón Único de Guardado / Guardado (Página 9) */}
                          <td className="py-3 px-4 text-right">
                            {estaGuardado ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 text-xs px-3 font-semibold bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border border-emerald-600/40 hover:bg-emerald-600/25 transition-all cursor-default select-none shadow-xs"
                                data-testid={`save-pr-btn-${part.alumno_id}`}
                                data-state="guardado"
                                disabled={isSaving}
                                onClick={() => handleGuardarFila(part.alumno_id)}
                              >
                                {isSaving ? "Guardando..." : "Guardado"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-9 text-xs px-3 font-semibold bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-all select-none shadow-xs"
                                disabled={isSaving || !inputVal.peso_kg}
                                onClick={() => handleGuardarFila(part.alumno_id)}
                                data-testid={`save-pr-btn-${part.alumno_id}`}
                                data-state="guardar"
                              >
                                {isSaving ? "Guardando..." : "Guardar"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tablas de Ranking Relativo por Sexo (Página 9) */}
      {claseActiva && ejercicioActivo && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* TABLA RANKING MASCULINO */}
            <Card className="border-border/80 bg-card overflow-hidden shadow-xs" data-testid="ranking-hombres-card">
              <CardHeader className="border-b border-border/60 py-3.5 px-5 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CategoryChip categoria="Masculino" />
                    <CardTitle className="text-base font-bold text-foreground">
                      Ranking Masculino (Hombres)
                    </CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {rankingHombresOrdenados.length} con récord
                  </span>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {rankingHombresOrdenados.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No hay marcas masculinas registradas aún para este ejercicio.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm" data-testid="ranking-hombres-table">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColHombres === "posicion" ? (sortDirHombres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por posición"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortHombres("posicion");
                              }
                            }}
                            onClick={() => handleSortHombres("posicion")}
                            className="py-2.5 px-3.5 text-center w-12 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center justify-center gap-1">
                              #
                              {sortColHombres === "posicion" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirHombres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColHombres === "atleta" ? (sortDirHombres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por nombre de atleta"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortHombres("atleta");
                              }
                            }}
                            onClick={() => handleSortHombres("atleta")}
                            className="py-2.5 px-3 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center gap-1">
                              Atleta
                              {sortColHombres === "atleta" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirHombres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColHombres === "carga" ? (sortDirHombres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por carga levantada"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortHombres("carga");
                              }
                            }}
                            onClick={() => handleSortHombres("carga")}
                            className="py-2.5 px-3 text-right cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center justify-end gap-1">
                              PR (kg)
                              {sortColHombres === "carga" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirHombres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColHombres === "peso_corporal" ? (sortDirHombres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por peso corporal"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortHombres("peso_corporal");
                              }
                            }}
                            onClick={() => handleSortHombres("peso_corporal")}
                            className="py-2.5 px-3 text-right cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center justify-end gap-1">
                              Peso Corp.
                              {sortColHombres === "peso_corporal" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirHombres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColHombres === "ratio" ? (sortDirHombres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por ratio de fuerza relativa"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortHombres("ratio");
                              }
                            }}
                            onClick={() => handleSortHombres("ratio")}
                            className="py-2.5 px-3.5 text-right font-black cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center justify-end gap-1">
                              Ratio Relativo
                              {sortColHombres === "ratio" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirHombres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {rankingHombresOrdenados.map((item) => {
                          const medalla =
                            item.posicion === 1 ? "🥇" : item.posicion === 2 ? "🥈" : item.posicion === 3 ? "🥉" : "";

                          return (
                            <tr
                              key={item.alumno_id}
                              className={`transition-colors ${
                                item.posicion === 1
                                  ? "bg-primary/5 font-medium"
                                  : "hover:bg-secondary/20"
                              }`}
                              data-testid={`ranking-row-m-${item.alumno_id}`}
                            >
                              <td className="py-3 px-3.5 text-center font-black">
                                {medalla ? (
                                  <span className="text-base" title={`${item.posicion}º lugar`}>
                                    {medalla}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {item.posicion}º
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 font-semibold text-foreground">
                                {item.nombre_completo}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-foreground">
                                {item.peso_kg} kg
                                <span className="text-[11px] text-muted-foreground block font-normal">
                                  × {item.reps}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right text-muted-foreground font-medium">
                                {item.peso_corporal_kg} kg
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                <Badge variant="secondary" className="font-mono font-bold text-sm px-2.5 py-0.5 border border-border/80 text-foreground bg-muted/60">
                                  {`${item.ratio?.toFixed(2)}×`}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* TABLA RANKING FEMENINO */}
            <Card className="border-border/80 bg-card overflow-hidden shadow-xs" data-testid="ranking-mujeres-card">
              <CardHeader className="border-b border-border/60 py-3.5 px-5 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CategoryChip categoria="Femenino" />
                    <CardTitle className="text-base font-bold text-foreground">
                      Ranking Femenino (Mujeres)
                    </CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {rankingMujeresOrdenadas.length} con récord
                  </span>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {rankingMujeresOrdenadas.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No hay marcas femeninas registradas aún para este ejercicio.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm" data-testid="ranking-mujeres-table">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColMujeres === "posicion" ? (sortDirMujeres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por posición"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortMujeres("posicion");
                              }
                            }}
                            onClick={() => handleSortMujeres("posicion")}
                            className="py-2.5 px-3.5 text-center w-12 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center justify-center gap-1">
                              #
                              {sortColMujeres === "posicion" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirMujeres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColMujeres === "atleta" ? (sortDirMujeres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por nombre de atleta"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortMujeres("atleta");
                              }
                            }}
                            onClick={() => handleSortMujeres("atleta")}
                            className="py-2.5 px-3 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center gap-1">
                              Atleta
                              {sortColMujeres === "atleta" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirMujeres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColMujeres === "carga" ? (sortDirMujeres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por carga levantada"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortMujeres("carga");
                              }
                            }}
                            onClick={() => handleSortMujeres("carga")}
                            className="py-2.5 px-3 text-right cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center justify-end gap-1">
                              PR (kg)
                              {sortColMujeres === "carga" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirMujeres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColMujeres === "peso_corporal" ? (sortDirMujeres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por peso corporal"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortMujeres("peso_corporal");
                              }
                            }}
                            onClick={() => handleSortMujeres("peso_corporal")}
                            className="py-2.5 px-3 text-right cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center justify-end gap-1">
                              Peso Corp.
                              {sortColMujeres === "peso_corporal" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirMujeres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                          <th
                            scope="col"
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortColMujeres === "ratio" ? (sortDirMujeres === "desc" ? "descending" : "ascending") : "none"}
                            aria-label="Ordenar por ratio de fuerza relativa"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSortMujeres("ratio");
                              }
                            }}
                            onClick={() => handleSortMujeres("ratio")}
                            className="py-2.5 px-3.5 text-right font-black cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus:bg-muted/40 transition-colors"
                          >
                            <span className="flex items-center justify-end gap-1">
                              Ratio Relativo
                              {sortColMujeres === "ratio" && (
                                <span className="text-[10px]" aria-hidden="true">{sortDirMujeres === "desc" ? "▼" : "▲"}</span>
                              )}
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {rankingMujeresOrdenadas.map((item) => {
                          const medalla =
                            item.posicion === 1 ? "🥇" : item.posicion === 2 ? "🥈" : item.posicion === 3 ? "🥉" : "";

                          return (
                            <tr
                              key={item.alumno_id}
                              className={`transition-colors ${
                                item.posicion === 1
                                  ? "bg-primary/5 font-medium"
                                  : "hover:bg-secondary/20"
                              }`}
                              data-testid={`ranking-row-f-${item.alumno_id}`}
                            >
                              <td className="py-3 px-3.5 text-center font-black">
                                {medalla ? (
                                  <span className="text-base" title={`${item.posicion}º lugar`}>
                                    {medalla}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {item.posicion}º
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 font-semibold text-foreground">
                                {item.nombre_completo}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-foreground">
                                {item.peso_kg} kg
                                <span className="text-[11px] text-muted-foreground block font-normal">
                                  × {item.reps}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right text-muted-foreground font-medium">
                                {item.peso_corporal_kg} kg
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                <Badge variant="secondary" className="font-mono font-bold text-sm px-2.5 py-0.5 border border-border/80 text-foreground bg-muted/60">
                                  {`${item.ratio?.toFixed(2)}×`}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ALUMNOS PENDIENTES DE PESO O SEXO */}
          {ranking.sinClasificar.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="py-3 px-5 border-b border-amber-500/20">
                <CardTitle className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <span>⚠️ Alumnos con PR registrado pero pendientes de clasificación ({ranking.sinClasificar.length})</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Para ingresar al ranking relativo, el alumno necesita tener registrado su peso corporal y sexo.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-amber-500/20 text-muted-foreground">
                        <th className="py-2 px-4">Alumno</th>
                        <th className="py-2 px-3 text-right">PR (kg)</th>
                        <th className="py-2 px-3">Motivo</th>
                        <th className="py-2 px-3">Cargar Datos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-500/10">
                      {ranking.sinClasificar.map((sc) => {
                        const perfilInput = perfilInputs[sc.alumno_id] ?? {
                          peso_corporal_kg: sc.peso_corporal_kg ? String(sc.peso_corporal_kg) : "",
                          sexo: sc.sexo ?? "M",
                        };

                        return (
                          <tr key={sc.alumno_id} className="hover:bg-amber-500/10">
                            <td className="py-2.5 px-4 font-semibold">{sc.nombre_completo}</td>
                            <td className="py-2.5 px-3 text-right font-bold">{sc.peso_kg} kg</td>
                            <td className="py-2.5 px-3">
                              <Badge variant="warning" className="text-[10px]">
                                {sc.motivo_exclusion === "SIN_PESO_CORPORAL"
                                  ? "Falta peso"
                                  : sc.motivo_exclusion === "SIN_SEXO"
                                  ? "Falta sexo"
                                  : "Faltan peso y sexo"}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="1"
                                  placeholder="Peso kg"
                                  value={perfilInput.peso_corporal_kg}
                                  onChange={(e) =>
                                    setPerfilInputs((prev) => ({
                                      ...prev,
                                      [sc.alumno_id]: {
                                        ...perfilInput,
                                        peso_corporal_kg: e.target.value,
                                      },
                                    }))
                                  }
                                  className="h-8 w-20 rounded border border-border/80 bg-background px-2 text-xs"
                                />
                                <select
                                  value={perfilInput.sexo}
                                  onChange={(e) =>
                                    setPerfilInputs((prev) => ({
                                      ...prev,
                                      [sc.alumno_id]: {
                                        ...perfilInput,
                                        sexo: e.target.value as "M" | "F",
                                      },
                                    }))
                                  }
                                  className="h-8 rounded border border-border/80 bg-background px-1.5 text-xs font-semibold"
                                >
                                  <option value="M">Masculino</option>
                                  <option value="F">Femenino</option>
                                </select>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs px-2.5"
                                  onClick={async () => {
                                    const peso = parseFloat(perfilInput.peso_corporal_kg);
                                    if (peso > 0) {
                                      await actualizarPerfilAlumno(sc.alumno_id, peso, perfilInput.sexo);
                                    }
                                  }}
                                >
                                  Clasificar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
