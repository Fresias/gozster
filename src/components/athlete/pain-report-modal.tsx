"use client";

import * as React from "react";
import { Info, TriangleAlert, X } from "@/components/athlete/icons";
import { nivelMolestia, type NivelMolestia } from "@/lib/athlete/molestias";

export interface PainReportData {
  exerciseId?: string;
  ejercicioId?: string;
  exerciseName?: string;
  setNumber?: number;
  zonaArticular: "HOMBRO" | "RODILLA" | "LUMBAR" | "CODO" | "CUELLO" | "CADERA" | "TOBILLO" | "OTRO";
  severidad: "LEVE" | "MODERADO" | "AGUDO";
  intensidadNumerica: number;
  momentoAparicion: "CALENTAMIENTO" | "EN_SERIE" | "POST_EJERCICIO";
  sintomasAlarma: string[];
  esSintomaAlarma: boolean;
  notasAlumno: string;
}

export interface PainReportModalEjercicio {
  id: string;
  ejercicio_id?: string | null;
  nombre: string;
}

export interface PainReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName?: string;
  exerciseId?: string;
  ejercicioId?: string;
  setNumber?: number;
  ejercicios?: PainReportModalEjercicio[];
  onSavePainReport: (report: PainReportData | string) => void;
}

export const JOINT_ZONES: Array<{ id: PainReportData["zonaArticular"]; label: string }> = [
  { id: "HOMBRO", label: "Hombro" },
  { id: "RODILLA", label: "Rodilla" },
  { id: "LUMBAR", label: "Espalda baja / Lumbar" },
  { id: "CODO", label: "Codo" },
  { id: "CUELLO", label: "Cuello / Cervical" },
  { id: "CADERA", label: "Cadera" },
  { id: "TOBILLO", label: "Tobillo" },
  { id: "OTRO", label: "Otro" },
];

export const MOMENTOS_APARICION: Array<{
  id: PainReportData["momentoAparicion"];
  label: string;
}> = [
  { id: "CALENTAMIENTO", label: "Calentamiento" },
  { id: "EN_SERIE", label: "Durante la serie" },
  { id: "POST_EJERCICIO", label: "Post-ejercicio" },
];

export const RED_FLAG_SYMPTOMS = [
  { id: "Dolor punzante/súbito", label: "Dolor punzante o súbito" },
  { id: "Irradiación/adormecimiento", label: "Irradiación o adormecimiento" },
  { id: "Mareo/falta de aire", label: "Mareo o falta de aire" },
  { id: "Inestabilidad articular", label: "Inestabilidad en la articulación" },
] as const;

const MENSAJE_NIVEL: Record<NivelMolestia, string> = {
  leve: "Leve: avisamos a tu coach. Seguí con precaución.",
  moderada: "Moderada: avisamos a tu coach. Si sigue, bajá el peso en las próximas series.",
  alta: "Alta: vas a suspender este ejercicio. Seguí con el resto solo si no molesta.",
  alarma: "Síntoma de alarma: frená por hoy y avisá en el gimnasio.",
};

const CLASE_NIVEL: Record<NivelMolestia, string> = {
  leve: "a-pain a-t-sec",
  moderada: "a-pain a-mod a-t-sec",
  alta: "a-pain a-alta a-t-sec",
  alarma: "a-pain a-alarm a-t-sec",
};

const TESTID_NIVEL: Record<NivelMolestia, string> = {
  leve: "pain-modal-cartel-1-3",
  moderada: "pain-modal-cartel-4-6",
  alta: "pain-modal-cartel-7-9",
  alarma: "protocolo-freno-alert",
};

function obtenerEnfocables(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(
    contenedor.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function PainReportModal({
  isOpen,
  onClose,
  exerciseName = "Sesión General",
  exerciseId,
  ejercicioId,
  setNumber = 1,
  ejercicios,
  onSavePainReport,
}: PainReportModalProps) {
  const ejerciciosList = React.useMemo<PainReportModalEjercicio[]>(() => {
    if (ejercicios && ejercicios.length > 0) return ejercicios;
    return [
      {
        id: exerciseId || "",
        ejercicio_id: ejercicioId || "",
        nombre: exerciseName,
      },
    ];
  }, [ejercicios, exerciseId, ejercicioId, exerciseName]);

  const defaultExId = exerciseId || ejerciciosList[0]?.id || "";
  const [selectedExId, setSelectedExId] = React.useState<string>(defaultExId);
  const [zonaArticular, setZonaArticular] = React.useState<PainReportData["zonaArticular"]>("RODILLA");
  const [intensidad, setIntensidad] = React.useState<number>(5);
  const [momentoAparicion, setMomentoAparicion] =
    React.useState<PainReportData["momentoAparicion"]>("EN_SERIE");
  const [sintomasAlarma, setSintomasAlarma] = React.useState<string[]>([]);
  const [notasAlumno, setNotasAlumno] = React.useState<string>("");

  const fallbackExId = ejercicios?.[0]?.id ?? "";
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const titleRef = React.useRef<HTMLHeadingElement | null>(null);
  const disparadorRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const active =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    if (active && !sheetRef.current?.contains(active) && !disparadorRef.current) {
      disparadorRef.current = active;
    }

    titleRef.current?.focus();

    return () => {
      const returnTarget = disparadorRef.current;
      disparadorRef.current = null;
      if (returnTarget && returnTarget.isConnected) {
        returnTarget.focus();
      }
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    setSelectedExId(exerciseId || fallbackExId);
    setZonaArticular("RODILLA");
    setIntensidad(5);
    setMomentoAparicion("EN_SERIE");
    setSintomasAlarma([]);
    setNotasAlumno("");
  }, [isOpen, exerciseId, fallbackExId]);

  const cerrarHoja = React.useCallback(() => {
    const returnTarget = disparadorRef.current;
    onClose();
    if (returnTarget && returnTarget.isConnected) {
      returnTarget.focus();
    }
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cerrarHoja();
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;

      const focos = obtenerEnfocables(sheetRef.current);
      if (focos.length === 0) {
        e.preventDefault();
        return;
      }

      const primero = focos[0]!;
      const ultimo = focos[focos.length - 1]!;
      const activo =
        typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

      if (e.shiftKey) {
        if (!activo || activo === primero || !focos.includes(activo)) {
          e.preventDefault();
          ultimo.focus();
        }
        return;
      }

      if (!activo || activo === ultimo || !focos.includes(activo)) {
        e.preventDefault();
        primero.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, cerrarHoja]);

  if (!isOpen) return null;

  const nivel = nivelMolestia(intensidad, sintomasAlarma);
  const severidad: "LEVE" | "MODERADO" | "AGUDO" =
    nivel === "leve" ? "LEVE" : nivel === "moderada" ? "MODERADO" : "AGUDO";

  const toggleSintomaAlarma = (sintoma: string) => {
    setSintomasAlarma((prev) =>
      prev.includes(sintoma) ? prev.filter((s) => s !== sintoma) : [...prev, sintoma],
    );
  };

  const handleConfirm = () => {
    const chosen = ejerciciosList.find((e) => e.id === selectedExId) ?? ejerciciosList[0];
    const resolvedExerciseId = chosen?.id || exerciseId;
    const resolvedEjercicioId = chosen?.ejercicio_id || ejercicioId || resolvedExerciseId;
    const resolvedExerciseName = chosen?.nombre || exerciseName;

    const data: PainReportData = {
      exerciseId: resolvedExerciseId,
      ejercicioId: resolvedEjercicioId,
      exerciseName: resolvedExerciseName,
      setNumber,
      zonaArticular,
      severidad,
      intensidadNumerica: intensidad,
      momentoAparicion,
      sintomasAlarma,
      esSintomaAlarma: nivel === "alarma" || nivel === "alta",
      notasAlumno: notasAlumno.trim(),
    };

    onSavePainReport(data);
    cerrarHoja();
  };

  return (
    <div
      className="a-sheet-wrap justify-center"
      data-testid="pain-report-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrarHoja();
      }}
    >
      <div
        ref={sheetRef}
        className="a-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pain-report-title"
      >
        <div className="a-sh-h">
          <div>
            <h2 id="pain-report-title" ref={titleRef} className="a-t-h" tabIndex={-1}>
              Tengo una molestia
            </h2>
            <span className="a-t-sec a-muted">
              Tu coach recibe el aviso y decide si cambia el ejercicio.
            </span>
          </div>
          <button
            type="button"
            className="a-icon-btn"
            onClick={cerrarHoja}
            aria-label="Cerrar"
          >
            <X width={18} height={18} className="a-i" />
          </button>
        </div>

        <label className="a-t-label a-muted" htmlFor="molEx">
          Ejercicio
        </label>
        <select
          id="molEx"
          className="a-sel-native"
          value={selectedExId}
          onChange={(e) => setSelectedExId(e.target.value)}
          data-testid="pain-exercise-select"
        >
          {ejerciciosList.map((ej) => (
            <option key={ej.id || ej.nombre} value={ej.id}>
              {ej.nombre}
            </option>
          ))}
        </select>

        <span className="a-t-label a-muted">Zona</span>
        <div className="a-grid2" role="group" aria-label="Zona">
          {JOINT_ZONES.map((zone) => {
            const isSelected = zonaArticular === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setZonaArticular(zone.id)}
                data-testid={`zona-btn-${zone.id.toLowerCase()}`}
              >
                {zone.label}
              </button>
            );
          })}
        </div>

        <span className="a-t-label a-muted">Cuándo apareció</span>
        <div className="a-chips" role="group" aria-label="Momento">
          {MOMENTOS_APARICION.map((momento) => {
            const isSelected = momentoAparicion === momento.id;
            return (
              <button
                key={momento.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setMomentoAparicion(momento.id)}
                data-testid={`momento-btn-${momento.id.toLowerCase()}`}
              >
                {momento.label}
              </button>
            );
          })}
        </div>

        <div className="a-lblrow">
          <span className="a-t-label a-muted">Intensidad</span>
          <span className="a-t-bs" data-testid="pain-severity-badge">
            {intensidad}/10 · {nivel}
          </span>
        </div>
        <div className="a-ints" role="group" aria-label="Intensidad del 1 al 10">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
            <button
              key={val}
              type="button"
              className={val >= 7 ? "a-hi" : undefined}
              aria-pressed={intensidad === val}
              onClick={() => setIntensidad(val)}
              data-testid={`intensity-chip-${val}`}
            >
              {val}
            </button>
          ))}
        </div>

        <p
          className={CLASE_NIVEL[nivel]}
          style={{ margin: 0 }}
          data-testid={TESTID_NIVEL[nivel]}
          data-nivel={nivel}
        >
          {nivel === "leve" ? (
            <Info width={18} height={18} className="a-i" />
          ) : (
            <TriangleAlert width={18} height={18} className="a-i" />
          )}
          <span>{MENSAJE_NIVEL[nivel]}</span>
        </p>

        <span className="a-t-label a-muted">Síntomas de alarma</span>
        <div className="a-checks a-t-body">
          {RED_FLAG_SYMPTOMS.map((rf) => {
            const isChecked = sintomasAlarma.includes(rf.id);
            return (
              <label key={rf.id} data-testid={`red-flag-label-${rf.id}`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleSintomaAlarma(rf.id)}
                  data-testid={`red-flag-checkbox-${rf.id}`}
                />
                <span>{rf.label}</span>
              </label>
            );
          })}
        </div>

        <label className="a-t-label a-muted" htmlFor="molCom">
          Comentario (opcional)
        </label>
        <textarea
          id="molCom"
          rows={2}
          value={notasAlumno}
          onChange={(e) => setNotasAlumno(e.target.value)}
          className="a-fin a-t-body"
          data-testid="pain-notes-input"
        />

        <button
          type="button"
          className="a-btn a-danger a-gym"
          onClick={handleConfirm}
          data-testid="submit-pain-report-btn"
        >
          Avisar a mi coach
        </button>
      </div>
    </div>
  );
}
