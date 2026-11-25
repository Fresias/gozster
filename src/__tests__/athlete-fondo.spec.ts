import { describe, expect, it } from "vitest";
import { DEFORMED_GRID_CONFIG, deformedGridSvg } from "@/lib/athlete/fondo";

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

  it("gradiente de máscara a 195° con recorrido completo", () => {
    const a = deformedGridSvg(false, 1, "t");
    // 195° CSS: vector (sin, -cos) = (-0.2588, 0.9659) → de arriba-derecha a abajo-izquierda
    expect(a).toContain('x1="0.6294" y1="0.0170" x2="0.3706" y2="0.9830"');
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
