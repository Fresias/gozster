import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState()),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

import {
  VideoUploadModal,
  VIDEO_ERROR_MENSAJES,
} from "@/components/athlete/video-upload-modal";
import { EjercicioActivo } from "@/components/athlete/ejercicio-activo";
import { useAthleteStore } from "@/store/use-athlete-store";

describe("FE-07 CP4: Hoja Video de la serie N (VideoUploadModal)", () => {
  it("renderiza título, subtítulo, grabar con capture=environment, galería, enlace y botón deshabilitado sin selección", () => {
    const html = renderToStaticMarkup(
      createElement(VideoUploadModal, {
        isOpen: true,
        onClose: () => {},
        exerciseName: "Press banca plano",
        setNumber: 2,
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Video de la serie 2");
    expect(html).toContain("Press banca plano · opcional · tu coach lo ve en tu registro");
    expect(html).toContain("Grabar ahora");
    expect(html).toContain('capture="environment"');
    expect(html).toContain('accept="video/*"');
    expect(html).toContain("Elegir de la galería");
    expect(html).toContain("Hasta 2 minutos o 100 MB. Sin señal, queda en el teléfono y se envía cuando vuelva.");
    expect(html).toContain("Pegar un enlace");
    expect(html).toContain("Adjuntar a la serie 2");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("📹");
  });

  it("muestra botón Quitar video cuando ya existe currentVideoUrl y onRemoveVideo", () => {
    const html = renderToStaticMarkup(
      createElement(VideoUploadModal, {
        isOpen: true,
        onClose: () => {},
        exerciseName: "Press banca plano",
        setNumber: 1,
        currentVideoUrl: "https://youtu.be/x",
        onRemoveVideo: () => {},
      }),
    );

    expect(html).toContain("Quitar video");
  });

  it("define los mensajes exactos de validación de 02-pantallas.md §3.2", () => {
    expect(VIDEO_ERROR_MENSAJES["muy-pesado"]).toBe(
      "El video pesa más de 100 MB. Grabá uno más corto o pegá un enlace.",
    );
    expect(VIDEO_ERROR_MENSAJES["muy-largo"]).toBe(
      "El video dura más de 2 minutos. Grabá uno más corto o pegá un enlace.",
    );
    expect(VIDEO_ERROR_MENSAJES.formato).toBe(
      "Ese archivo no es un video que podamos subir (MP4, MOV o WebM).",
    );
    expect(VIDEO_ERROR_MENSAJES.invalido).toBe(
      "Pegá un enlace que empiece con https://",
    );
  });

  it("ejercicio-activo.tsx monta VideoUploadModal y conecta adjuntarVideoASerie, quitarVideoDeSerie y reintentarVideoDeSerie", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx"),
      "utf-8",
    );
    expect(src).toContain("serie-video-btn-${s.numero_serie}");
    expect(src).toContain("adjuntarVideoASerie");
    expect(src).toContain("quitarVideoDeSerie");
    expect(src).toContain("reintentarVideoDeSerie");
  });
});

describe("FE-07 CP5: Estados de video en la fila de Registradas", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  it("renderiza Video (listo), Subiendo…, Video en el teléfono, Reintentar video y botón Video (ninguno) según videoEstado", () => {
    useAthleteStore.setState({
      ejercicioAbiertoId: "ej-sq",
      currentSession: {
        id: "11111111-1111-4111-8111-111111111111",
        nombre_rutina: "Lucía Fernández: DÍA 1",
        fecha: "2026-11-17",
        studentId: "22222222-2222-4222-8222-222222222222",
        studentName: "Lucía Fernández",
        dia_id: "33333333-3333-4333-8333-333333333333",
        molestias: [],
        ejercicios: [
          {
            id: "ej-sq",
            ejercicio_id: "cat-sq",
            nombre: "Sentadilla con barra",
            musculos_principales: ["Piernas"],
            descanso_segundos: 150,
            rpe_objetivo: 8,
            repeticiones_objetivo: "6-8",
            series: [
              {
                numero_serie: 1,
                peso_kg: 62.5,
                reps_hechas: 7,
                rpe_real: 8,
                completada: true,
                estimated1RM: 77,
                video_url: "https://youtu.be/x",
                videoEstado: "listo",
              },
              {
                numero_serie: 2,
                peso_kg: 62.5,
                reps_hechas: 7,
                rpe_real: 8,
                completada: true,
                estimated1RM: 77,
                videoEstado: "subiendo",
              },
              {
                numero_serie: 3,
                peso_kg: 62.5,
                reps_hechas: 7,
                rpe_real: 8,
                completada: true,
                estimated1RM: 77,
                videoEstado: "telefono",
              },
              {
                numero_serie: 4,
                peso_kg: 62.5,
                reps_hechas: 7,
                rpe_real: 8,
                completada: true,
                estimated1RM: 77,
                videoEstado: "error",
              },
              {
                numero_serie: 5,
                peso_kg: 62.5,
                reps_hechas: 7,
                rpe_real: 8,
                completada: true,
                estimated1RM: 77,
                videoEstado: "ninguno",
              },
            ],
          },
        ],
      },
    });

    const html = renderToStaticMarkup(createElement(EjercicioActivo));

    expect(html).toContain('data-testid="serie-video-listo-1"');
    expect(html).toContain('data-testid="serie-video-subiendo-2"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Subiendo…");
    expect(html).toContain('data-testid="serie-video-telefono-3"');
    expect(html).toContain("Video en el teléfono");
    expect(html).toContain('data-testid="serie-video-reintentar-4"');
    expect(html).toContain("Reintentar video");
    expect(html).toContain('data-testid="serie-video-btn-5"');
  });
});
