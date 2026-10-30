import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  ANA, BASE, STUB, abrirRutinaDeAna, agregar, athleteApp, borrar, borrarYTipear, builder, chequeoBug, conectarBd, e,
  editar, evidencia, indice, irAlDia, mover, pausa, prepararSesion, publicar, sembrar, tipear, verificarBd, verificarDia,
  guardarYComprobar, type Dia,
} from "./helpers/qa-constructor";

// GOZS-311 (QA humano 2/5): el coach abre la "Hipertrofia 4 días" que ya tiene asignada Ana y la modifica por UI:
// agrega, borra del medio, edita campos y reordena. Guarda dos veces (como en la vida real) y tras cada guardado
// compara UI, recarga y "BD" (emulada en ./helpers/qa-constructor).

async function recorrido(page: Page, info: TestInfo) {
  test.setTimeout(360_000);
  const { db, plantillaId, planAnaId } = sembrar();
  const plantillaAntes = JSON.stringify(db.dias_rutina.filter((d) => d.plan_id === plantillaId));
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
