"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoutineBuilderModal } from "@/components/coach/routine-builder/routine-builder-modal";
import {
  clasificarRutinas,
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

export function RutinasLibrary({ initialDataset }: { initialDataset: LiveSupabaseDataset }) {
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
    return (
    <li
      key={plan.id}
      data-testid="rutina-item"
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-bold">{plan.nombre}</p>
          {plan.etiqueta === "STANDARD" && <Badge variant="info">STANDARD</Badge>}
          {opciones.alumno && (
            <Badge variant={plan.estado === "ACTIVO" ? "success" : plan.estado === "BORRADOR" ? "warning" : "secondary"}>
              {plan.estado}
            </Badge>
          )}
          {plan.tags && plan.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="rutina-tags-badges">
              {plan.tags.map((tag) => {
                const styles = getTagBadgeStyles(tag);
                const slug = tagToSlug(tag);
                return (
                  <span
                    key={tag}
                    data-testid={`badge-tag-${slug}`}
                    data-tag={tag}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold select-none transition-colors ${styles.className}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${styles.dotColor}`} />
                    {tag}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {plan.alumno_id && <p className="text-sm text-muted-foreground">{nombreAlumno(plan.alumno_id)}</p>}
        {opciones.archivada && (
          <p className="text-sm text-muted-foreground">
            Creada {formatFecha(plan.fecha_inicio)} · archivada {formatFecha(plan.fecha_fin)}
            {origen && ` · desde “${origen.nombre}” (${formatFecha(origen.fecha_inicio)})`}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {!opciones.archivada && (
          <Button
            size="touch"
            variant="outline"
            onClick={() => {
              setBuilder({ plan, alumnoId: plan.alumno_id ?? undefined });
              setActiveMainTab("constructor");
            }}
          >
            Abrir
          </Button>
        )}
        {opciones.alumno && plan.estado !== "ACTIVO" && (
          <Button size="touch" onClick={() => void cambiarEstado(() => activarRutina(plan))}>
            Activar
          </Button>
        )}
        {opciones.alumno && plan.estado === "ACTIVO" && (
          <Button size="touch" variant="outline" onClick={() => void cambiarEstado(() => archivarRutina(plan.id))}>
            Archivar
          </Button>
        )}
        {!opciones.alumno && !opciones.archivada && (
          <Button size="touch" onClick={() => {
              setError(null);
              setAsignando(plan);
            }}>
            Asignar a alumno
          </Button>
        )}
      </div>
    </li>
    );
  };

  const lista = (planes: PlanEntrenamiento[], opciones: { alumno?: boolean; archivada?: boolean }, vacio: string) =>
    planes.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">{vacio}</p>
    ) : (
      <ul className="flex flex-col gap-3">{planes.map((p) => fila(p, opciones))}</ul>
    );

  return (
    <section className="flex flex-col gap-4 p-4 sm:p-6" data-testid="rutinas-library">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Rutinas &amp; Constructor</h1>
          <p className="text-xs text-muted-foreground">
            Gestión unificada 2x1: Biblioteca de plantillas y constructor visual a pantalla completa
          </p>
        </div>
        {activeMainTab === "biblioteca" && (
          <Button
            size="touch"
            onClick={() => {
              setBuilder({ plan: null });
              setActiveMainTab("constructor");
            }}
            data-testid="btn-nueva-rutina"
          >
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
        <TabsList className="w-full sm:w-auto" data-testid="rutinas-main-nav-tabs">
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

          {/* Barra de Filtros: Búsqueda Reactiva y Chips de Tags de Rutina */}
          <div
            className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-3 sm:p-4"
            data-testid="rutinas-filters-container"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Buscador reactivo */}
              <div className="relative w-full sm:max-w-xs">
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar rutina por nombre o notas..."
                  aria-label="Buscar rutinas"
                  data-testid="search-rutinas-input"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => setBusqueda("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Chips horizontales de Tags */}
              <div
                className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none"
                role="toolbar"
                aria-label="Filtro por tags de rutina"
                data-testid="rutinas-tags-filter"
              >
                {TAGS_FILTRO_BIBLIOTECA.map((tag) => {
                  const isSelected = selectedTag === tag || (tag === "Todos" && (!selectedTag || selectedTag === "Todos"));
                  const slug = tagToSlug(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTag(isSelected && tag !== "Todos" ? "Todos" : tag)}
                      aria-pressed={isSelected}
                      data-testid={`tag-filter-${slug}`}
                      data-filter-tag={tag}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all cursor-pointer font-bold select-none ${getTagChipFilterStyles(
                        tag,
                        isSelected,
                      )}`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Tabs defaultValue="plantillas">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="plantillas">Plantillas ({plantillasFiltradas.length})</TabsTrigger>
              <TabsTrigger value="alumnos">De alumnos ({vigentesFiltradas.length})</TabsTrigger>
              <TabsTrigger value="borradores">Borradores ({borradoresFiltrados.length})</TabsTrigger>
              <TabsTrigger value="archivadas">Archivadas ({archivadasFiltradas.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="plantillas">
              {lista(
                plantillasFiltradas,
                {},
                selectedTag !== "Todos" || busqueda
                  ? "No se encontraron plantillas con los filtros seleccionados."
                  : "Todavía no hay plantillas.",
              )}
            </TabsContent>
            <TabsContent value="alumnos">
              {lista(
                vigentesFiltradas,
                { alumno: true },
                selectedTag !== "Todos" || busqueda
                  ? "No se encontraron rutinas vigentes con los filtros seleccionados."
                  : "Ningún alumno tiene rutina.",
              )}
            </TabsContent>
            <TabsContent value="borradores">
              {lista(
                borradoresFiltrados,
                { alumno: true },
                selectedTag !== "Todos" || busqueda
                  ? "No se encontraron borradores con los filtros seleccionados."
                  : "No hay borradores.",
              )}
            </TabsContent>
            <TabsContent value="archivadas">
              {lista(
                archivadasFiltradas,
                { alumno: true, archivada: true },
                selectedTag !== "Todos" || busqueda
                  ? "No se encontraron rutinas archivadas con los filtros seleccionados."
                  : "No hay rutinas archivadas.",
              )}
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
