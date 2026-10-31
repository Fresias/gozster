import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  ANA, AHORA, CATALOGO, STUB, builder, campoNotas, chequeoBug, ErrorNegocio, evidencia, idDe, pausa, plan,
  prepararSesion, publicar, tarjetas, tipear, type Db,
} from "./helpers/qa-constructor";
import type { DiaRutina, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

// GOZS-307 (QA humano 5/5): el coach se equivoca. Faltantes, valores absurdos, texto peligroso, doble clic,
// sin red, navegación a mitad de edición y mobile. Todo por UI; la "BD" es un estado en memoria.
//
// A diferencia del helper compartido (que solo edita en el lugar y rechaza repeticiones vacías), acá
// guardar_rutina se emula línea a línea desde 20261029130000: nombre con TRIM (NULL si queda vacío), día sin
// nombre → 'Día n', día sin ejercicios aceptado, casts ::INTEGER / ::NUMERIC(3,1) del JSON, CHECKs de
// initial_schema_rls (series >= 1, descanso >= 0, rpe NULL o 1..10), repeticiones TEXT NOT NULL (sin formato
// ni largo), notas y comentarios TEXT sin tope, todo en una transacción y cualquier fallo de un ejercicio como
// GZ010 con mensaje humano. asignar_rutina_a_alumno archiva la ACTIVA y clona (misma migración).
// Los bugs reales son expect.soft `bug-*` con screenshot; los invariantes que se cumplen son expect duros.

const PG_CRUDO = /violates|check constraint|null value in column|GZ0\d\d|duplicate key|invalid input syntax|PGRST|XX000|23514|22P02/i;
const PELIGROSO = `Ñandú 💪 áéíóú <script>alert(1)</script> <img src=x onerror=alert(1)> "comillas" 'simples' '; DROP TABLE planes_entrenamiento; --`;

type Llamada = { rpc: string; ok: boolean; payload: any };
type Ctx = { db: Db; conSesiones: Set<string>; offline: boolean; latenciaMs: number; llamadas: Llamada[] };

// ---------- guardar_rutina / asignar_rutina_a_alumno emulados desde el SQL ----------
class ErrorCast extends Error {}
function aEntero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!/^[+-]?\d+$/.test(s)) throw new ErrorCast(`invalid input syntax for type integer: "${s}"`);
  return parseInt(s, 10);
}
function aNumeric31(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v));
  if (String(v).trim() === "" || Number.isNaN(n)) throw new ErrorCast(`invalid input syntax for type numeric: "${v}"`);
  const r = Math.round(n * 10) / 10;
  if (Math.abs(r) >= 100) throw new ErrorCast("numeric field overflow");
  return r;
}

function insertarDiasSql(db: Db, planId: string, dias: any[]) {
  dias.forEach((d, i) => {
    const n = i + 1;
    const crudo = d?.nombre == null ? "" : String(d.nombre);
    const dia = { id: randomUUID(), plan_id: planId, nombre: crudo.trim() ? crudo : `Día ${n}`, orden: n, created_at: AHORA, updated_at: AHORA } as DiaRutina;
    db.dias_rutina.push(dia);
    (d?.ejercicios ?? []).forEach((x: any, j: number) => {
      const etiqueta = x.nombre || CATALOGO.find((c) => c.id === x.ejercicio_id)?.nombre || `ejercicio ${j + 1}`;
      const valores = new ErrorNegocio(`No se pudo guardar '${etiqueta}' (día ${n}): revisa series, repeticiones y demás valores`);
      if (!CATALOGO.some((c) => c.id === x.ejercicio_id))
        throw new ErrorNegocio(`No se pudo guardar '${etiqueta}' (día ${n}): el ejercicio ya no existe en el catálogo`);
      let fila: EjercicioEnRutina;
      try {
        const grupo = aEntero(x.grupo_superserie);
        fila = {
          id: randomUUID(), dia_id: dia.id, ejercicio_id: x.ejercicio_id, orden: j + 1,
          series: aEntero(x.series), repeticiones: x.repeticiones ?? null, descanso_segundos: aEntero(x.descanso_segundos) ?? 90,
          rpe_objetivo: aNumeric31(x.rpe_objetivo), notas: x.notas ?? null,
          es_superserie: x.es_superserie ?? false, grupo_superserie: grupo,
          tempo: x.tempo ?? "3-0-1-0", tempo_activo: x.tempo_activo ?? false, tipo_serie: x.tipo_serie ?? "NORMAL",
          force_rpe_required: x.force_rpe_required ?? false, created_at: AHORA, updated_at: AHORA,
        } as unknown as EjercicioEnRutina;
      } catch {
        throw valores; // WHEN OTHERS → GZ010
      }
      const rpe = fila.rpe_objetivo as number | null;
      const g = fila.grupo_superserie as number | null;
      const ok = fila.series !== null && fila.series >= 1 && fila.repeticiones !== null && fila.descanso_segundos >= 0
        && (rpe === null || (rpe >= 1 && rpe <= 10)) && (fila.es_superserie ? g !== null && g >= 1 : g === null)
        && ["NORMAL", "WARMUP", "DROPSET"].includes(fila.tipo_serie as string);
      if (!ok) throw valores;
      db.ejercicios_en_rutina.push(fila);
    });
  });
}

function rpcGuardar(ctx: Ctx, p: any): string {
  const { db } = ctx;
  const nombre = String(p?.nombre ?? "").trim();
  if (!nombre) throw new ErrorNegocio("La rutina necesita un nombre");
  if (!Array.isArray(p.dias) || p.dias.length === 0) throw new ErrorNegocio("La rutina necesita al menos un día");
  const planId: string | null = p.plan_id || null;
  const comoNueva = !!p.como_nueva;
  let alumnoId: string | null = p.alumno_id ?? null;
  const existente = planId ? db.planes_entrenamiento.find((x) => x.id === planId) : undefined;
  if (planId && !existente) throw new ErrorNegocio("La rutina que intentas guardar ya no existe");
  if (existente) alumnoId = existente.alumno_id;
  if (planId && !comoNueva && ctx.conSesiones.has(planId))
    throw new ErrorNegocio("Esta rutina ya tiene sesiones registradas y no se puede modificar: guárdala como nueva versión");

  const respaldo = structuredClone({ planes: db.planes_entrenamiento, dias: db.dias_rutina, ejs: db.ejercicios_en_rutina });
  try {
    let id: string;
    if (existente && !comoNueva) {
      Object.assign(existente, { nombre, comentarios: p.comentarios ?? null, etiqueta: p.etiqueta ?? null, updated_at: new Date().toISOString() });
      const viejos = new Set(db.dias_rutina.filter((d) => d.plan_id === existente.id).map((d) => d.id));
      db.dias_rutina = db.dias_rutina.filter((d) => !viejos.has(d.id));
      db.ejercicios_en_rutina = db.ejercicios_en_rutina.filter((x) => !viejos.has(x.dia_id));
      id = existente.id;
    } else {
      const nuevo = plan(nombre, {
        alumno_id: alumnoId, comentarios: p.comentarios ?? null, etiqueta: p.etiqueta ?? null,
        tipo: alumnoId ? "DE_ALUMNO" : "PLANTILLA", plan_origen_id: planId,
        estado: (alumnoId ? "BORRADOR" : "ACTIVO") as PlanEntrenamiento["estado"], fecha_inicio: new Date().toISOString(),
      });
      db.planes_entrenamiento.unshift(nuevo);
      id = nuevo.id;
    }
    insertarDiasSql(db, id, p.dias);
    return id;
  } catch (err) {
    Object.assign(db, { planes_entrenamiento: respaldo.planes, dias_rutina: respaldo.dias, ejercicios_en_rutina: respaldo.ejs });
    throw err;
  }
}

function rpcAsignar(ctx: Ctx, planId: string, alumnoId: string): string {
  const { db } = ctx;
  const origen = db.planes_entrenamiento.find((x) => x.id === planId);
  if (!origen) throw new ErrorNegocio("La rutina que intentas asignar ya no existe");
  const t = new Date().toISOString();
  for (const pl of db.planes_entrenamiento.filter((x) => x.alumno_id === alumnoId && x.estado === "ACTIVO"))
    Object.assign(pl, { estado: "INACTIVO", fecha_fin: t });
  const clon = plan(origen.nombre, {
    alumno_id: alumnoId, comentarios: origen.comentarios, tipo: "DE_ALUMNO", plan_origen_id: origen.id,
    estado: "ACTIVO" as PlanEntrenamiento["estado"], fecha_inicio: t,
  });
  db.planes_entrenamiento.unshift(clon);
  for (const d of db.dias_rutina.filter((x) => x.plan_id === origen.id).sort((a, b) => a.orden - b.orden)) {
    const nd = { ...d, id: randomUUID(), plan_id: clon.id };
    db.dias_rutina.push(nd);
    for (const x of db.ejercicios_en_rutina.filter((e) => e.dia_id === d.id)) db.ejercicios_en_rutina.push({ ...x, id: randomUUID(), dia_id: nd.id });
  }
  return clon.id;
}

async function conectar(page: Page, ctx: Ctx) {
  const rpc = (nombre: string, fn: (body: any) => string) =>
    page.route(`**/rest/v1/rpc/${nombre}`, async (route) => {
      if (ctx.offline) return route.abort("internetdisconnected");
      const body = route.request().postDataJSON();
      await new Promise((r) => setTimeout(r, ctx.latenciaMs));
      try {
        const id = fn(body);
        ctx.llamadas.push({ rpc: nombre, ok: true, payload: body });
        await publicar(page, ctx.db);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(id) });
      } catch (err) {
        ctx.llamadas.push({ rpc: nombre, ok: false, payload: body });
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: err instanceof ErrorNegocio ? "GZ010" : "XX000", message: (err as Error).message, details: null, hint: null }),
        });
      }
    });
  await rpc("guardar_rutina", (b) => rpcGuardar(ctx, b.p_payload));
  await rpc("asignar_rutina_a_alumno", (b) => rpcAsignar(ctx, b.p_plan_id, b.p_alumno_id));
  await page.route("**/rest/v1/planes_entrenamiento*", async (route) => {
    if (ctx.offline) return route.abort("internetdisconnected");
    const id = new URL(route.request().url()).searchParams.get("id")?.replace(/^eq\./, "");
    if (route.request().method() !== "GET" || !id) return route.continue();
    const fila = ctx.db.planes_entrenamiento.find((x) => x.id === id);
    return fila ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fila) }) : route.continue();
  });
  await page.route("**/rest/v1/errores_app*", async (route) => {
    if (ctx.offline) return route.abort("internetdisconnected");
    ctx.db.errores_app.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, body: "" });
  });
}

// ---------- Datos ----------
const valido = (nombre: string, extra: Record<string, unknown> = {}) => ({
  ejercicio_id: idDe(nombre), nombre, series: 4, repeticiones: "10", descanso_segundos: 120, rpe_objetivo: 8, notas: null, tempo: "2-0-1-0", ...extra,
});

function sembrar(plantillas: Record<string, string[]> = { "Plantilla QA": ["Press de Banca Plano"] }): Ctx {
  const db: Db = { planes_entrenamiento: [], dias_rutina: [], ejercicios_en_rutina: [], errores_app: [] };
  for (const [nombre, ejercicios] of Object.entries(plantillas)) {
    const p = plan(nombre, { comentarios: `Comentario de ${nombre}` });
    db.planes_entrenamiento.push(p);
    insertarDiasSql(db, p.id, [{ nombre: "Día 1: Torso", ejercicios: ejercicios.map((x) => valido(x)) }]);
  }
  return { db, conSesiones: new Set(), offline: false, latenciaMs: 50, llamadas: [] };
}

async function arrancar(page: Page, ctx: Ctx) {
  await conectar(page, ctx);
  await prepararSesion(page);
  await publicar(page, ctx.db);
  const dialogos: string[] = [];
  page.on("dialog", (d) => { dialogos.push(`${d.type()}: ${d.message()}`); void d.accept(); });
  await irABiblioteca(page);
  return dialogos;
}

// ---------- UI ----------
const irABiblioteca = async (page: Page) => {
  await page.goto("/studio/rutinas");
  await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
};
const items = (page: Page) => page.getByTestId("rutina-item");
const nombrePlan = (page: Page) => builder(page).locator("label:has-text('Nombre de la Rutina') + input");
const comentariosPlan = (page: Page) => builder(page).locator("label:has-text('Comentarios Globales') + input");
const errorVisible = (page: Page) => builder(page).locator("p.text-destructive");
const btnGuardar = (page: Page) => builder(page).getByTestId("save-routine-to-supabase-btn");
const campo = (page: Page, testid: string, i = 0) => builder(page).getByTestId(testid).nth(i);

async function nuevaRutina(page: Page) {
  await page.getByRole("button", { name: "Nueva rutina" }).click();
  await expect(builder(page)).toBeVisible();
}

async function abrirPlantilla(page: Page, nombre: string) {
  await page.getByRole("tab", { name: /Plantillas/ }).click();
  const item = items(page).filter({ hasText: nombre });
  await expect(item).toHaveCount(1);
  await item.getByRole("button", { name: "Abrir" }).click();
  await expect(builder(page)).toBeVisible();
  await expect(nombrePlan(page)).toHaveValue(nombre);
}

async function agregarEjercicio(page: Page, nombre: string, tap = false) {
  const abrir = builder(page).getByTestId("open-exercise-catalog-btn");
  await (tap ? abrir.tap() : abrir.click());
  await tipear(page.getByPlaceholder("Buscar ejercicio por nombre o músculo..."), nombre);
  const agregar = page.locator("div.rounded-lg", { has: page.getByText(nombre, { exact: true }) }).first().getByRole("button", { name: "+ Agregar" });
  await (tap ? agregar.tap() : agregar.click());
  await expect(tarjetas(page).last()).toHaveText(nombre);
  await pausa(page);
}

async function cargar(page: Page, i: number, v: { series?: string; reps?: string; descanso?: string; rpe?: string; notas?: string }) {
  if (v.series !== undefined) await tipear(campo(page, "exercise-series-input", i), v.series);
  if (v.reps !== undefined) await tipear(campo(page, "exercise-reps-input", i), v.reps);
  if (v.descanso !== undefined) await tipear(campo(page, "exercise-rest-input", i), v.descanso);
  if (v.rpe !== undefined) await tipear(campo(page, "exercise-rpe-input", i), v.rpe);
  if (v.notas !== undefined) await tipear(campoNotas(page).nth(i), v.notas);
  await pausa(page);
}

/** Clic en Guardar y espera el desenlace: "guardada" o el mensaje de error del pie. */
async function guardar(page: Page, boton: Locator = btnGuardar(page)): Promise<{ ok: boolean; mensaje: string }> {
  await boton.click();
  const exito = builder(page).getByText("Rutina guardada");
  await expect(exito.or(errorVisible(page))).toBeVisible({ timeout: 15_000 });
  if (await exito.isVisible()) {
    await expect(builder(page)).toBeHidden();
    return { ok: true, mensaje: "" };
  }
  return { ok: false, mensaje: (await errorVisible(page).innerText()).trim() };
}

async function cerrarSinGuardar(page: Page) {
  await builder(page).getByRole("button", { name: "Cancelar" }).click();
  await expect(builder(page)).toBeHidden();
}

/** ¿La UI marcó el campo (aria-invalid o mensaje propio junto al input) además del texto del pie? */
async function campoMarcado(input: Locator) {
  if ((await input.getAttribute("aria-invalid")) === "true") return true;
  const id = await input.getAttribute("aria-describedby");
  return !!id;
}

/** Mensaje humano: en español, sin texto crudo de Postgres, y con su fila en errores_app. */
async function chequeoMensaje(page: Page, info: TestInfo, ctx: Ctx, mensaje: string, nombre: string) {
  await chequeoBug(page, info, `bug-mensaje-crudo-${nombre}`, !PG_CRUDO.test(mensaje), `el coach ve texto crudo de Postgres: "${mensaje}"`);
  const fila = ctx.db.errores_app.find((r: any) => r.mensaje_humano === mensaje);
  await chequeoBug(page, info, `bug-sin-fila-errores-app-${nombre}`, !!fila && (fila as any).contexto === "guardar_rutina" && !!(fila as any).detalle_tecnico,
    `el error "${mensaje}" no dejó una fila útil en errores_app (contexto + detalle técnico)`);
}

const planesDe = (ctx: Ctx, f: (p: PlanEntrenamiento) => boolean) => ctx.db.planes_entrenamiento.filter(f);
const filasDe = (ctx: Ctx, planId: string) => {
  const dias = ctx.db.dias_rutina.filter((d) => d.plan_id === planId).sort((a, b) => a.orden - b.orden);
  return { dias, ejs: dias.flatMap((d) => ctx.db.ejercicios_en_rutina.filter((x) => x.dia_id === d.id).sort((a, b) => a.orden - b.orden)) };
};

/** Clics de un humano impaciente sobre el mismo botón: no espera a que se habilite (un botón disabled no dispara click). */
async function rafaga(page: Page, boton: Locator, veces = 3) {
  for (let k = 0; k < veces; k++) {
    await boton.click({ force: true, timeout: 1_000, noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(150);
  }
}

test.describe("GOZS-307: QA humano — errores humanos, inputs absurdos, red y mobile", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB}/__e2e/fixtures`);
  });

  // Pendiente de la etapa 1: valores por defecto de una rutina nueva y de un ejercicio recién agregado.
  test("desktop 1440×900: defaults de rutina nueva — nombre/comentario precargados y campos en 0", async ({ page }, info) => {
    test.setTimeout(240_000);
    const ctx = sembrar({});
    await arrancar(page, ctx);
    await nuevaRutina(page);

    const nombre = await nombrePlan(page).inputValue();
    const comentario = await comentariosPlan(page).inputValue();
    await chequeoBug(page, info, "bug-rutina-nueva-nombre-comentario-precargados", nombre === "" && comentario === "",
      `una rutina nueva arranca con valor real, no placeholder: nombre "${nombre}", comentario "${comentario}"`);

    await builder(page).getByTestId("add-first-day-btn").click();
    await agregarEjercicio(page, "Sentadilla Trasera");
    const defaults = {
      series: await campo(page, "exercise-series-input").inputValue(),
      reps: await campo(page, "exercise-reps-input").inputValue(),
      descanso: await campo(page, "exercise-rest-input").inputValue(),
      rpe: await campo(page, "exercise-rpe-input").inputValue(),
    };
    await info.attach("defaults-ejercicio-nuevo", { body: JSON.stringify(defaults, null, 2), contentType: "application/json" });
    await chequeoBug(page, info, "bug-ejercicio-nuevo-campos-en-0", defaults.series !== "0" && defaults.reps !== "0" && defaults.rpe !== "0",
      `un ejercicio recién agregado arranca con series=${defaults.series}, reps="${defaults.reps}", RPE=${defaults.rpe}: valores inválidos que el coach tiene que pisar`);

    // Sin tocar nada: series 0 → la BD rechaza; el mensaje no dice qué campo.
    const intacto = await guardar(page);
    expect(intacto.ok, "series 0 / RPE 0 no pasan los CHECK").toBe(false);
    expect(ctx.db.planes_entrenamiento, "no queda basura de un guardado fallido (transacción)").toHaveLength(0);
    await chequeoMensaje(page, info, ctx, intacto.mensaje, "defaults");
    await chequeoBug(page, info, "bug-ui-no-marca-campo-invalido-defaults", await campoMarcado(campo(page, "exercise-series-input")),
      `el error "${intacto.mensaje}" queda solo en el pie: ni series ni RPE se marcan y el mensaje no dice qué campo corregir`);

    // El coach corrige series y RPE pero no ve el "0" de repeticiones: se guarda así.
    await cargar(page, 0, { series: "4", rpe: "8" });
    const corregido = await guardar(page);
    expect(corregido.ok, "con series y RPE válidos guarda").toBe(true);
    const p = ctx.db.planes_entrenamiento[0]!;
    const fila = filasDe(ctx, p.id).ejs[0]!;
    await info.attach("bd-defaults", { body: JSON.stringify({ nombre: p.nombre, comentarios: p.comentarios, reps: fila.repeticiones }, null, 2), contentType: "application/json" });
    await chequeoBug(page, info, "bug-defaults-se-guardan-sin-tocar", p.nombre !== nombre && p.comentarios !== comentario && fila.repeticiones !== "0",
      `si el coach no los toca, se guardan los defaults: nombre "${p.nombre}", comentario "${p.comentarios}", repeticiones "${fila.repeticiones}"`);
  });

  test("desktop 1440×900: faltantes — sin nombre, solo espacios, sin días, día sin nombre y día vacío", async ({ page }, info) => {
    test.setTimeout(240_000);
    const ctx = sembrar({});
    await arrancar(page, ctx);
    await nuevaRutina(page);
    const sinMarca: string[] = [];

    // Rutina sin días.
    const sinDias = await guardar(page);
    expect(sinDias).toEqual({ ok: false, mensaje: "La rutina necesita al menos un día" });
    await chequeoMensaje(page, info, ctx, sinDias.mensaje, "sin-dias");

    await builder(page).getByTestId("add-first-day-btn").click();
    await agregarEjercicio(page, "Press de Banca Plano");
    await cargar(page, 0, { series: "4", reps: "10", rpe: "8" });

    for (const [caso, valor] of [["nombre-vacio", ""], ["nombre-espacios", "     "]] as const) {
      await tipear(nombrePlan(page), valor);
      const r = await guardar(page);
      expect(r, `${caso}: la BD rechaza`).toEqual({ ok: false, mensaje: "La rutina necesita un nombre" });
      await chequeoMensaje(page, info, ctx, r.mensaje, caso);
      if (!(await campoMarcado(nombrePlan(page)))) sinMarca.push(`${caso}: nombre de la rutina`);
    }
    expect(ctx.db.planes_entrenamiento, "ningún faltante dejó un plan a medias").toHaveLength(0);

    // Día 1 sin nombre, Día 2 sin ejercicios: la BD los acepta en silencio.
    await tipear(nombrePlan(page), "Faltantes QA");
    await tipear(builder(page).getByTestId("day-name-input"), "");
    await builder(page).getByRole("button", { name: "+ Agregar Día" }).click();
    await expect(builder(page).getByTestId("day-name-input")).toHaveValue("Día 2");
    const r = await guardar(page);
    const p = ctx.db.planes_entrenamiento[0];
    const { dias, ejs } = p ? filasDe(ctx, p.id) : { dias: [], ejs: [] };
    await info.attach("bd-faltantes", { body: JSON.stringify({ guardo: r.ok, dias: dias.map((d) => d.nombre), ejercicios: ejs.length }, null, 2), contentType: "application/json" });
    await chequeoBug(page, info, "bug-dia-sin-nombre-se-guarda-sin-aviso", !r.ok || dias[0]?.nombre !== "Día 1",
      `un día con el nombre borrado se guarda sin aviso (la BD lo renombra "${dias[0]?.nombre}"; en el constructor la pestaña quedó como " (1)")`);
    await chequeoBug(page, info, "bug-dia-sin-ejercicios-se-guarda", !r.ok || dias.length !== 2 || ejs.filter((x) => x.dia_id === dias[1]!.id).length > 0,
      "un día sin ejercicios se guarda sin aviso: la alumna verá un día vacío en la Athlete App");
    await chequeoBug(page, info, "bug-ui-no-marca-campo-invalido-faltantes", sinMarca.length === 0,
      `ningún faltante marca su campo; solo aparece el texto del pie (${sinMarca.join("; ")})`);
  });

  test("desktop 1440×900: valores absurdos campo por campo — qué valida la UI, qué rechaza la BD y qué pasa en silencio", async ({ page }, info) => {
    test.setTimeout(600_000);
    const ctx = sembrar();
    await arrancar(page, ctx);
    const planId = ctx.db.planes_entrenamiento[0]!.id;

    type Caso = { campo: "series" | "reps" | "descanso" | "rpe" | "notas" | "comentarios"; valor: string; invalido: boolean };
    const casos: Caso[] = [
      ...["0", "-3", "999", "2.5"].map((valor) => ({ campo: "series" as const, valor, invalido: true })),
      ...["abc", "10--8", "💪", "0", "x".repeat(200)].map((valor) => ({ campo: "reps" as const, valor, invalido: true })),
      ...["-30", "99999", ""].map((valor) => ({ campo: "descanso" as const, valor, invalido: true })),
      ...["0", "11", "7.5", "-1", "abc"].map((valor) => ({ campo: "rpe" as const, valor, invalido: valor !== "7.5" })),
      { campo: "notas", valor: "n".repeat(5_000), invalido: false },
      { campo: "comentarios", valor: "c".repeat(10_000), invalido: false },
    ];
    const testid = { series: "exercise-series-input", reps: "exercise-reps-input", descanso: "exercise-rest-input", rpe: "exercise-rpe-input" } as const;
    const enBd = (c: Caso) => {
      const p = ctx.db.planes_entrenamiento.find((x) => x.id === planId)!;
      const f = filasDe(ctx, planId).ejs[0]!;
      return { series: f.series, reps: f.repeticiones, descanso: f.descanso_segundos, rpe: f.rpe_objetivo, notas: f.notas, comentarios: p.comentarios }[c.campo];
    };
    const tabla: Record<string, unknown>[] = [];

    for (const c of casos) {
      await abrirPlantilla(page, "Plantilla QA");
      const input = c.campo === "notas" ? campoNotas(page).nth(0) : c.campo === "comentarios" ? comentariosPlan(page) : campo(page, testid[c.campo]);
      if (c.valor.length > 300) await input.fill(c.valor); // pegado
      else await tipear(input, c.valor);
      await input.blur();
      const enUi = await input.inputValue();
      const antes = structuredClone(filasDe(ctx, planId));
      const r = await guardar(page);
      const marcado = r.ok ? false : await campoMarcado(input); // tras guardar bien el modal (y el input) ya no está
      const bd = enBd(c);
      const visto = c.campo === "series" || c.campo === "descanso" || c.campo === "rpe" ? Number(enUi) : enUi;
      tabla.push({ campo: c.campo, tipeado: c.valor.length > 40 ? `${c.valor.slice(0, 12)}… (${c.valor.length})` : c.valor,
        ui: enUi.length > 40 ? `(${enUi.length} chars)` : enUi, guardo: r.ok, mensaje: r.mensaje, uiMarcaCampo: marcado,
        bd: typeof bd === "string" && bd.length > 40 ? `(${bd.length} chars)` : bd });
      if (r.ok) {
        expect(bd, `${c.campo}="${c.valor.slice(0, 20)}": lo guardado es lo que el coach veía (sin cambios silenciosos)`).toEqual(visto);
      } else {
        expect(filasDe(ctx, planId), `${c.campo}="${c.valor}": un guardado rechazado no toca la BD`).toEqual(antes);
        await chequeoMensaje(page, info, ctx, r.mensaje, `${c.campo}-${c.valor}`);
        await cerrarSinGuardar(page);
      }
    }
    await info.attach("tabla-valores-absurdos", { body: JSON.stringify(tabla, null, 2), contentType: "application/json" });
    console.table(tabla);

    const fila = (campo: string, tipeado: string) => tabla.find((t) => t.campo === campo && t.tipeado === tipeado)!;
    const invalidos = casos.filter((c) => c.invalido).map((c) => ({ c, t: fila(c.campo, c.valor.length > 40 ? `${c.valor.slice(0, 12)}… (${c.valor.length})` : c.valor) }));
    const silenciosos = invalidos.filter(({ t }) => t.guardo && !t.uiMarcaCampo && !(t.campo === "series" && t.tipeado === "999") /* → 10 con aviso "Límite máximo" */);
    const rechazadosSinMarca = invalidos.filter(({ t }) => !t.guardo && !t.uiMarcaCampo);
    const lista = (xs: typeof invalidos) => xs.map(({ t }) => `${t.campo}="${t.tipeado}"→BD ${JSON.stringify(t.bd)}`).join("; ");

    await chequeoBug(page, info, "bug-reps-acepta-cualquier-texto",
      !silenciosos.some(({ c }) => c.campo === "reps"),
      `repeticiones es texto libre sin validar en UI ni BD: ${lista(silenciosos.filter(({ c }) => c.campo === "reps"))}`);
    await chequeoBug(page, info, "bug-descanso-absurdo-se-guarda",
      !silenciosos.some(({ c }) => c.campo === "descanso"),
      `descanso sin tope ni obligatorio: ${lista(silenciosos.filter(({ c }) => c.campo === "descanso"))}`);
    await chequeoBug(page, info, "bug-series-decimal-o-negativa-se-corrige-en-silencio",
      !silenciosos.some(({ c }) => c.campo === "series" || c.campo === "rpe"),
      `series/RPE inválidos se transforman sin aviso y se guardan: ${lista(silenciosos.filter(({ c }) => c.campo === "series" || c.campo === "rpe"))}`);
    await chequeoBug(page, info, "bug-ui-no-marca-campo-invalido",
      rechazadosSinMarca.length === 0,
      `la UI no valida nada antes de guardar: la BD rechaza y el pie dice "revisa series, repeticiones y demás valores" sin marcar el campo (${lista(rechazadosSinMarca)})`);
  });

  test("desktop 1440×900: texto peligroso se ve y se guarda literal en constructor, biblioteca y Athlete App", async ({ page }, info) => {
    test.setTimeout(360_000);
    const ctx = sembrar({});
    const dialogos = await arrancar(page, ctx);
    await nuevaRutina(page);

    await tipear(nombrePlan(page), PELIGROSO);
    await builder(page).getByTestId("add-first-day-btn").click();
    await tipear(builder(page).getByTestId("day-name-input"), PELIGROSO);
    await agregarEjercicio(page, "Press de Banca Plano");
    await cargar(page, 0, { series: "3", reps: "10", rpe: "8", notas: PELIGROSO });
    await expect(nombrePlan(page)).toHaveValue(PELIGROSO);
    await expect(builder(page).getByTestId("day-name-input")).toHaveValue(PELIGROSO);
    await expect(campoNotas(page).nth(0)).toHaveValue(PELIGROSO);
    expect((await guardar(page)).ok, "el texto peligroso se guarda").toBe(true);

    const p = ctx.db.planes_entrenamiento[0]!;
    const { dias, ejs } = filasDe(ctx, p.id);
    expect({ plan: p.nombre, dia: dias[0]!.nombre, notas: ejs[0]!.notas }, "en BD queda literal")
      .toEqual({ plan: PELIGROSO, dia: PELIGROSO, notas: PELIGROSO });

    // Biblioteca y constructor tras recargar.
    await page.reload();
    await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("tab", { name: /Plantillas/ }).click();
    await expect(items(page).first().locator("p.font-bold")).toHaveText(PELIGROSO);
    await items(page).first().getByRole("button", { name: "Abrir" }).click();
    await expect(nombrePlan(page)).toHaveValue(PELIGROSO);
    await expect(builder(page).getByTestId("day-name-input")).toHaveValue(PELIGROSO);
    await expect(campoNotas(page).nth(0)).toHaveValue(PELIGROSO);
    await expect(builder(page).getByRole("button", { name: `${PELIGROSO} (1)` })).toBeVisible();
    await cerrarSinGuardar(page);

    // Asignar a Ana y abrir la Athlete App.
    await items(page).first().getByRole("button", { name: "Asignar a alumno" }).click();
    await page.locator("#rutinas-alumno").selectOption({ label: "Ana Pérez" });
    await page.getByRole("button", { name: "Asignar", exact: true }).click();
    await expect(builder(page)).toBeVisible();
    await cerrarSinGuardar(page);
    const clon = planesDe(ctx, (x) => x.alumno_id === ANA && x.estado === "ACTIVO")[0]!;
    await publicar(page, ctx.db, clon.id);
    await page.goto("/athlete");
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-testid^="dia-row-"]').first()).toContainText(PELIGROSO);
    await page.getByTestId("empezar-dia-btn").click();
    await expect(page.locator('[data-testid^="exercise-select-btn-"]').first()).toContainText("Press de Banca Plano", { timeout: 30_000 });
    const notasBtn = page.locator('[data-testid^="exercise-notes-btn-"]').first();
    if (await notasBtn.isVisible()) {
      await notasBtn.click();
      await expect(page.getByTestId("exercise-notes-content")).toContainText(PELIGROSO);
    }
    await evidencia(page, info, "texto-peligroso-athlete");

    expect(await page.locator('img[src="x"]').count(), "no se inyectó ningún <img>").toBe(0);
    expect(dialogos, "ningún script se ejecutó (sin alert)").toEqual([]);
    expect(ctx.db.errores_app, "sin filas en errores_app").toEqual([]);
  });

  test.describe("doble y triple clic", () => {
    test("desktop 1440×900: ✓ Guardar en una rutina nueva crea exactamente una", async ({ page }, info) => {
      test.setTimeout(240_000);
      const ctx = sembrar({});
      await arrancar(page, ctx);
      await nuevaRutina(page);
      await tipear(nombrePlan(page), "Triple clic QA");
      await builder(page).getByTestId("add-first-day-btn").click();
      await agregarEjercicio(page, "Press de Banca Plano");
      await cargar(page, 0, { series: "4", reps: "10", rpe: "8" });
      await rafaga(page, btnGuardar(page));
      await expect(builder(page)).toBeHidden({ timeout: 15_000 });
      const creados = planesDe(ctx, (x) => x.nombre === "Triple clic QA");
      await chequeoBug(page, info, "bug-triple-clic-guardar-duplica", creados.length === 1,
        `triple clic en "✓ Guardar" creó ${creados.length} rutinas (${ctx.llamadas.filter((l) => l.ok).length} llamadas OK): tras el éxito el botón se rehabilita durante los 1,5 s en que el modal sigue abierto`);
      expect(creados.length, "al menos una rutina").toBeGreaterThan(0);
      // Tras el éxito, recargar() de la biblioteca cambia las props y el efecto de apertura resetea el modal a los
      // defaults mientras sigue abierto 1,5 s con los botones habilitados: los clics de más guardan esa rutina vacía.
      const extra = ctx.llamadas.filter((l) => l.rpc === "guardar_rutina").slice(1).map((l) => `"${l.payload.p_payload.nombre}" con ${l.payload.p_payload.dias.length} días`);
      await chequeoBug(page, info, "bug-tras-guardar-modal-se-resetea-y-reguarda", extra.length === 0 && ctx.db.errores_app.length === 0,
        `los clics 2 y 3 llegan después del éxito y mandan otro guardado (${extra.join("; ")}): el modal se resetea a la rutina por defecto y deja ${ctx.db.errores_app.length} filas en errores_app`);
    });

    test("desktop 1440×900: Guardar como rutina nueva crea exactamente un clon", async ({ page }, info) => {
      test.setTimeout(240_000);
      const ctx = sembrar();
      await arrancar(page, ctx);
      await abrirPlantilla(page, "Plantilla QA");
      await rafaga(page, builder(page).getByTestId("save-routine-as-new-btn"));
      await expect(builder(page)).toBeHidden({ timeout: 15_000 });
      const clones = planesDe(ctx, (x) => x.plan_origen_id === ctx.db.planes_entrenamiento.find((p) => p.nombre === "Plantilla QA" && !p.plan_origen_id)!.id);
      await chequeoBug(page, info, "bug-triple-clic-guardar-como-nueva-duplica", clones.length === 1,
        `triple clic en "Guardar como rutina nueva" creó ${clones.length} clones`);
      expect(ctx.db.errores_app, "sin filas en errores_app").toEqual([]);
    });

    test("desktop 1440×900: Guardar como nueva versión crea exactamente una versión", async ({ page }, info) => {
      test.setTimeout(240_000);
      const ctx = sembrar();
      const deAna = plan("Rutina de Ana", { alumno_id: ANA, tipo: "DE_ALUMNO" });
      ctx.db.planes_entrenamiento.push(deAna);
      insertarDiasSql(ctx.db, deAna.id, [{ nombre: "Día 1: Torso", ejercicios: [valido("Remo con Barra")] }]);
      ctx.conSesiones.add(deAna.id);
      await arrancar(page, ctx);
      await page.getByRole("tab", { name: /De alumnos/ }).click();
      await items(page).filter({ hasText: "Ana Pérez" }).getByRole("button", { name: "Abrir" }).click();
      await cargar(page, 0, { series: "5" });
      const r = await guardar(page);
      expect(r.mensaje, "con sesiones, guardar en el lugar se rechaza con mensaje humano").toMatch(/sesiones registradas/);
      await rafaga(page, builder(page).getByTestId("save-routine-new-version-btn"));
      await expect(builder(page)).toBeHidden({ timeout: 15_000 });
      const versiones = planesDe(ctx, (x) => x.plan_origen_id === deAna.id);
      await chequeoBug(page, info, "bug-triple-clic-nueva-version-duplica", versiones.length === 1,
        `triple clic en "Guardar como nueva versión" creó ${versiones.length} versiones`);
      expect(ctx.db.errores_app.every((x: any) => /sesiones registradas/.test(x.mensaje_humano)), "solo el error de negocio esperado").toBe(true);
    });

    test("desktop 1440×900: Asignar crea exactamente una asignación", async ({ page }, info) => {
      test.setTimeout(240_000);
      const ctx = sembrar();
      await arrancar(page, ctx);
      await page.getByRole("tab", { name: /Plantillas/ }).click();
      await items(page).first().getByRole("button", { name: "Asignar a alumno" }).click();
      await page.locator("#rutinas-alumno").selectOption({ label: "Ana Pérez" });
      await rafaga(page, page.getByRole("button", { name: "Asignar", exact: true }));
      await expect(builder(page)).toBeVisible({ timeout: 15_000 });
      await cerrarSinGuardar(page);
      const deAna = planesDe(ctx, (x) => x.alumno_id === ANA);
      await chequeoBug(page, info, "bug-triple-clic-asignar-duplica", deAna.length === 1,
        `triple clic en "Asignar" generó ${deAna.length} planes para Ana (${deAna.map((x) => x.estado).join(", ")})`);
      expect(planesDe(ctx, (x) => x.alumno_id === ANA && x.estado === "ACTIVO"), "un solo ACTIVO").toHaveLength(1);
      expect(ctx.db.errores_app, "sin filas en errores_app").toEqual([]);
    });
  });

  test("desktop 1440×900: sin red — mensaje, cambio conservado, cola offline y un solo guardado al reconectar", async ({ page, context }, info) => {
    test.setTimeout(240_000);
    const ctx = sembrar();
    await arrancar(page, ctx);
    const planId = ctx.db.planes_entrenamiento[0]!.id;
    await abrirPlantilla(page, "Plantilla QA");
    await cargar(page, 0, { series: "6", notas: "Editado sin red" });

    ctx.offline = true;
    await context.setOffline(true);
    const r = await guardar(page);
    expect(r.ok, "sin red no se guarda").toBe(false);
    await evidencia(page, info, "sin-red-mensaje");
    expect(PG_CRUDO.test(r.mensaje), `mensaje sin texto crudo: "${r.mensaje}"`).toBe(false);
    await chequeoBug(page, info, "bug-sin-red-mensaje-generico", /conexi[oó]n|red|internet|offline/i.test(r.mensaje),
      `sin red el coach ve "${r.mensaje}": no le dice que es la conexión ni que su cambio sigue pendiente`);
    await expect(campo(page, "exercise-series-input"), "el cambio no se pierde: sigue en el modal").toHaveValue("6");
    await expect(campoNotas(page).nth(0)).toHaveValue("Editado sin red");
    expect(filasDe(ctx, planId).ejs[0]!.series, "la BD no cambió").toBe(4);

    ctx.offline = false;
    await context.setOffline(false);
    await page.waitForTimeout(3_000);
    const encolado = ctx.llamadas.filter((l) => l.ok).length;
    await chequeoBug(page, info, "bug-sin-red-no-encola", encolado === 1,
      `al reconectar no se reintenta solo (${encolado} guardados): el constructor no encola como pide offline-first, depende de que el coach vuelva a tocar Guardar`);

    if (encolado === 0) expect((await guardar(page)).ok, "reintento manual guarda").toBe(true);
    else await expect(builder(page)).toBeHidden({ timeout: 15_000 });
    expect(ctx.llamadas.filter((l) => l.ok), "se guarda una sola vez").toHaveLength(1);
    expect(filasDe(ctx, planId).ejs[0]).toMatchObject({ series: 6, notas: "Editado sin red" });
    expect(planesDe(ctx, () => true), "sin planes duplicados").toHaveLength(1);
  });

  test("desktop 1440×900: refrescar y atrás/adelante a mitad de edición no deja modal fantasma ni datos mezclados", async ({ page }, info) => {
    test.setTimeout(300_000);
    const ctx = sembrar({ "Plantilla A": ["Press de Banca Plano"], "Plantilla B": ["Sentadilla Trasera", "Hip Thrust"] });
    await conectar(page, ctx);
    await prepararSesion(page);
    await publicar(page, ctx.db);
    await page.goto("/studio");
    await irABiblioteca(page);

    // Refrescar con el modal abierto y cambios en A.
    await abrirPlantilla(page, "Plantilla A");
    await cargar(page, 0, { series: "9", notas: "Solo en A, sin guardar" });
    await page.reload();
    await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
    await expect(builder(page), "tras refrescar no queda modal").toBeHidden();

    // Atrás y adelante con el modal abierto.
    await abrirPlantilla(page, "Plantilla A");
    await cargar(page, 0, { series: "7" });
    await page.goBack();
    await page.goForward();
    await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
    await expect(builder(page), "tras atrás/adelante no queda modal fantasma").toBeHidden();

    // B muestra lo suyo; A no arrastra ediciones no guardadas; una rutina nueva arranca vacía.
    await abrirPlantilla(page, "Plantilla B");
    await expect(tarjetas(page)).toHaveText(["Sentadilla Trasera", "Hip Thrust"]);
    await expect(comentariosPlan(page)).toHaveValue("Comentario de Plantilla B");
    await cerrarSinGuardar(page);
    await abrirPlantilla(page, "Plantilla A");
    await expect(campo(page, "exercise-series-input")).toHaveValue("4");
    await expect(campoNotas(page).nth(0)).toHaveValue("");
    await cerrarSinGuardar(page);
    await nuevaRutina(page);
    await expect(builder(page).getByTestId("no-days-message"), "rutina nueva sin días heredados").toBeVisible();
    await cerrarSinGuardar(page);
    await evidencia(page, info, "navegacion-estado-limpio");
    expect(ctx.llamadas, "navegar no guardó nada").toEqual([]);
  });

  test.describe("mobile 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("@mobile armar la rutina de la etapa 1 por tap: controles alcanzables y áreas táctiles", async ({ page }, info) => {
      test.setTimeout(360_000);
      const ctx = sembrar({});
      await arrancar(page, ctx);
      await page.getByRole("button", { name: "Nueva rutina" }).tap();
      await expect(builder(page)).toBeVisible();
      await tipear(nombrePlan(page), "Hipertrofia 4 días");
      await builder(page).getByTestId("add-first-day-btn").tap();
      await tipear(builder(page).getByTestId("day-name-input"), "Día 1: Torso Pesado");
      const carga = [
        { n: "Press de Banca Plano", series: "4", reps: "10-8-6", descanso: "180", rpe: "8.5", notas: "Pausa de 1 s en el pecho" },
        { n: "Remo con Barra", series: "4", reps: "8-12", descanso: "120", rpe: "8", notas: "Torso a 45°" },
        { n: "Press Militar", series: "3", reps: "8-12", descanso: "120", rpe: "8", notas: "" },
      ];
      const tapados: string[] = [];
      for (const [i, x] of carga.entries()) {
        await agregarEjercicio(page, x.n, true);
        for (const [id, v] of [["exercise-series-input", x.series], ["exercise-reps-input", x.reps], ["exercise-rest-input", x.descanso], ["exercise-rpe-input", x.rpe]] as const) {
          const input = campo(page, id, i);
          await input.scrollIntoViewIfNeeded();
          await input.tap();
          // Sin teclado virtual en Chromium headless: se verifica que el input enfocado quede dentro de la mitad
          // superior del viewport visual (donde no lo taparía un teclado de ~45% de alto).
          const box = await input.boundingBox();
          if (!box || box.y + box.height > 844 * 0.55) tapados.push(`${x.n} ${id} (y=${Math.round(box?.y ?? -1)})`);
          await tipear(input, v);
        }
        if (x.notas) await tipear(campoNotas(page).nth(i), x.notas);
      }

      const chicos: string[] = [];
      for (const x of carga)
        for (const nombre of [`Subir orden de ${x.n}`, `Bajar orden de ${x.n}`, `Eliminar ${x.n}`]) {
          const b = await builder(page).getByRole("button", { name: nombre, exact: true }).boundingBox();
          if (!b || b.width < 44 || b.height < 44) chicos.push(`${nombre}: ${Math.round(b?.width ?? 0)}×${Math.round(b?.height ?? 0)}`);
        }
      await chequeoBug(page, info, "bug-mobile-botones-tactiles-chicos", chicos.length === 0,
        `▲/▼/✕ por debajo de 44×44 px: ${chicos.slice(0, 3).join("; ")}${chicos.length > 3 ? ` (+${chicos.length - 3})` : ""}`);
      // No es un bug confirmado (no hay teclado real que emular): queda como evidencia para validar en dispositivo.
      await info.attach("mobile-inputs-en-mitad-inferior", { body: JSON.stringify(tapados, null, 2), contentType: "application/json" });

      const guardarBtn = btnGuardar(page);
      await guardarBtn.scrollIntoViewIfNeeded();
      const g = await guardarBtn.boundingBox();
      const alcanzable = !!g && g.x >= 0 && g.x + g.width <= 390 && g.y >= 0 && g.y + g.height <= 844;
      await chequeoBug(page, info, "bug-mobile-guardar-fuera-de-pantalla", alcanzable,
        `"✓ Guardar" no entra en 390 px sin zoom (x=${Math.round(g?.x ?? -1)}, ancho=${Math.round(g?.width ?? 0)})`);
      const anchoDoc = await page.evaluate(() => document.documentElement.scrollWidth);
      await chequeoBug(page, info, "bug-mobile-scroll-horizontal", anchoDoc <= 390, `la página tiene scroll horizontal (${anchoDoc} px de ancho)`);

      await guardarBtn.tap({ force: !alcanzable });
      await expect(builder(page).getByText("Rutina guardada")).toBeVisible({ timeout: 15_000 });
      const p = planesDe(ctx, () => true);
      expect(p, "una sola rutina").toHaveLength(1);
      expect(filasDe(ctx, p[0]!.id).ejs.map((f) => [f.series, f.repeticiones, f.descanso_segundos, Number(f.rpe_objetivo), f.notas ?? ""]))
        .toEqual(carga.map((x) => [Number(x.series), x.reps, Number(x.descanso), Number(x.rpe), x.notas]));
      expect(ctx.db.errores_app, "sin filas en errores_app").toEqual([]);
      await evidencia(page, info, "mobile-guardado");
    });
  });
});
