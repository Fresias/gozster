import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  BASE, STUB, abrirRutinaDeAna, agregar, athleteApp, borrar, builder, chequeoBug, conectarBd, e, etiquetaSs, evidencia,
  guardarYComprobar, indice, irAlDia, mover, particion, pausa, prepararSesion, publicar, sembrar, tarjeta, tarjetas, tipear, verificarBd,
  verificarDia, type Db, type Dia, type Ej,
} from "./helpers/qa-constructor";

// GOZS-305 (QA humano 3/5): el coach trabaja la estructura de la "Hipertrofia 4 días" de Ana por UI: agrega y renombra
// días (tildes y emoji), intenta reordenarlos y borrarlos, arma una biserie y un circuito, separa, borra y reordena dentro
// de las superseries. Tras cada bloque guarda y compara UI, recarga y "BD" (emulada en ./helpers/qa-constructor).
// Los bugs reales son expect.soft `bug-*` con screenshot: el recorrido sigue y el spec falla solo por ellos.

const tabsDias = (page: Page) => builder(page).getByRole("button", { name: /\(\d+\)$/ });
const botonSs = (page: Page, dia: Dia, nombre: string) =>
  tarjeta(page, indice(dia, nombre)).getByRole("button", { name: /^(\+ Superserie|✓ Superserie A|Cerrar circuito)$/ });
const etiqueta = (page: Page, dia: Dia, nombre: string) => etiquetaSs(page, indice(dia, nombre));
const ej = (dia: Dia, nombre: string) => dia.ejercicios[indice(dia, nombre)]!;

/** Un grupo es contiguo si entre su primer y su último ejercicio no hay ninguno de otro grupo o suelto. */
const gruposPartidos = (claves: (string | number | null | undefined)[]) =>
  [...new Set(claves.filter((k) => k !== null && k !== undefined))]
    .filter((k) => claves.slice(claves.indexOf(k), claves.lastIndexOf(k) + 1).some((x) => x !== k));

/** "+ Superserie" sobre un ejercicio suelto abre un circuito nuevo: lo que se agregue del catálogo entra en él. */
async function abrirCircuito(page: Page, dia: Dia, nombre: string, clave: string) {
  await expect(botonSs(page, dia, nombre)).toHaveText("+ Superserie");
  await botonSs(page, dia, nombre).click();
  ej(dia, nombre).ss = clave;
  await expect(botonSs(page, dia, nombre)).toHaveText("Cerrar circuito");
}

async function agregarAlCircuito(page: Page, dia: Dia, x: Ej, cabeza: string) {
  await agregar(page, dia, x);
  ej(dia, x.nombre).ss = ej(dia, cabeza).ss;
  expect(await etiqueta(page, dia, x.nombre), `${x.nombre} entra en el circuito de ${cabeza}`).toBe(await etiqueta(page, dia, cabeza));
}

async function cerrarCircuito(page: Page, dia: Dia, nombre: string) {
  await botonSs(page, dia, nombre).click();
  await expect(botonSs(page, dia, nombre)).toHaveText("✓ Superserie A");
  await expect(builder(page).getByRole("button", { name: "Cerrar circuito" })).toHaveCount(0);
}

/** Saca un ejercicio de su superserie (si el circuito sigue abierto, el primer toque solo lo cierra). */
async function soltar(page: Page, dia: Dia, nombre: string) {
  for (let k = 0; k < 2 && (await botonSs(page, dia, nombre).textContent()) !== "+ Superserie"; k++) {
    await botonSs(page, dia, nombre).click();
    await page.waitForTimeout(120);
  }
  await expect(botonSs(page, dia, nombre)).toHaveText("+ Superserie");
  expect(await etiqueta(page, dia, nombre), `${nombre} vuelve a ser un ejercicio suelto`).toBeNull();
  delete ej(dia, nombre).ss;
}

/** Al separar o borrar uno de una biserie, el que queda tiene que volver a ser suelto (sin grupos de 1). */
async function chequeoGrupoDeUno(page: Page, info: TestInfo, dia: Dia, queda: string, bug: string, accion: string) {
  const sigue = await etiqueta(page, dia, queda);
  await chequeoBug(page, info, bug, sigue === null,
    `${accion}: '${queda}' queda solo en "${sigue}" (grupo de 1); debería volver a ser un ejercicio normal`);
  // Rama del bug: el coach no lo nota (la tarjeta sigue violeta) y lo guarda así.
  if (sigue === null) delete ej(dia, queda).ss;
}

/** Reglas de la BD para superseries: sin grupos de 1, sin números de grupo compartidos entre días, bloques contiguos. */
async function invariantesBd(page: Page, info: TestInfo, db: Db, planId: string, etapa: string) {
  const dias = db.dias_rutina.filter((d) => d.plan_id === planId).sort((a, b) => a.orden - b.orden);
  const porDia = dias.map((d) => db.ejercicios_en_rutina.filter((x) => x.dia_id === d.id).sort((a, b) => a.orden - b.orden));
  const grupos = new Map<number, { dias: Set<string>; n: number }>();
  for (const [i, filas] of porDia.entries())
    for (const f of filas.filter((x) => x.es_superserie)) {
      const g = grupos.get(f.grupo_superserie!) ?? { dias: new Set<string>(), n: 0 };
      g.dias.add(dias[i]!.nombre);
      g.n++;
      grupos.set(f.grupo_superserie!, g);
    }
  const deUno = [...grupos].filter(([, g]) => g.n === 1).map(([n, g]) => `grupo ${n} en ${[...g.dias].join("")}`);
  const compartidos = [...grupos].filter(([, g]) => g.dias.size > 1).map(([n, g]) => `grupo ${n} en ${[...g.dias].join(" y ")}`);
  const partidos = porDia.flatMap((filas, i) => gruposPartidos(filas.map((f) => f.grupo_superserie)).map((n) => `grupo ${n} en ${dias[i]!.nombre}`));
  await chequeoBug(page, info, `bug-bd-grupo-de-uno-${etapa}`, deUno.length === 0, `ejercicios_en_rutina guarda superseries de 1: ${deUno.join("; ")}`);
  await chequeoBug(page, info, `bug-bd-grupo-compartido-entre-dias-${etapa}`, compartidos.length === 0, `grupo_superserie repetido entre días: ${compartidos.join("; ")}`);
  await chequeoBug(page, info, `bug-bd-superserie-partida-${etapa}`, partidos.length === 0, `superseries no consecutivas por orden: ${partidos.join("; ")}`);
}

/** La Athlete App muestra el Día 1 con las superseries agrupadas: "Biserie A<n>" (2) o "Circuito A<n> · N ejercicios" (3+), GOZS-316. */
async function athleteSuperseries(page: Page, db: Db, planId: string, hoy: Dia) {
  const dia = db.dias_rutina.find((d) => d.plan_id === planId && d.orden === 1)!;
  const filas = db.ejercicios_en_rutina.filter((x) => x.dia_id === dia.id).sort((a, b) => a.orden - b.orden);
  const botones = page.locator('[data-testid^="exercise-select-btn-"]');
  const tags = await Promise.all(hoy.ejercicios.map(async (_, i) => {
    const tag = botones.nth(i).locator('[data-testid^="superserie-tag-"]');
    return (await tag.count()) ? (await tag.textContent())!.replace(/\s+/g, " ").replace("🔗", "").trim() : null;
  }));
  expect(particion(tags), `Athlete App: superseries agrupadas en ${hoy.nombre}`).toEqual(particion(hoy.ejercicios.map((x) => x.ss)));
  expect(tags, "Athlete App: el badge coincide con grupo_superserie de la BD")
    .toEqual(filas.map((f) => {
      if (!f.es_superserie) return null;
      const n = filas.filter((x) => x.es_superserie && x.grupo_superserie === f.grupo_superserie).length;
      return n > 2 ? `Circuito A${f.grupo_superserie} · ${n} ejercicios` : `Biserie A${f.grupo_superserie}`;
    }));
}

async function recorrido(page: Page, info: TestInfo) {
  test.setTimeout(480_000);
  const { db, plantillaId, planAnaId } = sembrar();
  const rutina: Dia[] = structuredClone(BASE);
  await conectarBd(page, db);
  await prepararSesion(page);

  // 0. Ana ya entrenaba con la rutina original (la app queda con el plan viejo en caché).
  await athleteApp(page, db, planAnaId, rutina);

  // 1. El coach abre la rutina de Ana desde la biblioteca.
  await publicar(page, db);
  await page.goto("/studio/rutinas");
  await abrirRutinaDeAna(page);
  const m = builder(page);
  const [d1, d2, d3, d4] = rutina as [Dia, Dia, Dia, Dia];

  // 2. Días: agrega uno, lo renombra con tildes y emoji y lo llena; agrega otro que queda vacío; renombra el Día 2.
  await expect(m.getByRole("button", { name: /duplicar/i }), "no existe 'duplicar día' (no se prueba)").toHaveCount(0);
  await m.getByRole("button", { name: "+ Agregar Día" }).click();
  const d5: Dia = { nombre: "Día 5", ejercicios: [] };
  rutina.push(d5);
  await expect(m.getByTestId("day-name-input")).toHaveValue("Día 5");
  d5.nombre = "Día 5: Brazos 💪 y Glúteos";
  await tipear(m.getByTestId("day-name-input"), d5.nombre);
  await agregar(page, d5, e("Curl de Bíceps", "3", "10-12", "60", "8", "Codos pegados al torso"));
  await agregar(page, d5, e("Hip Thrust", "4", "8-12", "120", "8.5", "Pausa arriba"));
  await m.getByRole("button", { name: "+ Agregar Día" }).click();
  const d6: Dia = { nombre: "Día 6: Movilidad (opcional) ñandú", ejercicios: [] };
  rutina.push(d6);
  await tipear(m.getByTestId("day-name-input"), d6.nombre);
  await irAlDia(page, d2);
  d2.nombre = "Día 2: Pierna — Cuádriceps 🦵";
  await tipear(m.getByTestId("day-name-input"), d2.nombre);
  await expect(tabsDias(page)).toHaveText(rutina.map((d) => `${d.nombre} (${d.ejercicios.length})`));

  // 3. Reordenar y borrar días: el coach busca el control (botones, menú o arrastrar la pestaña).
  const arrastrables = await tabsDias(page).evaluateAll((tabs) => tabs.filter((t) => t.closest("[draggable=true]")).length);
  const reordenar = await m.getByRole("button", { name: /(subir|bajar|mover|reordenar).*d[ií]a/i }).count();
  await chequeoBug(page, info, "bug-sin-reordenar-dias", reordenar + arrastrables > 0,
    "el constructor no tiene ningún control para reordenar días (ni ▲/▼ ni arrastrar la pestaña)");
  await irAlDia(page, d6);
  const borrarDia = await m.getByRole("button", { name: /(eliminar|borrar|quitar)\s+(el\s+)?d[ií]a/i }).count();
  await chequeoBug(page, info, "bug-sin-borrar-dia", borrarDia > 0,
    `no hay control para borrar un día (ni vacío ni con ejercicios); '${d6.nombre}' agregado por error queda para siempre`);
  for (const dia of rutina) await verificarDia(page, info, dia, "dias");
  await guardarYComprobar(page, info, db, planAnaId, rutina, "dias");

  // 4. Superseries, Día 1. Primero lo intuitivo: tocar "+ Superserie" en dos ejercicios que ya están en la rutina.
  await irAlDia(page, d1);
  await botonSs(page, d1, "Remo con Barra").click();
  await botonSs(page, d1, "Press Militar").click();
  const [remo, militar] = [await etiqueta(page, d1, "Remo con Barra"), await etiqueta(page, d1, "Press Militar")];
  await chequeoBug(page, info, "bug-superserie-no-une-existentes", remo !== null && remo === militar,
    `"+ Superserie" en Remo con Barra y luego en Press Militar debería unirlos; quedan ${remo ?? "suelto"} / ${militar ?? "suelto"}`);
  // El coach deshace el intento y arma la biserie como la UI permite: abre el circuito y agrega del catálogo.
  await soltar(page, d1, "Remo con Barra");
  await soltar(page, d1, "Press Militar");
  await abrirCircuito(page, d1, "Press de Banca Plano", "biserie");
  await agregarAlCircuito(page, d1, e("Press Inclinado con Mancuernas", "3", "8-12", "90", "8", "Banco a 30°"), "Press de Banca Plano");
  await cerrarCircuito(page, d1, "Press de Banca Plano");
  // El nuevo entra al final del día: lo sube con ▲ hasta pegarlo al Press de Banca.
  await mover(page, d1, "Press Inclinado con Mancuernas", "Subir", indice(d1, "Press Inclinado con Mancuernas") - 1);
  // Circuito de 4 + 1 a partir de Fondos (último del día): lo agregado queda pegado.
  await abrirCircuito(page, d1, "Fondos en Paralelas", "circuito");
  for (const x of [
    e("Jalón al Pecho", "3", "12", "0", "8"),
    e("Curl de Bíceps", "3", "12", "0", "8"),
    e("Elevaciones Laterales", "3", "15", "0", "9"),
    e("Plancha Abdominal", "3", "10", "60", "7", "10 = segundos x 3"),
  ]) await agregarAlCircuito(page, d1, x, "Fondos en Paralelas");
  await cerrarCircuito(page, d1, "Fondos en Paralelas");
  await verificarDia(page, info, d1, "superseries-armadas");

  // 5. Borrar uno de adentro del circuito (quedan 4, sigue siendo circuito) y mover Curl del circuito a la biserie.
  await borrar(page, d1, "Elevaciones Laterales");
  expect(await etiqueta(page, d1, "Plancha Abdominal"), "el circuito sigue entero").toBe(await etiqueta(page, d1, "Fondos en Paralelas"));
  await soltar(page, d1, "Curl de Bíceps");
  // Con dos superseries en el día, el destino se elige en el <select> "Mover a otra superserie" (decisión PM, GOZS-314).
  const biserie = await etiqueta(page, d1, "Press de Banca Plano");
  const moverA = tarjeta(page, indice(d1, "Curl de Bíceps")).getByRole("combobox", { name: "Mover a otra superserie" });
  const conSelect = (await moverA.count()) > 0;
  if (conSelect) {
    await moverA.selectOption({ label: biserie! });
    await pausa(page);
    // El ejercicio puede cambiar de lugar al unirse: el modelo toma el orden que muestra la UI.
    const orden = (await tarjetas(page).allTextContents()).map((t) => t.trim());
    d1.ejercicios.sort((a, b) => orden.indexOf(a.nombre) - orden.indexOf(b.nombre));
  } else await botonSs(page, d1, "Curl de Bíceps").click();
  const curl = await etiqueta(page, d1, "Curl de Bíceps");
  await chequeoBug(page, info, "bug-mover-entre-superseries", curl === biserie,
    conSelect ? `"Mover a otra superserie" → ${biserie} deja Curl de Bíceps en ${curl ?? "suelto"}`
      : `no hay forma de llevar Curl de Bíceps a la ${biserie}: "+ Superserie" abre otro grupo (${curl})`);
  await soltar(page, d1, "Curl de Bíceps");
  // Si Curl quedó suelto en medio del circuito, lo saca afuera con ▼.
  const iCurl = indice(d1, "Curl de Bíceps");
  const [antes, despues] = [await etiquetaSs(page, iCurl - 1), await etiquetaSs(page, iCurl + 1)];
  if (iCurl > 0 && antes !== null && antes === despues) await mover(page, d1, "Curl de Bíceps", "Bajar");
  // 6. Reordenar dentro del circuito (Plancha sube) y meter con ▼ un ejercicio suelto en medio del bloque.
  await mover(page, d1, "Plancha Abdominal", "Subir");
  await mover(page, d1, "Dominadas", "Bajar");
  const bloque = await Promise.all(d1.ejercicios.map((_, i) => etiquetaSs(page, i)));
  await chequeoBug(page, info, "bug-superserie-partida-al-reordenar", gruposPartidos(bloque).length === 0,
    `▼ deja Dominadas (suelto) en medio de ${gruposPartidos(bloque).join(", ")} sin aviso; el bloque deja de ser consecutivo`);
  await mover(page, d1, "Dominadas", "Subir");
  await verificarDia(page, info, d1, "superseries-reordenadas");

  // 7. Día 2: biserie Sentadilla + Zancadas. El coach se olvida de cerrar el circuito y pasa al Día 4.
  await irAlDia(page, d2);
  await abrirCircuito(page, d2, "Sentadilla Trasera", "pierna");
  await agregarAlCircuito(page, d2, e("Zancadas Búlgaras", "3", "10", "60", "8", "Por pierna"), "Sentadilla Trasera");
  await irAlDia(page, d4);
  await agregar(page, d4, e("Elevación de Gemelos", "4", "12-15", "45", "8.5"));
  const gemelos = await etiqueta(page, d4, "Elevación de Gemelos");
  await chequeoBug(page, info, "bug-circuito-abierto-cruza-dias", gemelos === null,
    `con el circuito del Día 2 abierto, lo agregado en el Día 4 entra en ${gemelos} (mismo grupo en dos días)`);
  if (gemelos !== null) {
    ej(d4, "Elevación de Gemelos").ss = "pierna";
    await soltar(page, d4, "Elevación de Gemelos"); // la ve violeta y la suelta
  }
  await expect(m.getByRole("button", { name: "Cerrar circuito" })).toHaveCount(0);
  await irAlDia(page, d2);
  await mover(page, d2, "Zancadas Búlgaras", "Subir", indice(d2, "Zancadas Búlgaras") - 1);
  // Separar uno de la biserie: Sentadilla debería volver a ser normal.
  await soltar(page, d2, "Zancadas Búlgaras");
  await chequeoGrupoDeUno(page, info, d2, "Sentadilla Trasera", "bug-grupo-de-uno-al-separar", "separar Zancadas de la biserie");

  // 8. Día 3: biserie Jalón + Remo y después borra Jalón (el de adentro de la superserie).
  await irAlDia(page, d3);
  await abrirCircuito(page, d3, "Jalón al Pecho", "torso");
  await agregarAlCircuito(page, d3, e("Remo con Barra", "3", "12", "60", "8"), "Jalón al Pecho");
  await cerrarCircuito(page, d3, "Jalón al Pecho");
  await mover(page, d3, "Remo con Barra", "Subir");
  await borrar(page, d3, "Jalón al Pecho");
  await chequeoGrupoDeUno(page, info, d3, "Remo con Barra", "bug-grupo-de-uno-al-borrar", "borrar Jalón al Pecho de la biserie");

  for (const dia of rutina) await verificarDia(page, info, dia, "superseries");
  await guardarYComprobar(page, info, db, planAnaId, rutina, "superseries");
  await invariantesBd(page, info, db, planAnaId, "superseries");
  await m.getByRole("button", { name: "Cancelar" }).click();
  await expect(m).toBeHidden();
  verificarBd(db, plantillaId, BASE);

  // 9. Ana reabre la app (con caché del plan viejo): días en el orden y con los nombres nuevos, superseries agrupadas.
  await athleteApp(page, db, planAnaId, rutina);
  await athleteSuperseries(page, db, planAnaId, d1);
  await evidencia(page, info, "athlete-dia-1-superseries");
}

test.describe("GOZS-305: QA humano — días y superseries del constructor", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB}/__e2e/fixtures`);
  });

  test("desktop 1440×900: coach arma días, biserie y circuito; persiste y Ana los ve agrupados", async ({ page }, info) => {
    await recorrido(page, info);
  });

  test.describe("mobile 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("@mobile coach arma días, biserie y circuito; persiste y Ana los ve agrupados", async ({ page }, info) => {
      await recorrido(page, info);
    });
  });
});
