import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SEGUNDOS,
  esVideoDeStorage,
  normalizarEnlaceVideo,
  rutaVideoSerie,
  validarArchivoVideo,
} from "@/lib/athlete/video-serie";

describe("GOZS-577 (BE-03 CP2): video-serie utilidades y validaciones", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("normalizarEnlaceVideo", () => {
    it("acepta enlaces https válidos y recorta espacios", () => {
      expect(normalizarEnlaceVideo("  https://youtu.be/x  ")).toBe("https://youtu.be/x");
    });

    it("convierte http a https", () => {
      expect(normalizarEnlaceVideo("http://youtu.be/x")).toBe("https://youtu.be/x");
    });

    it("rechaza esquemas peligrosos o no http(s) como javascript:", () => {
      expect(normalizarEnlaceVideo("javascript:alert(1)")).toBeNull();
      expect(normalizarEnlaceVideo("data:text/html,<script>1</script>")).toBeNull();
      expect(normalizarEnlaceVideo("ftp://files.example.com/v.mp4")).toBeNull();
    });

    it("rechaza cadenas vacías o texto sin esquema", () => {
      expect(normalizarEnlaceVideo("")).toBeNull();
      expect(normalizarEnlaceVideo("   ")).toBeNull();
      expect(normalizarEnlaceVideo("youtu.be/x")).toBeNull();
    });

    it("rechaza enlaces mayores a 2.048 caracteres", () => {
      const larga = `https://example.com/${"a".repeat(2040)}`;
      expect(larga.length).toBeGreaterThan(2048);
      expect(normalizarEnlaceVideo(larga)).toBeNull();
    });
  });

  describe("rutaVideoSerie", () => {
    it("arma <alumno_id>/<sesion_id>/<ejercicio_id>/<numero_serie>-<uuid>.<ext>", () => {
      const ruta = rutaVideoSerie({
        alumnoId: "11111111-1111-4111-8111-111111111111",
        sesionId: "22222222-2222-4222-8222-222222222222",
        ejercicioId: "33333333-3333-4333-8333-333333333333",
        numeroSerie: 2,
        ext: ".MOV",
      });
      expect(ruta).toMatch(
        /^11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\/33333333-3333-4333-8333-333333333333\/2-[0-9a-f-]{36}\.mov$/,
      );
    });
  });

  describe("esVideoDeStorage", () => {
    it("detecta el prefijo storage:videos-series/", () => {
      expect(esVideoDeStorage("storage:videos-series/a/b/c/1-uuid.mp4")).toBe(true);
      expect(esVideoDeStorage("https://youtu.be/x")).toBe(false);
      expect(esVideoDeStorage(null)).toBe(false);
      expect(esVideoDeStorage(undefined)).toBe(false);
    });
  });

  describe("validarArchivoVideo", () => {
    it("rechaza archivo de 101 MB como muy-pesado", async () => {
      expect(VIDEO_MAX_BYTES).toBe(104_857_600);
      expect(VIDEO_MAX_SEGUNDOS).toBe(120);
      const fake101Mb = {
        size: 101 * 1024 * 1024,
        type: "video/mp4",
        name: "pesado.mp4",
      } as unknown as File;
      await expect(validarArchivoVideo(fake101Mb)).resolves.toBe("muy-pesado");
    });

    it("rechaza formatos no permitidos como formato", async () => {
      const imagen = new File(["abc"], "foto.png", { type: "image/png" });
      await expect(validarArchivoVideo(imagen)).resolves.toBe("formato");
    });

    it("rechaza videos mayores a 120 segundos como muy-largo cuando el navegador informa duración", async () => {
      const listeners: Record<string, Array<() => void>> = {};
      const fakeVideo = {
        preload: "",
        duration: 125,
        set src(_v: string) {
          queueMicrotask(() => listeners.loadedmetadata?.forEach((fn) => fn()));
        },
        addEventListener(ev: string, fn: () => void) {
          listeners[ev] = [...(listeners[ev] ?? []), fn];
        },
        removeEventListener: vi.fn(),
        removeAttribute: vi.fn(),
      };
      vi.stubGlobal("document", { createElement: () => fakeVideo });
      const origUrl = globalThis.URL;
      vi.stubGlobal("URL", Object.assign(origUrl, {
        createObjectURL: () => "blob:mock-video",
        revokeObjectURL: vi.fn(),
      }));

      const archivo = new File(["video"], "largo.mp4", { type: "video/mp4" });
      await expect(validarArchivoVideo(archivo)).resolves.toBe("muy-largo");
    });

    it("acepta por tamaño si el navegador no informa duración o no hay DOM", async () => {
      const archivo = new File(["video"], "corto.mp4", { type: "video/mp4" });
      await expect(validarArchivoVideo(archivo)).resolves.toBe("ok");
    });
  });
});
