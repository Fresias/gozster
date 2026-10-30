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
 * Corta cada día en tramos consecutivos del mismo grupo: los de 1 pasan a normales y un grupo
 * repetido en otro tramo o día recibe número nuevo. `abierto` es el circuito que el coach aún está
 * armando: su tramo de 1 se conserva (solo en el día donde está).
 */
export function normalizarSuperseries<T extends ItemSuperserie, D extends DiaSuperserie<T>>(
  dias: D[],
  abierto: number | null = null
): D[] {
  const usados = new Set<number>();
  let max = Math.max(0, ...dias.flatMap((d) => d.ejercicios.map((e) => grupoDe(e) ?? 0)));

  return dias.map((dia) => {
    const lista = dia.ejercicios;
    const ejercicios = [...lista];
    for (let i = 0; i < lista.length; ) {
      const g = grupoDe(lista[i]!);
      let fin = i + 1;
      while (g !== null && fin < lista.length && grupoDe(lista[fin]!) === g) fin++;
      const valido = g !== null && (fin - i >= 2 || g === abierto);
      for (let k = i; k < fin; k++) {
        if (!valido) {
          ejercicios[k] = { ...lista[k]!, es_superserie: false, grupo_superserie: null };
        } else if (g !== abierto && usados.has(g!)) {
          // grupo ya usado en otro tramo/día: número nuevo para que cada bloque sea único
          const nuevo = k === i ? ++max : ejercicios[k - 1]!.grupo_superserie;
          ejercicios[k] = { ...lista[k]!, grupo_superserie: nuevo };
        }
      }
      if (valido) usados.add(ejercicios[i]!.grupo_superserie!);
      i = fin;
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
