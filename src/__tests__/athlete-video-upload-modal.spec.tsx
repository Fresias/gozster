import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  VideoUploadModal,
  VIDEO_ERROR_MENSAJES,
} from "@/components/athlete/video-upload-modal";

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

  it("ejercicio-activo.tsx monta VideoUploadModal y el botón serie-video-btn-N en Registradas", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx"),
      "utf-8",
    );
    expect(src).toContain("serie-video-btn-${s.numero_serie}");
    expect(src).toContain("adjuntarVideoASerie");
    expect(src).toContain("quitarVideoDeSerie");
  });
});
