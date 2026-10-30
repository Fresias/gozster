import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";
/**
 * ============================================================================
 * GOZSter QA & Unit Tests: Reproductor de Técnica y Video YouTube
 * Archivo: src/__tests__/athlete-youtube-video.spec.ts
 * GitHub Issue: #33 (Pilar C)
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractYouTubeVideoId,
  getYouTubeEmbedUrl,
  getYouTubeSearchUrl,
} from "@/lib/youtube";
import { useAthleteStore } from "@/store/use-athlete-store";
import { REAL_ALUMNOS } from "@/services/real-mynter-data";

describe("Pilar C: Utilidades de Extracción de Video de YouTube", () => {
  it("debe extraer ID limpio cuando se proporciona un ID directo de 11 caracteres (formato Mynter)", () => {
    const rawId = "noTGHlQVKfA";
    expect(extractYouTubeVideoId(rawId)).toBe("noTGHlQVKfA");

    const anotherId = "Jd9rYOetS9U";
    expect(extractYouTubeVideoId(anotherId)).toBe("Jd9rYOetS9U");
  });

  it("debe extraer ID a partir de URLs estándar de YouTube (watch?v=)", () => {
    const url = "https://www.youtube.com/watch?v=bEv6CCg2BC8";
    expect(extractYouTubeVideoId(url)).toBe("bEv6CCg2BC8");

    const urlWithParams = "https://www.youtube.com/watch?v=rT7DgCr-3pg&feature=shared";
    expect(extractYouTubeVideoId(urlWithParams)).toBe("rT7DgCr-3pg");
  });

  it("debe extraer ID a partir de URLs acortadas (youtu.be)", () => {
    const url = "https://youtu.be/SEdqd1n0cvg";
    expect(extractYouTubeVideoId(url)).toBe("SEdqd1n0cvg");
  });

  it("debe extraer ID a partir de URLs embebidas (embed/)", () => {
    const url = "https://www.youtube.com/embed/noTGHlQVKfA";
    expect(extractYouTubeVideoId(url)).toBe("noTGHlQVKfA");
  });

  it("debe extraer ID a partir de URLs de YouTube Shorts", () => {
    const url = "https://www.youtube.com/shorts/noTGHlQVKfA";
    expect(extractYouTubeVideoId(url)).toBe("noTGHlQVKfA");
  });

  it("debe retornar null para entradas vacías, nulas o inválidas", () => {
    expect(extractYouTubeVideoId(null)).toBeNull();
    expect(extractYouTubeVideoId(undefined)).toBeNull();
    expect(extractYouTubeVideoId("")).toBeNull();
    expect(extractYouTubeVideoId("   ")).toBeNull();
    expect(extractYouTubeVideoId("https://google.com")).toBeNull();
  });

  it("debe generar URLs de YouTube nocookie con parámetros de privacidad y control", () => {
    const embed = getYouTubeEmbedUrl("noTGHlQVKfA");
    expect(embed).toBe(
      "https://www.youtube-nocookie.com/embed/noTGHlQVKfA?rel=0&modestbranding=1&enablejsapi=1",
    );

    expect(getYouTubeEmbedUrl(null)).toBeNull();
  });

  it("debe generar URLs de búsqueda en YouTube en caso de fallback", () => {
    const searchUrl = getYouTubeSearchUrl("Sentadilla Búlgara");
    expect(searchUrl).toContain("https://www.youtube.com/results?search_query=");
    expect(searchUrl).toContain("tecnica");
    expect(searchUrl).toContain("Sentadilla");
  });
});

describe("Pilar C: Integración en Athlete Store y Rutinas de Entrenamiento", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  it("la sesión por defecto debe incluir ejercicios con IDs de video y comentarios técnicos", () => {
    const session = useAthleteStore.getState().currentSession;
    expect(session.ejercicios.length).toBeGreaterThan(0);

    const sentadilla = session.ejercicios.find((e) =>
      e.nombre.toLowerCase().includes("sentadilla"),
    );
    expect(sentadilla).toBeDefined();
    expect(sentadilla?.url_video).toBe("bEv6CCg2BC8");
    expect(sentadilla?.comentario).toBeTruthy();

    const banca = session.ejercicios.find((e) =>
      e.nombre.toLowerCase().includes("press de banca"),
    );
    expect(banca?.url_video).toBe("rT7DgCr-3pg");
    expect(banca?.comentario).toBeTruthy();
  });

  it("debe permitir cargar la rutina real de un alumno migrado desde Mynter", () => {
    const alumno1 = REAL_ALUMNOS[0];
    expect(alumno1).toBeDefined();
    if (!alumno1) throw new Error("No hay alumnos en REAL_ALUMNOS");

    sembrarPlanAlumno(alumno1.id);
    const loaded = useAthleteStore.getState().loadStudentSession(alumno1.id);
    expect(loaded).toBe(true);

    const session = useAthleteStore.getState().currentSession;
    expect(session.studentId).toBe(alumno1.id);
    expect(session.studentName).toBe(alumno1.nombre_completo);
    expect(session.ejercicios.length).toBeGreaterThan(0);

    // Verificar que los ejercicios preserven el esquema con descanso, reps y posible video
    session.ejercicios.forEach((ej) => {
      expect(ej.id).toBeTruthy();
      expect(ej.nombre).toBeTruthy();
      expect(ej.descanso_segundos).toBeGreaterThan(0);
      expect(ej.series.length).toBeGreaterThan(0);
      expect(typeof ej.repeticiones_objetivo).toBe("string");
    });
  });

  it("el temporizador de descanso debe mantenerse inmutable y no ser afectado por la consulta de videos", () => {
    const store = useAthleteStore.getState();

    // Iniciar temporizador de descanso
    store.startRestTimer(90, "Sentadilla Trasera con Barra", 1);
    expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
    expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(90);

    // Simular que el atleta consulta la técnica de un video (el temporizador sigue corriendo)
    store.tickTimer();
    expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(89);
    expect(useAthleteStore.getState().restTimer.isActive).toBe(true);

    // Completar serie de un ejercicio no cancela el cronómetro del ejercicio anterior
    store.completeSet("ej-sentadilla-1", 1);
    const ejercicio = useAthleteStore
      .getState()
      .currentSession.ejercicios.find((e) => e.id === "ej-sentadilla-1");
    expect(ejercicio?.series[0]?.completada).toBe(true);
  });
});
