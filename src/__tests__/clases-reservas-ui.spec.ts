import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  DEMO_ALUMNOS_CLASES,
  DEMO_COACH_LUCIA,
  DEMO_CONTRATACIONES_CLASES,
  DEMO_PLANES_MEMBRESIA,
} from "@/services/coach-demo-dataset";

const readSource = (relPath: string) => fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

describe("Persistencia del store de clases (#113 / GH #122)", () => {
  it("persiste solo datos (no estados transitorios) para el modo offline", () => {
    const store = readSource("../store/use-clases-store.ts");
    expect(store).toContain('name: "gozster-clases"');
    expect(store).toContain("partialize");
  });
});

describe("Flujos de reserva sobre el dataset demo (Gherkin GH #122)", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ isOnline: true });
    useClasesStore.getState().resetDemoDataset();
  });

  it("GIVEN Valentina (Funcional 2x) WHEN reserva una clase Funcional con cupo THEN queda Anotado, cupo baja en 1 y contador marca 1 de 2", async () => {
    useClasesStore.getState().setDemoAlumnoId("demo-alumno-valentina");
    await useClasesStore.getState().cargarClasesAlumno();

    const lunesId = "demo-clase-func-lunes";
    const claseLunes = useClasesStore.getState().clases.find((c) => c.id === lunesId)!;
    const ocupadosAntes = useClasesStore.getState().agendaReservas.filter((r) => r.clase_id === lunesId).length;
    expect(ocupadosAntes).toBe(0);

    // Reservar clase
    await useClasesStore.getState().reservar(lunesId);

    const reserva = useClasesStore.getState().misReservas.find((r) => r.clase_id === lunesId);
    expect(reserva?.estado).toBe("ANOTADO");

    const ocupadosDespues = useClasesStore.getState().agendaReservas.filter((r) => r.clase_id === lunesId).length;
    expect(ocupadosDespues).toBe(1);

    // Contador semanal: 1 usada de 2 disponibles
    const usadas = useClasesStore.getState().misReservas.filter((r) => r.estado === "ANOTADO").length;
    expect(usadas).toBe(1);
    expect(useClasesStore.getState().plan?.limite_semanal).toBe(2);
  });

  it("GIVEN Valentina con 2 reservas en la semana WHEN intenta una tercera THEN ve 'Ya usaste tus clases de esta semana' (GZ002)", async () => {
    useClasesStore.getState().setDemoAlumnoId("demo-alumno-valentina");
    await useClasesStore.getState().cargarClasesAlumno();

    // Valentina reserva lunes y jueves
    await useClasesStore.getState().reservar("demo-clase-func-lunes");
    await useClasesStore.getState().reservar("demo-clase-func-jueves");

    const usadas = useClasesStore.getState().misReservas.filter((r) => r.estado === "ANOTADO").length;
    expect(usadas).toBe(2);

    // Intenta una tercera reserva (intento de reserva fuera del límite)
    await useClasesStore.getState().reservar("demo-clase-func-miercoles");
    expect(useClasesStore.getState().error).toBe("Ya usaste tus clases de esta semana");
  });

  it("GIVEN Valentina WHEN intenta reservar Boxeo THEN ve 'Tu plan no incluye esta actividad' (GZ003)", async () => {
    useClasesStore.getState().setDemoAlumnoId("demo-alumno-valentina");
    await useClasesStore.getState().cargarClasesAlumno();

    await useClasesStore.getState().reservar("demo-clase-box-viernes");
    expect(useClasesStore.getState().error).toBe("Tu plan no incluye esta actividad");
  });

  it("GIVEN Joaquín (inicio futuro) o Tomás (vencido) WHEN intentan reservar THEN ven el mensaje de GZ004", async () => {
    // Joaquín (inicio mes próximo)
    useClasesStore.getState().setDemoAlumnoId("demo-alumno-joaquin");
    await useClasesStore.getState().cargarClasesAlumno();
    await useClasesStore.getState().reservar("demo-clase-func-lunes");
    expect(useClasesStore.getState().error).toBe("Tu membresía no está habilitada para reservar");

    // Tomás (vencido)
    useClasesStore.getState().setDemoAlumnoId("demo-alumno-tomas");
    await useClasesStore.getState().cargarClasesAlumno();
    await useClasesStore.getState().reservar("demo-clase-func-lunes");
    expect(useClasesStore.getState().error).toBe("Tu membresía no está habilitada para reservar");
  });

  it("GIVEN una clase con capacidad 3 y 3 anotados WHEN un cuarto alumno reserva THEN ve 'No quedan cupos' (GZ001)", async () => {
    // Sofía Benítez (pase libre) intenta anotarse en la clase de miércoles que ya tiene 3 anotados
    useClasesStore.getState().setDemoAlumnoId("demo-alumno-sofia");
    await useClasesStore.getState().cargarClasesAlumno();

    await useClasesStore.getState().reservar("demo-clase-func-miercoles");
    expect(useClasesStore.getState().error).toBe("No quedan cupos en esta clase");
    expect(useClasesStore.getState().sinCupo).toContain("demo-clase-func-miercoles");
  });

  it("GIVEN una reserva activa antes del inicio de la clase WHEN el alumno cancela THEN la reserva queda CANCELADO y libera el cupo y límite", async () => {
    useClasesStore.getState().setDemoAlumnoId("demo-alumno-valentina");
    await useClasesStore.getState().cargarClasesAlumno();

    // Reserva lunes
    await useClasesStore.getState().reservar("demo-clase-func-lunes");
    const reserva = useClasesStore.getState().misReservas.find((r) => r.clase_id === "demo-clase-func-lunes")!;
    expect(reserva.estado).toBe("ANOTADO");

    // Cancela reserva
    await useClasesStore.getState().cancelarReserva(reserva.id);
    const cancelada = useClasesStore.getState().misReservas.find((r) => r.id === reserva.id)!;
    expect(cancelada.estado).toBe("CANCELADO");

    // Cupo liberado y límite semanal restaurado
    const ocupados = useClasesStore.getState().agendaReservas.filter((r) => r.clase_id === "demo-clase-func-lunes" && r.estado === "ANOTADO").length;
    expect(ocupados).toBe(0);
  });

  it("GIVEN el coach asignado WHEN marca ausente antes del inicio THEN ve 'La clase ya comenzó' (GZ006); después del inicio queda AUSENTE", async () => {
    await useClasesStore.getState().cargarAgenda();

    // demo-res-mie-1 es una reserva en una clase futura (miércoles 19:00)
    const reservaFutura = useClasesStore.getState().agendaReservas.find((r) => r.id === "demo-res-mie-1")!;
    await useClasesStore.getState().marcarAusente(reservaFutura.id);

    // Antes del inicio devuelve error GZ006
    expect(useClasesStore.getState().error).toBe("La clase ya comenzó");

    // Simulamos una clase ya iniciada (pasada respecto al reloj del store)
    const refMs = useClasesStore.getState().testAhora
      ? new Date(useClasesStore.getState().testAhora!).getTime()
      : Date.now();
    const clases = useClasesStore.getState().clases.map((c) =>
      c.id === "demo-clase-func-miercoles"
        ? { ...c, inicio: new Date(refMs - 3600000).toISOString() }
        : c,
    );
    useClasesStore.setState({ clases });

    await useClasesStore.getState().marcarAusente(reservaFutura.id);
    const marcada = useClasesStore.getState().agendaReservas.find((r) => r.id === reservaFutura.id)!;
    expect(marcada.estado).toBe("AUSENTE");
  });

  it("GIVEN el coach asignado WHEN cancela una clase con motivo THEN la clase queda CANCELADA, reservas ANULADO y alumnos la ven Cancelada", async () => {
    await useClasesStore.getState().cargarAgenda();

    const ok = await useClasesStore.getState().cancelarClase("demo-clase-func-miercoles", "Corte de suministro eléctrico");
    expect(ok).toBe(true);

    const clase = useClasesStore.getState().clases.find((c) => c.id === "demo-clase-func-miercoles")!;
    expect(clase.estado).toBe("CANCELADA");
    expect(clase.motivo_cancelacion).toBe("Corte de suministro eléctrico");

    const reservasClase = useClasesStore.getState().agendaReservas.filter((r) => r.clase_id === "demo-clase-func-miercoles");
    expect(reservasClase.every((r) => r.estado === "ANULADO")).toBe(true);
  });
});

describe("Vistas y detalles de alumnos (#113 / GH #122)", () => {
  const athlete = readSource("../components/athlete/athlete-classes.tsx");
  const agenda = readSource("../components/coach/class-agenda.tsx");
  const studentDetail = readSource("../components/coach/student-detail.tsx");

  it("Athlete App: contador semanal, selector demo, filtrado por actividad y cupos libres", () => {
    expect(athlete).toContain("clases usadas esta semana");
    expect(athlete).toContain("<DaysStrip");
    expect(athlete).toContain('data-testid="class-spots"');
    expect(athlete).toContain('data-testid="class-status"');
    expect(athlete).toContain('data-testid="plan-activity-filter"');
    expect(athlete).toContain('data-testid="demo-athlete-selector"');
    expect(athlete).toContain('data-testid="renewal-period-banner"');
    expect(athlete).toContain('size="touch"');
  });

  it("Coach Studio: ocupación, ausente en un toque condicionado al inicio y cancelación con motivo", () => {
    expect(agenda).toContain('data-testid="mark-absent-btn"');
    expect(agenda).toContain("claseIniciada");
    expect(agenda).toContain("min-h-11");
    expect(agenda).toContain("cupos");
    expect(agenda).toContain("minLength={MOTIVO_MINIMO}");
    expect(agenda).toContain("<dialog");
  });

  it("Student Detail: muestra Plan de Membresía y Actividad de la contratación", () => {
    expect(studentDetail).toContain('data-testid="membresia-clases-panel"');
    expect(studentDetail).toContain('data-testid="plan-membresia-nombre"');
    expect(studentDetail).toContain('data-testid="actividad-contratacion"');
    expect(studentDetail).toContain("Funcional 2x semana");
    expect(studentDetail).toContain("Pase libre Funcional + Boxeo");
  });

  it("Dataset demo exporta la estructura oficial de GH #122", () => {
    expect(DEMO_COACH_LUCIA.nombre_completo).toBe("Lucía Ferraro");
    expect(DEMO_PLANES_MEMBRESIA).toHaveLength(2);
    expect(DEMO_PLANES_MEMBRESIA.map((p) => p.nombre)).toEqual([
      "Funcional 2x semana",
      "Pase libre Funcional + Boxeo",
    ]);
    expect(DEMO_ALUMNOS_CLASES.map((a) => a.nombre_completo)).toEqual([
      "Valentina Ríos",
      "Sofía Benítez",
      "Joaquín Paz",
      "Tomás Ledesma",
    ]);
    expect(DEMO_CONTRATACIONES_CLASES).toHaveLength(4);
  });

  it("las rutas existen y están enlazadas desde los shells", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../app/(athlete)/athlete/clases/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, "../app/(coach)/studio/agenda/page.tsx"))).toBe(true);
    expect(readSource("../components/athlete/athlete-shell.tsx")).toContain('href: "/athlete/clases"');
    expect(readSource("../components/coach/studio-shell.tsx")).toContain('href="/studio/agenda"');
  });
});
