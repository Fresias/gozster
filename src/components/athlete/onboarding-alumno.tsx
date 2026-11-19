"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { Check, ChevronLeft, Dumbbell, Pencil, Timer } from "@/components/athlete/icons";
import type { NivelVistaAlumno } from "@/types/database.types";

/**
 * Onboarding de primera vez del alumno (Athlete v7 · FE-11, 4 pasos).
 *
 * Se muestra una sola vez, antes del Inicio, cuando `onboardingCompletado !== true`.
 * Pasos:
 * 1. Bienvenida oscura (onb1)
 * 2. ¿Cómo querés que te llamemos? (onbname, BE-01 / D-53)
 * 3. ¿Cómo querés ver tus ejercicios? (onb2)
 * 4. ¿Querés ver el descanso después de cada serie? (onb3)
 *
 * "Saltar" en cualquier paso aplica vista recomendada + descanso visible + primer nombre
 * sin guardar `nombre_preferido`.
 */

interface OnboardingAlumnoProps {
  /** Nombre del alumno para el saludo. Se usa sólo el primer nombre. */
  nombreAlumno?: string;
  /** Nombre del coach que armó el plan (opcional). */
  nombreCoach?: string;
  /** Cantidad de días del plan activo (opcional). */
  cantidadDias?: number;
  /** Callback al terminar o saltar, útil para tests y para el host. */
  onComplete?: () => void;
}

type PasoOnboarding = 1 | 2 | 3 | 4;

const PASOS_BARRA: readonly PasoOnboarding[] = [1, 2, 3, 4];

function CabeceraPaso({
  paso,
  onAtras,
  onSaltar,
}: {
  paso: PasoOnboarding;
  onAtras: () => void;
  onSaltar: () => void;
}) {
  return (
    <>
      <div className="a-steph">
        <button
          type="button"
          className="a-back"
          onClick={onAtras}
          aria-label="Paso anterior"
        >
          <ChevronLeft width={18} height={18} className="a-i" />
          Atrás
        </button>
        <span className="a-t-label">Paso {paso} de 4</span>
        <button type="button" className="a-link" onClick={onSaltar}>
          Saltar
        </button>
      </div>
      <div className="a-sp" aria-hidden="true">
        {PASOS_BARRA.map((i) => (
          <i key={i} className={i <= paso ? "a-on" : undefined} />
        ))}
      </div>
    </>
  );
}

export function OnboardingAlumno({
  nombreAlumno,
  nombreCoach,
  cantidadDias,
  onComplete,
}: OnboardingAlumnoProps) {
  const currentSession = useAthleteStore((s) => s.currentSession);
  const planAlumno = useAthleteStore((s) => s.planAlumno);
  const nombrePreferido = useAthleteStore((s) => s.nombrePreferido);
  const vistaRecomendadaCoach = useAthleteStore((s) => s.vistaRecomendadaCoach);
  const onboardingCompletado = useAthleteStore((s) => s.onboardingCompletado);
  const setNivelVistaAlumno = useAthleteStore((s) => s.setNivelVistaAlumno);
  const usarVistaRecomendada = useAthleteStore((s) => s.usarVistaRecomendada);
  const setMostrarTimerDescanso = useAthleteStore((s) => s.setMostrarTimerDescanso);
  const setOnboardingCompletado = useAthleteStore((s) => s.setOnboardingCompletado);
  const guardarNombrePreferido = useAthleteStore((s) => s.guardarNombrePreferido);

  // Evita el flash/hydration-mismatch: el estado persistido sólo se conoce en cliente.
  const [montado, setMontado] = React.useState(false);
  const [paso, setPaso] = React.useState<PasoOnboarding>(1);
  const [vistaSel, setVistaSel] = React.useState<NivelVistaAlumno>(vistaRecomendadaCoach);
  const [timerSel, setTimerSel] = React.useState(true);

  const rawNombre =
    nombreAlumno ||
    planAlumno?.alumnos?.[0]?.nombre_completo ||
    currentSession.studentName ||
    "";
  const primerNombre = rawNombre.trim().split(/\s+/)[0] || "";
  const nombreInicial = nombrePreferido || primerNombre;

  const [nombreInput, setNombreInput] = React.useState(nombreInicial);
  const [nombreTocado, setNombreTocado] = React.useState(false);

  React.useEffect(() => {
    setMontado(true);
  }, []);

  // Al montar, arrancar con la vista que recomienda el coach preseleccionada.
  React.useEffect(() => {
    setVistaSel(vistaRecomendadaCoach);
  }, [vistaRecomendadaCoach]);

  // Sincroniza el campo de nombre con la hidratación si el alumno todavía no editó.
  React.useEffect(() => {
    if (!nombreTocado) {
      setNombreInput(nombreInicial);
    }
  }, [nombreInicial, nombreTocado]);

  const finalizar = React.useCallback(() => {
    setNivelVistaAlumno(vistaSel);
    setMostrarTimerDescanso(timerSel);
    setOnboardingCompletado(true);
    onComplete?.();
  }, [vistaSel, timerSel, setNivelVistaAlumno, setMostrarTimerDescanso, setOnboardingCompletado, onComplete]);

  const saltar = React.useCallback(() => {
    usarVistaRecomendada();
    setMostrarTimerDescanso(true);
    setOnboardingCompletado(true);
    onComplete?.();
  }, [usarVistaRecomendada, setMostrarTimerDescanso, setOnboardingCompletado, onComplete]);

  const continuarNombre = React.useCallback(() => {
    void guardarNombrePreferido(nombreInput);
    setPaso(3);
  }, [guardarNombrePreferido, nombreInput]);

  if (!montado || onboardingCompletado) return null;

  const saludo = primerNombre ? `Hola, ${primerNombre}.` : "Hola.";

  if (paso === 1) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bienvenida a GOZSter"
        className="a-dk a-dk-onb"
      >
        <div className="a-chev" aria-hidden="true" />
        <div className="a-dk-wedge" aria-hidden="true" />
        <div className="a-bigG" aria-hidden="true">
          G
        </div>
        <div className="a-dk-in">
          <div className="flex items-center justify-between">
            <span className="a-t-label">Paso 1 de 4</span>
            <button type="button" className="a-link a-dk-link" onClick={saltar}>
              Saltar
            </button>
          </div>
          <div className="a-grow" />
          <h1 className="a-t-dxl" data-testid="onboarding-titulo">
            {saludo}
            <br />
            <span className="a-muted">Tu plan ya está listo.</span>
          </h1>
          <p className="a-t-body a-muted m-0">
            {nombreCoach ? (
              <>
                Tu coach <b>{nombreCoach}</b> te armó
                {typeof cantidadDias === "number" ? ` un plan de ${cantidadDias} días.` : " tu plan."}{" "}
              </>
            ) : (
              "Tu coach te armó tu plan. "
            )}
            Antes de empezar, contanos cómo te llamamos y elegí dos cosas para que la app se adapte
            a vos. Tarda 30 segundos.
          </p>
          <div className="a-card a-dk-card">
            <div className="a-row min-h-[60px]">
              <Pencil width={20} height={20} className="a-i" />
              <span className="a-rt">
                <b className="a-t-bs">Cómo te llamamos</b>
                <small className="a-t-sec a-muted">Tu nombre o un apodo</small>
              </span>
            </div>
            <div className="a-row min-h-[60px]">
              <Dumbbell width={20} height={20} className="a-i" />
              <span className="a-rt">
                <b className="a-t-bs">Cómo ver tus ejercicios</b>
                <small className="a-t-sec a-muted">Simple o Técnica</small>
              </span>
            </div>
            <div className="a-row min-h-[60px]">
              <Timer width={20} height={20} className="a-i" />
              <span className="a-rt">
                <b className="a-t-bs">El descanso entre series</b>
                <small className="a-t-sec a-muted">Si querés ver la cuenta o no</small>
              </span>
            </div>
          </div>
          <button type="button" className="a-btn a-dk-btn" onClick={() => setPaso(2)}>
            Empezar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a GOZSter"
      className="a-onb-wrap"
    >
      <div className="a-chev" aria-hidden="true" />
      <div className="a-scroll">
        <div className="a-view">
          {paso === 2 && (
            <div className="a-onb" data-testid="onboarding-paso-nombre">
              <CabeceraPaso paso={2} onAtras={() => setPaso(1)} onSaltar={saltar} />
              <h1 className="a-t-h">¿Cómo querés que te llamemos?</h1>
              <p className="a-t-body a-muted m-0">
                Así te saludamos en la app. Lo podés cambiar cuando quieras en Configuración.
              </p>
              <label className="a-flbl a-t-bs" htmlFor="onb-name-in">
                Nombre o apodo
              </label>
              <input
                id="onb-name-in"
                className="a-fin a-t-body"
                autoComplete="nickname"
                autoCapitalize="words"
                maxLength={30}
                value={nombreInput}
                onChange={(e) => {
                  setNombreTocado(true);
                  setNombreInput(e.target.value);
                }}
              />
              <p className="a-t-sec a-muted m-0">
                Hasta 30 caracteres. Si lo dejás vacío, usamos tu primer nombre.
              </p>
              <div className="a-grow" />
              <button type="button" className="a-btn" onClick={continuarNombre}>
                Continuar
              </button>
            </div>
          )}

          {paso === 3 && (
            <div className="a-onb">
              <CabeceraPaso paso={3} onAtras={() => setPaso(2)} onSaltar={saltar} />
              <h1 className="a-t-h">¿Cómo querés ver tus ejercicios?</h1>
              <div className="a-qgroup" role="group" aria-label="Vista de ejercicios">
                <button
                  type="button"
                  className="a-opt"
                  aria-pressed={vistaSel === "SIMPLE"}
                  onClick={() => setVistaSel("SIMPLE")}
                >
                  <span className="a-ck">
                    {vistaSel === "SIMPLE" ? <Check width={20} height={20} className="a-i" /> : null}
                  </span>
                  <b className="a-t-title">Simple</b>
                  {vistaRecomendadaCoach === "SIMPLE" && (
                    <span className="a-chip a-ink a-t-label justify-self-start">
                      Te la recomienda tu coach
                    </span>
                  )}
                  <small className="a-t-sec">Solo peso y repeticiones. Anotás y seguís.</small>
                  <span className="a-preview">
                    <span className="a-t-label a-muted">Serie 1 de 3</span>
                    <span className="a-pr">
                      <span>
                        <span className="a-t-mm">60</span>{" "}
                        <span className="a-t-sec">kg × 8</span>
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="a-opt"
                  aria-pressed={vistaSel === "TECNICA"}
                  onClick={() => setVistaSel("TECNICA")}
                >
                  <span className="a-ck">
                    {vistaSel === "TECNICA" ? <Check width={20} height={20} className="a-i" /> : null}
                  </span>
                  <b className="a-t-title">Técnica</b>
                  {vistaRecomendadaCoach === "TECNICA" && (
                    <span className="a-chip a-ink a-t-label justify-self-start">
                      Te la recomienda tu coach
                    </span>
                  )}
                  <small className="a-t-sec">
                    Lo mismo, más cuánto te costó (RPE), tipo de serie, aproximación y tu máximo
                    estimado.
                  </small>
                  <span className="a-preview">
                    <span className="a-pr">
                      <span className="a-t-label a-muted">Serie 1 de 3</span>
                      <span className="a-chip a-t-label">RPE 8</span>
                    </span>
                    <span className="a-pr">
                      <span>
                        <span className="a-t-mm">60</span>{" "}
                        <span className="a-t-sec">kg × 8</span>
                      </span>
                      <span className="a-t-sec a-muted">1RM 75 kg</span>
                    </span>
                  </span>
                </button>
              </div>
              <p className="a-t-sec a-muted m-0 text-center">
                Podés cambiarla cuando quieras desde Configuración.
              </p>
              <div className="a-grow" />
              <button type="button" className="a-btn" onClick={() => setPaso(4)}>
                Continuar con {vistaSel === "SIMPLE" ? "Simple" : "Técnica"}
              </button>
            </div>
          )}

          {paso === 4 && (
            <div className="a-onb">
              <CabeceraPaso paso={4} onAtras={() => setPaso(3)} onSaltar={saltar} />
              <h1 className="a-t-h">¿Querés ver el descanso después de cada serie?</h1>
              <p className="a-t-body a-muted m-0">
                Cada ejercicio tiene un descanso que indica tu coach (por ejemplo, 90 s) para
                recuperarte antes de la próxima serie.
              </p>
              <div className="a-qgroup" role="group" aria-label="Descanso">
                <button
                  type="button"
                  className="a-opt"
                  aria-pressed={timerSel}
                  onClick={() => setTimerSel(true)}
                >
                  <span className="a-ck">
                    {timerSel ? <Check width={20} height={20} className="a-i" /> : null}
                  </span>
                  <b className="a-t-title">Sí, mostrame la cuenta</b>
                  <small className="a-t-sec">
                    Al registrar una serie aparece el reloj. Suena cuando termina; en Android
                    también vibra.
                  </small>
                  <span className="a-preview">
                    <span className="a-pr">
                      <span className="a-t-label a-muted">Descanso</span>
                      <span className="a-t-sec a-muted">de 1:30</span>
                    </span>
                    <span className="a-t-mm">0:58</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="a-opt"
                  aria-pressed={!timerSel}
                  onClick={() => setTimerSel(false)}
                >
                  <span className="a-ck">
                    {!timerSel ? <Check width={20} height={20} className="a-i" /> : null}
                  </span>
                  <b className="a-t-title">No, voy a mi ritmo</b>
                  <small className="a-t-sec">
                    Registrás la serie y pasás directo a la siguiente. Sin reloj.
                  </small>
                </button>
              </div>
              <div className="a-grow" />
              <button type="button" className="a-btn" onClick={finalizar}>
                Listo, ver mis días
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
