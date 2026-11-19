import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { AthleteSheet, siguienteElementoFoco } from "@/components/athlete/athlete-sheet";

describe("FE-07 CP1: Componente de hoja base (AthleteSheet)", () => {
  it("no renderiza nada cuando isOpen es false", () => {
    const html = renderToStaticMarkup(
      createElement(
        AthleteSheet,
        {
          isOpen: false,
          onClose: () => {},
          title: "Indicaciones del ejercicio",
        },
        createElement("p", null, "Contenido"),
      ),
    );
    expect(html).toBe("");
  });

  it("renderiza role=dialog, aria-modal, aria-labelledby, encabezado fijo y clases .a-sheet", () => {
    const html = renderToStaticMarkup(
      createElement(
        AthleteSheet,
        {
          isOpen: true,
          onClose: () => {},
          title: "Indicaciones del ejercicio",
          subtitle: "Sentadilla con barra · Cuádriceps, Glúteos",
          titleId: "sheet-title-test",
          dialogTestId: "sheet-dialog-test",
          closeTestId: "sheet-close-test",
        },
        createElement("p", null, "Cuerpo de la hoja"),
      ),
    );

    expect(html).toContain('class="a-sheet-wrap"');
    expect(html).toContain('class="a-sheet"');
    expect(html).toContain('class="a-sh-h"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="sheet-title-test"');
    expect(html).toContain('id="sheet-title-test"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('data-testid="sheet-dialog-test"');
    expect(html).toContain('data-testid="sheet-close-test"');
    expect(html).toContain("Indicaciones del ejercicio");
    expect(html).toContain("Sentadilla con barra · Cuádriceps, Glúteos");
    expect(html).toContain("Cuerpo de la hoja");
  });

  it("aplica la clase a-center cuando center es true", () => {
    const html = renderToStaticMarkup(
      createElement(
        AthleteSheet,
        {
          isOpen: true,
          onClose: () => {},
          title: "Suscripción",
          center: true,
        },
        createElement("p", null, "Detalle"),
      ),
    );
    expect(html).toContain('class="a-sheet-wrap a-center"');
  });

  it("cicla el foco entre primero y último en Tab y Shift+Tab (siguienteElementoFoco)", () => {
    const a = "btn-cerrar";
    const b = "btn-accion";
    const c = "btn-volver";
    const lista = [a, b, c];

    // Desde fuera / título: Tab va al primero, Shift+Tab va al último
    expect(siguienteElementoFoco(lista, null, false)).toBe(a);
    expect(siguienteElementoFoco(lista, "titulo", false)).toBe(a);
    expect(siguienteElementoFoco(lista, "titulo", true)).toBe(c);

    // En el medio: flujo nativo (null)
    expect(siguienteElementoFoco(lista, b, false)).toBeNull();
    expect(siguienteElementoFoco(lista, b, true)).toBeNull();

    // En los extremos: cicla
    expect(siguienteElementoFoco(lista, c, false)).toBe(a);
    expect(siguienteElementoFoco(lista, a, true)).toBe(c);

    // Lista vacía
    expect(siguienteElementoFoco([], a, false)).toBeNull();
  });

  it("gestiona Escape en window, trap de Tab y devolución de foco al disparador", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/athlete-sheet.tsx"),
      "utf-8",
    );
    expect(src).toContain('window.addEventListener("keydown", handleKeyDown)');
    expect(src).toContain('e.key === "Escape"');
    expect(src).toContain('e.key === "Tab"');
    expect(src).toContain("previousFocusRef.current");
    expect(src).toContain("returnTarget.focus()");
  });
});
