import { describe, expect, it } from "vitest";
import { asignarGrupo, moverEjercicio, normalizarSuperseries, posicionTrasGrupo } from "@/lib/superseries";

type E = { id: string; es_superserie: boolean; grupo_superserie: number | null };
const e = (id: string, g: number | null = null): E => ({ id, es_superserie: g !== null, grupo_superserie: g });
const dia = (...ejercicios: E[]) => ({ ejercicios });
const ids = (l: E[]) => l.map((x) => `${x.id}:${x.grupo_superserie ?? "-"}`).join(",");

describe("normalizarSuperseries", () => {
  it("un grupo de 1 pasa a ejercicio normal", () => {
    const [d] = normalizarSuperseries([dia(e("a"), e("b", 1))]);
    expect(d!.ejercicios[1]).toEqual(e("b"));
  });

  it("conserva el circuito abierto aunque tenga 1 solo y lo suelta al cerrarlo", () => {
    expect(ids(normalizarSuperseries([dia(e("a", 1))], 1)[0]!.ejercicios)).toBe("a:1");
    expect(ids(normalizarSuperseries([dia(e("a", 1))], null)[0]!.ejercicios)).toBe("a:-");
  });

  it("el mismo grupo en dos días recibe un número nuevo en el segundo", () => {
    const r = normalizarSuperseries([dia(e("a", 1), e("b", 1)), dia(e("c", 1), e("d", 1))]);
    expect(ids(r[0]!.ejercicios)).toBe("a:1,b:1");
    const g = r[1]!.ejercicios[0]!.grupo_superserie;
    expect(g).not.toBe(1);
    expect(r[1]!.ejercicios[1]!.grupo_superserie).toBe(g);
  });

  it("un bloque partido por un suelto queda como tramos válidos", () => {
    const r = normalizarSuperseries([dia(e("a", 1), e("x"), e("b", 1))]);
    expect(r[0]!.ejercicios.every((x) => !x.es_superserie)).toBe(true);
  });
});

describe("moverEjercicio", () => {
  it("un suelto salta el bloque ajeno entero", () => {
    expect(ids(moverEjercicio([e("a", 1), e("b", 1), e("c", 1), e("x")], 3, "UP"))).toBe("x:-,a:1,b:1,c:1");
    expect(ids(moverEjercicio([e("x"), e("a", 1), e("b", 1)], 0, "DOWN"))).toBe("a:1,b:1,x:-");
  });

  it("dentro del bloque solo intercambia", () => {
    expect(ids(moverEjercicio([e("a", 1), e("b", 1), e("c", 1)], 1, "UP"))).toBe("b:1,a:1,c:1");
  });

  it("no pasa de los extremos", () => {
    const l = [e("a"), e("b")];
    expect(moverEjercicio(l, 0, "UP")).toBe(l);
  });
});

describe("asignarGrupo / posicionTrasGrupo", () => {
  it("une un existente pegado al grupo destino", () => {
    const r = asignarGrupo([e("a", 1), e("b", 1), e("x"), e("c", 2), e("d", 2)], "x", 2);
    expect(ids(r)).toBe("a:1,b:1,c:2,d:2,x:2");
  });

  it("sacar de un grupo lo deja normal y deja el resto válido al normalizar", () => {
    const r = normalizarSuperseries([dia(...asignarGrupo([e("a", 1), e("b", 1)], "a", null))]);
    expect(ids(r[0]!.ejercicios)).toBe("a:-,b:-");
  });

  it("posicionTrasGrupo devuelve el final si el grupo no existe", () => {
    expect(posicionTrasGrupo([e("a")], 9)).toBe(1);
  });
});
