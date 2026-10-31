// Regla de dominio: un grupo de superserie tiene 2 o más ejercicios consecutivos del mismo día.
// Todo el constructor pasa por normalizarSuperseries; lo que no cumple la regla vuelve a ser ejercicio normal.

export interface ItemSuperserie {
  es_superserie: boolean;
  grupo_superserie: number | null;
}

interface DiaSuperserie<T extends ItemSuperserie> {
  ejercicios: T[];
}

const grupoDe = (e: ItemSuperserie) => (e.es_superserie ? e.grupo_superserie : null);

/**
 * Deja cada día con grupos válidos: los de 1 pasan a normales y un grupo repetido en otro día recibe
 * número nuevo. `abierto` es el circuito que el coach aún está armando: se conserva aunque tenga 1.
 * Mientras se edita, los miembros pueden estar separados (el ejercicio nuevo entra al final del día y
 * se sube con ▲); con `consecutivos` (al guardar) cada grupo se junta pegado a su primer miembro.
 */
export function normalizarSuperseries<T extends ItemSuperserie, D extends DiaSuperserie<T>>(
  dias: D[],
  abierto: number | null = null,
  consecutivos = false
): D[] {
  const usados = new Set<number>();
  let max = Math.max(0, ...dias.flatMap((d) => d.ejercicios.map((e) => grupoDe(e) ?? 0)));

  return dias.map((dia) => {
    const cuenta = new Map<number, number>();
    for (const e of dia.ejercicios) {
      const g = grupoDe(e);
      if (g !== null) cuenta.set(g, (cuenta.get(g) ?? 0) + 1);
    }
    const nuevo = new Map<number, number>();
    for (const [g, n] of cuenta) {
      if (n < 2 && g !== abierto) continue;
      const final = g !== abierto && usados.has(g) ? ++max : g;
      nuevo.set(g, final);
      usados.add(final);
    }
    let ejercicios = dia.ejercicios.map((e) => {
      const g = grupoDe(e);
      if (g === null) return e.es_superserie || e.grupo_superserie !== null ? { ...e, es_superserie: false, grupo_superserie: null } : e;
      const final = nuevo.get(g);
      if (final === undefined) return { ...e, es_superserie: false, grupo_superserie: null };
      return final === g ? e : { ...e, grupo_superserie: final };
    });
    if (consecutivos) {
      const orden: T[] = [];
      for (const e of ejercicios) {
        const g = grupoDe(e);
        if (g === null) orden.push(e);
        else if (!orden.some((o) => grupoDe(o) === g)) orden.push(...ejercicios.filter((x) => grupoDe(x) === g));
      }
      ejercicios = orden;
    }
    return { ...dia, ejercicios };
  });
}

/** Mueve un ejercicio un lugar; si choca con un bloque de superserie ajeno lo salta entero. */
export function moverEjercicio<T extends ItemSuperserie>(lista: T[], index: number, dir: "UP" | "DOWN"): T[] {
  const paso = dir === "UP" ? -1 : 1;
  const mover = lista[index];
  if (!mover || index + paso < 0 || index + paso >= lista.length) return lista;

  let destino = index + paso;
  const g = grupoDe(lista[destino]!);
  if (g !== null && g !== grupoDe(mover)) {
    while (destino + paso >= 0 && destino + paso < lista.length && grupoDe(lista[destino + paso]!) === g) destino += paso;
  }
  const copia = [...lista];
  copia.splice(index, 1);
  copia.splice(destino, 0, mover);
  return copia;
}

/** Posición donde un ejercicio entra pegado al final del bloque `grupo` (o al final del día si no está). */
export function posicionTrasGrupo<T extends ItemSuperserie>(lista: T[], grupo: number): number {
  let ultimo = -1;
  lista.forEach((e, i) => {
    if (grupoDe(e) === grupo) ultimo = i;
  });
  return ultimo === -1 ? lista.length : ultimo + 1;
}

/** Une `exId` al grupo indicado (null = lo suelta), dejándolo pegado al bloque. */
export function asignarGrupo<T extends ItemSuperserie & { id: string }>(lista: T[], exId: string, grupo: number | null): T[] {
  const ex = lista.find((e) => e.id === exId);
  if (!ex) return lista;
  const resto = lista.filter((e) => e.id !== exId);
  if (grupo === null) {
    return lista.map((e) => (e.id === exId ? { ...e, es_superserie: false, grupo_superserie: null } : e));
  }
  const pos = posicionTrasGrupo(resto, grupo);
  resto.splice(pos, 0, { ...ex, es_superserie: true, grupo_superserie: grupo });
  return resto;
}
