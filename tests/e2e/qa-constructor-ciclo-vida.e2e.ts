import { randomUUID } from "node:crypto";
import { expect, test, type Dialog, type Page, type TestInfo } from "@playwright/test";
import {
  ANA, BASE, STUB, abrirRutinaDeAna, aPayload, athleteApp, builder, chequeoBug, conectarBd, editar,
  ErrorNegocio, evidencia, guardarYComprobar, insertarDias, plan, prepararSesion, publicar, sembrar, tipear,
  verificarBd, type Db, type Dia,
} from "./helpers/qa-constructor";
import type { PlanEntrenamiento } from "@/types/database.types";

// GOZS-306 (QA humano 4/5): el ciclo de vida de una rutina entre el constructor, la biblioteca y la
// Athlete App. El coach trabaja SIEMPRE por UI (como un entrenador real); solo el hecho "esta rutina
// tiene sesiones registradas" se prepara por datos (conSesiones), que es lo que gatilla el versionado.
//
// La "BD" es el estado en memoria de ./helpers/qa-constructor. Acá se emulan las RPCs de la migración
// vigente 20261029130000 (guardar_rutina con como_nueva y asignar_rutina_a_alumno) y la de clonación
// 20261030001200 (clonar_plan_entrenamiento), replicando sus reglas: versión nueva de un plan de alumno
// nace BORRADOR sin desplazar al ACTIVO; asignar deja la ACTIVA anterior en INACTIVO y clona la nueva ACTIVO.
// Los bugs reales son expect.soft `bug-*` con screenshot: el recorrido sigue y el spec falla solo por ellos.

const NOMBRE = "Hipertrofia 4 días";
const ahora = () => new Date().toISOString();

type Ctx = { db: Db; conSesiones: Set<string> };

const planesDe = (db: Db, alumnoId: string) => db.planes_entrenamiento.filter((p) => p.alumno_id === alumnoId);
const activosDe = (db: Db, alumnoId: string) => planesDe(db, alumnoId).filter((p) => p.estado === "ACTIVO");

/** guardar_rutina(p_payload): edición en el lugar sin sesiones; con sesiones rechaza; con como_nueva crea versión. */
function rpcGuardarRutina(ctx: Ctx, p: any): string {
  const { db } = ctx;
  const nombre = String(p.nombre ?? "").trim();
  if (!nombre) throw new ErrorNegocio("La rutina necesita un nombre");
  if (!Array.isArray(p.dias) || p.dias.length === 0) throw new ErrorNegocio("La rutina necesita al menos un día");
  const planId: string | undefined = p.plan_id || undefined;
  const comoNueva = !!p.como_nueva;
  let alumnoId: string | null = p.alumno_id ?? null;
  let existente: PlanEntrenamiento | undefined;
  if (planId) {
    existente = db.planes_entrenamiento.find((x) => x.id === planId);
    if (!existente) throw new ErrorNegocio("La rutina que intentas guardar ya no existe");
    alumnoId = existente.alumno_id; // el alumno lo manda el plan, no el payload
  }

  if (planId && !comoNueva) {
    if (ctx.conSesiones.has(planId))
      throw new ErrorNegocio("Esta rutina ya tiene sesiones registradas y no se puede modificar: guárdala como nueva versión");
    const viejos = new Set(db.dias_rutina.filter((d) => d.plan_id === planId).map((d) => d.id));
    const respaldo = { dias: [...db.dias_rutina], ejs: [...db.ejercicios_en_rutina] };
    db.dias_rutina = db.dias_rutina.filter((d) => !viejos.has(d.id));
    db.ejercicios_en_rutina = db.ejercicios_en_rutina.filter((x) => !viejos.has(x.dia_id));
    try {
      insertarDias(db, planId, p.dias);
    } catch (err) {
      Object.assign(db, { dias_rutina: respaldo.dias, ejercicios_en_rutina: respaldo.ejs });
      throw err;
    }
    Object.assign(existente!, { nombre, comentarios: p.comentarios ?? null, etiqueta: p.etiqueta ?? null, updated_at: ahora() });
    return planId;
  }

  // plan nuevo o versión nueva: una versión de un plan de alumno nace BORRADOR (no desplaza al ACTIVO).
  const nuevo = plan(nombre, {
    alumno_id: alumnoId,
    comentarios: p.comentarios ?? null,
    etiqueta: p.etiqueta ?? null,
    tipo: alumnoId ? "DE_ALUMNO" : "PLANTILLA",
    plan_origen_id: planId ?? null,
    estado: (alumnoId ? "BORRADOR" : "ACTIVO") as PlanEntrenamiento["estado"],
    fecha_inicio: ahora(),
  });
  db.planes_entrenamiento.unshift(nuevo);
  insertarDias(db, nuevo.id, p.dias);
  return nuevo.id;
}

/** asignar_rutina_a_alumno: archiva la ACTIVA del alumno (INACTIVO) y clona la rutina como su nueva ACTIVO.
 * p_nombre opcional (20261031230000): NULL o vacío = nombre de la plantilla. */
function rpcAsignar(db: Db, planId: string, alumnoId: string, nombre?: string | null): string {
  const origen = db.planes_entrenamiento.find((x) => x.id === planId);
  if (!origen) throw new ErrorNegocio("La rutina que intentas asignar ya no existe");
  const t = ahora();
  for (const pl of activosDe(db, alumnoId)) Object.assign(pl, { estado: "INACTIVO", fecha_fin: t });
  const clon = plan(nombre?.trim() || origen.nombre, {
    alumno_id: alumnoId, comentarios: origen.comentarios, etiqueta: origen.etiqueta,
    tipo: "DE_ALUMNO", plan_origen_id: origen.id,
    estado: "ACTIVO" as PlanEntrenamiento["estado"], fecha_inicio: t, fecha_fin: null,
  });
  db.planes_entrenamiento.unshift(clon);
  for (const d of db.dias_rutina.filter((x) => x.plan_id === origen.id).sort((a, b) => a.orden - b.orden)) {
    const nd = { ...d, id: randomUUID(), plan_id: clon.id };
    db.dias_rutina.push(nd);
    for (const x of db.ejercicios_en_rutina.filter((e) => e.dia_id === d.id).sort((a, b) => a.orden - b.orden))
      db.ejercicios_en_rutina.push({ ...x, id: randomUUID(), dia_id: nd.id });
  }
  return clon.id;
}

const fallo = (err: unknown) => ({
  status: 400,
  contentType: "application/json",
  body: JSON.stringify({ code: err instanceof ErrorNegocio ? "GZ010" : "XX000", message: (err as Error).message, details: null, hint: null }),
});

async function conectarCiclo(page: Page, ctx: Ctx) {
  await page.route("**/rest/v1/rpc/guardar_rutina", async (route) => {
    try {
      const id = rpcGuardarRutina(ctx, route.request().postDataJSON().p_payload);
      await publicar(page, ctx.db);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(id) });
    } catch (err) {
      await route.fulfill(fallo(err));
    }
  });
  await page.route("**/rest/v1/rpc/asignar_rutina_a_alumno", async (route) => {
    try {
      const { p_plan_id, p_alumno_id, p_nombre } = route.request().postDataJSON();
      const id = rpcAsignar(ctx.db, p_plan_id, p_alumno_id, p_nombre);
      await publicar(page, ctx.db);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(id) });
    } catch (err) {
      await route.fulfill(fallo(err));
    }
  });
  // .single() tras guardar/asignar: PostgREST devuelve el objeto, no el array que da el stub.
  await page.route("**/rest/v1/planes_entrenamiento*", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("id")?.replace(/^eq\./, "");
    if (route.request().method() !== "GET" || !id) return route.continue();
    const fila = ctx.db.planes_entrenamiento.find((x) => x.id === id);
    return fila ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fila) }) : route.continue();
  });
  await page.route("**/rest/v1/errores_app*", async (route) => {
    ctx.db.errores_app.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, body: "" });
  });
}

const irABiblioteca = async (page: Page) => {
  await page.goto("/studio/rutinas");
  await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
};
const tab = (page: Page, nombre: RegExp) => page.getByRole("tab", { name: nombre });
const items = (page: Page) => page.getByTestId("rutina-item");
const nombrePlan = (page: Page) => builder(page).locator("label:has-text('Nombre de la Rutina') + input");

test.describe("GOZS-306: QA humano — guardar, versionar, plantillas, clonar y asignar", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB}/__e2e/fixtures`);
  });

  // 1. Editar sin sesiones: cambia series y notas y guarda. Mismo plan_id, sin planes nuevos.
  async function editarSinSesiones(page: Page, info: TestInfo) {
    test.setTimeout(240_000);
    const { db, planAnaId } = sembrar();
    await conectarBd(page, db);
    await prepararSesion(page);
    await publicar(page, db);
    await irABiblioteca(page);
    await abrirRutinaDeAna(page);

    const rutina: Dia[] = structuredClone(BASE);
    await editar(page, rutina[0]!, "Press de Banca Plano", { series: "5", notas: "Pausa de 2 s en el pecho" });
    await editar(page, rutina[0]!, "Remo con Barra", { reps: "12", rpe: "7.5" });
    await guardarYComprobar(page, info, db, planAnaId, rutina, "editar-sin-sesiones");
  }

  test("desktop 1440×900: editar una rutina sin sesiones se guarda en el lugar", async ({ page }, info) => {
    await editarSinSesiones(page, info);
  });
  test.describe("mobile 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("@mobile editar una rutina sin sesiones se guarda en el lugar", async ({ page }, info) => {
      await editarSinSesiones(page, info);
    });
  });

  // 2. Editar con sesiones (versionado).
  test("desktop 1440×900: con sesiones registradas, guardar ofrece versionar y crea un plan nuevo", async ({ page }, info) => {
    test.setTimeout(300_000);
    const { db, planAnaId } = sembrar();
    const ctx: Ctx = { db, conSesiones: new Set([planAnaId]) };
    await conectarCiclo(page, ctx);
    await prepararSesion(page);
    await publicar(page, db);

    const diasViejos = db.dias_rutina.filter((d) => d.plan_id === planAnaId).map((d) => d.id).sort();
    await irABiblioteca(page);
    await abrirRutinaDeAna(page);
    const rutina: Dia[] = structuredClone(BASE);
    await editar(page, rutina[0]!, "Press de Banca Plano", { series: "6", notas: "Versión nueva: tempo lento" });

    const m = builder(page);
    // "✓ Guardar" en el lugar: la RPC rechaza por sesiones y aparece el botón de versionar.
    await m.getByTestId("save-routine-to-supabase-btn").click();
    await expect(m.getByTestId("save-routine-new-version-btn")).toBeVisible();
    await expect(m.getByText(/sesiones registradas/i)).toBeVisible();
    expect(db.errores_app.every((r: any) => /sesiones registradas/i.test(r.mensaje_humano)),
      "el único error registrado es el de negocio esperado").toBe(true);

    await m.getByTestId("save-routine-new-version-btn").click();
    await expect(m.getByText("Rutina guardada")).toBeVisible();
    await expect(m).toBeHidden();

    // Invariantes correctos: se creó una versión trazable, el contenido viejo no cambió y las sesiones siguen ancladas.
    const vieja = db.planes_entrenamiento.find((p) => p.id === planAnaId)!;
    const nueva = db.planes_entrenamiento.find((p) => p.plan_origen_id === planAnaId && p.alumno_id === ANA)!;
    expect(nueva, "se creó la versión nueva con plan_origen_id = plan anterior").toBeTruthy();
    expect(db.dias_rutina.filter((d) => d.plan_id === planAnaId).map((d) => d.id).sort(),
      "los días (y por ende el histórico de sesiones) del plan anterior no se tocan").toEqual(diasViejos);
    verificarBd(db, planAnaId, BASE);
    verificarBd(db, nueva.id, rutina);

    // Bugs vs criterios de aceptación: la anterior debería archivarse y la nueva debería quedar visible para Ana.
    await chequeoBug(page, info, "bug-version-anterior-no-archivada", vieja.estado === "INACTIVO",
      `tras versionar, la rutina anterior debería quedar archivada en solo lectura; quedó '${vieja.estado}' (sigue ACTIVO y editable)`);
    await chequeoBug(page, info, "bug-version-nueva-no-activa", nueva.estado === "ACTIVO",
      `la versión nueva debería quedar ACTIVO para que Ana la vea en la Athlete App; quedó '${nueva.estado}' y no hay control en la UI para activarla`);

    // Lo que Ana ve hoy es el plan ACTIVO = el anterior (los cambios de la versión nueva no le llegan).
    await athleteApp(page, db, planAnaId, BASE);
    await evidencia(page, info, "versionado-ana-sigue-viendo-la-anterior");
  });

  // 3. Plantillas: clonar, editar el clon y verificar que la original no cambia.
  test("desktop 1440×900: clonar una plantilla no toca la original y deja nombres duplicados", async ({ page }, info) => {
    test.setTimeout(300_000);
    const { db, plantillaId } = sembrar();
    const ctx: Ctx = { db, conSesiones: new Set<string>() };
    await conectarCiclo(page, ctx);
    await prepararSesion(page);
    await publicar(page, db);
    await irABiblioteca(page);
    await tab(page, /Plantillas/).click();
    await expect(items(page)).toHaveCount(1);

    // Clonar = abrir la plantilla y "Guardar como rutina nueva" (no hay botón "Clonar" dedicado).
    const clonar = async () => {
      await items(page).last().getByTestId("rutina-acciones-btn").click();
  await page.getByRole("menuitem", { name: "Abrir" }).click();
      const m = builder(page);
      await expect(m).toBeVisible();
      await m.getByTestId("save-routine-as-new-btn").click();
      await expect(m.getByText("Rutina guardada")).toBeVisible();
      await expect(m).toBeHidden();
      await page.reload();
      await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
      await tab(page, /Plantillas/).click();
    };
    await clonar();
    await clonar();

    const plantillas = db.planes_entrenamiento.filter((p) => p.tipo === "PLANTILLA");
    expect(plantillas, "cada clon es una plantilla nueva (alumno_id NULL)").toHaveLength(3);
    for (const c of plantillas.filter((p) => p.id !== plantillaId)) {
      expect(c.alumno_id, "el clon no arrastra alumno").toBeNull();
      expect(c.plan_origen_id, "el clon traza su origen").toBe(plantillaId);
    }
    const nombres = plantillas.map((p) => p.nombre);
    await chequeoBug(page, info, "bug-clon-nombre-duplicado", new Set(nombres).size === nombres.length,
      `clonar deja plantillas con nombre idéntico (${nombres.join(" / ")}): en la biblioteca no se distinguen cuál es cuál`);

    // Editar el clon más nuevo (primero de la lista) y comprobar que ni la original ni el otro clon cambian.
    await items(page).first().getByTestId("rutina-acciones-btn").click();
  await page.getByRole("menuitem", { name: "Abrir" }).click();
    const m = builder(page);
    const clonEditado: Dia[] = structuredClone(BASE);
    await editar(page, clonEditado[0]!, "Press de Banca Plano", { series: "8", notas: "Solo en este clon" });
    await m.getByTestId("save-routine-to-supabase-btn").click();
    await expect(m.getByText("Rutina guardada")).toBeVisible();
    await expect(m).toBeHidden();

    const clonNuevo = db.planes_entrenamiento.filter((p) => p.tipo === "PLANTILLA")[0]!;
    verificarBd(db, clonNuevo.id, clonEditado);
    verificarBd(db, plantillaId, BASE); // la original intacta
    for (const c of plantillas.filter((p) => p.id !== plantillaId && p.id !== clonNuevo.id)) verificarBd(db, c.id, BASE);
  });

  // 4. Asignar una plantilla a un alumno que ya tiene una rutina ACTIVA.
  test("desktop 1440×900: asignar una plantilla deja exactamente una rutina ACTIVO para el alumno", async ({ page }, info) => {
    test.setTimeout(300_000);
    const { db } = sembrar();
    const ctx: Ctx = { db, conSesiones: new Set<string>() };
    await conectarCiclo(page, ctx);
    await prepararSesion(page);
    await publicar(page, db);

    const asignarAAna = async () => {
      await irABiblioteca(page);
      await tab(page, /Plantillas/).click();
      await items(page).first().getByRole("button", { name: "Asignar a alumno" }).click();
      await page.locator("#rutinas-alumno").selectOption({ label: "Ana Pérez" });
      await page.getByRole("button", { name: "Asignar", exact: true }).click();
      // confirmarAsignacion abre el constructor con el clon: lo cerramos como haría el coach.
      await expect(builder(page)).toBeVisible();
      await builder(page).getByRole("button", { name: "Cancelar" }).click();
      await expect(builder(page)).toBeHidden();
    };

    await asignarAAna();
    expect(activosDe(db, ANA), "exactamente un plan ACTIVO para Ana tras asignar").toHaveLength(1);
    expect(planesDe(db, ANA).filter((p) => p.estado === "INACTIVO"), "la ACTIVA anterior quedó archivada").toHaveLength(1);

    // Reasignar la misma plantilla al mismo alumno: no debe duplicar el ACTIVO.
    await asignarAAna();
    expect(activosDe(db, ANA), "reasignar sigue dejando un solo ACTIVO").toHaveLength(1);
    const archivadas = planesDe(db, ANA).filter((p) => p.estado === "INACTIVO");
    expect(archivadas.length, "cada asignación archiva la anterior").toBe(2);

    const nombresArch = archivadas.map((p) => p.nombre);
    await chequeoBug(page, info, "bug-reasignar-archivadas-identicas", new Set(nombresArch).size === nombresArch.length,
      `reasignar acumula en Archivadas copias con nombre idéntico (${nombresArch.join(" / ")}): sin fecha visible no se distinguen`);

    await irABiblioteca(page);
    await tab(page, /Archivadas/).click();
    await expect(items(page), "las copias archivadas aparecen en Archivadas").toHaveCount(2);
  });

  // 5. Salir sin guardar (sin repetir GOZS-312, que es Cancelar/✕): recargar con cambios pendientes.
  // Correcto: beforeunload avisa. Si el coach CANCELA, la recarga se detiene y lo editado sigue; si ACEPTA,
  // se recarga y los cambios se descartan. El bug es que hoy no avisa y los pierde en silencio.
  test("desktop 1440×900: recargar con cambios sin guardar avisa — cancelar conserva, aceptar descarta", async ({ page }, info) => {
    test.setTimeout(240_000);
    const { db } = sembrar();
    await conectarBd(page, db);
    await prepararSesion(page);
    await publicar(page, db);
    await irABiblioteca(page);
    await abrirRutinaDeAna(page);

    const editado = `${NOMBRE} (editando sin guardar)`;
    await tipear(nombrePlan(page), editado);

    // Rama (a): el coach CANCELA el aviso → la recarga se detiene y lo editado sigue en el modal.
    let avisoVisto = false;
    const alCancelar = (d: Dialog) => { avisoVisto = true; void d.dismiss(); };
    page.on("dialog", alCancelar);
    await page.reload({ timeout: 15_000 }).catch(() => {}); // si el aviso cancela la recarga, reload() puede rechazar
    page.off("dialog", alCancelar);
    const modalSigueAbierto = await builder(page).isVisible().catch(() => false);
    const loEditadoSigue = modalSigueAbierto && (await nombrePlan(page).inputValue().catch(() => "")) === editado;
    await chequeoBug(page, info, "bug-sin-aviso-al-salir", avisoVisto && loEditadoSigue,
      "recargar con cambios sin guardar debería avisar (beforeunload) y, al cancelar, no recargar ni perder lo editado; hoy no avisa y se pierde en silencio");

    // Rama (b): el coach ACEPTA el aviso (o no hay aviso) → se recarga y los cambios se descartan.
    const alAceptar = (d: Dialog) => { void d.accept(); };
    page.on("dialog", alAceptar);
    await page.reload();
    page.off("dialog", alAceptar);
    // Invariante: lo no guardado no persiste (abrirRutinaDeAna exige el nombre original).
    await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
    await abrirRutinaDeAna(page);
  });

  // 6. Dos pestañas: editar campos distintos en cada una y guardar las dos.
  test("desktop 1440×900: guardar la misma rutina en dos pestañas pisa cambios sin avisar", async ({ page, context }, info) => {
    test.setTimeout(300_000);
    const { db, planAnaId } = sembrar();
    await conectarBd(page, db);
    await prepararSesion(page);
    await publicar(page, db);
    await irABiblioteca(page);
    await abrirRutinaDeAna(page);

    const page2 = await context.newPage();
    await conectarBd(page2, db); // misma "BD" en memoria
    await prepararSesion(page2);
    await publicar(page2, db);
    await irABiblioteca(page2);
    await abrirRutinaDeAna(page2);

    // Pestaña 1 cambia las series del Press de Banca; pestaña 2 cambia el descanso del Remo (ambos en Día 1).
    await tipear(builder(page).getByTestId("exercise-series-input").nth(0), "7");
    await tipear(builder(page2).getByTestId("exercise-rest-input").nth(1), "200");

    await builder(page).getByTestId("save-routine-to-supabase-btn").click();
    await expect(builder(page).getByText("Rutina guardada")).toBeVisible();
    await builder(page2).getByTestId("save-routine-to-supabase-btn").click();
    await expect(builder(page2).getByText("Rutina guardada")).toBeVisible();

    const dia1 = db.dias_rutina.filter((d) => d.plan_id === planAnaId).sort((a, b) => a.orden - b.orden)[0]!;
    const filas = db.ejercicios_en_rutina.filter((x) => x.dia_id === dia1.id).sort((a, b) => a.orden - b.orden);
    expect(filas[1]!.descanso_segundos, "el último guardado (pestaña 2) quedó en BD").toBe(200);
    await chequeoBug(page, info, "bug-dos-pestanas-pisa-sin-aviso", filas[0]!.series === 7,
      `la pestaña 2 reescribió todo el día con su estado viejo: la serie del Press editada en la pestaña 1 (7) quedó en ${filas[0]!.series}; ninguna pestaña avisó del conflicto`);
    await page2.close();
  });

  // 7. Estados: filtros y badges en la biblioteca, y que la Athlete App solo muestre la ACTIVA.
  test("desktop 1440×900: estados ACTIVO/BORRADOR/INACTIVO en biblioteca y Athlete App", async ({ page }, info) => {
    test.setTimeout(300_000);
    const { db, planAnaId } = sembrar();
    const ctx: Ctx = { db, conSesiones: new Set<string>() };
    await conectarCiclo(page, ctx);
    await prepararSesion(page);

    // Una versión en BORRADOR y una rutina vieja archivada (INACTIVO) para la misma alumna.
    const borrador = plan(NOMBRE, { alumno_id: ANA, tipo: "DE_ALUMNO", plan_origen_id: planAnaId, estado: "BORRADOR" as PlanEntrenamiento["estado"] });
    db.planes_entrenamiento.unshift(borrador);
    insertarDias(db, borrador.id, aPayload(BASE));
    const archivada = plan("Full Body (vieja)", { alumno_id: ANA, tipo: "DE_ALUMNO", estado: "INACTIVO" as PlanEntrenamiento["estado"], fecha_fin: ahora() });
    db.planes_entrenamiento.push(archivada);
    insertarDias(db, archivada.id, aPayload(BASE.slice(0, 3)));
    await publicar(page, db);

    await irABiblioteca(page);
    await tab(page, /De alumnos/).click();
    const activa = items(page).filter({ has: page.getByText(/^(Vigente|Vence en \d+ d)$/) });
    await expect(activa, "la rutina ACTIVO de Ana se muestra con su badge").toHaveCount(1);
    const borradorVisible = await items(page).filter({ has: page.getByText("Borrador", { exact: true }) }).count();
    await chequeoBug(page, info, "bug-borrador-mezclado-en-de-alumnos", borradorVisible === 0,
      `una rutina en BORRADOR aparece en "De alumnos" junto a la ACTIVA, sin filtro propio que las separe (cf. GOZS-308)`);

    await tab(page, /Archivadas/).click();
    await expect(items(page), "la INACTIVO va a Archivadas").toHaveCount(1);

    // Athlete App: publicando solo la ACTIVO se emula lo que RLS le deja ver a Ana; ni BORRADOR ni INACTIVO le llegan.
    await athleteApp(page, db, planAnaId, BASE);
    await evidencia(page, info, "estados-athlete-solo-activo");

    // No hay control en la biblioteca para mover una rutina entre estados (ni reactivar una archivada).
    await irABiblioteca(page);
    await tab(page, /De alumnos/).click();
    const controlEstado = await activa.first().getByRole("button", { name: /activar|desactivar|archivar|restaurar|estado/i }).count();
    await chequeoBug(page, info, "bug-sin-control-de-estado", controlEstado > 0,
      "la biblioteca no tiene ningún control para cambiar el estado de una rutina (activar un BORRADOR o reactivar una archivada)");
  });
});
