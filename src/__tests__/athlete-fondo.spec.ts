import { describe, expect, it } from "vitest";
import { DEFORMED_GRID_CONFIG, deformedGridSvg, fbm2D } from "@/lib/athlete/fondo";

const paths = (svg: string) => svg.match(/<path d="[^"]+"\/>/g) ?? [];

describe("fondo Deformed Grid Mesh II", () => {
  it("configuración cerrada por defecto", () => {
    expect(DEFORMED_GRID_CONFIG).toMatchObject({
      cols: 30, rows: 34, warp: 70, freq: 0.6, fill: 1, angle: 195,
      strokeWidth: 1, opacity: 0.14, curves: true,
    });
  });

  it("es determinista y trae 35 filas + 31 columnas", () => {
    const a = deformedGridSvg(false, 1234, "t");
    expect(deformedGridSvg(false, 1234, "t")).toBe(a);
    expect(paths(a)).toHaveLength(35 + 31);
    expect(a).toContain('stroke-width="1"');
    expect(a).toContain('stroke-opacity="0.14"');
    expect(a).toContain('viewBox="0 0 390 820"');
    expect(a).toContain("Q");
  });

  it("gradiente de máscara a 195° (fórmula trigonométrica) con 3 stops", () => {
    const a = deformedGridSvg(false, 1, "t");
    expect(a).toContain('x1="98.3%" y1="62.9%" x2="1.7%" y2="37.1%"');
    expect(a).toContain('<stop offset="0%" stop-color="#fff" stop-opacity="1"/>');
    expect(a).toContain('<stop offset="45%" stop-color="#fff" stop-opacity="0.72"/>');
    expect(a).toContain('<stop offset="100%" stop-color="#fff" stop-opacity="0"/>');
  });

  it("sangrado pad=28 con warp=0 (polilínea para leer coordenadas)", () => {
    const a = deformedGridSvg(false, 1, "t", { ...DEFORMED_GRID_CONFIG, warp: 0, curves: false });
    const [h0, hUlt] = [paths(a)[0], paths(a)[34]];
    expect(h0).toMatch(/^<path d="M-28.0 -28.0L/);
    expect(h0).toContain("L418.0 -28.0");
    expect(hUlt).toMatch(/^<path d="M-28.0 848.0L/);
  });

  it("fbm2D en [-1,1], determinista y con 2 octavas", () => {
    for (let i = 0; i < 50; i++) {
      const v = fbm2D(i * 0.6, i * 0.37, 1234);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(fbm2D(i * 0.6, i * 0.37, 1234)).toBe(v);
    }
    expect(fbm2D(0.6, 0.6, 1)).not.toBe(fbm2D(0.6, 0.6, 2));
  });

  it("desplazamiento usa c*freq y r*freq sobre la grilla con sangrado", () => {
    const a = deformedGridSvg(false, 1234, "t", { ...DEFORMED_GRID_CONFIG, curves: false });
    const dx = fbm2D(0, 0, 1234) * 70;
    const dy = fbm2D(19.3, 47.1, 1234 + 101) * 70;
    expect(paths(a)[0]).toContain(`M${(-28 + dx).toFixed(1)} ${(-28 + dy).toFixed(1)}L`);
  });

  it("semillas distintas dan coordenadas distintas", () => {
    expect(paths(deformedGridSvg(false, 1, "t"))).not.toEqual(paths(deformedGridSvg(false, 2, "t")));
  });

  it("colores por tema e IDs sin colisión", () => {
    const l = deformedGridSvg(false, 5, "m3m-l-5");
    const d = deformedGridSvg(true, 5, "m3m-d-5");
    expect(l).toContain('fill="#FAFAFA"');
    expect(l).toContain('stroke="#09090B"');
    expect(d).toContain('fill="#09090B"');
    expect(d).toContain('stroke="#FAFAFA"');
    expect(l).toContain('id="m3m-l-5-m"');
    expect(d).toContain('id="m3m-d-5-m"');
    expect(l).not.toContain("m3m-d-");
  });
});
