"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  filtrarEjercicios,
  GRUPOS_MUSCULARES_CATALOGO,
  tagToSlug,
} from "@/lib/rutinas-biblioteca";
import { getYouTubeEmbedUrl, extractYouTubeVideoId } from "@/lib/youtube";
import { createClient } from "@/lib/supabase/browser";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Video,
  AlertTriangle,
} from "@/components/ui/icons";
import type { Ejercicio, EjercicioEnRutina } from "@/types/database.types";

export interface EjerciciosLibraryTabProps {
  ejercicios: Ejercicio[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  isNuevoOpen?: boolean;
  onOpenNuevoChange?: (open: boolean) => void;
  onEjercicioCreated?: (nuevo: Ejercicio) => void;
  onEjercicioUpdated?: (actualizado: Ejercicio) => void;
  onEjercicioDeleted?: (id: string) => void;
  onRecargar?: () => Promise<any>;
}

function parseMusculosInput(input: string): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

export function EjerciciosLibraryTab({
  ejercicios,
  ejerciciosEnRutina,
  isNuevoOpen = false,
  onOpenNuevoChange,
  onEjercicioCreated,
  onEjercicioUpdated,
  onEjercicioDeleted,
  onRecargar,
}: EjerciciosLibraryTabProps) {
  const [busqueda, setBusqueda] = React.useState("");
  const [grupoMuscular, setGrupoMuscular] = React.useState("Todos");

  // Estado del Diálogo Formulario (Crear / Editar)
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingEjercicio, setEditingEjercicio] = React.useState<Ejercicio | null>(null);

  // Campos del formulario
  const [nombre, setNombre] = React.useState("");
  const [musculos, setMusculos] = React.useState("");
  const [musculosSecundarios, setMusculosSecundarios] = React.useState("");
  const [urlVideo, setUrlVideo] = React.useState("");
  const [comentario, setComentario] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Estado del Diálogo de Eliminación
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deletingEjercicio, setDeletingEjercicio] = React.useState<Ejercicio | null>(null);

  // Estado del Diálogo de Preview de Video
  const [videoPreviewEjercicio, setVideoPreviewEjercicio] = React.useState<Ejercicio | null>(null);

  // Sincronizar trigger externo para 'Nuevo Ejercicio'
  React.useEffect(() => {
    if (isNuevoOpen) {
      handleOpenCreate();
      onOpenNuevoChange?.(false);
    }
  }, [isNuevoOpen, onOpenNuevoChange]);

  const filteredEjercicios = React.useMemo(() => {
    return filtrarEjercicios(ejercicios, grupoMuscular, busqueda);
  }, [ejercicios, grupoMuscular, busqueda]);

  // Contar rutinas en las que se usa cada ejercicio
  const conteoUso = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const er of ejerciciosEnRutina) {
      mapa.set(er.ejercicio_id, (mapa.get(er.ejercicio_id) ?? 0) + 1);
    }
    return mapa;
  }, [ejerciciosEnRutina]);

  const handleOpenCreate = () => {
    setEditingEjercicio(null);
    setNombre("");
    setMusculos("");
    setMusculosSecundarios("");
    setUrlVideo("");
    setComentario("");
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (ej: Ejercicio) => {
    setEditingEjercicio(ej);
    setNombre(ej.nombre);
    setMusculos((ej.musculos_principales || []).join(", "));
    setMusculosSecundarios((ej.musculos_secundarios || []).join(", "));
    setUrlVideo(ej.url_video || "");
    setComentario(ej.comentario || "");
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenDelete = (ej: Ejercicio) => {
    setDeletingEjercicio(ej);
    setDeleteDialogOpen(true);
  };

  const handleSaveEjercicio = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      setFormError("El nombre del ejercicio es obligatorio.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const musculosPrincipalesArray = parseMusculosInput(musculos);
    const musculosSecundariosArray = parseMusculosInput(musculosSecundarios);
    const videoTrim = urlVideo.trim() || null;
    const comentarioTrim = comentario.trim() || null;
    const nowIso = new Date().toISOString();

    try {
      if (editingEjercicio) {
        // Actualizar ejercicio existente
        const actualizado: Ejercicio = {
          ...editingEjercicio,
          nombre: nombreTrim,
          musculos_principales: musculosPrincipalesArray,
          musculos_secundarios: musculosSecundariosArray,
          url_video: videoTrim,
          comentario: comentarioTrim,
          updated_at: nowIso,
        };

        try {
          const supabase = createClient();
          if (supabase && typeof supabase.from === "function") {
            const { error: sbError } = await supabase
              .from("ejercicios")
              .update({
                nombre: actualizado.nombre,
                musculos_principales: actualizado.musculos_principales,
                musculos_secundarios: actualizado.musculos_secundarios,
                url_video: actualizado.url_video,
                comentario: actualizado.comentario,
                updated_at: actualizado.updated_at,
              })
              .eq("id", editingEjercicio.id);

            if (sbError) {
              console.warn("Supabase update error:", sbError.message);
            }
          }
        } catch (sbErr) {
          console.warn("Supabase client warning (offline/mock):", sbErr);
        }

        onEjercicioUpdated?.(actualizado);
      } else {
        // Crear nuevo ejercicio
        const nuevoId = crypto.randomUUID();
        const nuevo: Ejercicio = {
          id: nuevoId,
          nombre: nombreTrim,
          musculos_principales: musculosPrincipalesArray,
          musculos_secundarios: musculosSecundariosArray,
          url_video: videoTrim,
          comentario: comentarioTrim,
          creado_por: null,
          created_at: nowIso,
          updated_at: nowIso,
        };

        try {
          const supabase = createClient();
          if (supabase && typeof supabase.from === "function") {
            const { error: sbError } = await supabase.from("ejercicios").insert(nuevo);
            if (sbError) {
              console.warn("Supabase insert error:", sbError.message);
            }
          }
        } catch (sbErr) {
          console.warn("Supabase client warning (offline/mock):", sbErr);
        }

        onEjercicioCreated?.(nuevo);
      }

      setDialogOpen(false);
      if (onRecargar) {
        void onRecargar();
      }
    } catch (err: any) {
      setFormError(err?.message || "Ocurrió un error al guardar el ejercicio.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmarEliminar = async () => {
    if (!deletingEjercicio) return;
    const cantEnUso = conteoUso.get(deletingEjercicio.id) ?? 0;
    if (cantEnUso > 0) {
      // Bloqueado: en uso
      return;
    }

    try {
      try {
        const supabase = createClient();
        if (supabase && typeof supabase.from === "function") {
          const { error: sbError } = await supabase
            .from("ejercicios")
            .delete()
            .eq("id", deletingEjercicio.id);
          if (sbError) {
            console.warn("Supabase delete error:", sbError.message);
          }
        }
      } catch (sbErr) {
        console.warn("Supabase delete error (offline/mock):", sbErr);
      }

      onEjercicioDeleted?.(deletingEjercicio.id);
      setDeleteDialogOpen(false);
      setDeletingEjercicio(null);
      if (onRecargar) {
        void onRecargar();
      }
    } catch (err: any) {
      console.error("Error al eliminar ejercicio:", err);
    }
  };

  const deletingEnUsoCount = deletingEjercicio ? conteoUso.get(deletingEjercicio.id) ?? 0 : 0;

  return (
    <div className="space-y-4" data-testid="ejercicios-library-tab">
      {/* Barra de Filtros: Búsqueda y Chips de Grupos Musculares */}
      <div
        className="flex flex-col gap-3 border-b border-border pb-4"
        data-testid="ejercicios-filters-container"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Chips de filtro por grupo muscular */}
          <div className="w-full sm:w-auto overflow-x-auto touch-pan-x overscroll-x-contain py-0.5">
            <div
              className="inline-flex h-9 w-max min-w-full sm:min-w-0 sm:w-auto items-center justify-start gap-1 p-1 rounded-lg bg-secondary/60 text-muted-foreground"
              data-testid="ejercicios-musculo-filter"
            >
              {GRUPOS_MUSCULARES_CATALOGO.map((grupo) => {
                const isSelected = grupoMuscular === grupo;
                const slug = tagToSlug(grupo);
                return (
                  <button
                    key={grupo}
                    type="button"
                    onClick={() => setGrupoMuscular(grupo)}
                    data-testid={`filtro-musculo-${slug}`}
                    aria-pressed={isSelected}
                    className={`h-7 px-3 text-[13px] font-medium shrink-0 rounded-md transition-colors ${
                      isSelected
                        ? "bg-background text-foreground font-semibold shadow-xs"
                        : "hover:bg-background/50 hover:text-foreground"
                    }`}
                  >
                    {grupo}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Búsqueda y botón de acción */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o músculo..."
                data-testid="search-ejercicios-input"
                className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <Button
              className="h-9 px-3.5 text-sm font-medium shrink-0"
              onClick={handleOpenCreate}
              data-testid="btn-nuevo-ejercicio"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo Ejercicio
            </Button>
          </div>
        </div>
      </div>

      {/* Listado de Ejercicios */}
      {filteredEjercicios.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-border p-8 text-center"
          data-testid="empty-state-ejercicios"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground mb-3">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            No se encontraron ejercicios
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
            {busqueda || grupoMuscular !== "Todos"
              ? "No hay ejercicios que coincidan con los filtros aplicados. Podés limpiar la búsqueda o cambiar de grupo muscular."
              : "Todavía no hay ejercicios en el catálogo maestro. Podés comenzar agregando el primero."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {(busqueda || grupoMuscular !== "Todos") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBusqueda("");
                  setGrupoMuscular("Todos");
                }}
                data-testid="btn-limpiar-filtros-ejercicios"
              >
                Limpiar filtros
              </Button>
            )}
            <Button size="sm" onClick={handleOpenCreate} data-testid="btn-crear-primer-ejercicio">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nuevo Ejercicio
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5"
          data-testid="ejercicios-list"
        >
          {filteredEjercicios.map((ej) => {
            const cantEnUso = conteoUso.get(ej.id) ?? 0;
            const tieneVideo = Boolean(ej.url_video && extractYouTubeVideoId(ej.url_video));

            return (
              <div
                key={ej.id}
                data-testid={`ejercicio-card-${ej.id}`}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-sm text-foreground leading-snug">
                      {ej.nombre}
                    </h4>
                    {cantEnUso > 0 && (
                      <span
                        data-testid={`ejercicio-uso-${ej.id}`}
                        className="inline-flex items-center shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300"
                        title={`En uso en ${cantEnUso} rutina(s)`}
                      >
                        En {cantEnUso} {cantEnUso === 1 ? "rutina" : "rutinas"}
                      </span>
                    )}
                  </div>

                  {/* Badges de músculos */}
                  <div className="flex flex-wrap gap-1 mb-2.5">
                    {(ej.musculos_principales || []).map((m, idx) => (
                      <span
                        key={idx}
                        className="rounded-full border border-border/80 bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-foreground"
                      >
                        {m}
                      </span>
                    ))}
                    {(ej.musculos_secundarios || []).map((m, idx) => (
                      <span
                        key={`sec-${idx}`}
                        className="rounded-full border border-border/40 bg-secondary/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {m}
                      </span>
                    ))}
                  </div>

                  {/* Comentario o descripción */}
                  {ej.comentario && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {ej.comentario}
                    </p>
                  )}
                </div>

                {/* Pie con Video y Acciones */}
                <div className="flex items-center justify-between pt-3 border-t border-border/60 mt-2 gap-2">
                  <div>
                    {tieneVideo ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 gap-1"
                        onClick={() => setVideoPreviewEjercicio(ej)}
                        data-testid={`btn-preview-video-${ej.id}`}
                      >
                        <Video className="h-3.5 w-3.5" />
                        Video YouTube
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Sin video</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs font-medium"
                      onClick={() => handleOpenEdit(ej)}
                      data-testid={`btn-editar-ejercicio-${ej.id}`}
                      aria-label={`Editar ejercicio ${ej.nombre}`}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleOpenDelete(ej)}
                      data-testid={`btn-eliminar-ejercicio-${ej.id}`}
                      aria-label={`Eliminar ejercicio ${ej.nombre}`}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Diálogo Accesible para Crear o Editar Ejercicio */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-ejercicio">
          <form onSubmit={handleSaveEjercicio}>
            <DialogHeader>
              <DialogTitle data-testid="dialog-ejercicio-title">
                {editingEjercicio ? "Editar Ejercicio" : "Nuevo Ejercicio"}
              </DialogTitle>
              <DialogDescription>
                Completá los datos del ejercicio para el catálogo maestro de rutinas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2">
              <div>
                <label
                  htmlFor="ejercicio-nombre"
                  className="block text-xs font-semibold text-foreground mb-1"
                >
                  Nombre del ejercicio *
                </label>
                <input
                  id="ejercicio-nombre"
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Press Banca Plano, Sentadilla con Barra..."
                  data-testid="input-ejercicio-nombre"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="ejercicio-musculos"
                  className="block text-xs font-semibold text-foreground mb-1"
                >
                  Músculos principales (separados por coma)
                </label>
                <input
                  id="ejercicio-musculos"
                  type="text"
                  value={musculos}
                  onChange={(e) => setMusculos(e.target.value)}
                  placeholder="Ej. Pecho, Tríceps, Deltoides Anterior"
                  data-testid="input-ejercicio-musculos"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="ejercicio-musculos-sec"
                  className="block text-xs font-semibold text-foreground mb-1"
                >
                  Músculos secundarios (opcional)
                </label>
                <input
                  id="ejercicio-musculos-sec"
                  type="text"
                  value={musculosSecundarios}
                  onChange={(e) => setMusculosSecundarios(e.target.value)}
                  placeholder="Ej. Core, Serrato anterior"
                  data-testid="input-ejercicio-musculos-secundarios"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="ejercicio-video"
                  className="block text-xs font-semibold text-foreground mb-1"
                >
                  URL de Video (YouTube)
                </label>
                <input
                  id="ejercicio-video"
                  type="url"
                  value={urlVideo}
                  onChange={(e) => setUrlVideo(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  data-testid="input-ejercicio-video"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {urlVideo && extractYouTubeVideoId(urlVideo) && (
                  <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    ✓ Video válido de YouTube detectado
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="ejercicio-comentarios"
                  className="block text-xs font-semibold text-foreground mb-1"
                >
                  Comentarios / Indicaciones técnicas
                </label>
                <textarea
                  id="ejercicio-comentarios"
                  rows={3}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Recomendaciones de ejecución, rango de movimiento, postura..."
                  data-testid="input-ejercicio-comentarios"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {formError && (
                <p role="alert" className="text-xs text-destructive font-medium">
                  {formError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                onClick={() => handleSaveEjercicio()}
                disabled={!nombre.trim() || isSubmitting}
                data-testid="btn-guardar-ejercicio"
              >
                {isSubmitting ? "Guardando..." : "Guardar ejercicio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmación para Eliminar Ejercicio */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md" data-testid="modal-confirmar-eliminar-ejercicio">
          <DialogHeader>
            <DialogTitle data-testid="dialog-eliminar-title">
              ¿Eliminar ejercicio del catálogo?
            </DialogTitle>
            <DialogDescription data-testid="dialog-eliminar-descripcion">
              ¿Estás seguro de que querés eliminar “{deletingEjercicio?.nombre}”?
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {deletingEnUsoCount > 0 ? (
              <div
                role="alert"
                className="rounded-lg border border-amber-500/40 bg-amber-500/15 p-3 text-xs text-amber-300 space-y-1"
                data-testid="alerta-ejercicio-en-uso"
              >
                <div className="flex items-center gap-1.5 font-bold text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Ejercicio en uso ({deletingEnUsoCount} {deletingEnUsoCount === 1 ? "instancia" : "instancias"} en rutinas)</span>
                </div>
                <p>
                  No se puede eliminar este ejercicio porque forma parte de planes de entrenamiento configurados. Desvinculalo primero de las rutinas antes de removerlo del catálogo maestro.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Esta acción eliminará permanentemente el ejercicio del catálogo maestro.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingEnUsoCount > 0}
              onClick={handleConfirmarEliminar}
              data-testid="btn-confirmar-eliminar"
            >
              {deletingEnUsoCount > 0 ? "Eliminar bloqueado" : "Eliminar ejercicio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Preview de Video YouTube */}
      <Dialog
        open={Boolean(videoPreviewEjercicio)}
        onOpenChange={(open) => !open && setVideoPreviewEjercicio(null)}
      >
        <DialogContent className="max-w-lg p-4" data-testid="modal-video-preview">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-sm font-semibold">
              {videoPreviewEjercicio?.nombre}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Vista previa del video técnico
            </DialogDescription>
          </DialogHeader>

          {videoPreviewEjercicio && getYouTubeEmbedUrl(videoPreviewEjercicio.url_video) ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe
                src={getYouTubeEmbedUrl(videoPreviewEjercicio.url_video)!}
                title={`Video de técnica para ${videoPreviewEjercicio.nombre}`}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                data-testid="youtube-preview-iframe"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No hay una URL válida de YouTube para este ejercicio.
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVideoPreviewEjercicio(null)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
