import { describe, expect, it } from "vitest";
import { parseIndicaciones, tieneIndicaciones } from "@/lib/athlete/indicaciones";

describe("BE-04 · Parser de indicaciones con formato", () => {
  it("parsea el ejemplo completo con pasos, puntos clave, errores comunes, tempo y respiración", () => {
    const texto = [
      "Pasos:",
      "1. Barra apoyada en los trapecios, manos un poco más abiertas que los hombros.",
      "2. Pies al ancho de la cadera, puntas levemente hacia afuera.",
      "3. Inspirá, apretá el abdomen y bajá sentándote hacia atrás.",
      "Puntos clave:",
      "- Las rodillas siguen la dirección de las puntas.",
      "• El peso queda en todo el pie, no en las puntas.",
      "* La mirada al frente, el cuello neutro.",
      "Errores comunes:",
      "- Talones que se despegan del piso.",
      "1) Redondear la espalda abajo de todo.",
      "Línea sin marcador dentro de la sección.",
      "Tempo: 3-1-X-1",
      "Respiración: inspirá arriba, aguantá al bajar.",
    ].join("\n");

    const parsed = parseIndicaciones(texto);

    expect(parsed).toEqual({
      libre: [],
      pasos: [
        "Barra apoyada en los trapecios, manos un poco más abiertas que los hombros.",
        "Pies al ancho de la cadera, puntas levemente hacia afuera.",
        "Inspirá, apretá el abdomen y bajá sentándote hacia atrás.",
      ],
      clave: [
        "Las rodillas siguen la dirección de las puntas.",
        "El peso queda en todo el pie, no en las puntas.",
        "La mirada al frente, el cuello neutro.",
      ],
      errores: [
        "Talones que se despegan del piso.",
        "Redondear la espalda abajo de todo.",
        "Línea sin marcador dentro de la sección.",
      ],
      tempo: "3-1-X-1",
      respiracion: "inspirá arriba, aguantá al bajar.",
    });
    expect(tieneIndicaciones(parsed)).toBe(true);
  });

  it("mantiene el texto viejo sin encabezados intacto en `libre`", () => {
    const textoViejo = [
      "Bajá la barra hasta el pecho, controlada, y empujá sin despegar los glúteos del banco.",
      "- Cuidar posición de escápulas",
      "1. Calentar bien los hombros",
    ].join("\n");

    const parsed = parseIndicaciones(textoViejo);

    expect(parsed).toEqual({
      libre: [
        "Bajá la barra hasta el pecho, controlada, y empujá sin despegar los glúteos del banco.",
        "- Cuidar posición de escápulas",
        "1. Calentar bien los hombros",
      ],
      pasos: [],
      clave: [],
      errores: [],
      tempo: null,
      respiracion: null,
    });
    expect(tieneIndicaciones(parsed)).toBe(true);
  });

  it("conserva el texto previo al primer encabezado en `libre` y luego parsea secciones", () => {
    const texto = [
      "Nota general de la serie.",
      "Pasos:",
      "1. Apoyar pies firmes.",
    ].join("\n");

    const parsed = parseIndicaciones(texto);

    expect(parsed.libre).toEqual(["Nota general de la serie."]);
    expect(parsed.pasos).toEqual(["Apoyar pies firmes."]);
  });

  it("reconoce encabezados en mayúsculas, minúsculas y sin dos puntos, y Respiracion sin tilde", () => {
    const texto = [
      "PASOS",
      "1. Primer paso",
      "PUNTOS CLAVE",
      "- Punto importante",
      "ERRORES COMUNES",
      "- Error frecuente",
      "TEMPO: 2-0-2-0",
      "RESPIRACION: fluida durante todo el rango",
    ].join("\n");

    const parsed = parseIndicaciones(texto);

    expect(parsed).toEqual({
      libre: [],
      pasos: ["Primer paso"],
      clave: ["Punto importante"],
      errores: ["Error frecuente"],
      tempo: "2-0-2-0",
      respiracion: "fluida durante todo el rango",
    });
  });

  it("soporta saltos de línea CRLF (\\r\\n) y descarta líneas vacías", () => {
    const texto = "\r\n  Pasos:  \r\n\r\n  1. Subir explosivo  \r\n\r\n  Tempo:   3-1-X-1  \r\n\r\n";

    const parsed = parseIndicaciones(texto);

    expect(parsed).toEqual({
      libre: [],
      pasos: ["Subir explosivo"],
      clave: [],
      errores: [],
      tempo: "3-1-X-1",
      respiracion: null,
    });
  });

  it("corta la sección activa cuando aparece Tempo: o Respiración: en el medio", () => {
    const texto = [
      "Pasos:",
      "1. Colocar la barra",
      "Tempo: 3-0-1-0",
      "Observación posterior fuera de sección",
      "Puntos clave:",
      "- Pecho arriba",
    ].join("\n");

    const parsed = parseIndicaciones(texto);

    expect(parsed.pasos).toEqual(["Colocar la barra"]);
    expect(parsed.tempo).toBe("3-0-1-0");
    expect(parsed.libre).toEqual(["Observación posterior fuera de sección"]);
    expect(parsed.clave).toEqual(["Pecho arriba"]);
  });

  it("devuelve estructura vacía para null, undefined, cadena vacía o solo espacios", () => {
    const vacio = {
      libre: [],
      pasos: [],
      clave: [],
      errores: [],
      tempo: null,
      respiracion: null,
    };

    for (const entrada of [null, undefined, "", "   \r\n\t  "]) {
      const parsed = parseIndicaciones(entrada);
      expect(parsed).toEqual(vacio);
      expect(tieneIndicaciones(parsed)).toBe(false);
    }
  });

  it("devuelve texto con <script> tal cual sin sanitizar HTML (React lo escapa)", () => {
    const texto = [
      "<script>alert('xss')</script>",
      "Pasos:",
      "1. <script>alert(1)</script>",
      "Tempo: <b>3-1-1-0</b>",
    ].join("\n");

    const parsed = parseIndicaciones(texto);

    expect(parsed.libre).toEqual(["<script>alert('xss')</script>"]);
    expect(parsed.pasos).toEqual(["<script>alert(1)</script>"]);
    expect(parsed.tempo).toBe("<b>3-1-1-0</b>");
  });

  it("tieneIndicaciones devuelve true cuando al menos un campo tiene datos", () => {
    expect(tieneIndicaciones(parseIndicaciones("Texto libre"))).toBe(true);
    expect(tieneIndicaciones(parseIndicaciones("Pasos:\n1. Paso"))).toBe(true);
    expect(tieneIndicaciones(parseIndicaciones("Puntos clave:\n- Clave"))).toBe(true);
    expect(tieneIndicaciones(parseIndicaciones("Errores comunes:\n- Error"))).toBe(true);
    expect(tieneIndicaciones(parseIndicaciones("Tempo: 3-1-X-1"))).toBe(true);
    expect(tieneIndicaciones(parseIndicaciones("Respiración: nasal"))).toBe(true);
  });
});
