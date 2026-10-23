"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { Button } from "@/components/ui/button";
import type { NivelVistaAlumno } from "@/types/database.types";

/**
 * Onboarding de primera vez del alumno (GOZS-145, mockups 01-03).
 *
 * Se muestra una sola vez, antes del Inicio, cuando `onboardingCompletado !== true`.
 * Tiene 3 pasos (Bienvenida, Vista Simple/Técnica y Descanso) y un "Saltar" en
 * cada paso que aplica los valores por defecto: la vista recomendada por el coach
 * y el timer de descanso visible.
 *
 * - La elección de vista se guarda en `vistaElegidaPorAlumno` (via setNivelVistaAlumno).
 *   NO escribimos `perfiles.nivel_vista_alumno`: por RLS sólo lo cambia el coach.
 * - La preferencia del timer se guarda en `mostrarTimerDescanso`.
 *
 * Íconos estilo Lucide como SVG inline (el repo no usa el paquete lucide-react;
 * ver bimodal-theme-toggle.spec.ts). Sin emojis.
 */

interface OnboardingAlumnoProps {
  /** Nombre del alumno para el saludo. Se usa sólo el primer nombre. */
  nombreAlumno?: string;
  /** Nombre del coach que armó el plan (opcional, para el copy de bienvenida). */
  nombreCoach?: string;
  /** Cantidad de días del plan activo (opcional, para el copy de bienvenida). */
  cantidadDias?: number;
  /** Callback al terminar o saltar, útil para tests y para el host. */
  onComplete?: () => void;
}

type IconProps = { className?: string };

function LayoutGridIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function TimerIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="10" y1="2" x2="14" y2="2" />
      <line x1="12" y1="14" x2="15" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Indicador de selección: círculo relleno con check (seleccionado) o aro vacío. */
function SelectionDot({ selected }: { selected: boolean }) {
  if (selected) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white">
        <CheckIcon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="h-7 w-7 shrink-0 rounded-full border-2 border-[#CBD5E1]" aria-hidden="true" />
  );
}

/** Mini-tarjeta de una serie, reutilizada en las dos opciones de vista (paso 2). */
function SerieChip({ tecnica }: { tecnica?: boolean }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#475569]">
          Serie 1 de 3
        </span>
        {tecnica && (
          <span className="flex gap-1">
            {["W", "N", "F"].map((t) => (
              <span
                key={t}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E2E8F0] bg-white font-mono text-[11px] font-bold text-[#475569]"
              >
                {t}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono tabular-nums text-[#0F172A]">
          <span className="text-2xl font-extrabold">60</span>
          <span className="ml-1 text-sm font-semibold text-[#475569]">kg</span>
          <span className="mx-2 text-[#94A3B8]">×</span>
          <span className="text-2xl font-extrabold">8</span>
        </span>
        {tecnica ? (
          <span className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 font-mono text-xs font-bold text-[#2563EB]">
            RPE 8
          </span>
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2563EB] text-white">
            <CheckIcon className="h-4 w-4" />
          </span>
        )}
      </div>
      {tecnica && (
        <div className="mt-2 flex items-center justify-between border-t border-[#E2E8F0] pt-2 text-xs">
          <span className="text-[#475569]">Máximo estimado (1RM)</span>
          <span className="font-mono tabular-nums font-bold text-[#0F172A]">75 kg</span>
        </div>
      )}
    </div>
  );
}

const DOTS = [1, 2, 3] as const;

export function OnboardingAlumno({
  nombreAlumno,
  nombreCoach,
  cantidadDias,
  onComplete,
}: OnboardingAlumnoProps) {
  const currentSession = useAthleteStore((s) => s.currentSession);
  const vistaRecomendadaCoach = useAthleteStore((s) => s.vistaRecomendadaCoach);
  const onboardingCompletado = useAthleteStore((s) => s.onboardingCompletado);
  const setNivelVistaAlumno = useAthleteStore((s) => s.setNivelVistaAlumno);
  const usarVistaRecomendada = useAthleteStore((s) => s.usarVistaRecomendada);
  const setMostrarTimerDescanso = useAthleteStore((s) => s.setMostrarTimerDescanso);
  const setOnboardingCompletado = useAthleteStore((s) => s.setOnboardingCompletado);

  // Evita el flash/hydration-mismatch: el estado persistido sólo se conoce en cliente.
  const [montado, setMontado] = React.useState(false);
  const [paso, setPaso] = React.useState<1 | 2 | 3>(1);
  const [vistaSel, setVistaSel] = React.useState<NivelVistaAlumno>(vistaRecomendadaCoach);
  const [timerSel, setTimerSel] = React.useState(true);

  React.useEffect(() => {
    setMontado(true);
  }, []);

  // Al montar, arrancar con la vista que recomienda el coach preseleccionada.
  React.useEffect(() => {
    setVistaSel(vistaRecomendadaCoach);
  }, [vistaRecomendadaCoach]);

  const finalizar = React.useCallback(() => {
    // Guardar la elección del alumno (vista + timer) y marcar el onboarding visto.
    setNivelVistaAlumno(vistaSel);
    setMostrarTimerDescanso(timerSel);
    setOnboardingCompletado(true);
    onComplete?.();
  }, [vistaSel, timerSel, setNivelVistaAlumno, setMostrarTimerDescanso, setOnboardingCompletado, onComplete]);

  const saltar = React.useCallback(() => {
    // "Saltar" aplica los valores por defecto: vista recomendada + timer visible.
    usarVistaRecomendada();
    setMostrarTimerDescanso(true);
    setOnboardingCompletado(true);
    onComplete?.();
  }, [usarVistaRecomendada, setMostrarTimerDescanso, setOnboardingCompletado, onComplete]);

  if (!montado || onboardingCompletado) return null;

  const primerNombre = (nombreAlumno || currentSession.studentName || "")
    .trim()
    .split(/\s+/)[0];
  const saludo = primerNombre ? `Hola, ${primerNombre}.` : "Hola.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a GOZSter"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-[#F8FAFC]"
    >
      <div className="flex min-h-dvh w-full max-w-md flex-col px-5 pb-6 pt-5">
        {/* Barra superior: paso + Saltar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[#475569]">
            {paso > 1 && (
              <button
                type="button"
                onClick={() => setPaso((p) => (p > 1 ? ((p - 1) as 1 | 2 | 3) : p))}
                aria-label="Paso anterior"
                className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#475569] transition-colors hover:bg-[#F1F5F9] active:scale-[0.97]"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            )}
            <span>Paso {paso} de 3</span>
          </div>
          <button
            type="button"
            onClick={saltar}
            className="flex min-h-11 items-center px-2 text-sm font-semibold text-[#475569] transition-colors hover:text-[#0F172A] active:scale-[0.97]"
          >
            Saltar
          </button>
        </div>

        {/* Contenido del paso */}
        <div className="mt-4 flex-1">
          {paso === 1 && (
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#2563EB]">
                GOZSter
              </p>
              <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#0F172A]">
                {saludo}
                <br />
                Tu plan ya está listo.
              </h1>
              <p className="mt-4 text-base leading-relaxed text-[#475569]">
                {nombreCoach ? (
                  <>
                    Tu coach <span className="font-bold text-[#0F172A]">{nombreCoach}</span> te armó
                    {typeof cantidadDias === "number" ? (
                      <>
                        {" "}
                        un plan de <span className="font-bold text-[#0F172A]">{cantidadDias} días</span>.
                      </>
                    ) : (
                      <> tu plan.</>
                    )}{" "}
                  </>
                ) : (
                  <>Tu coach te armó tu plan. </>
                )}
                Antes de empezar, elegí dos cosas para que la app se adapte a vos. Tarda 30 segundos.
              </p>

              <div className="mt-6 divide-y divide-[#E2E8F0] rounded-2xl border border-[#E2E8F0] bg-white">
                <div className="flex items-center gap-4 p-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                    <LayoutGridIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-bold text-[#0F172A]">Cómo ver tus ejercicios</p>
                    <p className="text-sm text-[#475569]">Simple o Técnica.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                    <TimerIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-bold text-[#0F172A]">El descanso entre series</p>
                    <p className="text-sm text-[#475569]">Si querés ver la cuenta regresiva o no.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div>
              <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-[#0F172A]">
                ¿Cómo querés ver tus ejercicios?
              </h1>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => setVistaSel("SIMPLE")}
                  aria-pressed={vistaSel === "SIMPLE"}
                  className={`w-full rounded-2xl border bg-white p-4 text-left transition-all active:scale-[0.99] ${
                    vistaSel === "SIMPLE"
                      ? "border-[#2563EB] ring-2 ring-[#2563EB]"
                      : "border-[#E2E8F0]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[#0F172A]">Simple</span>
                        {vistaRecomendadaCoach === "SIMPLE" && (
                          <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#2563EB]">
                            Te la recomienda tu coach
                          </span>
                        )}
                      </span>
                      <p className="mt-1 text-sm text-[#475569]">
                        Solo peso y repeticiones. Anotás y seguís.
                      </p>
                    </div>
                    <SelectionDot selected={vistaSel === "SIMPLE"} />
                  </div>
                  <div className="mt-3">
                    <SerieChip />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setVistaSel("TECNICA")}
                  aria-pressed={vistaSel === "TECNICA"}
                  className={`w-full rounded-2xl border bg-white p-4 text-left transition-all active:scale-[0.99] ${
                    vistaSel === "TECNICA"
                      ? "border-[#2563EB] ring-2 ring-[#2563EB]"
                      : "border-[#E2E8F0]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[#0F172A]">Técnica</span>
                        {vistaRecomendadaCoach === "TECNICA" && (
                          <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#2563EB]">
                            Te la recomienda tu coach
                          </span>
                        )}
                      </span>
                      <p className="mt-1 text-sm text-[#475569]">
                        Lo mismo + cuánto te costó (RPE), tipo de serie, calentamiento y tu máximo
                        estimado.
                      </p>
                    </div>
                    <SelectionDot selected={vistaSel === "TECNICA"} />
                  </div>
                  <div className="mt-3">
                    <SerieChip tecnica />
                  </div>
                </button>
              </div>

              <p className="mt-4 text-center text-xs italic text-[#94A3B8]">
                Podés cambiarla cuando quieras desde Perfil.
              </p>
            </div>
          )}

          {paso === 3 && (
            <div>
              <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-[#0F172A]">
                ¿Querés ver el descanso después de cada serie?
              </h1>
              <p className="mt-3 text-base leading-relaxed text-[#475569]">
                Cada ejercicio tiene un descanso que indica tu coach (por ejemplo{" "}
                <span className="font-mono tabular-nums font-semibold text-[#0F172A]">90 s</span>): el
                tiempo para recuperarte antes de la próxima serie.
              </p>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => setTimerSel(true)}
                  aria-pressed={timerSel}
                  className={`w-full rounded-2xl border bg-white p-4 text-left transition-all active:scale-[0.99] ${
                    timerSel ? "border-[#2563EB] ring-2 ring-[#2563EB]" : "border-[#E2E8F0]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-[#0F172A]">Sí, mostrame la cuenta</p>
                      <p className="mt-1 text-sm text-[#475569]">
                        Al registrar una serie aparece el reloj. Vibra cuando termina.
                      </p>
                    </div>
                    <SelectionDot selected={timerSel} />
                  </div>
                  <div className="mt-3 rounded-xl bg-[#0F172A] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">
                        Descanso
                      </span>
                      <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white">
                        Saltar
                      </span>
                    </div>
                    <p className="mt-1 font-mono tabular-nums text-3xl font-extrabold text-white">
                      00:58
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                      <div className="h-full w-2/3 rounded-full bg-[#38BDF8]" />
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTimerSel(false)}
                  aria-pressed={!timerSel}
                  className={`w-full rounded-2xl border bg-white p-4 text-left transition-all active:scale-[0.99] ${
                    !timerSel ? "border-[#2563EB] ring-2 ring-[#2563EB]" : "border-[#E2E8F0]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-[#0F172A]">No, voy a mi ritmo</p>
                      <p className="mt-1 text-sm text-[#475569]">
                        Registrás la serie y pasa directo a la siguiente. Sin reloj.
                      </p>
                    </div>
                    <SelectionDot selected={!timerSel} />
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[#047857]">
                      <CheckIcon className="h-4 w-4" />
                      Serie 1 guardada
                    </span>
                    <span className="text-sm font-semibold text-[#047857]">Ahora: Serie 2</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Indicador de pasos */}
        <div className="mt-6 flex justify-center gap-2" aria-hidden="true">
          {DOTS.map((d) => (
            <span
              key={d}
              className={`h-1.5 rounded-full transition-all ${
                d === paso ? "w-6 bg-[#2563EB]" : "w-1.5 bg-[#CBD5E1]"
              }`}
            />
          ))}
        </div>

        {/* CTA principal */}
        <div className="mt-4">
          {paso === 1 && (
            <Button
              size="touch"
              className="h-14 w-full rounded-[14px] bg-[#2563EB] text-[17px] font-bold text-white hover:brightness-105"
              onClick={() => setPaso(2)}
            >
              Empezar
            </Button>
          )}
          {paso === 2 && (
            <Button
              size="touch"
              className="h-14 w-full rounded-[14px] bg-[#2563EB] text-[17px] font-bold text-white hover:brightness-105"
              onClick={() => setPaso(3)}
            >
              Continuar con {vistaSel === "SIMPLE" ? "Simple" : "Técnica"}
            </Button>
          )}
          {paso === 3 && (
            <Button
              size="touch"
              className="h-14 w-full rounded-[14px] bg-[#2563EB] text-[17px] font-bold text-white hover:brightness-105"
              onClick={finalizar}
            >
              Listo, ver mis días
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
