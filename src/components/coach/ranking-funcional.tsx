"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { claveDia, horaLocal } from "@/lib/clases";
import { useClasesStore } from "@/store/use-clases-store";
import {
  ResultadoRanking,
  useRankingStore,
} from "@/store/use-ranking-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { Ejercicio, Perfil } from "@/types/database.types";
import { DEMO_ALUMNOS, DEMO_ALUMNOS_CLASES } from "@/services/coach-demo-dataset";
import { REAL_EJERCICIOS } from "@/services/real-mynter-data";

interface RankingFuncionalProps {
  initialClaseId?: string | null;
  initialEjercicioId?: string | null;
  alumnosDisponibles?: Perfil[];
  ejerciciosDisponibles?: Ejercicio[];
}

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
    cargarAgenda,
  } = useClasesStore();

  const {
    claseIdSeleccionada,
    ejercicioIdSeleccionado,
    prs,
    guardandoPrId,
    aviso,
    error,
    setClaseId,
    setEjercicioId,
    cargarPrsClase,
    registrarPr,
    actualizarPerfilAlumno,
    calcularRanking,
    limpiarAviso,
  } = useRankingStore();

  // Alumnos y ejercicios combinados (props o fallback demo/real)
  const todosAlumnos: Perfil[] = React.useMemo(() => {
    if (alumnosDisponibles && alumnosDisponibles.length > 0) {
      return alumnosDisponibles;
    }
    return [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES];
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
    (listaEjercicios.find((e) => e.nombre.toLowerCase().includes("dominadas"))?.id ||
      listaEjercicios.find((e) => e.nombre.toLowerCase().includes("banca"))?.id ||
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

  // Participantes anotados en la clase seleccionada
  const participantes = React.useMemo(() => {
    if (!activeClaseId) return [];
    return agendaReservas.filter(
      (r) => r.clase_id === activeClaseId && (r.estado === "ANOTADO" || r.estado === "AUSENTE"),
    );
  }, [agendaReservas, activeClaseId]);

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

  // Sincronizar inputs de PR con valores existentes
  React.useEffect(() => {
    if (!claseIdSeleccionada || !ejercicioIdSeleccionado) return;
    const nuevoMap: Record<string, { peso_kg: string; reps: string }> = {};
    for (const part of participantes) {
      const prExistente = prs.find(
        (p) =>
          p.clase_id === claseIdSeleccionada &&
          p.alumno_id === part.alumno_id &&
          p.ejercicio_id === ejercicioIdSeleccionado,
      );
      if (prExistente) {
        nuevoMap[part.alumno_id] = {
          peso_kg: String(prExistente.peso_kg),
          reps: String(prExistente.reps),
        };
      }
    }
    setPrInputs((prev) => ({ ...nuevoMap, ...prev }));
  }, [activeClaseId, activeEjercicioId, participantes, prs]);

  // Manejo de guardado de PR
  const handleGuardarPr = async (alumnoId: string) => {
    if (!activeClaseId || !activeEjercicioId) return;
    const inputVal = prInputs[alumnoId];
    const peso = parseFloat(inputVal?.peso_kg ?? "0");
    const reps = parseInt(inputVal?.reps ?? "1", 10) || 1;

    if (isNaN(peso) || peso < 0) {
      alert("Por favor ingresá un peso válido (mayor o igual a 0 kg).");
      return;
    }

    await registrarPr({
      clase_id: activeClaseId,
      alumno_id: alumnoId,
      ejercicio_id: activeEjercicioId,
      peso_kg: peso,
      reps,
    });
  };

  // Manejo de actualización de perfil inline (peso corporal y sexo)
  const handleGuardarPerfil = async (alumnoId: string) => {
    const p = perfilInputs[alumnoId];
    if (!p) return;
    const peso = parseFloat(p.peso_corporal_kg);
    if (isNaN(peso) || peso <= 0 || peso > 500) {
      alert("El peso corporal debe ser un número positivo (ej: 75.5 kg).");
      return;
    }
    if (p.sexo !== "M" && p.sexo !== "F") {
      alert("Seleccioná el sexo biológico del alumno ('M' o 'F') para el ranking.");
      return;
    }

    const res = await actualizarPerfilAlumno(alumnoId, peso, p.sexo);
    if (res.ok) {
      // Actualizar también en la lista local de alumnos para recalcular inmediatamente
      const idx = todosAlumnos.findIndex((a) => a.id === alumnoId);
      if (idx !== -1) {
        todosAlumnos[idx]!.peso_corporal_kg = peso;
        todosAlumnos[idx]!.sexo = p.sexo;
      }
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
  }, [activeClaseId, activeEjercicioId, calcularRanking, todosAlumnos, participantes, prs]);

  // Filtro de búsqueda de ejercicios
  const [filtroEjercicio, setFiltroEjercicio] = React.useState<string>("");
  const ejerciciosFiltrados = React.useMemo(() => {
    if (!filtroEjercicio.trim()) return listaEjercicios.slice(0, 30);
    const q = filtroEjercicio.toLowerCase();
    return listaEjercicios
      .filter((e) => e.nombre.toLowerCase().includes(q))
      .slice(0, 30);
  }, [listaEjercicios, filtroEjercicio]);

  return (
    <div className="space-y-6 pb-12" data-testid="ranking-funcional-view">
      {/* Cabecera y Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🏆</span>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Ranking Funcional</h1>
            <Badge variant="purple" className="ml-2 font-bold uppercase tracking-wider">
              PR / Peso Corporal
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Registrá los Personal Records (PR) de los alumnos de la clase y comparalos relativos a su peso corporal, divididos por sexo.
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

      {/* Selectores de Clase y Ejercicio */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Selector de Clase */}
        <Card className="border-border/80 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>1. Clase Seleccionada</span>
              {claseActiva && (
                <Badge
                  variant={claseActiva.actividad === "FUNCIONAL" ? "default" : "secondary"}
                  className="font-bold uppercase text-[10px]"
                >
                  {claseActiva.actividad}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <label htmlFor="select-clase" className="sr-only">Seleccionar Clase</label>
            <select
              id="select-clase"
              data-testid="clase-select"
              value={activeClaseId ?? ""}
              onChange={(e) => setClaseId(e.target.value || null)}
              className="w-full min-h-[44px] rounded-xl border border-border/80 bg-background px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">-- Seleccionar una clase --</option>
              {listaClases.map((c) => {
                const fecha = claveDia(c.inicio);
                const hora = horaLocal(c.inicio);
                const insc = agendaReservas.filter((r) => r.clase_id === c.id && r.estado === "ANOTADO").length;
                return (
                  <option key={c.id} value={c.id}>
                    {fecha} · {hora} · {c.actividad} ({insc} inscriptos)
                  </option>
                );
              })}
            </select>
            {claseActiva && (
              <p className="text-xs text-muted-foreground">
                Inscriptos: {participantes.length} alumno(s) {claseActiva.capacidad ? `/ ${claseActiva.capacidad} cupos` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Selector de Ejercicio */}
        <Card className="border-border/80 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>2. Ejercicio de Prueba</span>
              {ejercicioActivo && (
                <Badge variant="outline" className="text-[10px]">
                  {ejercicioActivo.musculos_principales?.[0] || "General"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Buscar ejercicio..."
                value={filtroEjercicio}
                onChange={(e) => setFiltroEjercicio(e.target.value)}
                className="w-1/3 min-h-[44px] rounded-xl border border-border/80 bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <select
                id="select-ejercicio"
                data-testid="ejercicio-select"
                value={activeEjercicioId ?? ""}
                onChange={(e) => setEjercicioId(e.target.value || null)}
                className="w-2/3 min-h-[44px] rounded-xl border border-border/80 bg-background px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="">-- Seleccionar ejercicio --</option>
                {ejerciciosFiltrados.map((ej) => (
                  <option key={ej.id} value={ej.id}>
                    {ej.nombre}
                  </option>
                ))}
              </select>
            </div>
            {ejercicioActivo && (
              <p className="text-xs text-muted-foreground truncate">
                Músculos: {ejercicioActivo.musculos_principales?.join(", ") || "Todos"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sección de Registro de PRs por Alumno de la Clase */}
      {claseActiva && ejercicioActivo && (
        <Card className="border-border/80 bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <span>Participantes de la Clase ({participantes.length})</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ingresá el PR (peso y repeticiones) logrado en <strong className="text-foreground">{ejercicioActivo.nombre}</strong>.
                </p>
              </div>

              {/* Agregar alumno a la clase */}
              {alumnosNoParticipantes.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    data-testid="add-student-select"
                    value={alumnoAnotarId}
                    onChange={(e) => setAlumnoAnotarId(e.target.value)}
                    className="min-h-[40px] rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="">+ Sumar otro alumno...</option>
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
                  >
                    {agregandoAlumno ? "Sumando..." : "Sumar a Clase"}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            {participantes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
                <p>Todavía no hay alumnos anotados en esta clase.</p>
                <p className="text-xs mt-1">Usá el selector de arriba para sumar alumnos y registrar sus marcas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm" data-testid="participants-table">
                  <thead>
                    <tr className="border-b border-border/60 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="py-2.5 px-3">Alumno</th>
                      <th className="py-2.5 px-3">Sexo</th>
                      <th className="py-2.5 px-3">Peso Corporal</th>
                      <th className="py-2.5 px-3">PR en Ejercicio</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
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

                      const tieneDatosCompletos =
                        Boolean(alumno?.peso_corporal_kg && alumno?.peso_corporal_kg > 0 && alumno?.sexo);

                      return (
                        <tr
                          key={part.id}
                          className="hover:bg-secondary/20 transition-colors"
                          data-testid={`student-row-${part.alumno_id}`}
                        >
                          {/* Alumno */}
                          <td className="py-3 px-3">
                            <span className="font-semibold block">{part.alumno_nombre}</span>
                            <span className="text-[11px] text-muted-foreground">{part.estado}</span>
                          </td>

                          {/* Sexo */}
                          <td className="py-3 px-3">
                            {alumno?.sexo ? (
                              <Badge
                                variant={alumno.sexo === "M" ? "info" : "purple"}
                                className="font-bold text-xs"
                              >
                                {alumno.sexo === "M" ? "♂ Hombre" : "♀ Mujer"}
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-1">
                                <select
                                  aria-label={`Sexo de ${part.alumno_nombre}`}
                                  value={perfilInput.sexo}
                                  onChange={(e) =>
                                    setPerfilInputs((prev) => ({
                                      ...prev,
                                      [part.alumno_id]: {
                                        ...perfilInput,
                                        sexo: e.target.value as "M" | "F",
                                      },
                                    }))
                                  }
                                  className="h-9 rounded-lg border border-border/80 bg-background px-2 text-xs font-semibold"
                                >
                                  <option value="M">♂ M</option>
                                  <option value="F">♀ F</option>
                                </select>
                              </div>
                            )}
                          </td>

                          {/* Peso Corporal */}
                          <td className="py-3 px-3">
                            {alumno?.peso_corporal_kg ? (
                              <span className="font-bold text-foreground">
                                {alumno.peso_corporal_kg} kg
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="1"
                                  placeholder="ej: 75"
                                  aria-label={`Peso corporal de ${part.alumno_nombre}`}
                                  value={perfilInput.peso_corporal_kg}
                                  onChange={(e) =>
                                    setPerfilInputs((prev) => ({
                                      ...prev,
                                      [part.alumno_id]: {
                                        ...perfilInput,
                                        peso_corporal_kg: e.target.value,
                                      },
                                    }))
                                  }
                                  className="h-9 w-20 rounded-lg border border-border/80 bg-background px-2 text-xs font-semibold"
                                />
                                <span className="text-xs text-muted-foreground">kg</span>
                                {!tieneDatosCompletos && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleGuardarPerfil(part.alumno_id)}
                                    title="Guardar peso y sexo"
                                    className="h-9 text-xs px-2"
                                  >
                                    Guardar
                                  </Button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Input PR */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  placeholder="0"
                                  aria-label={`PR de ${part.alumno_nombre} en kg`}
                                  value={inputVal.peso_kg}
                                  onChange={(e) =>
                                    setPrInputs((prev) => ({
                                      ...prev,
                                      [part.alumno_id]: {
                                        ...inputVal,
                                        peso_kg: e.target.value,
                                      },
                                    }))
                                  }
                                  className="h-10 w-24 rounded-lg border border-border/80 bg-background px-2.5 text-sm font-bold text-right"
                                  data-testid={`input-pr-peso-${part.alumno_id}`}
                                />
                                <span className="text-xs text-muted-foreground font-semibold">kg</span>
                              </div>

                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  placeholder="1"
                                  aria-label={`Reps de ${part.alumno_nombre}`}
                                  value={inputVal.reps}
                                  onChange={(e) =>
                                    setPrInputs((prev) => ({
                                      ...prev,
                                      [part.alumno_id]: {
                                        ...inputVal,
                                        reps: e.target.value,
                                      },
                                    }))
                                  }
                                  className="h-10 w-14 rounded-lg border border-border/80 bg-background px-2 text-xs font-semibold text-center"
                                  data-testid={`input-pr-reps-${part.alumno_id}`}
                                />
                                <span className="text-[11px] text-muted-foreground">reps</span>
                              </div>
                            </div>
                          </td>

                          {/* Botón Guardar PR */}
                          <td className="py-3 px-3 text-right">
                            <Button
                              size="sm"
                              variant={prExistente ? "secondary" : "default"}
                              disabled={guardandoPrId === part.alumno_id || !inputVal.peso_kg}
                              onClick={() => handleGuardarPr(part.alumno_id)}
                              data-testid={`save-pr-btn-${part.alumno_id}`}
                            >
                              {guardandoPrId === part.alumno_id
                                ? "Guardando..."
                                : prExistente
                                ? "Actualizar"
                                : "Guardar PR"}
                            </Button>
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

      {/* Tablas de Ranking Relativo por Sexo */}
      {claseActiva && ejercicioActivo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Tablas de Ranking Relativo</h2>
              <p className="text-xs text-muted-foreground">
                Ordenado por <strong className="text-foreground">Ratio = PR (kg) / Peso Corporal (kg)</strong> en tablas separadas por sexo biológico.
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* TABLA RANKING MASCULINO */}
            <Card className="border-border/80 bg-card overflow-hidden shadow-xs" data-testid="ranking-hombres-card">
              <CardHeader className="bg-sky-500/10 border-b border-border/60 py-3.5 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden="true">♂</span>
                    <CardTitle className="text-base font-bold text-sky-400">
                      Ranking Masculino (Hombres)
                    </CardTitle>
                  </div>
                  <Badge variant="info" className="font-bold text-xs">
                    {ranking.hombres.length} clasificado(s)
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {ranking.hombres.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No hay marcas masculinas registradas aún para este ejercicio.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm" data-testid="ranking-hombres-table">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          <th className="py-2.5 px-3.5 text-center w-12">#</th>
                          <th className="py-2.5 px-3">Atleta</th>
                          <th className="py-2.5 px-3 text-right">PR (kg)</th>
                          <th className="py-2.5 px-3 text-right">Peso Corp.</th>
                          <th className="py-2.5 px-3.5 text-right font-black">Ratio Relativo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {ranking.hombres.map((item) => {
                          const esPodio = (item.posicion ?? 0) <= 3;
                          const medalla =
                            item.posicion === 1 ? "🥇" : item.posicion === 2 ? "🥈" : item.posicion === 3 ? "🥉" : "";

                          return (
                            <tr
                              key={item.alumno_id}
                              className={`transition-colors ${
                                item.posicion === 1
                                  ? "bg-amber-500/10 font-medium"
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
                              <td className="py-3 px-3 font-semibold">
                                {item.nombre_completo}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-foreground">
                                {item.peso_kg} kg
                                <span className="text-[11px] text-muted-foreground block font-normal">
                                  {item.reps} {item.reps === 1 ? "rep" : "reps"}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right text-muted-foreground font-medium">
                                {item.peso_corporal_kg} kg
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                <Badge variant="success" className="font-black text-sm px-2.5 py-0.5">
                                  {item.ratio?.toFixed(2)}x
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
              <CardHeader className="bg-purple-500/10 border-b border-border/60 py-3.5 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden="true">♀</span>
                    <CardTitle className="text-base font-bold text-purple-300">
                      Ranking Femenino (Mujeres)
                    </CardTitle>
                  </div>
                  <Badge variant="purple" className="font-bold text-xs">
                    {ranking.mujeres.length} clasificada(s)
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {ranking.mujeres.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No hay marcas femeninas registradas aún para este ejercicio.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm" data-testid="ranking-mujeres-table">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          <th className="py-2.5 px-3.5 text-center w-12">#</th>
                          <th className="py-2.5 px-3">Atleta</th>
                          <th className="py-2.5 px-3 text-right">PR (kg)</th>
                          <th className="py-2.5 px-3 text-right">Peso Corp.</th>
                          <th className="py-2.5 px-3.5 text-right font-black">Ratio Relativo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {ranking.mujeres.map((item) => {
                          const medalla =
                            item.posicion === 1 ? "🥇" : item.posicion === 2 ? "🥈" : item.posicion === 3 ? "🥉" : "";

                          return (
                            <tr
                              key={item.alumno_id}
                              className={`transition-colors ${
                                item.posicion === 1
                                  ? "bg-purple-500/10 font-medium"
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
                              <td className="py-3 px-3 font-semibold">
                                {item.nombre_completo}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-foreground">
                                {item.peso_kg} kg
                                <span className="text-[11px] text-muted-foreground block font-normal">
                                  {item.reps} {item.reps === 1 ? "rep" : "reps"}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right text-muted-foreground font-medium">
                                {item.peso_corporal_kg} kg
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                <Badge variant="purple" className="font-black text-sm px-2.5 py-0.5">
                                  {item.ratio?.toFixed(2)}x
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
                                  <option value="M">♂ M</option>
                                  <option value="F">♀ F</option>
                                </select>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs px-2.5"
                                  onClick={() => handleGuardarPerfil(sc.alumno_id)}
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
