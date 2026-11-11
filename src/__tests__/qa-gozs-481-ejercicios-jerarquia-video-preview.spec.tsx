import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { EjerciciosLibraryTab } from "@/components/coach/ejercicios-library-tab";
import type { Ejercicio, EjercicioEnRutina } from "@/types/database.types";
import {
  assertNoDemoLiteralsInLiveMode,
  fireEvent,
  render,
} from "@/test-utils/no-demo-literals";

vi.mock("@/lib/supabase/browser", () => ({
  SUPABASE_URL: "https://cutvhrxgrwwfntetdsdo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_BdrxwuFPjcloqpXvWYAvHw_jw8TJAEH",
  createClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  }),
}));

const mockEjercicios: Ejercicio[] = [
  {
    id: "ej-banca",
    nombre: "Press de Banca Plano con Barra",
    musculos_principales: ["Pecho", "Tríceps"],
    musculos_secundarios: ["Deltoides Anterior"],
    url_video: "https://www.youtube.com/watch?v=rT7DgCr-3pg",
    comentario: "Retraer escápulas y mantener apoyo de pies firme.",
    creado_por: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "ej-sentadilla",
    nombre: "Sentadilla Trasera con Barra",
    musculos_principales: ["Cuádriceps", "Glúteos"],
    musculos_secundarios: ["Isquiotibiales", "Core"],
    url_video: "https://youtu.be/bEv6CCg2BC8",
    comentario: "Profundidad rompiendo el paralelo, rodillas alineadas con puntas.",
    creado_por: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "ej-fondos",
    nombre: "Fondos en Paralelas",
    musculos_principales: ["Pecho", "Tríceps"],
    musculos_secundarios: [],
    url_video: null,
    comentario: "Inclinación leve hacia adelante para enfatizar pectorales.",
    creado_por: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

const mockEjerciciosEnRutina: EjercicioEnRutina[] = [
  {
    id: "er-1",
    dia_id: "dia-1",
    ejercicio_id: "ej-banca",
    orden: 1,
    series: 4,
    repeticiones: "8-10",
    descanso_segundos: 90,
    rpe_objetivo: 8,
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    tipo_serie: "NORMAL",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

describe("GOZS-481: Jerarquía Visual en Biblioteca de Ejercicios", () => {
  it("GIVEN un entrenador en la biblioteca WHEN visualiza los ejercicios THEN los títulos destacan con jerarquía clara y tipografía visiblemente diferenciada de los metadatos musculares", () => {
    const { getByTestId } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );

    const titleBanca = getByTestId("ejercicio-nombre-ej-banca");
    expect(titleBanca.textContent).toBe("Press de Banca Plano con Barra");
    // Jerarquía visual primaria dominante
    expect(titleBanca.className).toContain("text-base");
    expect(titleBanca.className).toContain("font-bold");
    expect(titleBanca.className).toContain("text-foreground");

    // Metadatos musculares atenuados
    const musculosBanca = getByTestId("ejercicio-musculos-ej-banca");
    expect(musculosBanca.textContent).toContain("Pecho");
    expect(musculosBanca.textContent).toContain("Tríceps");
    expect(musculosBanca.textContent).toContain("Deltoides Anterior");

    // Uso en rutinas presente
    const usoBadge = getByTestId("ejercicio-uso-ej-banca");
    expect(usoBadge.textContent).toContain("En 1 rutina");
  });
});

describe("GOZS-481: Panel Fijo de Video Preview con Hover (Master-Detail Desktop)", () => {
  it("GIVEN el panel lateral en estado inicial THEN muestra el estado explorador vacío sin video ni iframe", () => {
    const { getByTestId, queryByTestId } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );

    const sidebar = getByTestId("video-preview-sidebar");
    expect(sidebar).toBeTruthy();
    expect(getByTestId("video-preview-empty-state")).toBeTruthy();
    expect(queryByTestId("video-preview-thumbnail")).toBeNull();
    expect(queryByTestId("video-preview-iframe")).toBeNull();
  });

  it("GIVEN un ejercicio con video WHEN posa el mouse (hover) sobre su tarjeta THEN el panel lateral exhibe la portada HD y biomecánica sin reproducir automáticamente", () => {
    const { getByTestId, queryByTestId } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );

    const cardBanca = getByTestId("ejercicio-card-ej-banca");
    fireEvent.mouseEnter(cardBanca);

    // Muestra contenido activo
    expect(getByTestId("video-preview-active-content")).toBeTruthy();
    expect(getByTestId("video-preview-title").textContent).toContain("Press de Banca");

    // Portada HD de YouTube con ID extraído
    const thumbnail = getByTestId("video-preview-thumbnail") as HTMLImageElement;
    expect(thumbnail.src).toBe("https://img.youtube.com/vi/rT7DgCr-3pg/hqdefault.jpg");

    // Guía biomecánica principal
    expect(getByTestId("video-preview-comentario").textContent).toContain("Retraer escápulas");

    // Botón de reproducción visible
    expect(getByTestId("btn-play-preview-video")).toBeTruthy();

    // Cero autoplay desatendido
    expect(queryByTestId("video-preview-iframe")).toBeNull();
  });

  it("GIVEN que el cursor se mueve fuera de la tarjeta WHEN se sale del elemento previo THEN la vista previa desaparece inmediatamente", () => {
    const { getByTestId, queryByTestId } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );

    const cardBanca = getByTestId("ejercicio-card-ej-banca");
    fireEvent.mouseEnter(cardBanca);
    expect(getByTestId("video-preview-thumbnail")).toBeTruthy();

    // Mouse leave
    fireEvent.mouseLeave(cardBanca);
    expect(queryByTestId("video-preview-thumbnail")).toBeNull();
    expect(getByTestId("video-preview-empty-state")).toBeTruthy();
  });

  it("GIVEN que el cursor se mueve a otro ejercicio con video WHEN entra en la segunda tarjeta THEN conmuta limpiamente sin latencia", () => {
    const { getByTestId } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );

    const cardBanca = getByTestId("ejercicio-card-ej-banca");
    const cardSentadilla = getByTestId("ejercicio-card-ej-sentadilla");

    fireEvent.mouseEnter(cardBanca);
    expect(getByTestId("video-preview-title").textContent).toContain("Press de Banca");
    let thumbnail = getByTestId("video-preview-thumbnail") as HTMLImageElement;
    expect(thumbnail.src).toContain("rT7DgCr-3pg");

    // Mueve a sentadilla
    fireEvent.mouseEnter(cardSentadilla);
    expect(getByTestId("video-preview-title").textContent).toContain("Sentadilla Trasera");
    thumbnail = getByTestId("video-preview-thumbnail") as HTMLImageElement;
    expect(thumbnail.src).toContain("bEv6CCg2BC8");
    expect(getByTestId("video-preview-comentario").textContent).toContain("Profundidad");
  });

  it("GIVEN que el cursor se mueve a un ejercicio sin video WHEN entra en la tarjeta THEN la vista previa anterior desaparece", () => {
    const { getByTestId, queryByTestId } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );

    const cardBanca = getByTestId("ejercicio-card-ej-banca");
    const cardFondos = getByTestId("ejercicio-card-ej-fondos");

    fireEvent.mouseEnter(cardBanca);
    expect(getByTestId("video-preview-thumbnail")).toBeTruthy();

    // Mueve a fondos (sin video)
    fireEvent.mouseEnter(cardFondos);
    expect(queryByTestId("video-preview-thumbnail")).toBeNull();
    expect(getByTestId("video-preview-empty-state")).toBeTruthy();
  });

  it("GIVEN un preview visible WHEN el usuario hace clic en el botón de reproducción THEN reproduce el video de forma controlada y permite detenerlo", () => {
    const { getByTestId, queryByTestId } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );

    const cardBanca = getByTestId("ejercicio-card-ej-banca");
    fireEvent.mouseEnter(cardBanca);

    // Clic en el botón play del preview
    const playBtn = getByTestId("btn-play-preview-video");
    fireEvent.click(playBtn);

    // Ahora el iframe está montado de forma controlada
    const iframe = getByTestId("video-preview-iframe") as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.src).toContain("youtube-nocookie.com/embed/rT7DgCr-3pg");

    // Botón para detener la reproducción
    const stopBtn = getByTestId("btn-stop-preview-video");
    expect(stopBtn).toBeTruthy();
    fireEvent.click(stopBtn);

    // Vuelve al estado inicial
    expect(queryByTestId("video-preview-iframe")).toBeNull();
  });
});

describe("GOZS-481: Modo Mobile / Acceso Accesible sin Hover", () => {
  it("GIVEN un usuario en viewport móvil o que prefiere modal WHEN hace clic en Video YouTube THEN se abre el diálogo modal accesible", () => {
    const { getByTestId, queryByTestId } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );

    expect(queryByTestId("modal-video-preview")).toBeNull();

    const btnVideoBanca = getByTestId("btn-preview-video-ej-banca");
    fireEvent.click(btnVideoBanca);

    const modal = getByTestId("modal-video-preview");
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain("Press de Banca Plano con Barra");
    expect(getByTestId("youtube-preview-iframe")).toBeTruthy();
  });

  it("verifica que no se inyectan literales demo en modo live", () => {
    const { container } = render(
      <EjerciciosLibraryTab
        ejercicios={mockEjercicios}
        ejerciciosEnRutina={mockEjerciciosEnRutina}
      />
    );
    assertNoDemoLiteralsInLiveMode(container);
  });
});
