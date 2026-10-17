"use client";

import * as React from "react";
import type { Ejercicio } from "@/types/database.types";
import { Button } from "@/components/ui/button";

export interface QuickSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  alumnoNombre: string;
  alumnoId: string;
  ejercicioActual: string;
  dolorDetalle?: string;
  zona?: string;
  catalogoEjercicios: Ejercicio[];
  onSwapSuccess: (originalExercise: string, newExercise: string) => void;
}

interface BiomechanicalAlternative {
  nombre: string;
  musculos: string;
  ventaja: string;
  descripcion: string;
}

/**
 * Modal de Sustitución Rápida (Quick Swap) ante Alertas de Dolor Articular 🚨.
 * Pre-filtra alternativas biomecánicamente seguras de la biblioteca de ejercicios
 * para reemplazar el movimiento lesivo en 1 toque (fat-finger friendly).
 */
export function QuickSwapModal({
  isOpen,
  onClose,
  alumnoNombre,
  alumnoId: _alumnoId,
  ejercicioActual,
  dolorDetalle,
  zona,
  catalogoEjercicios,
  onSwapSuccess,
}: QuickSwapModalProps) {
  const [searchQuery, setSearchQuery] = React.useState("");

  if (!isOpen) return null;

  // Determinar sugerencias biomecánicas pre-filtradas según ejercicio o zona articular
  const isLowerBody =
    /sentadilla|squat|pierna|cuadriceps|prensa/i.test(ejercicioActual) ||
    /rodilla/i.test(zona || "") ||
    /rodilla/i.test(dolorDetalle || "");

  const isChestShoulder =
    /banca|press|pecho|hombro|militar/i.test(ejercicioActual) ||
    /hombro|codo/i.test(zona || "") ||
    /hombro|codo/i.test(dolorDetalle || "");

  let defaultAlternatives: BiomechanicalAlternative[] = [];

  if (isLowerBody) {
    defaultAlternatives = [
      {
        nombre: "Prensa de Piernas a 45°",
        musculos: "Cuádriceps, Glúteos",
        ventaja: "Cero carga axial en columna y menor tensión de cizalla en rodillas",
        descripcion: "Soporte dorsal completo con recorrido controlado.",
      },
      {
        nombre: "Hip Thrust con Barra",
        musculos: "Glúteos, Isquiosurales",
        ventaja: "Elimina totalmente el estrés sobre el tendón rotuliano",
        descripcion: "Patrón de bisagra horizontal sin flexión profunda de rodilla.",
      },
      {
        nombre: "Goblet Squat con Mancuerna en Talones Elevados",
        musculos: "Cuádriceps",
        ventaja: "Torso vertical que minimiza la palanca articular",
        descripcion: "Permite trabajar fuerza con carga moderada y máxima estabilidad.",
      },
      {
        nombre: "Peso Muerto Rumano con Mancuernas",
        musculos: "Cadena Posterior",
        ventaja: "Rodilla semirrígida que protege meniscos y ligamentos",
        descripcion: "Enfoque en extensión de cadera y control excéntrico.",
      },
    ];
  } else if (isChestShoulder) {
    defaultAlternatives = [
      {
        nombre: "Press con Mancuernas en Banco Plano (Agarre Neutro)",
        musculos: "Pectoral Mayor, Tríceps",
        ventaja: "El agarre neutro abre el espacio subacromial y desinflama el tendón del supraespinoso",
        descripcion: "Libre rotación de muñecas y codos adaptada a la anatomía del alumno.",
      },
      {
        nombre: "Floor Press con Mancuernas",
        musculos: "Pectoral, Tríceps",
        ventaja: "El piso bloquea la hiperextensión articular del hombro",
        descripcion: "Seguridad máxima en la fase excéntrica limitando el estiramiento lesivo.",
      },
      {
        nombre: "Cruce de Poleas en Banco a 30°",
        musculos: "Pectoral",
        ventaja: "Tensión constante con mínimo impacto en articulaciones glenohumerales",
        descripcion: "Trabajo continuo de hipertrofia sin puntos de máxima compresión articular.",
      },
      {
        nombre: "Press Inclinado con Mancuernas (30°)",
        musculos: "Pectoral Superior",
        ventaja: "Ángulo articular más amable que el press plano tradicional",
        descripcion: "Menor roce en la porción anterior de la cápsula articular.",
      },
    ];
  } else {
    defaultAlternatives = [
      {
        nombre: "Jalón al Pecho en Polea (Agarre Neutro Estrecho)",
        musculos: "Dorsal Ancho, Bíceps",
        ventaja: "Trayectoria guiada que reduce el estrés en codos y muñecas",
        descripcion: "Permite modular el peso y aislar la musculatura dorsal.",
      },
      {
        nombre: "Remo con Mancuerna con Apoyo en Banco",
        musculos: "Espalda Media, Dorsal",
        ventaja: "El soporte del banco descarga la musculatura lumbar",
        descripcion: "Estabilidad unilateral sin compresión vertebral.",
      },
      {
        nombre: "Remo en Polea Baja con Agarre V",
        musculos: "Dorsal, Trapecio",
        ventaja: "Tensión constante en línea biomecánica natural",
        descripcion: "Movimiento suave sin tirones balísticos.",
      },
    ];
  }

  // Filtrar alternativas según búsqueda
  const filteredAlternatives = defaultAlternatives.filter((alt) =>
    alt.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    alt.musculos.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // También permitir buscar directamente en el catálogo general de ejercicios
  const catalogMatches = searchQuery.trim().length > 1
    ? catalogoEjercicios.filter(
        (e) =>
          e.nombre.toLowerCase().includes(searchQuery.toLowerCase()) &&
          e.nombre.toLowerCase() !== ejercicioActual.toLowerCase()
      )
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-swap-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-destructive/40 bg-card p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header con botón de cierre */}
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive text-lg font-bold border border-destructive/30">
              🚨
            </span>
            <div>
              <h3
                id="quick-swap-title"
                className="text-base sm:text-lg font-black tracking-tight text-foreground flex items-center gap-2"
              >
                <span>Sustituir Ejercicio por Molestia Articular</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Atleta: <strong className="text-foreground">{alumnoNombre}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Tarjeta del Ejercicio con Reporte de Dolor */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-destructive uppercase tracking-wider text-[11px]">
              Movimiento Lesivo Reportado
            </span>
            {zona && (
              <span className="px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-[10px] font-bold border border-destructive/30">
                Zona: {zona}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-foreground">{ejercicioActual}</p>
          {dolorDetalle && (
            <p className="text-xs text-foreground/80 italic font-medium">
              &ldquo;{dolorDetalle}&rdquo;
            </p>
          )}
        </div>

        {/* Barra de búsqueda de alternativas */}
        <div className="space-y-1.5">
          <label htmlFor="quick-swap-search" className="text-xs font-bold text-foreground">
            Alternativas Biomecánicas Recomendadas
          </label>
          <input
            id="quick-swap-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar otra variante o ejercicio en la biblioteca..."
            className="w-full min-h-11 rounded-xl border border-input bg-secondary/40 px-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Lista de Alternativas Pre-filtradas */}
        <div className="space-y-2.5">
          {filteredAlternatives.map((alt) => (
            <div
              key={alt.nombre}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/80 bg-secondary/20 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">
                    {alt.nombre}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border/60 text-muted-foreground font-semibold">
                    {alt.musculos}
                  </span>
                </div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  🛡️ {alt.ventaja}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {alt.descripcion}
                </p>
              </div>

              {/* Botón de sustitución táctil ≥ 48px */}
              <Button
                type="button"
                onClick={() => {
                  onSwapSuccess(ejercicioActual, alt.nombre);
                  onClose();
                }}
                className="min-h-12 w-full sm:w-auto px-4 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-xs shrink-0 active:scale-95 transition-transform"
              >
                🔄 Sustituir en 1-Toque
              </Button>
            </div>
          ))}

          {/* Si el coach busca en el catálogo general */}
          {catalogMatches.length > 0 && (
            <div className="pt-2 border-t border-border/60 space-y-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Resultados adicionales de la biblioteca ({catalogMatches.length})
              </span>
              {catalogMatches.slice(0, 4).map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60 bg-card text-xs"
                >
                  <span className="font-semibold text-foreground">{cat.nombre}</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onSwapSuccess(ejercicioActual, cat.nombre);
                      onClose();
                    }}
                    className="min-h-10 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground"
                  >
                    Elegir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-11 px-5 text-xs font-semibold"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
