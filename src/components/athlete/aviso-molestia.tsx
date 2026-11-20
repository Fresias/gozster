"use client";

import * as React from "react";
import { Info, TriangleAlert } from "@/components/athlete/icons";
import type {
  AvisoMolestia as AvisoMolestiaData,
  ZonaArticular,
} from "@/lib/athlete/molestias";

const ZONA_LABEL: Record<ZonaArticular, string> = {
  HOMBRO: "Hombro",
  RODILLA: "Rodilla",
  LUMBAR: "Espalda baja / Lumbar",
  CODO: "Codo",
  CUELLO: "Cuello / Cervical",
  CADERA: "Cadera",
  TOBILLO: "Tobillo",
  OTRO: "Otro",
};

export interface AvisoMolestiaProps {
  aviso: AvisoMolestiaData;
  onTerminarSesion?: () => void;
  isFinishing?: boolean;
}

export function AvisoMolestia({
  aviso,
  onTerminarSesion,
  isFinishing = false,
}: AvisoMolestiaProps) {
  if (!aviso) return null;

  if (aviso.tipo === "heredado") {
    return (
      <div className="a-pain-mini" role="status" data-testid="molestia-heredada">
        <span className="a-pm-ic" aria-hidden="true">
          !
        </span>
        <b className="a-t-bs">Molestia reportada</b>
      </div>
    );
  }

  const m = aviso.molestia;
  const zonaLabel = ZONA_LABEL[m.zona] ?? m.zona;
  const head = `${zonaLabel} · ${m.eva}/10`;
  const errorEnvio =
    m.envio === "error" ? (
      <small className="a-t-sec" data-testid="molestia-envio-error">
        No se pudo enviar el reporte al servidor. Avisá a tu coach en persona.
      </small>
    ) : null;

  if (m.nivel === "alarma") {
    return (
      <div
        className="a-pain a-alarm"
        role="alert"
        data-testid="live-workout-stop-protocol-banner"
        data-nivel="alarma"
      >
        <TriangleAlert width={22} height={22} className="a-i" />
        <span className="a-rt">
          <b className="a-t-bs">Frená por hoy</b>
          <small className="a-t-sec">
            {head}. Avisá en el gimnasio o a tu entrenador cercano. Tu coach ya recibió una alerta.
          </small>
          {errorEnvio}
          {onTerminarSesion && (
            <button
              type="button"
              className="a-btn"
              onClick={onTerminarSesion}
              disabled={isFinishing}
              data-testid="molestia-terminar-sesion-btn"
            >
              {isFinishing ? "Guardando…" : "Terminar sesión"}
            </button>
          )}
        </span>
      </div>
    );
  }

  if (m.nivel === "alta") {
    return (
      <div
        className="a-pain a-alta"
        role="alert"
        data-testid="pain-banner-range-7-9"
        data-nivel="alta"
      >
        <TriangleAlert width={22} height={22} className="a-i" />
        <span className="a-rt">
          <b className="a-t-bs">Suspendé este ejercicio</b>
          <small className="a-t-sec">
            {head}. Seguí con el resto solo si no te molesta. Tu coach ya fue avisado.
          </small>
          {errorEnvio}
        </span>
      </div>
    );
  }

  if (m.nivel === "moderada") {
    return (
      <div
        className="a-pain a-mod"
        role="status"
        data-testid="pain-banner-range-4-6"
        data-nivel="moderada"
      >
        <TriangleAlert width={22} height={22} className="a-i" />
        <span className="a-rt">
          <b className="a-t-bs">Molestia moderada · {head}</b>
          <small className="a-t-sec">
            Avisamos a tu coach. Si sigue, bajá el peso en las próximas series.
          </small>
          {errorEnvio}
        </span>
      </div>
    );
  }

  return (
    <div
      className="a-pain"
      role="status"
      data-testid="pain-banner-range-1-3"
      data-nivel="leve"
    >
      <Info width={22} height={22} className="a-i" />
      <span className="a-rt">
        <b className="a-t-bs">Molestia leve · {head}</b>
        <small className="a-t-sec">
          Avisamos a tu coach. Seguí con precaución según cómo te sientas.
        </small>
        {errorEnvio}
      </span>
    </div>
  );
}
