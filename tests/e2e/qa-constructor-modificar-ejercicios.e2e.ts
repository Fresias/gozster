import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import type { DiaRutina, Ejercicio, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

// GOZS-311 (QA humano 2/5): el coach abre la "Hipertrofia 4 días" que ya tiene asignada Ana y la modifica por UI:
// agrega, borra del medio, edita campos y reordena. Guarda dos veces (como en la vida real) y tras cada guardado
// compara UI, recarga y "BD". La BD es un estado en memoria: guardar_rutina con plan_id se emula replicando el SQL
// de 20261029130000 (UPDATE del plan, DELETE de sus días en cascada, re-INSERT con orden = posición en el array)
// y cada escritura se publica en el stub (PUT /__e2e/fixtures) para que el SSR de la recarga lea lo guardado.
const STUB = "http://localhost:54321";
const COACH = "00000000-0000-4000-8000-000000000001";
const ANA = "00000000-0000-4000-8000-0000000000a1";
const AHORA = "2026-10-20T00:00:00Z";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const session = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: COACH, exp: 4102444800, role: "authenticated" })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: COACH, aud: "authenticated", role: "authenticated", email: "coach-e2e@gozster.test", app_metadata: {}, user_metadata: {} },
};

const CATALOGO: Ejercicio[] = [
  "Press de Banca Plano", "Remo con Barra", "Press Militar", "Dominadas", "Fondos en Paralelas",
  "Sentadilla Trasera", "Peso Muerto Rumano", "Prensa de Piernas", "Extensión de Cuádriceps", "Elevación de Gemelos",
  "Press Inclinado con Mancuernas", "Jalón al Pecho", "Elevaciones Laterales", "Curl de Bíceps", "Hip Thrust",
  "Zancadas Búlgaras", "Curl Femoral Tumbado", "Plancha Abdominal",
].map((nombre) => ({
  id: randomUUID(), nombre, comentario: null, url_video: null, musculos_principales: [], musculos_secundarios: [],
  creado_por: null, created_at: AHORA, updated_at: AHORA,
}));
const idDe = (nombre: string) => CATALOGO.find((x) => x.nombre === nombre)!.id;

type Ej = { nombre: string; series: string; reps: string; descanso: string; rpe: string; notas: string };
type Dia = { nombre: string; ejercicios: Ej[] };
const e = (nombre: string, series: string, reps: string, descanso: string, rpe: string, notas = ""): Ej =>
  ({ nombre, series, reps, descanso, rpe, notas });

// La rutina que la etapa 1 deja guardada y asignada.
const BASE: Dia[] = [
  { nombre: "Día 1: Torso Pesado", ejercicios: [
    e("Press de Banca Plano", "4", "10-8-6", "180", "8.5", "Pausa de 1 s en el pecho"),
    e("Remo con Barra", "4", "10", "120", "8", "Torso a 45°, sin tirón"),
    e("Press Militar", "3", "8-12", "120", "8", "Glúteos apretados"),
    e("Dominadas", "3", "10", "120", "9", "Rango completo"),
    e("Fondos en Paralelas", "3", "4x10", "90", "7.5", "Inclinación hacia adelante"),
  ] },
  { nombre: "Día 2: Pierna", ejercicios: [
    e("Sentadilla Trasera", "5", "10-8-6", "180", "8", "Profundidad: cadera bajo rodilla"),
    e("Peso Muerto Rumano", "4", "8-12", "150", "8", "Bisagra, barra pegada"),
    e("Prensa de Piernas", "3", "10", "120", "8.5"),
    e("Extensión de Cuádriceps", "3", "4x10", "60", "9", "Sin rebote"),
    e("Elevación de Gemelos", "4", "8-12", "60", "9", "Pausa arriba 2 s"),
  ] },
  { nombre: "Día 3: Torso Volumen", ejercicios: [
    e("Jalón al Pecho", "4", "10", "90", "8", "Codos hacia el bolsillo"),
    e("Press Inclinado con Mancuernas", "4", "8-12", "90", "8"),
  ] },
  { nombre: "Día 4: Pierna + Core", ejercicios: [
    e("Hip Thrust", "4", "8-12", "120", "8", "Mentón al pecho"),
    e("Curl Femoral Tumbado", "3", "4x10", "60", "8.5"),
    e("Plancha Abdominal", "3", "10", "45", "7", "10 = segundos x 3"),
  ] },
];

// ---------- "BD" emulada ----------
type Db = {
  planes_entrenamiento: PlanEntrenamiento[];
  dias_rutina: DiaRutina[];
  ejercicios_en_rutina: EjercicioEnRutina[];
  errores_app: Record<string, unknown>[];
};

class ErrorNegocio extends Error {}

function insertarDias(db: Db, planId: string, dias: any[]) {
  dias.forEach((d, i) => {
    const dia = { id: randomUUID(), plan_id: planId, nombre: String(d.nombre ?? "").trim() || `Día ${i + 1}`, orden: i + 1, created_at: AHORA, updated_at: AHORA } as DiaRutina;
    db.dias_rutina.push(dia);
    (d.ejercicios ?? []).forEach((x: any, j: number) => {
      const fila = {
        id: randomUUID(), dia_id: dia.id, ejercicio_id: x.ejercicio_id, orden: j + 1,
        series: x.series, repeticiones: x.repeticiones, descanso_segundos: x.descanso_segundos ?? 90,
        rpe_objetivo: x.rpe_objetivo ?? null, notas: x.notas ?? null,
        es_superserie: x.es_superserie ?? false, grupo_superserie: x.grupo_superserie ?? null,
        tempo: x.tempo ?? "3-0-1-0", tempo_activo: x.tempo_activo ?? false, tipo_serie: x.tipo_serie ?? "NORMAL",
        force_rpe_required: x.force_rpe_required ?? false, created_at: AHORA, updated_at: AHORA,
      } as unknown as EjercicioEnRutina;
      // CHECKs de initial_schema_rls (series >= 1, descanso >= 0, rpe NULL o 1..10) y FK al catálogo.
      const rpe = fila.rpe_objetivo as number | null;
      if (!CATALOGO.some((c) => c.id === fila.ejercicio_id))
        throw new ErrorNegocio(`No se pudo guardar '${x.nombre}' (día ${i + 1}): el ejercicio ya no existe en el catálogo`);
      if (!Number.isInteger(fila.series) || fila.series < 1 || fila.descanso_segundos < 0 || (rpe !== null && (rpe < 1 || rpe > 10)) || !fila.repeticiones)
        throw new ErrorNegocio(`No se pudo guardar '${x.nombre}' (día ${i + 1}): revisa series, repeticiones y demás valores`);
      db.ejercicios_en_rutina.push(fila);
    });
  });
}

const aPayload = (dias: Dia[]) => dias.map((d) => ({
  nombre: d.nombre,
  ejercicios: d.ejercicios.map((x) => ({
    ejercicio_id: idDe(x.nombre), series: Number(x.series), repeticiones: x.reps, descanso_segundos: Number(x.descanso),
    rpe_objetivo: Number(x.rpe), notas: x.notas || null, tempo: "2-0-1-0",
  })),
}));

function plan(nombre: string, extra: Partial<PlanEntrenamiento>): PlanEntrenamiento {
  return {
    id: randomUUID(), profesor_id: COACH, alumno_id: null, nombre, comentarios: "Calentamiento: 10 min de movilidad.",
    etiqueta: null, tipo: "PLANTILLA", plan_origen_id: null, estado: "ACTIVO", fecha_inicio: AHORA, fecha_fin: null,
    created_at: AHORA, updated_at: AHORA, ...extra,
  };
}

function sembrar(): { db: Db; plantillaId: string; planAnaId: string } {
  const db: Db = { planes_entrenamiento: [], dias_rutina: [], ejercicios_en_rutina: [], errores_app: [] };
  const plantilla = plan("Hipertrofia 4 días", {});
  const deAna = plan("Hipertrofia 4 días", { alumno_id: ANA, tipo: "DE_ALUMNO", plan_origen_id: plantilla.id });
  db.planes_entrenamiento.push(deAna, plantilla);
  insertarDias(db, plantilla.id, aPayload(BASE));
  insertarDias(db, deAna.id, aPayload(BASE));
  return { db, plantillaId: plantilla.id, planAnaId: deAna.id };
}

// guardar_rutina con plan_id y sin sesiones (el fixture no tiene registro_sesiones): edición en el lugar.
function guardarRutina(db: Db, p: any): string {
  const nombre = String(p.nombre ?? "").trim();
  if (!nombre) throw new ErrorNegocio("La rutina necesita un nombre");
  if (!Array.isArray(p.dias) || p.dias.length === 0) throw new ErrorNegocio("La rutina necesita al menos un día");
  const existente = db.planes_entrenamiento.find((x) => x.id === p.plan_id);
  if (!existente || p.como_nueva) throw new Error("GOZS-311: la etapa 2 solo edita rutinas existentes en el lugar");
  const viejos = new Set(db.dias_rutina.filter((d) => d.plan_id === existente.id).map((d) => d.id));
  const respaldo = { dias: [...db.dias_rutina], ejs: [...db.ejercicios_en_rutina] };
  db.dias_rutina = db.dias_rutina.filter((d) => !viejos.has(d.id));
  db.ejercicios_en_rutina = db.ejercicios_en_rutina.filter((x) => !viejos.has(x.dia_id));
  try {
    insertarDias(db, existente.id, p.dias);
  } catch (err) {
    // la RPC es una transacción: si falla un ejercicio no queda nada a medias
    Object.assign(db, { dias_rutina: respaldo.dias, ejercicios_en_rutina: respaldo.ejs });
    throw err;
  }
  Object.assign(existente, { nombre, comentarios: p.comentarios ?? null, etiqueta: p.etiqueta ?? null, updated_at: new Date().toISOString() });
  return existente.id;
}

async function publicar(page: Page, db: Db, soloPlanId?: string) {
  const planes = soloPlanId ? db.planes_entrenamiento.filter((x) => x.id === soloPlanId) : db.planes_entrenamiento;
  const diasIds = new Set(db.dias_rutina.filter((d) => planes.some((x) => x.id === d.plan_id)).map((d) => d.id));
  await page.request.put(`${STUB}/__e2e/fixtures`, {
    data: {
      alumnos: [{ id: ANA, nombre_completo: "Ana Pérez", rol: "ALUMNO", email: "ana@gozster.test" }],
      ejercicios: CATALOGO,
      planes_entrenamiento: planes,
      dias_rutina: db.dias_rutina.filter((d) => diasIds.has(d.id)),
      ejercicios_en_rutina: db.ejercicios_en_rutina.filter((x) => diasIds.has(x.dia_id)),
    },
  });
}

async function conectarBd(page: Page, db: Db) {
  await page.route("**/rest/v1/rpc/guardar_rutina", async (route: Route) => {
    try {
      const id = guardarRutina(db, route.request().postDataJSON().p_payload);
      await publicar(page, db);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(id) });
    } catch (err) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: err instanceof ErrorNegocio ? "GZ010" : "XX000", message: (err as Error).message, details: null, hint: null }),
      });
    }
  });
  // .single() tras guardar: PostgREST devuelve el objeto, no el array que da el stub.
  await page.route("**/rest/v1/planes_entrenamiento*", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("id")?.replace(/^eq\./, "");
    if (route.request().method() !== "GET" || !id) return route.continue();
    const fila = db.planes_entrenamiento.find((x) => x.id === id);
    return fila ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fila) }) : route.continue();
  });
  await page.route("**/rest/v1/errores_app*", async (route) => {
    db.errores_app.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, body: "" });
  });
}

// ---------- Ritmo humano ----------
const pausa = (page: Page) => page.waitForTimeout(120);

async function tipear(campo: Locator, texto: string) {
  await campo.scrollIntoViewIfNeeded();
  await campo.click();
  await campo.press("ControlOrMeta+a");
  if (texto) await campo.pressSequentially(texto, { delay: 15 });
  else await campo.press("Backspace");
}

async function evidencia(page: Page, info: TestInfo, nombre: string) {
  const path = info.outputPath(`${nombre}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(nombre, { path, contentType: "image/png" });
}

/** Chequeo de bug: soft (el recorrido sigue) + screenshot si falla. */
async function chequeoBug(page: Page, info: TestInfo, nombre: string, ok: boolean, mensaje: string) {
  expect.soft(ok, `${nombre}: ${mensaje}`).toBe(true);
  if (!ok) await evidencia(page, info, nombre);
}

/** Como lo hace mucha gente: va al final del campo, borra con Backspace y escribe. */
async function borrarYTipear(campo: Locator, texto: string) {
  await campo.click();
  await campo.press("End");
  for (const _ of await campo.inputValue()) await campo.press("Backspace");
  await campo.pressSequentially(texto, { delay: 15 });
}

const builder = (page: Page) => page.getByTestId("routine-builder-modal");
const tarjetas = (page: Page) => builder(page).locator("h4");
const numeros = (page: Page) => builder(page).locator("span", { hasText: /^#\d+$/ });
const campoNotas = (page: Page) => builder(page).getByPlaceholder("Notas técnicas del coach para el atleta...");
const indice = (dia: Dia, nombre: string) => dia.ejercicios.findIndex((x) => x.nombre === nombre);

async function irAlDia(page: Page, dia: Dia) {
  await builder(page).getByRole("button", { name: `${dia.nombre} (${dia.ejercicios.length})` }).click();
  await expect(builder(page).getByTestId("day-name-input")).toHaveValue(dia.nombre);
}

/** Lo que muestra el constructor del día seleccionado: orden, numeración #1..#n sin huecos y cada campo. */
async function verificarDia(page: Page, info: TestInfo, dia: Dia, etapa: string) {
  const m = builder(page);
  await irAlDia(page, dia);
  try {
    await expect(tarjetas(page)).toHaveText(dia.ejercicios.map((x) => x.nombre));
    await expect(numeros(page)).toHaveText(dia.ejercicios.map((_, i) => `#${i + 1}`));
    for (const [i, x] of dia.ejercicios.entries()) {
      await expect(m.getByTestId("exercise-series-input").nth(i), `${x.nombre}: series`).toHaveValue(x.series);
      await expect(m.getByTestId("exercise-reps-input").nth(i), `${x.nombre}: reps`).toHaveValue(x.reps);
      await expect(m.getByTestId("exercise-rest-input").nth(i), `${x.nombre}: descanso`).toHaveValue(x.descanso);
      await expect(m.getByTestId("exercise-rpe-input").nth(i), `${x.nombre}: RPE`).toHaveValue(x.rpe);
      await expect(campoNotas(page).nth(i), `${x.nombre}: notas`).toHaveValue(x.notas);
    }
  } catch (err) {
    await evidencia(page, info, `fallo-${etapa}-${dia.nombre.replace(/\W+/g, "_")}`);
    throw err;
  }
}

/** Estado en BD del plan editado: mismo id, días 1..n, ejercicios con orden 1..n sin huecos ni duplicados y cada campo. */
function verificarBd(db: Db, planId: string, esperado: Dia[]) {
  const dias = db.dias_rutina.filter((d) => d.plan_id === planId).sort((a, b) => a.orden - b.orden);
  expect(dias.map((d) => [d.orden, d.nombre])).toEqual(esperado.map((d, i) => [i + 1, d.nombre]));
  for (const [i, dia] of esperado.entries()) {
    const filas = db.ejercicios_en_rutina.filter((x) => x.dia_id === dias[i]!.id).sort((a, b) => a.orden - b.orden);
    expect(filas.map((f) => f.orden), `${dia.nombre}: orden sin huecos ni duplicados`).toEqual(filas.map((_, j) => j + 1));
    expect(
      filas.map((f) => ({ id: f.ejercicio_id, series: f.series, reps: f.repeticiones, desc: f.descanso_segundos, rpe: Number(f.rpe_objetivo), notas: f.notas ?? "" })),
      `${dia.nombre}: ejercicios_en_rutina`,
    ).toEqual(dia.ejercicios.map((x) => ({ id: idDe(x.nombre), series: Number(x.series), reps: x.reps, desc: Number(x.descanso), rpe: Number(x.rpe), notas: x.notas })));
  }
}

async function agregar(page: Page, dia: Dia, x: Ej) {
  const m = builder(page);
  await m.getByTestId("open-exercise-catalog-btn").click();
  await tipear(page.getByPlaceholder("Buscar ejercicio por nombre o músculo..."), x.nombre);
  await page.locator("div.rounded-lg", { has: page.getByText(x.nombre, { exact: true }) }).first()
    .getByRole("button", { name: "+ Agregar" }).click();
  dia.ejercicios.push({ ...x });
  const i = dia.ejercicios.length - 1;
  await expect(tarjetas(page).nth(i)).toHaveText(x.nombre);
  await editar(page, dia, x.nombre, x);
}

async function editar(page: Page, dia: Dia, nombre: string, cambios: Partial<Ej>) {
  const m = builder(page);
  const i = indice(dia, nombre);
  if (cambios.series !== undefined) await tipear(m.getByTestId("exercise-series-input").nth(i), cambios.series);
  if (cambios.reps !== undefined) await tipear(m.getByTestId("exercise-reps-input").nth(i), cambios.reps);
  if (cambios.descanso !== undefined) await tipear(m.getByTestId("exercise-rest-input").nth(i), cambios.descanso);
  if (cambios.rpe !== undefined) await tipear(m.getByTestId("exercise-rpe-input").nth(i), cambios.rpe);
  if (cambios.notas !== undefined) await tipear(campoNotas(page).nth(i), cambios.notas);
  Object.assign(dia.ejercicios[i]!, cambios);
  await pausa(page);
}

async function borrar(page: Page, dia: Dia, nombre: string) {
  await builder(page).getByRole("button", { name: `Eliminar ${nombre}`, exact: true }).click();
  dia.ejercicios.splice(indice(dia, nombre), 1);
  await pausa(page);
}

async function mover(page: Page, dia: Dia, nombre: string, sentido: "Subir" | "Bajar", veces = 1) {
  for (let k = 0; k < veces; k++) {
    await builder(page).getByRole("button", { name: `${sentido} orden de ${nombre}`, exact: true }).click();
    const i = indice(dia, nombre);
    const [x] = dia.ejercicios.splice(i, 1);
    dia.ejercicios.splice(sentido === "Subir" ? i - 1 : i + 1, 0, x!);
    await pausa(page);
  }
}

async function abrirRutinaDeAna(page: Page) {
  await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: /De alumnos \(1\)/ }).click();
  const item = page.getByTestId("rutina-item").filter({ hasText: "Ana Pérez" });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("ACTIVO");
  await item.getByRole("button", { name: "Abrir" }).click();
  await expect(builder(page)).toBeVisible();
  await expect(builder(page).locator("label:has-text('Nombre de la Rutina') + input")).toHaveValue("Hipertrofia 4 días");
}

async function guardarYComprobar(page: Page, info: TestInfo, db: Db, planAnaId: string, rutina: Dia[], etapa: string) {
  const m = builder(page);
  await m.getByTestId("save-routine-to-supabase-btn").click();
  await expect(m.getByText("Rutina guardada")).toBeVisible();
  await expect(m).toBeHidden();
  expect(db.errores_app, `${etapa}: sin filas nuevas en errores_app`).toEqual([]);
  expect(db.planes_entrenamiento.find((x) => x.id === planAnaId), `${etapa}: se edita en el lugar y sigue ACTIVO`)
    .toMatchObject({ alumno_id: ANA, tipo: "DE_ALUMNO", estado: "ACTIVO", nombre: "Hipertrofia 4 días" });
  expect(db.planes_entrenamiento, `${etapa}: no aparecen planes nuevos`).toHaveLength(2);
  verificarBd(db, planAnaId, rutina);

  await page.reload();
  await abrirRutinaDeAna(page);
  for (const dia of rutina) await verificarDia(page, info, dia, `${etapa}-recarga`);
}

async function athleteApp(page: Page, db: Db, planAnaId: string, rutina: Dia[]) {
  // El stub ignora filtros: se publica solo lo que RLS le dejaría ver a Ana.
  await publicar(page, db, planAnaId);
  await page.goto("/athlete");
  await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 60_000 });
  const filas = page.locator('[data-testid^="dia-row-"]');
  await expect(filas).toHaveCount(rutina.length);
  for (const [i, dia] of rutina.entries()) await expect(filas.nth(i)).toContainText(dia.nombre);
  const hoy = rutina[0]!;
  await expect(page.getByTestId("hero-dia-hoy")).toContainText(hoy.nombre);
  await expect(page.getByTestId("hero-dia-hoy")).toContainText(`${hoy.ejercicios.length} ejercicios`);
  await page.getByTestId("empezar-dia-btn").click();
  const botones = page.locator('[data-testid^="exercise-select-btn-"]');
  await expect(botones).toHaveCount(hoy.ejercicios.length, { timeout: 30_000 });
  for (const [i, x] of hoy.ejercicios.entries()) await expect(botones.nth(i)).toContainText(x.nombre);
}

async function recorrido(page: Page, info: TestInfo) {
  test.setTimeout(360_000);
  const { db, plantillaId, planAnaId } = sembrar();
  const plantillaAntes = JSON.stringify(db.dias_rutina.filter((d) => d.plan_id === plantillaId));
  const rutina: Dia[] = structuredClone(BASE);
  await conectarBd(page, db);
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: "http://localhost:3100" }]);
  // Solo la primera vez: la Athlete App conserva su store persistido entre visitas, como en el teléfono de Ana.
  await page.addInitScript(() => {
    if (!window.localStorage.getItem("gozster-athlete-store"))
      window.localStorage.setItem("gozster-athlete-store", JSON.stringify({ state: { onboardingCompletado: true }, version: 2 }));
  });

  // 0. Ana ya entrenaba con la rutina original (la app queda con el plan viejo en caché).
  await athleteApp(page, db, planAnaId, rutina);

  // 1. El coach abre la rutina de Ana desde la biblioteca.
  await publicar(page, db);
  await page.goto("/studio/rutinas");
  await abrirRutinaDeAna(page);
  const m = builder(page);
  const [d1, d2] = [rutina[0]!, rutina[1]!];

  // 2-3. Ronda A: agregar 3 al Día 1, borrar uno del medio en Día 1 y Día 2, agregar uno al Día 2.
  await irAlDia(page, d1);
  await agregar(page, d1, e("Press Inclinado con Mancuernas", "3", "8-12", "90", "8", "Banco a 30°"));
  await agregar(page, d1, e("Elevaciones Laterales", "4", "12", "60", "9"));
  await agregar(page, d1, e("Curl de Bíceps", "3", "10", "60", "8.5", "Sin balanceo"));
  await borrar(page, d1, "Press Militar");
  await verificarDia(page, info, d1, "rondaA");
  await irAlDia(page, d2);
  await borrar(page, d2, "Prensa de Piernas");
  await agregar(page, d2, e("Zancadas Búlgaras", "3", "10", "90", "8", "Por pierna"));
  await verificarDia(page, info, d2, "rondaA");
  // Los días que no se tocaron siguen igual.
  for (const dia of rutina.slice(2)) await verificarDia(page, info, dia, "rondaA");
  await guardarYComprobar(page, info, db, planAnaId, rutina, "rondaA");

  // 4. Ronda B (rutina recién guardada, ids nuevos). Primero un descuido: cambia algo y toca "Cancelar".
  await irAlDia(page, d1);
  await tipear(m.getByTestId("exercise-series-input").nth(0), "9");
  let pregunto = false;
  page.once("dialog", (d) => {
    pregunto = true;
    void d.accept();
  });
  await m.getByRole("button", { name: "Cancelar" }).click();
  await pausa(page);
  pregunto ||= (await page.getByText(/sin guardar|descartar/i).count()) > 0;
  await chequeoBug(page, info, "bug-cancelar-descarta-sin-avisar", pregunto,
    "cerrar el constructor con cambios sin guardar debería pedir confirmación; hoy los descarta en silencio");
  await expect(m).toBeHidden();
  await page.getByTestId("rutina-item").filter({ hasText: "Ana Pérez" }).getByRole("button", { name: "Abrir" }).click();
  await verificarDia(page, info, d1, "rondaB-cancelar");

  // Editar campos: reps 10 → 8-12 → 4x10, RPE 7.5/8.5 por teclado.
  for (const reps of ["10", "8-12", "4x10"]) {
    await editar(page, d1, "Remo con Barra", { reps });
    await expect(m.getByTestId("exercise-reps-input").nth(indice(d1, "Remo con Barra"))).toHaveValue(reps);
  }
  await editar(page, d1, "Remo con Barra", { series: "5", descanso: "150", rpe: "7.5", notas: "Pausa arriba, sin tirón" });
  await editar(page, d1, "Dominadas", { rpe: "8.5", notas: "" });
  await editar(page, d1, "Elevaciones Laterales", { series: "3", reps: "12-15", descanso: "45" });
  // Borrando con Backspace en vez de seleccionar todo: el campo vacío pasa por 0 y no debe quedar "075".
  const fondos = indice(d1, "Fondos en Paralelas");
  await borrarYTipear(m.getByTestId("exercise-series-input").nth(fondos), "4");
  await borrarYTipear(m.getByTestId("exercise-rest-input").nth(fondos), "75");
  await borrarYTipear(m.getByTestId("exercise-rpe-input").nth(fondos), "8.5");
  const vistos = await Promise.all(["series", "rest", "rpe"].map((c) => m.getByTestId(`exercise-${c}-input`).nth(fondos).inputValue()));
  await chequeoBug(page, info, "bug-cero-a-la-izquierda", vistos.join(" | ") === "4 | 75 | 8.5",
    `borrar con Backspace y escribir 4 / 75 / 8.5 debería mostrar eso; se ve ${vistos.join(" / ")}`);
  // El coach ve el número raro y lo corrige seleccionando todo.
  await editar(page, d1, "Fondos en Paralelas", { series: "4", descanso: "75", rpe: "8.5" });

  // 5. Reordenar con ▲/▼: los extremos no se pueden mover fuera de la lista.
  await expect(m.getByRole("button", { name: `Subir orden de ${d1.ejercicios[0]!.nombre}`, exact: true })).toBeDisabled();
  await expect(m.getByRole("button", { name: `Bajar orden de ${d1.ejercicios.at(-1)!.nombre}`, exact: true })).toBeDisabled();
  await mover(page, d1, "Curl de Bíceps", "Subir", 2);
  await mover(page, d1, "Press de Banca Plano", "Bajar");
  await verificarDia(page, info, d1, "rondaB");
  await irAlDia(page, d2);
  await mover(page, d2, "Zancadas Búlgaras", "Subir", d2.ejercicios.length - 1);
  await editar(page, d2, "Sentadilla Trasera", { reps: "8-12", rpe: "7.5" });
  await verificarDia(page, info, d2, "rondaB");
  // Mover un ejercicio a otro día: el constructor no ofrece ningún control para hacerlo (solo ▲/▼ dentro del día).
  await expect(m.getByRole("button", { name: /mover a|otro día/i })).toHaveCount(0);
  await guardarYComprobar(page, info, db, planAnaId, rutina, "rondaB");
  await m.getByRole("button", { name: "Cancelar" }).click();
  await expect(m).toBeHidden();

  // La plantilla de origen no se toca al editar la rutina de Ana.
  expect(JSON.stringify(db.dias_rutina.filter((d) => d.plan_id === plantillaId)), "la plantilla no cambia").toBe(plantillaAntes);
  verificarBd(db, plantillaId, BASE);

  // 6-7. Ana reabre la app (con caché del plan viejo) y ve el orden y los datos nuevos.
  await athleteApp(page, db, planAnaId, rutina);
  await evidencia(page, info, "athlete-dia-1-editado");
}

test.describe("GOZS-311: QA humano — modificar ejercicios de una rutina existente", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB}/__e2e/fixtures`);
  });

  test("desktop 1440×900: coach agrega, borra, edita y reordena la rutina de Ana; persiste y Ana la ve igual", async ({ page }, info) => {
    await recorrido(page, info);
  });

  test.describe("mobile 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("@mobile coach agrega, borra, edita y reordena la rutina de Ana; persiste y Ana la ve igual", async ({ page }, info) => {
      await recorrido(page, info);
    });
  });
});
