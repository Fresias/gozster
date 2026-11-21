"use client";

import * as React from "react";
import { Check, TrendingUp, X } from "@/components/athlete/icons";
import type { Perfil } from "@/types/database.types";

export interface RecordatorioPesoCardProps {
  student?: Perfil | null;
  onShowToast?: (message: string, variant?: "ok" | "warn") => void;
}

/**
 * Recordatorio mensual de peso corporal (kg puro, GOZS-345).
 * Compartido entre InicioMisDias e InicioClases.
 */
export function RecordatorioPesoCard({ student, onShowToast }: RecordatorioPesoCardProps) {
  const [recordatorioDescartado, setRecordatorioDescartado] = React.useState(false);
  const [nuevoPesoKg, setNuevoPesoKg] = React.useState<string>("");
  const [guardandoPeso, setGuardandoPeso] = React.useState(false);
  const [pesoGuardadoMensaje, setPesoGuardadoMensaje] = React.useState<string | null>(null);
  const [errorInline, setErrorInline] = React.useState<string | null>(null);

  const diasSinActualizarPeso = React.useMemo(() => {
    if (!student) return 0;
    if (student.peso_corporal_kg === null || student.peso_corporal_kg === undefined) {
      return 999; // Sin peso registrado -> mostrar aviso
    }
    const fechaRef =
      (student as { fecha_actualizacion_peso?: string | null }).fecha_actualizacion_peso ||
      student.updated_at ||
      student.created_at;
    if (!fechaRef) return 999;
    const diffMs = Date.now() - new Date(fechaRef).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [student]);

  const debeRecordarPeso = !recordatorioDescartado && diasSinActualizarPeso >= 30;
  if (!debeRecordarPeso) return null;

  const handleGuardarPeso = async () => {
    const pesoNum = parseFloat(nuevoPesoKg);
    if (isNaN(pesoNum) || pesoNum <= 0 || pesoNum > 500) {
      const msg = "Por favor ingresá un peso válido en kg (ej: 75.5)";
      if (onShowToast) {
        onShowToast(msg, "warn");
      } else {
        setErrorInline(msg);
      }
      return;
    }
    setErrorInline(null);
    setGuardandoPeso(true);
    try {
      if (student) {
        student.peso_corporal_kg = pesoNum;
        student.updated_at = new Date().toISOString();
        (student as { fecha_actualizacion_peso?: string }).fecha_actualizacion_peso =
          new Date().toISOString();
      }
      try {
        const { supabase } = await import("@/lib/supabase/client");
        if (student?.id) {
          await supabase
            .from("perfiles")
            .update({
              peso_corporal_kg: pesoNum,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", student.id);
        }
      } catch (err) {
        console.warn("Actualización de peso offline:", err);
      }
      setPesoGuardadoMensaje(`¡Peso guardado: ${pesoNum} kg!`);
      setTimeout(() => {
        setRecordatorioDescartado(true);
      }, 2000);
    } finally {
      setGuardandoPeso(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Recordatorio de peso corporal"
      className="a-card p-4 space-y-3 text-left"
      data-testid="recordatorio-peso-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--a-primary)", color: "var(--a-on-primary)" }}
          >
            <TrendingUp width={18} height={18} className="a-i" />
          </span>
          <div>
            <p className="a-t-bs">
              Actualizá tu peso corporal para calibrar tus marcas de fuerza (kg)
            </p>
            <p className="a-t-sec a-muted mt-0.5">
              {student?.peso_corporal_kg
                ? `Último registro: ${student.peso_corporal_kg} kg (hace ${diasSinActualizarPeso} días)`
                : "Calibración en kilogramos puros sin métricas invasivas"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setRecordatorioDescartado(true)}
          className="a-icon-btn"
          aria-label="Descartar recordatorio"
          data-testid="descartar-recordatorio-peso-btn"
        >
          <X width={16} height={16} className="a-i" />
        </button>
      </div>

      {pesoGuardadoMensaje ? (
        <div
          className="a-oknote a-t-sec font-semibold"
          data-testid="peso-guardado-feedback"
        >
          <Check width={16} height={16} className="a-i" />
          <span>{pesoGuardadoMensaje}</span>
        </div>
      ) : (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[130px] max-w-[200px]">
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="20"
                max="400"
                placeholder={student?.peso_corporal_kg ? String(student.peso_corporal_kg) : "Ej: 75.0"}
                value={nuevoPesoKg}
                onChange={(e) => setNuevoPesoKg(e.target.value)}
                className="a-t-body w-full min-h-11 rounded-2xl border border-input bg-card px-3 pr-9 text-foreground"
                data-testid="input-peso-corporal"
                aria-label="Nuevo peso corporal en kilogramos"
              />
              <span className="a-t-sec a-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                kg
              </span>
            </div>

            <button
              type="button"
              disabled={!nuevoPesoKg || guardandoPeso}
              onClick={handleGuardarPeso}
              className="a-mini min-h-11"
              data-testid="btn-guardar-peso-corporal"
            >
              {guardandoPeso ? "Guardando…" : "Actualizar"}
            </button>
          </div>
          {errorInline && (
            <p className="a-t-sec text-destructive" role="alert">
              {errorInline}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
