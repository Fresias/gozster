import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import type { DiaRutina, Ejercicio, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

// GOZS-303 (QA humano 1/5): un coach arma "Hipertrofia 4 días" de cero, todo por UI y a ritmo humano.
// La "BD" es un estado en memoria del test: las RPC del navegador (guardar_rutina, asignar_rutina_a_alumno)
// se emulan replicando el SQL de 20261029130000 (orden, defaults y CHECKs de ejercicios_en_rutina) y cada
// escritura se publica en el stub (PUT /__e2e/fixtures), así el SSR de la recarga lee lo "guardado".
// Las comprobaciones que hoy fallan por bug real son expect.soft: el recorrido sigue y deja screenshot.
const STUB = "http://localhost:54321";
const COACH = "00000000-0000-4000-8000-000000000001";
const ANA = "00000000-0000-4000-8000-0000000000a1";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const session = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: COACH, exp: 4102444800, role: "authenticated" })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: COACH, aud: "authenticated", role: "authenticated", email: "coach-e2e@gozster.test", app_metadata: {}, user_metadata: {} },
};

const ej = (nombre: string, ...musculos: string[]): Ejercicio => ({
  id: randomUUID(),
  nombre,
  comentario: null,
  url_video: null,
  musculos_principales: musculos,
  musculos_secundarios: [],
  creado_por: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

const CATALOGO = [
  ej("Press de Banca Plano", "Pectoral"),
  ej("Remo con Barra", "Dorsal"),
  ej("Press Militar", "Deltoides"),
  ej("Dominadas", "Dorsal"),
  ej("Fondos en Paralelas", "Pectoral", "Tríceps"),
  ej("Sentadilla Trasera", "Cuádriceps"),
  ej("Peso Muerto Rumano", "Isquiotibiales"),
  ej("Prensa de Piernas", "Cuádriceps"),
  ej("Extensión de Cuádriceps", "Cuádriceps"),
  ej("Elevación de Gemelos", "Gemelos"),
  ej("Press Inclinado con Mancuernas", "Pectoral"),
  ej("Jalón al Pecho", "Dorsal"),
  ej("Elevaciones Laterales", "Deltoides"),
  ej("Curl de Bíceps", "Bíceps"),
  ej("Extensión de Tríceps en Polea", "Tríceps"),
  ej("Hip Thrust", "Glúteos"),
  ej("Zancadas Búlgaras", "Glúteos", "Cuádriceps"),
  ej("Curl Femoral Tumbado", "Isquiotibiales"),
  ej("Plancha Abdominal", "Core"),
  ej("Rueda Abdominal", "Core"),
];

type Carga = { buscar: string; nombre: string; series: string; reps: string; descanso: string; rpe: string; notas: string };
const c = (buscar: string, nombre: string, series: string, reps: string, descanso: string, rpe: string, notas: string): Carga =>
  ({ buscar, nombre, series, reps, descanso, rpe, notas });

const RUTINA = {
  nombre: "Hipertrofia 4 días",
  comentarios: "Calentamiento: 10 min de movilidad + 2 series de aproximación. Escala RPE 1-10 (RPE 8 = 2 reps en reserva).",
  dias: [
    {
      nombre: "Día 1: Torso Pesado",
      ejercicios: [
        c("press de banca", "Press de Banca Plano", "4", "10-8-6", "180", "8.5", "Pausa de 1 s en el pecho"),
        c("REMO", "Remo con Barra", "4", "8-12", "120", "8", "Torso a 45°, sin tirón"),
        c("militar", "Press Militar", "3", "8-12", "120", "8", "Glúteos apretados"),
        c("Dominadas", "Dominadas", "3", "10", "120", "9", ""),
        c("fondos", "Fondos en Paralelas", "3", "4x10", "90", "7.5", "Inclinación hacia adelante"),
      ],
    },
    {
      nombre: "Día 2: Pierna",
      ejercicios: [
        c("SENTADILLA", "Sentadilla Trasera", "5", "10-8-6", "180", "8", "Profundidad: cadera bajo rodilla"),
        c("rumano", "Peso Muerto Rumano", "4", "8-12", "150", "8", "Bisagra, barra pegada"),
        c("prensa", "Prensa de Piernas", "3", "10", "120", "8.5", ""),
        c("extension de cuadriceps", "Extensión de Cuádriceps", "3", "4x10", "60", "9", "Sin rebote"),
        c("gemelos", "Elevación de Gemelos", "4", "8-12", "60", "9", "Pausa arriba 2 s"),
      ],
    },
    {
      nombre: "Día 3: Torso Volumen",
      ejercicios: [
        c("inclinado", "Press Inclinado con Mancuernas", "4", "8-12", "90", "8", ""),
        c("jalón", "Jalón al Pecho", "4", "10", "90", "8", "Codos hacia el bolsillo"),
        c("Laterales", "Elevaciones Laterales", "4", "4x10", "60", "9", ""),
        c("biceps", "Curl de Bíceps", "3", "8-12", "60", "8.5", "Sin balanceo"),
        c("tríceps", "Extensión de Tríceps en Polea", "3", "10-8-6", "60", "8", ""),
      ],
    },
    {
      nombre: "Día 4: Pierna + Core",
      ejercicios: [
        c("hip thrust", "Hip Thrust", "4", "8-12", "120", "8", "Mentón al pecho"),
        c("zancadas", "Zancadas Búlgaras", "3", "10", "90", "8", "Por pierna"),
        c("femoral", "Curl Femoral Tumbado", "3", "4x10", "60", "8.5", ""),
        c("PLANCHA", "Plancha Abdominal", "3", "10", "45", "7", "10 = segundos x 3"),
        c("rueda", "Rueda Abdominal", "3", "8-12", "60", "8", ""),
      ],
    },
  ],
};

// ---------- "BD" emulada (mismo contrato que guardar_rutina / asignar_rutina_a_alumno) ----------
type Db = {
  planes_entrenamiento: PlanEntrenamiento[];
  dias_rutina: DiaRutina[];
  ejercicios_en_rutina: EjercicioEnRutina[];
  errores_app: Record<string, unknown>[];
};
const nuevaDb = (): Db => ({ planes_entrenamiento: [], dias_rutina: [], ejercicios_en_rutina: [], errores_app: [] });

async function publicar(page: Page, db: Db, soloPlanId?: string) {
  const planes = soloPlanId ? db.planes_entrenamiento.filter((p) => p.id === soloPlanId) : db.planes_entrenamiento;
  const diasIds = new Set(db.dias_rutina.filter((d) => planes.some((p) => p.id === d.plan_id)).map((d) => d.id));
  await page.request.put(`${STUB}/__e2e/fixtures`, {
    data: {
      alumnos: [{ id: ANA, nombre_completo: "Ana Pérez", rol: "ALUMNO", email: "ana@gozster.test" }],
      ejercicios: CATALOGO,
      planes_entrenamiento: planes,
      dias_rutina: db.dias_rutina.filter((d) => diasIds.has(d.id)),
      ejercicios_en_rutina: db.ejercicios_en_rutina.filter((e) => diasIds.has(e.dia_id)),
    },
  });
}

class ErrorNegocio extends Error {}

function guardarRutina(db: Db, p: any): string {
  const nombre = String(p.nombre ?? "").trim();
  if (!nombre) throw new ErrorNegocio("La rutina necesita un nombre");
  if (!Array.isArray(p.dias) || p.dias.length === 0) throw new ErrorNegocio("La rutina necesita al menos un día");
  if (p.plan_id) throw new Error("GOZS-303: la etapa 1 no edita rutinas existentes");
  const ahora = new Date().toISOString();
  const alumnoId = p.alumno_id ?? null;
  const plan: PlanEntrenamiento = {
    id: randomUUID(),
    profesor_id: COACH,
    alumno_id: alumnoId,
    nombre,
    comentarios: p.comentarios ?? null,
    etiqueta: p.etiqueta ?? null,
    tipo: alumnoId ? "DE_ALUMNO" : "PLANTILLA",
    plan_origen_id: null,
    estado: alumnoId ? "BORRADOR" : "ACTIVO",
    fecha_inicio: ahora,
    fecha_fin: null,
    created_at: ahora,
    updated_at: ahora,
  };
  const dias: DiaRutina[] = [];
  const ejercicios: EjercicioEnRutina[] = [];
  p.dias.forEach((d: any, i: number) => {
    const dia = { id: randomUUID(), plan_id: plan.id, nombre: String(d.nombre ?? "").trim() || `Día ${i + 1}`, orden: i + 1, created_at: ahora, updated_at: ahora } as DiaRutina;
    dias.push(dia);
    (d.ejercicios ?? []).forEach((e: any, j: number) => {
      const fila = {
        id: randomUUID(),
        dia_id: dia.id,
        ejercicio_id: e.ejercicio_id,
        orden: j + 1,
        series: e.series,
        repeticiones: e.repeticiones,
        descanso_segundos: e.descanso_segundos ?? 90,
        rpe_objetivo: e.rpe_objetivo ?? null,
        notas: e.notas ?? null,
        es_superserie: e.es_superserie ?? false,
        grupo_superserie: e.grupo_superserie ?? null,
        tempo: e.tempo ?? "3-0-1-0",
        tempo_activo: e.tempo_activo ?? false,
        tipo_serie: e.tipo_serie ?? "NORMAL",
        force_rpe_required: e.force_rpe_required ?? false,
        created_at: ahora,
        updated_at: ahora,
      } as unknown as EjercicioEnRutina;
      // CHECKs de initial_schema_rls: series >= 1, descanso >= 0, rpe NULL o 1..10; FK al catálogo.
      const rpe = fila.rpe_objetivo as number | null;
      if (!CATALOGO.some((x) => x.id === fila.ejercicio_id))
        throw new ErrorNegocio(`No se pudo guardar '${e.nombre}' (día ${i + 1}): el ejercicio ya no existe en el catálogo`);
      if (!Number.isInteger(fila.series) || fila.series < 1 || fila.descanso_segundos < 0 || (rpe !== null && (rpe < 1 || rpe > 10)) || !fila.repeticiones)
        throw new ErrorNegocio(`No se pudo guardar '${e.nombre}' (día ${i + 1}): revisa series, repeticiones y demás valores`);
      ejercicios.push(fila);
    });
  });
  db.planes_entrenamiento.unshift(plan);
  db.dias_rutina.push(...dias);
  db.ejercicios_en_rutina.push(...ejercicios);
  return plan.id;
}

function asignarRutina(db: Db, planId: string, alumnoId: string): string {
  const origen = db.planes_entrenamiento.find((p) => p.id === planId);
  if (!origen) throw new ErrorNegocio("La rutina que intentas asignar ya no existe");
  const ahora = new Date().toISOString();
  for (const p of db.planes_entrenamiento)
    if (p.alumno_id === alumnoId && p.estado === "ACTIVO") Object.assign(p, { estado: "INACTIVO", fecha_fin: ahora });
  const clon: PlanEntrenamiento = { ...origen, id: randomUUID(), alumno_id: alumnoId, tipo: "DE_ALUMNO", estado: "ACTIVO", plan_origen_id: origen.id, etiqueta: null, fecha_inicio: ahora, fecha_fin: null, created_at: ahora };
  db.planes_entrenamiento.unshift(clon);
  for (const d of db.dias_rutina.filter((x) => x.plan_id === origen.id)) {
    const nd = { ...d, id: randomUUID(), plan_id: clon.id };
    db.dias_rutina.push(nd);
    for (const e of db.ejercicios_en_rutina.filter((x) => x.dia_id === d.id)) db.ejercicios_en_rutina.push({ ...e, id: randomUUID(), dia_id: nd.id });
  }
  return clon.id;
}

async function conectarBd(page: Page, db: Db) {
  const responder = async (route: Route, fn: () => string) => {
    try {
      const id = fn();
      await publicar(page, db);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(id) });
    } catch (e) {
      const negocio = e instanceof ErrorNegocio;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: negocio ? "GZ010" : "XX000", message: (e as Error).message, details: null, hint: null }),
      });
    }
  };
  await page.route("**/rest/v1/rpc/guardar_rutina", (r) => responder(r, () => guardarRutina(db, r.request().postDataJSON().p_payload)));
  await page.route("**/rest/v1/rpc/asignar_rutina_a_alumno", (r) => {
    const { p_plan_id, p_alumno_id } = r.request().postDataJSON();
    return responder(r, () => asignarRutina(db, p_plan_id, p_alumno_id));
  });
  // .single() tras guardar: PostgREST devuelve el objeto, no el array que da el stub.
  await page.route("**/rest/v1/planes_entrenamiento*", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("id")?.replace(/^eq\./, "");
    if (route.request().method() !== "GET" || !id) return route.continue();
    const fila = db.planes_entrenamiento.find((p) => p.id === id);
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

/** Chequeo de bug conocido: soft (el recorrido sigue) + screenshot si falla. */
async function chequeoBug(page: Page, info: TestInfo, nombre: string, ok: boolean, mensaje: string) {
  expect.soft(ok, `${nombre}: ${mensaje}`).toBe(true);
  if (!ok) await evidencia(page, info, nombre);
}

const builder = (page: Page) => page.getByTestId("routine-builder-modal");
const tarjetas = (page: Page) => builder(page).locator("h4");
const campoNotas = (page: Page) => builder(page).getByPlaceholder("Notas técnicas del coach para el atleta...");

async function agregarDesdeCatalogo(page: Page, info: TestInfo, carga: Carga) {
  await builder(page).getByTestId("open-exercise-catalog-btn").click();
  const buscador = page.getByPlaceholder("Buscar ejercicio por nombre o músculo...");
  await tipear(buscador, carga.buscar);
  const fila = page.locator("div.rounded-lg", { has: page.getByText(carga.nombre, { exact: true }) });
  const encontrado = await fila.first().isVisible();
  await chequeoBug(page, info, `bug-busqueda-${carga.buscar.replace(/\W+/g, "_")}`, encontrado,
    `buscar "${carga.buscar}" debería mostrar "${carga.nombre}" (mayúsculas/tildes indistintas)`);
  if (!encontrado) await tipear(buscador, carga.nombre); // el coach se resigna y escribe el nombre exacto
  await fila.first().getByRole("button", { name: "+ Agregar" }).click();
  await pausa(page);
}

async function completarEjercicio(page: Page, i: number, carga: Carga) {
  const m = builder(page);
  await tipear(m.getByTestId("exercise-series-input").nth(i), carga.series);
  await tipear(m.getByTestId("exercise-reps-input").nth(i), carga.reps);
  await tipear(m.getByTestId("exercise-rest-input").nth(i), carga.descanso);
  await tipear(m.getByTestId("exercise-rpe-input").nth(i), carga.rpe);
  if (carga.notas) await tipear(campoNotas(page).nth(i), carga.notas);
  await pausa(page);
}

async function verificarDiaEnBuilder(page: Page, dia: (typeof RUTINA.dias)[number]) {
  const m = builder(page);
  await m.getByRole("button", { name: `${dia.nombre} (${dia.ejercicios.length})` }).click();
  await expect(m.getByTestId("day-name-input")).toHaveValue(dia.nombre);
  await expect(tarjetas(page)).toHaveText(dia.ejercicios.map((e) => e.nombre));
  for (const [i, e] of dia.ejercicios.entries()) {
    await expect(m.getByTestId("exercise-series-input").nth(i)).toHaveValue(e.series);
    await expect(m.getByTestId("exercise-reps-input").nth(i)).toHaveValue(e.reps);
    await expect(m.getByTestId("exercise-rest-input").nth(i)).toHaveValue(e.descanso);
    await expect.soft(m.getByTestId("exercise-rpe-input").nth(i), `${e.nombre}: RPE`).toHaveValue(e.rpe);
    await expect(campoNotas(page).nth(i)).toHaveValue(e.notas);
  }
}

async function recorrido(page: Page, info: TestInfo) {
  test.setTimeout(420_000);
  const db = nuevaDb();
  await publicar(page, db);
  await conectarBd(page, db);
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: "http://localhost:3100" }]);
  await page.goto("/studio/rutinas");
  await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Todavía no hay plantillas.")).toBeVisible();

  // 1. Rutina nueva con comentarios globales, en BORRADOR.
  await page.getByRole("button", { name: "Nueva rutina" }).click();
  const m = builder(page);
  await expect(m).toBeVisible();
  await tipear(m.locator("label:has-text('Nombre de la Rutina') + input"), RUTINA.nombre);
  await tipear(m.locator("label:has-text('Comentarios Globales') + input"), RUTINA.comentarios);
  const hayEstado = (await m.getByText(/borrador/i).count()) > 0 || (await m.getByLabel(/estado/i).count()) > 0;
  await chequeoBug(page, info, "bug-sin-estado-borrador", hayEstado, "el constructor debería permitir crear la rutina como BORRADOR");

  // 2-4. Cuatro días, 5 ejercicios cada uno, con todos los campos.
  for (const [d, dia] of RUTINA.dias.entries()) {
    if (d === 0) await m.getByTestId("add-first-day-btn").click();
    else await m.getByRole("button", { name: "+ Agregar Día" }).click();
    await tipear(m.getByTestId("day-name-input"), dia.nombre);
    if (d === 0) {
      // El placeholder promete búsqueda por músculo.
      await m.getByTestId("open-exercise-catalog-btn").click();
      await tipear(page.getByPlaceholder("Buscar ejercicio por nombre o músculo..."), "pectoral");
      const porMusculo = await page.getByText("Press de Banca Plano", { exact: true }).isVisible();
      await chequeoBug(page, info, "bug-busqueda-por-musculo", porMusculo, 'buscar "pectoral" debería listar ejercicios de pectoral');
      await page.locator("h3", { hasText: "Catálogo Maestro" }).locator("..").getByRole("button", { name: "✕" }).click();
    }
    for (const [i, carga] of dia.ejercicios.entries()) {
      await agregarDesdeCatalogo(page, info, carga);
      await completarEjercicio(page, i, carga);
    }
    await expect(m.getByRole("button", { name: `${dia.nombre} (${dia.ejercicios.length})` })).toBeVisible();
  }
  await verificarDiaEnBuilder(page, RUTINA.dias[0]!);

  // 5. Guardar → BD → recargar → abrir desde la biblioteca y comparar campo por campo.
  await m.getByTestId("save-routine-to-supabase-btn").click();
  await expect(m.getByText("Rutina guardada")).toBeVisible();
  await expect(m).toBeHidden();

  expect(db.planes_entrenamiento).toHaveLength(1);
  const plan = db.planes_entrenamiento[0]!;
  expect(plan).toMatchObject({ nombre: RUTINA.nombre, comentarios: RUTINA.comentarios, alumno_id: null, tipo: "PLANTILLA" });
  await chequeoBug(page, info, "bug-plantilla-nace-activa", plan.estado === "BORRADOR", `estado en BD = ${plan.estado}, se esperaba BORRADOR`);
  const diasBd = db.dias_rutina.filter((x) => x.plan_id === plan.id).sort((a, b) => a.orden - b.orden);
  expect(diasBd.map((x) => [x.orden, x.nombre])).toEqual(RUTINA.dias.map((x, i) => [i + 1, x.nombre]));
  for (const [i, dia] of RUTINA.dias.entries()) {
    const filas = db.ejercicios_en_rutina.filter((x) => x.dia_id === diasBd[i]!.id).sort((a, b) => a.orden - b.orden);
    expect(filas.map((f) => ({ id: f.ejercicio_id, series: f.series, reps: f.repeticiones, desc: f.descanso_segundos, notas: f.notas ?? "" })))
      .toEqual(dia.ejercicios.map((e) => ({ id: CATALOGO.find((x) => x.nombre === e.nombre)!.id, series: Number(e.series), reps: e.reps, desc: Number(e.descanso), notas: e.notas })));
    for (const [j, e] of dia.ejercicios.entries())
      expect.soft(Number(filas[j]!.rpe_objetivo), `BD ${dia.nombre} / ${e.nombre}: rpe_objetivo`).toBe(Number(e.rpe));
  }

  await page.reload();
  await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
  const item = page.getByTestId("rutina-item").filter({ hasText: RUTINA.nombre });
  await expect(item).toHaveCount(1);
  await item.getByTestId("rutina-acciones-btn").click();
  await page.getByRole("menuitem", { name: "Abrir" }).click();
  await expect(m.locator("label:has-text('Nombre de la Rutina') + input")).toHaveValue(RUTINA.nombre);
  await expect(m.locator("label:has-text('Comentarios Globales') + input")).toHaveValue(RUTINA.comentarios);
  for (const dia of RUTINA.dias) await verificarDiaEnBuilder(page, dia);
  await m.getByRole("button", { name: "Cancelar" }).click();
  await expect(m).toBeHidden();

  // 6. Asignar a la alumna de prueba: queda ACTIVA y con el mismo contenido.
  await item.getByRole("button", { name: "Asignar a alumno" }).click();
  await page.locator("#rutinas-alumno").selectOption({ label: "Ana Pérez" });
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(m).toBeVisible();
  await expect(m.getByText("Ana Pérez")).toBeVisible();
  for (const dia of RUTINA.dias) await verificarDiaEnBuilder(page, dia);
  await m.getByRole("button", { name: "Cancelar" }).click();
  const clon = db.planes_entrenamiento.find((p) => p.alumno_id === ANA)!;
  expect(clon).toMatchObject({ estado: "ACTIVO", tipo: "DE_ALUMNO", plan_origen_id: plan.id });
  await page.getByTestId("tab-de-alumnos").click();
  await expect(page.getByTestId("rutina-item").filter({ hasText: RUTINA.nombre })).toContainText("Vigente");
  expect(db.errores_app, "no debe haber filas nuevas en errores_app").toEqual([]);

  // Athlete App: el stub ignora filtros, así que se publica solo lo que RLS le dejaría ver a Ana.
  await publicar(page, db, clon.id);
  await page.addInitScript(() => {
    window.localStorage.setItem("gozster-athlete-store", JSON.stringify({ state: { onboardingCompletado: true }, version: 2 }));
  });
  await page.goto("/athlete");
  await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 60_000 });
  const filasDia = page.locator('[data-testid^="dia-row-"]');
  await expect(filasDia).toHaveCount(4);
  for (const [i, dia] of RUTINA.dias.entries()) await expect(filasDia.nth(i)).toContainText(dia.nombre);
  await evidencia(page, info, "athlete-mis-dias");
  const contenedor = await page.getByTestId("inicio-mis-dias-container").innerText();
  const semanaVista = (t: string) => t.match(/Semana[^\n]*/)?.[0] ?? "sin 'Semana'";
  // El clon no tiene fecha_fin: alcanza con "Semana 1" (no hay total que mostrar). Lo que no vale es el "Semana 3 de 8" fijo.
  await chequeoBug(page, info, "bug-semana-hardcodeada", /Semana\s+1\b/.test(contenedor),
    `un plan asignado hoy (sin fecha_fin) debería mostrar la semana 1; se vio: "${semanaVista(contenedor)}"`);

  // Con fecha_fin sí hay que mostrar el total: "Semana N de M". Mismo plan, ahora con fin a 8 semanas.
  Object.assign(clon, { fecha_fin: new Date(Date.parse(clon.fecha_inicio) + 8 * 7 * 24 * 60 * 60 * 1000).toISOString() });
  await publicar(page, db, clon.id);
  await page.reload();
  await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 60_000 });
  const contenedorConFin = await page.getByTestId("inicio-mis-dias-container").innerText();
  await chequeoBug(page, info, "bug-semana-hardcodeada-con-fin", /Semana\s+1\s+de\s+\d+/.test(contenedorConFin),
    `un plan con fecha_fin a 8 semanas debería mostrar "Semana 1 de M"; se vio: "${semanaVista(contenedorConFin)}"`);
  await chequeoBug(page, info, "bug-dia-prefijo-duplicado", !(await filasDia.first().innerText()).includes("Día 1 · Día 1"),
    'la fila del día repite el prefijo: "Día 1 · Día 1: Torso Pesado"');
  const hero = await page.getByTestId("hero-dia-hoy").innerText();
  const diaHero = RUTINA.dias.find((x) => hero.includes(x.nombre))!;
  expect(diaHero, "el héroe muestra un día de la rutina").toBeTruthy();
  await page.getByTestId("empezar-dia-btn").click();
  const botones = page.locator('[data-testid^="exercise-select-btn-"]');
  await expect(botones).toHaveCount(diaHero.ejercicios.length, { timeout: 30_000 });
  for (const [i, e] of diaHero.ejercicios.entries()) await expect(botones.nth(i)).toContainText(e.nombre);
  await evidencia(page, info, "athlete-dia-en-curso");
}

test.describe("GOZS-303: QA humano — crear rutina desde cero en el constructor", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB}/__e2e/fixtures`);
  });

  test("desktop 1440×900: coach arma Hipertrofia 4 días, guarda, recarga, asigna y la alumna la ve igual", async ({ page }, info) => {
    await recorrido(page, info);
  });

  test.describe("mobile 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("@mobile coach arma Hipertrofia 4 días, guarda, recarga, asigna y la alumna la ve igual", async ({ page }, info) => {
      await recorrido(page, info);
    });
  });
});
