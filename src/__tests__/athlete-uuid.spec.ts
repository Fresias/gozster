import { afterEach, describe, expect, it, vi } from "vitest";
import { esUuid, nuevoUuid } from "@/lib/athlete/uuid";

describe("BE-00 CP2 · src/lib/athlete/uuid.ts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("esUuid", () => {
    it("acepta UUIDs válidos en minúsculas y mayúsculas", () => {
      expect(esUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      expect(esUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
    });

    it("rechaza ids heredados tipo session-*, vacíos o tipos no string", () => {
      expect(esUuid("session-today-001")).toBe(false);
      expect(esUuid("session-00000000-0000-4000-8000-000000000001-d1")).toBe(false);
      expect(esUuid("")).toBe(false);
      expect(esUuid(null)).toBe(false);
      expect(esUuid(undefined)).toBe(false);
      expect(esUuid(12345)).toBe(false);
      expect(esUuid("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
      expect(esUuid("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
    });
  });

  describe("nuevoUuid", () => {
    it("genera UUIDs v4 válidos y distintos en llamadas consecutivas", () => {
      const a = nuevoUuid();
      const b = nuevoUuid();

      expect(esUuid(a)).toBe(true);
      expect(esUuid(b)).toBe(true);
      expect(a).not.toBe(b);
    });

    it("usa crypto.getRandomValues como respaldo si falta crypto.randomUUID", () => {
      const getRandomValues = vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i += 1) {
          arr[i] = (i * 17 + 5) & 0xff;
        }
        return arr;
      });

      vi.stubGlobal("crypto", { getRandomValues });

      const id = nuevoUuid();
      expect(getRandomValues).toHaveBeenCalledTimes(1);
      expect(esUuid(id)).toBe(true);
      // Verifica bits de versión 4 y variante RFC 4122
      expect(id[14]).toBe("4");
      expect(["8", "9", "a", "b"]).toContain(id[19]);
    });
  });
});
