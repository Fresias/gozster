"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoutineBuilderModal } from "@/components/coach/routine-builder/routine-builder-modal";
import { clasificarRutinas, formatFecha, separarBorradores } from "@/lib/rutinas-biblioteca";
import { fetchLiveDatasetFromSupabase, type LiveSupabaseDataset } from "@/services/alumnos-service";
import { activarRutina, archivarRutina, asignarRutinaAAlumno } from "@/services/rutinas-service";
import type { PlanEntrenamiento } from "@/types/database.types";

export function RutinasLibrary({ initialDataset }: { initialDataset: LiveSupabaseDataset }) {
  const [dataset, setDataset] = React.useState(initialDataset);
  const [builder, setBuilder] = React.useState<{ plan: PlanEntrenamiento | null; alumnoId?: string } | null>(null);
  const [asignando, setAsignando] = React.useState<PlanEntrenamiento | null>(null);
  const [alumnoElegido, setAlumnoElegido] = React.useState("");
  const [enCurso, setEnCurso] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  const { plantillas, deAlumnos, archivadas } = clasificarRutinas(dataset.planes);
  const { vigentes, borradores } = separarBorradores(deAlumnos);
  const nombresExistentes = dataset.planes.map((p) => p.nombre);
  const nombreAlumno = (id: string | null) =>
    dataset.alumnos.find((a) => a.id === id)?.nombre_completo ?? "Alumno";

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
      const nuevoId = await asignarRutinaAAlumno(asignando.id, alumnoElegido);
      const fresco = await recargar();
      const clon = fresco.planes.find((p) => p.id === nuevoId) ?? null;
      const alumnoId = alumnoElegido;
      setAsignando(null);
      setAlumnoElegido("");
      if (clon) setBuilder({ plan: clon, alumnoId });
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
            onClick={() => setBuilder({ plan, alumnoId: plan.alumno_id ?? undefined })}
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
        <h1 className="text-2xl font-black">Rutinas</h1>
        <Button size="touch" onClick={() => setBuilder({ plan: null })}>
          Nueva rutina
        </Button>
      </header>

      {aviso && (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-3 text-sm text-amber-300">
          {aviso}
        </p>
      )}

      <Tabs defaultValue="plantillas">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="plantillas">Plantillas ({plantillas.length})</TabsTrigger>
          <TabsTrigger value="alumnos">De alumnos ({vigentes.length})</TabsTrigger>
          <TabsTrigger value="borradores">Borradores ({borradores.length})</TabsTrigger>
          <TabsTrigger value="archivadas">Archivadas ({archivadas.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="plantillas">{lista(plantillas, {}, "Todavía no hay plantillas.")}</TabsContent>
        <TabsContent value="alumnos">{lista(vigentes, { alumno: true }, "Ningún alumno tiene rutina.")}</TabsContent>
        <TabsContent value="borradores">{lista(borradores, { alumno: true }, "No hay borradores.")}</TabsContent>
        <TabsContent value="archivadas">
          {lista(archivadas, { alumno: true, archivada: true }, "No hay rutinas archivadas.")}
        </TabsContent>
      </Tabs>

      {error && !asignando && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}

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

      <RoutineBuilderModal
        isOpen={builder !== null}
        onClose={() => setBuilder(null)}
        catalogoEjercicios={dataset.ejercicios}
        alumnoId={builder?.alumnoId}
        alumnoNombre={builder?.alumnoId ? nombreAlumno(builder.alumnoId) : "Plantilla Maestra"}
        planInicial={builder?.plan ?? null}
        nombresExistentes={nombresExistentes}
        diasIniciales={dataset.dias}
        ejerciciosEnRutinaIniciales={dataset.ejerciciosEnRutina}
        onRoutineSaved={() => void recargar()}
      />
    </section>
  );
}
