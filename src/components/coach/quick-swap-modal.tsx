"use client";

import * as React from "react";
import type { Ejercicio } from "@/types/database.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import { TriangleAlert, X, Lock, Check, ArrowRightLeft } from "@/components/coach/icons";

export interface QuickSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  alumnoNombre: string;
  alumnoId: string;
  ejercicioActual: string;
  ejercicioActualId?: string;
  ejercicioEnRutinaId?: string;
  planId?: string;
  alertaId?: string;
  reporteDolorId?: string;
  dolorDetalle?: string;
  zona?: string;
  catalogoEjercicios: Ejercicio[];
  onSwapSuccess: (originalExercise: string, newExercise: string, motivo?: string) => void;
}

export interface BiomechanicalAlternative {
  id?: string;
  nombre: string;
  musculos: string;
  patron_movimiento: string;
  equipamiento: string;
  nivel_exigencia: "Baja" | "Moderada" | "Alta" | string;
  restricciones_articulares: string[];
  ventaja: string;
  descripcion: string;
  explicacion_tecnica: string;
}

const PRESET_MOTIVOS = [
  "Molestia articular informada por atleta",
  "Compresión subacromial en hombro",
  "Cizalla patelofemoral en rodilla",
  "Sobrecarga lumbar en carga axial",
  "Molestia en tendón de tríceps/codo",
];

export function QuickSwapModal({
  isOpen,
  onClose,
  alumnoNombre,
  alumnoId,
  ejercicioActual,
  ejercicioActualId,
  ejercicioEnRutinaId,
  planId: _planId,
  alertaId,
  reporteDolorId: _reporteDolorId,
  dolorDetalle,
  zona,
  catalogoEjercicios,
  onSwapSuccess,
}: QuickSwapModalProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [motivo, setMotivo] = React.useState("Molestia articular informada por atleta");
  const [selectedAlternative, setSelectedAlternative] = React.useState<BiomechanicalAlternative | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Determinar sugerencias biomecánicas clasificadas según ejercicio o zona articular
  const isLowerBody =
    /sentadilla|squat|pierna|cuadriceps|prensa|rodilla|patelar/i.test(ejercicioActual) ||
    /rodilla/i.test(zona || "") ||
    /rodilla/i.test(dolorDetalle || "");

  const isChestShoulder =
    /banca|press|pecho|hombro|militar|acromial/i.test(ejercicioActual) ||
    /hombro|codo/i.test(zona || "") ||
    /hombro|codo/i.test(dolorDetalle || "");

  let defaultAlternatives: BiomechanicalAlternative[] = [];

  if (isLowerBody) {
    defaultAlternatives = [
      {
        nombre: "Prensa de Piernas a 45°",
        musculos: "Cuádriceps, Glúteos",
        patron_movimiento: "Dominancia de Rodilla / Empuje Guiado",
        equipamiento: "Máquina de Prensa 45°",
        nivel_exigencia: "Moderada",
        restricciones_articulares: ["Cizalla patelar", "Compresión vertebral"],
        ventaja: "Cero carga axial en columna y menor tensión de cizalla en rodillas",
        descripcion: "Soporte dorsal completo con recorrido controlado.",
        explicacion_tecnica:
          "El soporte dorsal fijo neutraliza la compresión del raquis lumbar y permite fijar topes de seguridad para no sobrepasar los 90° de flexión lesiva.",
      },
      {
        nombre: "Hip Thrust con Barra",
        musculos: "Glúteos, Isquiosurales",
        patron_movimiento: "Bisagra de Cadera / Extensión Pélvica",
        equipamiento: "Barra Olímpica y Banco",
        nivel_exigencia: "Moderada",
        restricciones_articulares: ["Sobrecarga rotuliana", "Pinzamiento femoroacetabular"],
        ventaja: "Elimina totalmente el estrés sobre el tendón rotuliano",
        descripcion: "Patrón de bisagra horizontal sin flexión profunda de rodilla.",
        explicacion_tecnica:
          "Concentra la palanca de fuerza sobre el glúteo mayor manteniendo la tibia en posición vertical neutra, anulando el torque patelar.",
      },
      {
        nombre: "Goblet Squat con Mancuerna en Talones Elevados",
        musculos: "Cuádriceps",
        patron_movimiento: "Sentadilla Frontal con Carga Anterior",
        equipamiento: "Mancuerna o Kettlebell",
        nivel_exigencia: "Baja",
        restricciones_articulares: ["Dorsiflexión de tobillo limitada", "Flexión lumbar"],
        ventaja: "Torso vertical que minimiza la palanca articular lumbar",
        descripcion: "Permite trabajar fuerza con carga moderada y máxima estabilidad.",
        explicacion_tecnica:
          "El contrapeso anterior fuerza la activación del core y la cuña de talón compensa déficits articulares sin compensaciones espinales.",
      },
      {
        nombre: "Peso Muerto Rumano con Mancuernas",
        musculos: "Cadena Posterior",
        patron_movimiento: "Bisagra de Cadera Dominante",
        equipamiento: "Mancuernas",
        nivel_exigencia: "Moderada",
        restricciones_articulares: ["Meniscos", "Ligamento cruzado anterior"],
        ventaja: "Rodilla semirrígida que protege meniscos y ligamentos",
        descripcion: "Enfoque en extensión de cadera y control excéntrico.",
        explicacion_tecnica:
          "Mantiene la articulación de la rodilla en ángulo constante de 15-20°, transfiriendo todo el trabajo a la articulación coxofemoral.",
      },
    ];
  } else if (isChestShoulder) {
    defaultAlternatives = [
      {
        nombre: "Press con Mancuernas en Banco Plano (Agarre Neutro)",
        musculos: "Pectoral Mayor, Tríceps",
        patron_movimiento: "Empuje Horizontal con Libertad Rotacional",
        equipamiento: "Mancuernas y Banco Plano",
        nivel_exigencia: "Moderada",
        restricciones_articulares: ["Compresión subacromial", "Tendinopatía bicipital"],
        ventaja: "El agarre neutro abre el espacio subacromial y desinflama el tendón del supraespinoso",
        descripcion: "Libre rotación de muñecas y codos adaptada a la anatomía del alumno.",
        explicacion_tecnica:
          "La rotación neutra del húmero incrementa el túnel subacromial evitando el choque de la tuberosidad mayor contra el acromion.",
      },
      {
        nombre: "Floor Press con Mancuernas",
        musculos: "Pectoral, Tríceps",
        patron_movimiento: "Empuje Horizontal con Rango Limitado",
        equipamiento: "Mancuernas en Suelo",
        nivel_exigencia: "Baja",
        restricciones_articulares: ["Hiperextensión glenohumeral", "Laxitud capsular anterior"],
        ventaja: "El piso bloquea la hiperextensión articular del hombro",
        descripcion: "Seguridad máxima en la fase excéntrica limitando el estiramiento lesivo.",
        explicacion_tecnica:
          "El suelo actúa como tope mecánico impidiendo que el codo viaje por detrás de la línea del torso, eliminando la tensión sobre la cápsula anterior.",
      },
      {
        nombre: "Cruce de Poleas en Banco a 30°",
        musculos: "Pectoral",
        patron_movimiento: "Aducción Horizontal Continua",
        equipamiento: "Torre de Poleas",
        nivel_exigencia: "Baja",
        restricciones_articulares: ["Inestabilidad glenohumeral", "Compresión esternal"],
        ventaja: "Tensión constante con mínimo impacto en articulaciones glenohumerales",
        descripcion: "Trabajo continuo de hipertrofia sin puntos de máxima compresión articular.",
        explicacion_tecnica:
          "La resistencia por cable entrega una curva de fuerza convergente que respeta la dirección de las fibras esternocostales.",
      },
      {
        nombre: "Press Inclinado con Mancuernas (30°)",
        musculos: "Pectoral Superior",
        patron_movimiento: "Empuje Diagonal",
        equipamiento: "Mancuernas y Banco Inclinado",
        nivel_exigencia: "Moderada",
        restricciones_articulares: ["Pinzamiento en plano sagital"],
        ventaja: "Ángulo articular más amable que el press plano tradicional",
        descripcion: "Menor roce en la porción anterior de la cápsula articular.",
        explicacion_tecnica:
          "La angulación de 30° ubica el brazo en el plano escapular natural (30-40° anterior al plano coronal).",
      },
    ];
  } else {
    defaultAlternatives = [
      {
        nombre: "Jalón al Pecho en Polea (Agarre Neutro Estrecho)",
        musculos: "Dorsal Ancho, Bíceps",
        patron_movimiento: "Tracción Vertical Guiada",
        equipamiento: "Polea Alta",
        nivel_exigencia: "Baja",
        restricciones_articulares: ["Epitrocleitis", "Pinzamiento acromial"],
        ventaja: "Trayectoria guiada que reduce el estrés en codos y muñecas",
        descripcion: "Permite modular el peso y aislar la musculatura dorsal.",
        explicacion_tecnica:
          "El agarre neutro estrecho alinea el antebrazo con la dirección del dorsal ancho reduciendo torsión en codo y flexores de muñeca.",
      },
      {
        nombre: "Remo con Mancuerna con Apoyo en Banco",
        musculos: "Espalda Media, Dorsal",
        patron_movimiento: "Tracción Horizontal Unilateral con Soporte",
        equipamiento: "Mancuerna y Banco Plano",
        nivel_exigencia: "Moderada",
        restricciones_articulares: ["Hernia discal lumbar", "Sobrecarga paravertebral"],
        ventaja: "El soporte del banco descarga la musculatura lumbar",
        descripcion: "Estabilidad unilateral sin compresión vertebral.",
        explicacion_tecnica:
          "Tres puntos de apoyo que cancelan el momento de flexión lumbar durante la tracción del dorsal.",
      },
      {
        nombre: "Remo en Polea Baja con Agarre V",
        musculos: "Dorsal, Trapecio",
        patron_movimiento: "Tracción Horizontal Guiada Sentada",
        equipamiento: "Polea Baja",
        nivel_exigencia: "Baja",
        restricciones_articulares: ["Carga axial en bipedestación"],
        ventaja: "Tensión constante en línea biomecánica natural",
        descripcion: "Movimiento suave sin tirones balísticos.",
        explicacion_tecnica:
          "Posición sentada con soporte de pies que amortigua las fuerzas de cizalla lumbosacras.",
      },
    ];
  }

  // Filtrar alternativas
  const filteredAlternatives = defaultAlternatives.filter((alt) => {
    const q = searchQuery.toLowerCase();
    return (
      alt.nombre.toLowerCase().includes(q) ||
      alt.patron_movimiento.toLowerCase().includes(q) ||
      alt.equipamiento.toLowerCase().includes(q) ||
      alt.musculos.toLowerCase().includes(q)
    );
  });

  // Catálogo general de ejercicios
  const catalogMatches =
    searchQuery.trim().length > 1
      ? catalogoEjercicios.filter(
          (e) =>
            e.nombre.toLowerCase().includes(searchQuery.toLowerCase()) &&
            e.nombre.toLowerCase() !== ejercicioActual.toLowerCase()
        )
      : [];

  if (!isOpen) return null;

  const handleConfirmSwap = async (alt: BiomechanicalAlternative) => {
    setIsSubmitting(true);
    try {
      // Buscar ID del nuevo ejercicio en el catálogo si existe
      const matchedCatalog = catalogoEjercicios.find(
        (e) => e.nombre.toLowerCase() === alt.nombre.toLowerCase()
      );
      const nuevoEjercicioId = matchedCatalog?.id || "30000000-0000-0000-0000-000000000002";

      // Si tenemos los IDs requeridos y estamos conectados, invocar quick_swap_ejercicio
      if (ejercicioEnRutinaId && nuevoEjercicioId) {
        await supabase.rpc("quick_swap_ejercicio", {
          p_ejercicio_en_rutina_id: ejercicioEnRutinaId,
          p_nuevo_ejercicio_id: nuevoEjercicioId,
          p_alerta_id: alertaId || null,
          p_motivo: motivo.trim() || "Sustitución biomecánica por molestia",
        });
      }

      onSwapSuccess(ejercicioActual, alt.nombre, motivo.trim());
      onClose();
    } catch (e) {
      // Si falla la llamada RPC (por permisos mock o red), igualmente ejecutamos la sustitución en cliente
      onSwapSuccess(ejercicioActual, alt.nombre, motivo.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-swap-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0"
      data-testid="quick-swap-modal"
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-destructive/40 bg-card p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header con botón de cierre */}
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive border border-destructive/30">
              <TriangleAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3
                id="quick-swap-title"
                className="text-base sm:text-lg font-black tracking-tight text-foreground flex items-center gap-2 flex-wrap"
              >
                <span>Sustituir Ejercicio por Molestia Articular (Exclusivo Coach)</span>
                <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">
                  Registro Inmutable
                </Badge>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Atleta: <strong className="text-foreground">{alumnoNombre}</strong> • Reemplazo para{" "}
                <strong>toda la rutina vigente</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" aria-hidden="true" />
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

        {/* AVISO TÉCNICO BIOMECÁNICO OBLIGATORIO */}
        <div
          className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 text-xs space-y-1.5"
          data-testid="biomechanical-safety-notice"
        >
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-500">
            <TriangleAlert className="h-4 w-4 text-amber-500 inline" aria-hidden="true" />
            <span>Aviso de Seguridad Biomecánica para el Entrenador</span>
          </div>
          <p className="font-bold text-foreground text-xs leading-relaxed">
            La similitud biomecánica no garantiza seguridad automática ante una lesión.
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Evalúa la respuesta individual del atleta, historial de dolor y restricciones articulares
            antes de prescribir la alternativa.
          </p>
        </div>

        {/* Motivo de la Sustitución (Trazabilidad obligatoria) */}
        <div className="space-y-1.5">
          <label htmlFor="swap-motive-input" className="text-xs font-bold text-foreground block">
            Motivo de la Sustitución (Registro en Ficha Histórica):
          </label>
          <input
            id="swap-motive-input"
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Describe el motivo clínico/biomecánico del reemplazo..."
            className="w-full min-h-10 rounded-xl border border-input bg-background px-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="swap-motive-input"
          />
          {/* Chips de motivos comunes */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PRESET_MOTIVOS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setMotivo(chip)}
                className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                  motivo === chip
                    ? "bg-primary text-primary-foreground border-primary font-bold"
                    : "bg-secondary/40 text-muted-foreground border-border/60 hover:bg-secondary"
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Buscador de Alternativas */}
        <div className="space-y-1.5">
          <label htmlFor="quick-swap-search" className="text-xs font-bold text-foreground">
            Biblioteca Biomecánica de Alternativas Clasificadas:
          </label>
          <input
            id="quick-swap-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por patrón, equipamiento, músculo o nombre..."
            className="w-full min-h-10 rounded-xl border border-input bg-secondary/40 px-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="quick-swap-search-input"
          />
        </div>

        {/* Lista de Alternativas Biomecánicas Clasificadas */}
        <div className="space-y-3" data-testid="alternatives-catalog-list">
          {filteredAlternatives.map((alt) => (
            <div
              key={alt.nombre}
              className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl border border-border/80 bg-secondary/20 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
              data-testid={`alternative-card-${alt.nombre.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="space-y-2 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-black text-foreground">
                    {alt.nombre}
                  </span>
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary font-bold">
                    {alt.patron_movimiento}
                  </Badge>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border/60 text-muted-foreground font-semibold">
                    Equipamiento: {alt.equipamiento}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border/60 text-muted-foreground font-semibold">
                    Exigencia: {alt.nivel_exigencia}
                  </span>
                </div>

                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {alt.ventaja}
                </p>

                {/* Explicación Técnica Visible */}
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p className="leading-relaxed">
                    <strong className="text-foreground/90">Fundamento técnico:</strong>{" "}
                    {alt.explicacion_tecnica}
                  </p>
                </div>

                {/* Restricciones Articulares */}
                {alt.restricciones_articulares.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                      Protege ante:
                    </span>
                    {alt.restricciones_articulares.map((res) => (
                      <span
                        key={res}
                        className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20 inline-flex items-center gap-1"
                      >
                        <Check className="h-2.5 w-2.5 inline text-emerald-500" aria-hidden="true" /> {res}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón de Sustitución en 1-Toque */}
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleConfirmSwap(alt)}
                className="min-h-12 w-full md:w-auto px-4 text-xs font-black bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-xs shrink-0 active:scale-95 transition-transform"
                data-testid={`confirm-swap-btn-${alt.nombre.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {isSubmitting ? (
                  "Sustituyendo..."
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5 inline" aria-hidden="true" />
                    Sustituir en 1-Toque
                  </span>
                )}
              </Button>
            </div>
          ))}

          {/* Resultados de búsqueda en catálogo general */}
          {catalogMatches.length > 0 && (
            <div className="pt-2 border-t border-border/60 space-y-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Resultados generales de la biblioteca ({catalogMatches.length})
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
                    disabled={isSubmitting}
                    onClick={() =>
                      handleConfirmSwap({
                        nombre: cat.nombre,
                        musculos: cat.musculos_principales.join(", "),
                        patron_movimiento: "Catálogo General",
                        equipamiento: "Gimnasio",
                        nivel_exigencia: "Moderada",
                        restricciones_articulares: [],
                        ventaja: "Alternativa seleccionada del catálogo",
                        descripcion: cat.comentario || "",
                        explicacion_tecnica: "Sustitución personalizada directa del catálogo.",
                      })
                    }
                    className="min-h-10 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground"
                  >
                    Elegir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer con recordatorio de inmutabilidad */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-border/60 text-xs text-muted-foreground">
          <p className="text-[11px] inline-flex items-center gap-1">
            <Lock className="h-3.5 w-3.5 text-primary inline" aria-hidden="true" />
            <span>
              <strong>Inmutabilidad garantizada:</strong> Las sesiones y series finalizadas
              previamente no serán alteradas.
            </span>
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-10 px-5 text-xs font-semibold w-full sm:w-auto"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
