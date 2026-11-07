"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Dumbbell, FileText, MoreHorizontal, Plus, Search, X } from "@/components/ui/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoutineBuilderModal } from "@/components/coach/routine-builder/routine-builder-modal";
import {
  clasificarRutinas,
  determinarPestanaPorDefecto,
  filtrarRutinas,
  formatFecha,
  getTagBadgeStyles,
  getTagChipFilterStyles,
  heredarTagsDePlantilla,
  nombreUnico,
  separarBorradores,
  TAGS_FILTRO_BIBLIOTECA,
  tagToSlug,
} from "@/lib/rutinas-biblioteca";
import { fetchLiveDatasetFromSupabase, type LiveSupabaseDataset } from "@/services/alumnos-service";
import { activarRutina, archivarRutina, asignarRutinaAAlumno } from "@/services/rutinas-service";
import type { PlanEntrenamiento } from "@/types/database.types";

export function RutinasLibrary({
  initialDataset,
  defaultSubTab,
}: {
  initialDataset: LiveSupabaseDataset;
  defaultSubTab?: "plantillas" | "alumnos" | "borradores" | "archivadas";
}) {
  const [dataset, setDataset] = React.useState(initialDataset);
  const [activeMainTab, setActiveMainTab] = React.useState<"biblioteca" | "constructor">("biblioteca");
  const [builder, setBuilder] = React.useState<{ plan: PlanEntrenamiento | null; alumnoId?: string } | null>(null);
  const [asignando, setAsignando] = React.useState<PlanEntrenamiento | null>(null);
  const [alumnoElegido, setAlumnoElegido] = React.useState("");
  const [enCurso, setEnCurso] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [selectedTag, setSelectedTag] = React.useState<string>("Todos");
  const [busqueda, setBusqueda] = React.useState<string>("");
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  const { plantillas, deAlumnos, archivadas } = clasificarRutinas(dataset.planes);
  const { vigentes, borradores } = separarBorradores(deAlumnos);
  const nombresExistentes = dataset.planes.map((p) => p.nombre);
  const nombreAlumno = (id: string | null) =>
    dataset.alumnos.find((a) => a.id === id)?.nombre_completo ?? "Alumno";

  const [subTab, setSubTab] = React.useState<string>(() =>
    defaultSubTab ?? determinarPestanaPorDefecto(initialDataset.planes),
  );

  const plantillasFiltradas = React.useMemo(
    () => filtrarRutinas(plantillas, selectedTag, busqueda),
    [plantillas, selectedTag, busqueda],
  );
  const vigentesFiltradas = React.useMemo(
    () => filtrarRutinas(vigentes, selectedTag, busqueda),
    [vigentes, selectedTag, busqueda],
  );
  const borradoresFiltrados = React.useMemo(
    () => filtrarRutinas(borradores, selectedTag, busqueda),
    [borradores, selectedTag, busqueda],
  );
  const archivadasFiltradas = React.useMemo(
    () => filtrarRutinas(archivadas, selectedTag, busqueda),
    [archivadas, selectedTag, busqueda],
  );

  const recargar = async () => {
    const fresco = await fetchLiveDatasetFromSupabase();
    setDataset(fresco);
    return fresco;
  };

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (asignando && !dialog.open) dialog.showModal();
    if (!asignando && dialog.open) dialog.close();
  }, [asignando]);

  const cerrarAsignacion = () => {
    setAsignando(null);
    setAlumnoElegido("");
  };

  const confirmarAsignacion = async () => {
    if (!asignando || !alumnoElegido) return;
    setEnCurso(true);
    setError(null);
    setAviso(null);
    try {
      const nombresAlumno = dataset.planes.filter((p) => p.alumno_id === alumnoElegido).map((p) => p.nombre);
      const nombrePropuesto = nombreUnico(asignando.nombre, nombresAlumno);
      const nuevoId = await asignarRutinaAAlumno(
        asignando.id,
        alumnoElegido,
        undefined,
        nombrePropuesto !== asignando.nombre ? nombrePropuesto : undefined,
      );
      const fresco = await recargar();
      let clon = fresco.planes.find((p) => p.id === nuevoId) ?? null;
      if (clon && (!clon.tags || clon.tags.length === 0) && asignando.tags && asignando.tags.length > 0) {
        clon.tags = heredarTagsDePlantilla(asignando, clon);
      }
      const alumnoId = alumnoElegido;
      setAsignando(null);
      setAlumnoElegido("");
      if (clon) {
        setBuilder({ plan: clon, alumnoId });
        setActiveMainTab("constructor");
      }
      else setAviso("La rutina se asignó, pero no pudimos cargarla. Recarga la página para verla.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos asignar la rutina. Intenta de nuevo.");
    } finally {
      setEnCurso(false);
    }
  };

  const cambiarEstado = async (accion: () => Promise<void>) => {
    setError(null);
    setAviso(null);
    try {
      await accion();
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cambiar el estado. Intenta de nuevo.");
    }
  };

  const fila = (plan: PlanEntrenamiento, opciones: { alumno?: boolean; archivada?: boolean }) => {
    const origen = plan.plan_origen_id ? dataset.planes.find((p) => p.id === plan.plan_origen_id) : undefined;
    const diasPlan = dataset.dias.filter((d) => d.plan_id === plan.id);
    const idsDias = new Set(diasPlan.map((d) => d.id));
    const cantEjercicios = dataset.ejerciciosEnRutina.filter((e) => idsDias.has(e.dia_id)).length;
    const msDia = 86_400_000;
    const diasDesdeInicio = plan.fecha_inicio
      ? Math.max(0, Math.floor((Date.now() - new Date(plan.fecha_inicio).getTime()) / msDia))
      : null;
    const diasParaVencer = plan.fecha_fin
      ? Math.ceil((new Date(plan.fecha_fin).getTime() - Date.now()) / msDia)
      : null;
    const estadoBadge =
      plan.estado === "ACTIVO"
        ? diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer <= 5
          ? { variant: "warning" as const, texto: `Vence en ${diasParaVencer} d` }
          : { variant: "success" as const, texto: "Vigente" }
        : plan.estado === "BORRADOR"
        ? { variant: "warning" as const, texto: "Borrador" }
        : { variant: "secondary" as const, texto: "Archivada" };
    const abrir = () => {
      setBuilder({ plan, alumnoId: plan.alumno_id ?? undefined });
      setActiveMainTab("constructor");
    };

    return (
      <li
        key={plan.id}
        data-testid="rutina-item"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="m-0 truncate text-[15px] font-semibold text-foreground">{plan.nombre}</p>
            {plan.alumno_id && (
              <p className="m-0 truncate text-[13px] text-neutral-soft-foreground">{nombreAlumno(plan.alumno_id)}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-soft-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              aria-label={`Acciones de ${plan.nombre}`}
              data-testid="rutina-acciones-btn"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {!opciones.archivada && <DropdownMenuItem onClick={abrir}>Abrir</DropdownMenuItem>}
              {opciones.alumno && plan.estado !== "ACTIVO" && (
                <DropdownMenuItem onClick={() => void cambiarEstado(() => activarRutina(plan))}>Activar</DropdownMenuItem>
              )}
              {opciones.alumno && plan.estado === "ACTIVO" && (
                <DropdownMenuItem onClick={() => void cambiarEstado(() => archivarRutina(plan.id))}>Archivar</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {plan.etiqueta === "STANDARD" && <Badge variant="info">STANDARD</Badge>}
          {plan.tags && plan.tags.length > 0 && (
            <div className="contents" data-testid="rutina-tags-badges">
              {plan.tags.map((tag) => (
                <Badge key={tag} variant="secondary" data-testid={`badge-tag-${tagToSlug(tag)}`} data-tag={tag}>
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {opciones.alumno && <Badge variant={estadoBadge.variant}>{estadoBadge.texto}</Badge>}
        </div>

        {opciones.archivada && (
          <p className="m-0 text-[13px] text-neutral-soft-foreground">
            Creada {formatFecha(plan.fecha_inicio)} · archivada {formatFecha(plan.fecha_fin)}
            {origen && ` · desde “${origen.nombre}” (${formatFecha(origen.fecha_inicio)})`}
          </p>
        )}

        <div className="mt-auto flex items-center gap-4 border-t border-border pt-3 text-[13px] text-neutral-soft-foreground">
          <span>
            {diasPlan.length} {diasPlan.length === 1 ? "día" : "días"}
          </span>
          <span>
            {cantEjercicios} {cantEjercicios === 1 ? "ejercicio" : "ejercicios"}
          </span>
          {diasDesdeInicio !== null && (
            <span className="ml-auto">{diasDesdeInicio === 0 ? "hoy" : `hace ${diasDesdeInicio} días`}</span>
          )}
        </div>

        {!opciones.alumno && !opciones.archivada && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-sm font-medium"
            onClick={() => {
              setError(null);
              setAsignando(plan);
            }}
          >
            Asignar a alumno
          </Button>
        )}
      </li>
    );
  };

  const renderEmptyState = (tipo: "plantillas" | "alumnos" | "borradores" | "archivadas") => {
    const tieneFiltros = (selectedTag && selectedTag !== "Todos") || busqueda.trim().length > 0;

    if (tipo === "plantillas") {
      if (tieneFiltros) {
        return (
          <EmptyState
            data-testid="empty-state-plantillas-filtradas"
            icon={<FileText className="h-6 w-6" />}
            title="No se encontraron plantillas"
            description="No hay plantillas maestras que coincidan con los filtros seleccionados."
            action={
              <Button
                size="touch"
                variant="outline"
                onClick={() => {
                  setSelectedTag("Todos");
                  setBusqueda("");
                }}
              >
                Limpiar filtros
              </Button>
            }
          />
        );
      }

      return (
        <EmptyState
          data-testid="empty-state-plantillas"
          icon={<FileText className="h-6 w-6" />}
          title="Todavía no hay plantillas."
          description="Creá una plantilla base reutilizable para acelerar la asignación a tus alumnos o explorá las rutinas ya asignadas."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="touch"
                onClick={() => {
                  setBuilder({ plan: null });
                  setActiveMainTab("constructor");
                }}
                data-testid="btn-crear-plantilla"
              >
                Crear plantilla
              </Button>
              {deAlumnos.length > 0 && (
                <Button
                  size="touch"
                  variant="outline"
                  onClick={() => setSubTab("alumnos")}
                  data-testid="btn-ver-rutinas-alumnos"
                >
                  Ver rutinas de alumnos
                </Button>
              )}
            </div>
          }
        />
      );
    }

    if (tipo === "alumnos") {
      if (tieneFiltros) {
        return (
          <EmptyState
            data-testid="empty-state-alumnos-filtradas"
            icon={<Dumbbell className="h-6 w-6" />}
            title="No se encontraron rutinas vigentes"
            description="No hay rutinas de alumnos que coincidan con los filtros seleccionados."
            action={
              <Button
                size="touch"
                variant="outline"
                onClick={() => {
                  setSelectedTag("Todos");
                  setBusqueda("");
                }}
              >
                Limpiar filtros
              </Button>
            }
          />
        );
      }

      return (
        <EmptyState
          data-testid="empty-state-alumnos"
          icon={<Dumbbell className="h-6 w-6" />}
          title="Ningún alumno tiene rutina."
          description="Asigná una rutina a tus alumnos desde una plantilla o creá una nueva rutina desde cero."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="touch"
                onClick={() => {
                  setBuilder({ plan: null });
                  setActiveMainTab("constructor");
                }}
                data-testid="btn-crear-rutina-alumnos"
              >
                Crear plantilla
              </Button>
              {plantillas.length > 0 && (
                <Button
                  size="touch"
                  variant="outline"
                  onClick={() => setSubTab("plantillas")}
                  data-testid="btn-ver-plantillas"
                >
                  Ver plantillas
                </Button>
              )}
            </div>
          }
        />
      );
    }

    if (tipo === "borradores") {
      return (
        <EmptyState
          data-testid="empty-state-borradores"
          icon={<FileText className="h-6 w-6" />}
          title={tieneFiltros ? "No se encontraron borradores" : "No hay borradores."}
          description={
            tieneFiltros
              ? "No hay borradores que coincidan con los filtros seleccionados."
              : "Las rutinas en edición o pendientes de asignación aparecerán aquí."
          }
          action={
            tieneFiltros ? (
              <Button
                size="touch"
                variant="outline"
                onClick={() => {
                  setSelectedTag("Todos");
                  setBusqueda("");
                }}
              >
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      );
    }

    return (
      <EmptyState
        data-testid="empty-state-archivadas"
        icon={<FileText className="h-6 w-6" />}
        title={tieneFiltros ? "No se encontraron rutinas archivadas" : "No hay rutinas archivadas."}
        description={
          tieneFiltros
            ? "No hay rutinas archivadas que coincidan con los filtros seleccionados."
            : "Las rutinas dadas de baja o reemplazadas se guardan aquí para consulta histórica."
        }
        action={
          tieneFiltros ? (
            <Button
              size="touch"
              variant="outline"
              onClick={() => {
                setSelectedTag("Todos");
                setBusqueda("");
              }}
            >
              Limpiar filtros
            </Button>
          ) : undefined
        }
      />
    );
  };

  const lista = (
    planes: PlanEntrenamiento[],
    opciones: { alumno?: boolean; archivada?: boolean },
    tipo: "plantillas" | "alumnos" | "borradores" | "archivadas",
  ) =>
    planes.length === 0 ? (
      renderEmptyState(tipo)
    ) : (
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">{planes.map((p) => fila(p, opciones))}</ul>
    );

  return (
    <section className="flex flex-col gap-5" data-testid="rutinas-library">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">Rutinas</h1>
          <p className="m-0 mt-1 text-sm text-neutral-soft-foreground">
            Plantillas reutilizables y rutinas asignadas a cada alumno.
          </p>
        </div>
        {activeMainTab === "biblioteca" && (
          <Button
            className="h-9 px-3.5 text-sm font-medium"
            onClick={() => {
              setBuilder({ plan: null });
              setActiveMainTab("constructor");
            }}
            data-testid="btn-nueva-rutina"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nueva rutina
          </Button>
        )}
      </header>

      {/* Tabs principales 2x1: Tab 1 Biblioteca & Plantillas, Tab 2 Constructor Visual */}
      <Tabs
        value={activeMainTab}
        onValueChange={(val) => {
          if (val === "constructor" && !builder) {
            setBuilder({ plan: null });
          }
          setActiveMainTab(val as "biblioteca" | "constructor");
        }}
        className="w-full"
      >
        <TabsList className={activeMainTab === "constructor" ? "w-full sm:w-auto" : "sr-only"} data-testid="rutinas-main-nav-tabs">
          <TabsTrigger value="biblioteca" data-testid="tab-biblioteca-plantillas">
            Biblioteca &amp; Plantillas
          </TabsTrigger>
          <TabsTrigger value="constructor" data-testid="tab-constructor-visual">
            Constructor Visual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="biblioteca" className="space-y-4 pt-3">
          {aviso && (
            <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-3 text-sm text-amber-300">
              {aviso}
            </p>
          )}

          <Tabs value={subTab} onValueChange={setSubTab} className="w-full space-y-4">
            {/* Header Unificado: Selectores de Pestañas ('De alumnos', 'Plantillas', ...) + Barra de Filtros (Búsqueda y Objetivos) */}
            <div
              className="flex flex-col gap-3 border-b border-border pb-4"
              data-testid="rutinas-filters-container"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                {/* Selectores de pestañas */}
                <div className="w-full sm:w-auto overflow-x-auto touch-pan-x overscroll-x-contain py-0.5">
                  <TabsList
                    className="inline-flex h-9 w-max min-w-full sm:min-w-0 sm:w-auto items-center justify-start p-1 rounded-lg bg-secondary/60 text-muted-foreground"
                    data-testid="rutinas-sub-tabs"
                  >
                    <TabsTrigger
                      value="alumnos"
                      data-testid="tab-de-alumnos"
                      aria-label="De alumnos"
                      className="h-7 px-3 text-[13px] font-medium shrink-0"
                    >
                      De alumnos <span className="text-subtle-foreground tabular-nums">{vigentesFiltradas.length}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="plantillas"
                      data-testid="tab-plantillas-maestras"
                      aria-label="Plantillas maestras"
                      className="h-7 px-3 text-[13px] font-medium shrink-0"
                    >
                      Plantillas <span className="text-subtle-foreground tabular-nums">{plantillasFiltradas.length}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="borradores"
                      data-testid="tab-borradores"
                      className="h-7 px-3 text-[13px] font-medium shrink-0"
                    >
                      Borradores <span className="text-subtle-foreground tabular-nums">{borradoresFiltrados.length}</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="archivadas"
                      data-testid="tab-archivadas"
                      className="h-7 px-3 text-[13px] font-medium shrink-0"
                    >
                      Archivadas <span className="text-subtle-foreground tabular-nums">{archivadasFiltradas.length}</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Filtros: Búsqueda y Chips de Objetivos */}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  {/* Buscador reactivo */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="search"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar por nombre o alumno"
                      aria-label="Buscar rutinas"
                      data-testid="search-rutinas-input"
                      className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {busqueda && (
                      <button
                        type="button"
                        onClick={() => setBusqueda("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                        aria-label="Limpiar búsqueda"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filtro por objetivo (objetivo Rutinas.html: selector "Todos los objetivos") */}
                  <div data-testid="rutinas-tags-filter">
                    <select
                      value={selectedTag || "Todos"}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      aria-label="Filtrar por objetivo"
                      data-testid="rutinas-objetivo-select"
                      className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground cursor-pointer"
                    >
                      {TAGS_FILTRO_BIBLIOTECA.map((tag) => (
                        <option key={tag} value={tag} data-testid={`tag-filter-${tagToSlug(tag)}`}>
                          {tag === "Todos" ? "Todos los objetivos" : tag}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <TabsContent value="alumnos">
              {lista(vigentesFiltradas, { alumno: true }, "alumnos")}
            </TabsContent>
            <TabsContent value="plantillas">
              {lista(plantillasFiltradas, {}, "plantillas")}
            </TabsContent>
            <TabsContent value="borradores">
              {lista(borradoresFiltrados, { alumno: true }, "borradores")}
            </TabsContent>
            <TabsContent value="archivadas">
              {lista(archivadasFiltradas, { alumno: true, archivada: true }, "archivadas")}
            </TabsContent>
          </Tabs>

          {error && !asignando && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
        </TabsContent>

        <TabsContent value="constructor" className="space-y-4 pt-3">
          <RoutineBuilderModal
            isOpen={activeMainTab === "constructor"}
            embedded={true}
            onClose={() => {
              setBuilder(null);
              setActiveMainTab("biblioteca");
            }}
            catalogoEjercicios={dataset.ejercicios}
            alumnoId={builder?.alumnoId}
            alumnoNombre={builder?.alumnoId ? nombreAlumno(builder.alumnoId) : "Plantilla Maestra"}
            planInicial={builder?.plan ?? null}
            nombresExistentes={nombresExistentes}
            soloLectura={!!builder?.plan && builder.plan.estado === "INACTIVO" && dataset.planes.some((p) => p.plan_origen_id === builder.plan?.id)}
            diasIniciales={dataset.dias}
            ejerciciosEnRutinaIniciales={dataset.ejerciciosEnRutina}
            onRoutineSaved={() => void recargar()}
          />
        </TabsContent>
      </Tabs>

      <dialog
        ref={dialogRef}
        onClose={cerrarAsignacion}
        className="w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-5 text-foreground backdrop:bg-black/60"
      >
        <h2 className="text-lg font-bold">Asignar “{asignando?.nombre}”</h2>
        <label className="mt-4 block text-sm font-semibold" htmlFor="rutinas-alumno">
          Alumno
        </label>
        <select
          id="rutinas-alumno"
          value={alumnoElegido}
          onChange={(e) => setAlumnoElegido(e.target.value)}
          className="mt-1 min-h-12 w-full rounded-xl border border-border bg-background px-3"
        >
          <option value="">Elegí un alumno</option>
          {dataset.alumnos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre_completo}
            </option>
          ))}
        </select>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="touch" onClick={cerrarAsignacion}>
            Cancelar
          </Button>
          <Button size="touch" disabled={!alumnoElegido || enCurso} onClick={confirmarAsignacion}>
            {enCurso ? "Asignando…" : "Asignar"}
          </Button>
        </div>
      </dialog>
    </section>
  );
}
