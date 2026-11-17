// Render directo del JSX real (react-dom/server) para estados que en la app solo aparecen
// escribiendo datos (registrar una serie, terminar la sesión, reportar una molestia) o para
// componentes que hoy no están montados en ninguna ruta de /athlete.
// Uso: node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json docs/ux-ui-review/athlete-landing/tools/ssr.tsx
import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { RestTimer } from "@/components/athlete/rest-timer";
import { AvisoRecord } from "@/components/athlete/aviso-record";
import { PainReportBanner, getPainBannerConfig } from "@/components/athlete/pain-banner";
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import { HabitTracker } from "@/components/athlete/habit-tracker";
import { NutritionTracker } from "@/components/athlete/nutrition-tracker";
import { PlateCalculatorModal } from "@/components/athlete/plate-calculator-modal";
import { VideoUploadModal } from "@/components/athlete/video-upload-modal";
import AthleteError from "@/app/(athlete)/athlete/error";
import { useAthleteStore } from "@/store/use-athlete-store";

const OUT = path.join(process.cwd(), "docs/ux-ui-review/athlete-landing/tools/ssr");
fs.mkdirSync(OUT, { recursive: true });

/** zustand v5 usa getInitialState() como snapshot de servidor: se actualiza en el lugar. */
function store(parcial: Record<string, unknown>) {
  useAthleteStore.setState(parcial as never);
  Object.assign(useAthleteStore.getInitialState(), useAthleteStore.getState());
}

type Fragmento = { id: string; anfitrion: string; insertar: string; el: React.ReactElement; antes?: () => void };
const timer = (isPaused: boolean) => () =>
  store({ mostrarTimerDescanso: true, restTimer: { isActive: true, isPaused, secondsRemaining: 74, totalSeconds: 90, exerciseName: "Press banca plano", setNumber: 2 } });

const FRAGMENTOS: Fragmento[] = [
  { id: "rest-timer", anfitrion: "lw-superserie", insertar: "main-end", antes: timer(false), el: <RestTimer /> },
  { id: "rest-timer-pausa", anfitrion: "lw-superserie", insertar: "main-end", antes: timer(true), el: <RestTimer /> },
  {
    id: "aviso-record", anfitrion: "lw-superserie", insertar: "aviso-record",
    el: <AvisoRecord resultado={{ esRecord: true, tipo: "peso", epley_kg: null, delta_epley_kg: null }} serie={{ peso_kg: 47.5, reps_hechas: 8 }} nombreEjercicio="Press banca plano" onClose={() => {}} />,
  },
  {
    id: "aviso-record-tecnica", anfitrion: "lw-tecnica", insertar: "aviso-record",
    el: <AvisoRecord resultado={{ esRecord: true, tipo: "peso", epley_kg: 59.4, delta_epley_kg: 2.1 }} serie={{ peso_kg: 47.5, reps_hechas: 8 }} nombreEjercicio="Press banca plano" tecnica onClose={() => {}} />,
  },
  { id: "pain-banner-leve", anfitrion: "lw-superserie", insertar: "pain-banner", el: <PainReportBanner banner={getPainBannerConfig(2, { exerciseName: "Press banca plano" })} onDismiss={() => {}} /> },
  { id: "pain-banner-moderado", anfitrion: "lw-superserie", insertar: "pain-banner", el: <PainReportBanner banner={getPainBannerConfig(5, { exerciseName: "Press banca plano" })} onDismiss={() => {}} /> },
  { id: "pain-banner-alto", anfitrion: "lw-superserie", insertar: "pain-banner", el: <PainReportBanner banner={getPainBannerConfig(8, { exerciseName: "Press banca plano" })} onDismiss={() => {}} /> },
  {
    id: "modal-cierre-dia", anfitrion: "lw-superserie", insertar: "body-end",
    el: (
      <CierreDiaModal isOpen onClose={() => {}} onVolverInicio={() => {}} tonelajeKg={4285} seriesCompletadas={13} totalSeries={13}
        duracionMinutos={54} rachaDias={4} rachaPrevia={3} metaDiasSemana={3} diasCompletadosSemana={1} studentName="Lucía Fernández" diaNombre="DÍA 1"
        recordsObtenidos={[{ exerciseName: "Press banca plano", peso_kg: 47.5, reps_hechas: 8, tipo: "peso", epley_kg: 59.4, delta_epley_kg: 2.1, numero_serie: 3 }]} />
    ),
  },
  { id: "error", anfitrion: "inicio", insertar: "main-replace", el: <AthleteError error={Object.assign(new Error("Error de ejemplo"), { digest: "0" })} reset={() => {}} /> },
  { id: "habitos", anfitrion: "inicio", insertar: "main-replace", el: <HabitTracker athleteId="0f0f0f0f-0000-4000-8000-000000000000" athleteName="Lucía Fernández" /> },
  { id: "nutricion", anfitrion: "inicio", insertar: "main-replace", el: <NutritionTracker athleteId="0f0f0f0f-0000-4000-8000-000000000000" athleteName="Lucía Fernández" /> },
  { id: "modal-calculadora-discos", anfitrion: "lw-aproximacion", insertar: "body-end", el: <PlateCalculatorModal isOpen onClose={() => {}} targetWeightKg={62.5} onApplyWeight={() => {}} /> },
  { id: "modal-subida-video", anfitrion: "lw-superserie", insertar: "body-end", el: <VideoUploadModal isOpen onClose={() => {}} exerciseName="Press banca plano" setNumber={2} onSaveVideoUrl={() => {}} /> },
];

const origError = console.error;
console.error = () => {};
for (const f of FRAGMENTOS) {
  f.antes?.();
  const html = renderToStaticMarkup(f.el);
  fs.writeFileSync(path.join(OUT, `${f.id}.json`), JSON.stringify({ id: f.id, anfitrion: f.anfitrion, insertar: f.insertar, html }));
  console.log(f.id, html.length);
}
console.error = origError;
