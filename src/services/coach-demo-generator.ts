import type {
  Contratacion,
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  Pago,
  Perfil,
  PlanEntrenamiento,
  PlanMembresia,
  RegistroSerie,
  RegistroSesion,
} from "@/types/database.types";
import {
  type HistoricalLoadEntry,
  MOCK_DIAS,
  MOCK_EJERCICIOS,
  MOCK_EJERCICIOS_RUTINA,
} from "@/services/coach-mock-data";
import { esSinEntrenar7d } from "@/lib/sin-entrenar";

// Generador del gimnasio demo (GOZS-139): ~40 alumnos con un mes de historia.
// Funciones puras, relativas a `ahora` y deterministas (PRNG con semilla fija, nunca Math.random).

const DIA_MS = 86_400_000;
const DIAS_HISTORIAL = 30;

import type { KpisNegocio } from "@/lib/kpis-negocio";
export type { KpisNegocio };

export interface DemoGimnasioBase {
  profesorId: string;
  alumnos: Perfil[];
  planes: PlanEntrenamiento[];
  contrataciones: Contratacion[];
  planesMembresia: PlanMembresia[];
}

export interface DemoGimnasio {
  alumnos: Perfil[];
  planes: PlanEntrenamiento[];
  contrataciones: Contratacion[];
  pagos: Pago[];
  historial: Record<string, HistoricalLoadEntry[]>;
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  ejercicios: Ejercicio[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entre = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mismoMes = (iso: string, ref: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
};

type Arquetipo = "CONSTANTE" | "IRREGULAR" | "AUSENCIA" | "ABANDONO";

interface FilaAlumno {
  nombre: string;
  arquetipo: Arquetipo;
  /** Hace cuántos días fue la última sesión (arquetipos AUSENCIA/ABANDONO). */
  ultimaHace?: number;
  vencido?: boolean;
  tardio?: boolean;
  altaHace?: number;
  bajaHace?: number;
  sinPlan?: boolean;
}

// 26 alumnos nuevos: 4 altas, 2 bajas, 6 sin entrenar (3 ausencias + 3 abandonos), 6 vencidos, 4 pagan tarde.
// Los nombres evitan las claves de getDemoAlumnoAlerts (lucas, celeste, facundo, mateo, valentina, camila, martina).
const FILAS: FilaAlumno[] = [
  { nombre: "Julieta Sosa", arquetipo: "CONSTANTE", altaHace: 0 },
  { nombre: "Ignacio Duarte", arquetipo: "CONSTANTE", altaHace: 1 },
  { nombre: "Abril Figueroa", arquetipo: "IRREGULAR", altaHace: 3 },
  { nombre: "Franco Ibarra", arquetipo: "CONSTANTE", altaHace: 5, sinPlan: true },
  { nombre: "Nahuel Cabrera", arquetipo: "IRREGULAR", bajaHace: 2 },
  { nombre: "Daniela Ponce", arquetipo: "IRREGULAR", bajaHace: 6 },
  { nombre: "Agustín Molina", arquetipo: "AUSENCIA", ultimaHace: 8, vencido: true },
  { nombre: "Rocío Herrera", arquetipo: "AUSENCIA", ultimaHace: 8 },
  { nombre: "Tobías Aguirre", arquetipo: "AUSENCIA", ultimaHace: 9 },
  { nombre: "Micaela Vera", arquetipo: "ABANDONO", ultimaHace: 11, vencido: true },
  { nombre: "Federico Luna", arquetipo: "ABANDONO", ultimaHace: 13 },
  { nombre: "Brenda Acosta", arquetipo: "ABANDONO", ultimaHace: 16 },
  { nombre: "Gonzalo Peralta", arquetipo: "CONSTANTE", vencido: true },
  { nombre: "Lara Domínguez", arquetipo: "CONSTANTE", vencido: true },
  { nombre: "Santiago Ojeda", arquetipo: "IRREGULAR", vencido: true },
  { nombre: "Pilar Sánchez", arquetipo: "IRREGULAR", vencido: true },
  { nombre: "Emiliano Correa", arquetipo: "CONSTANTE", tardio: true },
  { nombre: "Victoria Maldonado", arquetipo: "CONSTANTE", tardio: true },
  { nombre: "Ramiro Cáceres", arquetipo: "IRREGULAR", tardio: true },
  { nombre: "Antonella Bustos", arquetipo: "IRREGULAR", tardio: true },
  { nombre: "Leandro Funes", arquetipo: "CONSTANTE" },
  { nombre: "Camino Rivas", arquetipo: "CONSTANTE" },
  { nombre: "Paula Medrano", arquetipo: "CONSTANTE" },
  { nombre: "Dante Quinteros", arquetipo: "IRREGULAR" },
  { nombre: "Noelia Barrios", arquetipo: "IRREGULAR" },
  { nombre: "Fernando Rosales", arquetipo: "CONSTANTE" },
];

const DIAS_VENCIDOS = [12, 18, 15, 22, 11, 20];
const DIAS_TARDIOS = [14, 16, 21, 24];
const DIAS_EN_TERMINO = [1, 3, 5, 7, 10, 2, 8, 4, 6, 9, 1, 5, 3, 7];

const CATALOGO_PLANES: Array<{ nombre: string; dias: number }> = [
  { nombre: "Fuerza 3 días", dias: 3 },
  { nombre: "Hipertrofia Torso/Pierna", dias: 4 },
  { nombre: "Full Body principiante", dias: 3 },
  { nombre: "Powerlifting 4 días", dias: 4 },
  { nombre: "Push/Pull/Legs", dias: 5 },
  { nombre: "Upper/Lower 4 días", dias: 4 },
  { nombre: "Full Body 2 días", dias: 2 },
  { nombre: "Tonificación 3 días", dias: 3 },
  { nombre: "Recomposición 5 días", dias: 5 },
  { nombre: "Glúteos y Pierna 4 días", dias: 4 },
  { nombre: "Fuerza Base 2 días", dias: 2 },
];

const EJERCICIOS = [
  { id: "demo-ej-sentadilla", nombre: "Sentadilla Trasera", kg: 70 },
  { id: "demo-ej-banca", nombre: "Press de Banca Plano", kg: 55 },
  { id: "demo-ej-rumano", nombre: "Peso Muerto Rumano", kg: 65 },
  { id: "demo-ej-remo", nombre: "Remo con Barra", kg: 45 },
  { id: "demo-ej-militar", nombre: "Press Militar", kg: 32 },
  { id: "demo-ej-prensa", nombre: "Prensa 45°", kg: 120 },
  { id: "demo-ej-hipthrust", nombre: "Hip Thrust", kg: 60 },
  { id: "demo-ej-jalon", nombre: "Jalón al Pecho", kg: 42 },
];

const redondear25 = (kg: number) => Math.round(kg / 2.5) * 2.5;

/** Días (hacia atrás desde hoy) de cada sesión: arranca en `ultima` y retrocede según la frecuencia del plan. */
function diasDeSesiones(
  rng: () => number,
  ultima: number,
  freq: number,
  salto: number,
  limite: number,
): number[] {
  const dias = [ultima];
  let d = ultima;
  for (;;) {
    d += Math.max(1, Math.round(7 / freq) + entre(rng, -1, 1));
    if (d > limite) break;
    if (rng() >= salto) dias.push(d);
  }
  return dias;
}

function sesionesDelAlumno(
  alumno: Perfil,
  idx: number,
  freq: number,
  arquetipo: Arquetipo,
  ahora: Date,
  limite: number,
  hacerPr: boolean,
): HistoricalLoadEntry[] {
  if (!alumno.ultimo_entreno_at) return [];
  const ultima = Math.floor((ahora.getTime() - Date.parse(alumno.ultimo_entreno_at)) / DIA_MS);
  if (ultima > DIAS_HISTORIAL) return [];
  const rng = mulberry32(9100 + idx * 31);
  const salto = arquetipo === "IRREGULAR" ? 0.4 : arquetipo === "CONSTANTE" ? 0.05 : 0.2;
  const dias = diasDeSesiones(rng, ultima, freq, salto, Math.min(limite, DIAS_HISTORIAL));
  const kgBase = EJERCICIOS.map((e) => redondear25(e.kg * (0.6 + rng() * 0.7)));

  // De la más antigua a la más nueva para que el peso progrese.
  const cronologico = [...dias].reverse();
  const entradas = cronologico.map((haceDias, n): HistoricalLoadEntry => {
    const ts = haceDias === 0
      ? ahora.getTime() - entre(rng, 1, 3) * 3_600_000
      : ahora.getTime() - haceDias * DIA_MS - entre(rng, 1, 10) * 3_600_000;
    const iso = new Date(ts).toISOString();
    const esUltima = n === cronologico.length - 1;
    const sesionId = `demo-ses-${alumno.id}-${n + 1}`;
    const series: HistoricalLoadEntry["series"] = [];
    for (let j = 0; j < 3; j++) {
      const ej = (n * 3 + j + idx) % EJERCICIOS.length;
      const info = EJERCICIOS[ej]!;
      const progreso = 1 + 0.004 * (DIAS_HISTORIAL - haceDias);
      for (let s = 1; s <= 3; s++) {
        let peso = redondear25((kgBase[ej] ?? info.kg) * progreso);
        if (hacerPr && esUltima && j === 0 && s === 1) peso += 5;
        const reps = entre(rng, 6, 12);
        const serie: RegistroSerie & { ejercicioNombre: string } = {
          id: `${sesionId}-s${j * 3 + s}`,
          sesion_id: sesionId,
          ejercicio_id: info.id,
          numero_serie: s,
          peso_kg: peso,
          reps_hechas: reps,
          rpe_real: 6.5 + entre(rng, 0, 6) * 0.5,
          completada: true,
          created_at: iso,
          updated_at: iso,
          ejercicioNombre: info.nombre,
        };
        series.push(serie);
      }
    }
    const sesion: RegistroSesion = {
      id: sesionId,
      alumno_id: alumno.id,
      dia_id: `${alumno.id}-d${(n % freq) + 1}`,
      fecha: iso,
      duracion_minutos: entre(rng, 45, 80),
      volumen_total_kg: series.reduce((acc, s) => acc + s.peso_kg * s.reps_hechas, 0),
      created_at: iso,
      updated_at: iso,
    };
    return { sesion, series };
  });
  // Más reciente primero, como el resto del historial.
  return entradas.reverse();
}

export function generarDemoGimnasio(base: DemoGimnasioBase, ahora: Date): DemoGimnasio {
  const hoy = inicioDia(ahora);
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const haceDias = (n: number) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n);
  const isoHace = (n: number, hora = 9) => new Date(haceDias(n).getTime() + hora * 3_600_000).toISOString();
  const dentroDelMes = (n: number) => (haceDias(n) < inicioMes ? inicioMes : haceDias(n));
  const diaDelMes = (dia: number, mesesDesdeHoy: number) =>
    new Date(hoy.getFullYear(), hoy.getMonth() + mesesDesdeHoy, dia);
  /** Último vencimiento (día `dia`) estrictamente anterior a hoy. */
  const ultimoVencimiento = (dia: number) => {
    const c = diaDelMes(dia, 0);
    return c < hoy ? c : diaDelMes(dia, -1);
  };

  const nuevos: Perfil[] = [];
  const planesNuevos: PlanEntrenamiento[] = [];
  const meta = new Map<string, { freq: number; arquetipo: Arquetipo; dia: number; vencido: boolean; altaHace?: number; pr: boolean }>();

  let iVencido = 0;
  let iTardio = 0;
  let iTermino = 0;
  FILAS.forEach((f, i) => {
    const rng = mulberry32(4200 + i * 17);
    const id = `demo-alumno-g${pad(i + 1)}`;
    const dia = f.vencido
      ? DIAS_VENCIDOS[iVencido++ % DIAS_VENCIDOS.length]!
      : f.tardio
        ? DIAS_TARDIOS[iTardio++ % DIAS_TARDIOS.length]!
        : DIAS_EN_TERMINO[iTermino++ % DIAS_EN_TERMINO.length]!;
    const catalogo = CATALOGO_PLANES[(i * 5 + 2) % CATALOGO_PLANES.length]!;
    const baja = f.bajaHace !== undefined;
    const creado = f.altaHace !== undefined ? dentroDelMes(f.altaHace) : haceDias(entre(rng, 40, 140));
    const limite = f.altaHace !== undefined ? Math.round((hoy.getTime() - creado.getTime()) / DIA_MS) : DIAS_HISTORIAL;

    // Última sesión según arquetipo (altas: desde el día de alta; bajas: antes de la baja).
    let ultimaHace: number;
    if (f.altaHace !== undefined) ultimaHace = entre(rng, 0, Math.max(0, limite));
    else if (baja) ultimaHace = f.bajaHace! + entre(rng, 1, 4);
    else if (f.ultimaHace !== undefined) ultimaHace = f.ultimaHace;
    else ultimaHace = f.arquetipo === "CONSTANTE" ? entre(rng, 0, 2) : entre(rng, 1, 5);

    const emailSlug = f.nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, ".");
    const ultimoEntreno = new Date(
      ultimaHace === 0
        ? ahora.getTime() - entre(rng, 1, 3) * 3_600_000
        : ahora.getTime() - ultimaHace * DIA_MS - entre(rng, 1, 10) * 3_600_000,
    ).toISOString();

    const fechaBaja = baja ? ymd(dentroDelMes(f.bajaHace!)) : null;
    const cuota = f.vencido ? ultimoVencimiento(dia) : diaDelMes(dia, 1);
    nuevos.push({
      id,
      nombre_completo: f.nombre,
      email: `${emailSlug}@ficticio.ar`,
      telefono: `+54 9 11 5${entre(rng, 100, 999)}-${entre(rng, 1000, 9999)}`,
      rol: "ALUMNO",
      estado_membresia: baja ? "INACTIVA" : "ACTIVA",
      profesor_asignado_id: base.profesorId,
      fecha_baja: fechaBaja,
      fecha_vencimiento_cuota: baja ? ymd(haceDias(f.bajaHace!)) : ymd(cuota),
      ultimo_entreno_at: ultimoEntreno,
      created_at: creado.toISOString(),
      updated_at: ultimoEntreno,
    });
    meta.set(id, {
      freq: catalogo.dias,
      arquetipo: f.arquetipo,
      dia,
      vencido: Boolean(f.vencido),
      altaHace: f.altaHace !== undefined ? limite : undefined,
      pr: i % 4 === 1,
    });
    if (!f.sinPlan) {
      const inicio = entre(rng, 5, 28);
      planesNuevos.push({
        id: `demo-plan-g${pad(i + 1)}`,
        profesor_id: base.profesorId,
        alumno_id: id,
        nombre: catalogo.nombre,
        estado: baja ? "INACTIVO" : "ACTIVO",
        fecha_inicio: ymd(haceDias(inicio)),
        fecha_fin: ymd(haceDias(inicio - 60)),
        comentarios: null,
        created_at: isoHace(inicio),
        updated_at: isoHace(inicio),
      });
    }
  });

  const alumnos = [...base.alumnos, ...nuevos];
  const generados = new Set(nuevos.map((a) => a.id));

  // Alumnos base: frecuencia y día de corte asignados (los que ya tienen contratación conservan la suya).
  alumnos.forEach((a, i) => {
    if (!meta.has(a.id)) {
      meta.set(a.id, {
        freq: [3, 4, 2, 5, 3, 4][i % 6]!,
        arquetipo: "CONSTANTE",
        dia: DIAS_EN_TERMINO[(i + 3) % DIAS_EN_TERMINO.length]!,
        vencido: false,
        pr: i % 3 === 0,
      });
    }
  });

  // Contrataciones: las base se respetan; al resto se le deriva una desde el perfil.
  const planesMembresia = base.planesMembresia;
  // El inicio de las contrataciones base sigue al alta del perfil (copia: no se muta el export original).
  const contrataciones: Contratacion[] = base.contrataciones.map((c) => {
    const alta = alumnos.find((a) => a.id === c.alumno_id)?.created_at;
    return alta ? { ...c, fecha_inicio: ymd(new Date(alta)) } : c;
  });
  const pagos: Pago[] = [];
  alumnos.forEach((a, i) => {
    const m = meta.get(a.id)!;
    const rng = mulberry32(7300 + i * 13);
    const existente = contrataciones.find((c) => c.alumno_id === a.id);
    const plan = existente
      ? planesMembresia.find((p) => p.id === existente.plan_membresia_id) ?? planesMembresia[0]!
      : planesMembresia[entre(rng, 0, planesMembresia.length - 1)]!;
    const activo = a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE";
    let contrato = existente;
    if (!contrato) {
      const fin = a.fecha_vencimiento_cuota ?? ymd(diaDelMes(m.dia, 1));
      const diasHastaFin = Math.round((Date.parse(`${fin}T00:00:00`) - hoy.getTime()) / DIA_MS);
      contrato = {
        id: `demo-cont-${a.id}`,
        alumno_id: a.id,
        tipo_servicio: "PRESENCIAL",
        plan_membresia_id: plan.id,
        actividad: plan.cantidad_actividades > 1 ? null : "FUNCIONAL",
        dia_vencimiento: m.dia,
        fecha_inicio: ymd(new Date(a.created_at)),
        fecha_fin: fin,
        estado: diasHastaFin < 0 ? "VENCIDA" : diasHastaFin <= 3 ? "POR_VENCER" : "VIGENTE",
        dias_aviso_previo: 5,
        precio_pactado: null,
        created_at: a.created_at,
        updated_at: a.updated_at,
      };
      contrataciones.push(contrato);
    }
    // Quien está activo y no es un vencido pagó este mes: el día de corte, o hoy si todavía no llegó.
    if (activo && !m.vencido) {
      const diaPago = m.altaHace !== undefined
        ? inicioDia(new Date(a.created_at))
        : new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(contrato.dia_vencimiento, hoy.getDate()));
      const iso = new Date(diaPago.getTime() + 11 * 3_600_000).toISOString();
      pagos.push({
        id: `demo-pago-${a.id}`,
        contratacion_id: contrato.id,
        alumno_id: a.id,
        cobro_id: null,
        monto: plan.precio,
        monto_lista: plan.precio,
        monto_cobrado: plan.precio,
        nota: null,
        medio_pago: (["TRANSFERENCIA", "EFECTIVO", "PASARELA_ONLINE"] as const)[i % 3]!,
        estado: "CONFIRMADO",
        idempotency_key: `demo-pago-${a.id}-${ymd(diaPago)}`,
        confirmado_por: base.profesorId,
        confirmado_at: iso,
        created_at: iso,
        updated_at: iso,
      });
    }
  });

  // Historial de cargas del último mes.
  const historial: Record<string, HistoricalLoadEntry[]> = {};
  alumnos.forEach((a, i) => {
    const m = meta.get(a.id)!;
    const entradas = sesionesDelAlumno(a, i, m.freq, m.arquetipo, ahora, m.altaHace ?? DIAS_HISTORIAL, m.pr);
    if (entradas.length === 0) return;
    historial[a.id] = entradas;
    // En los alumnos generados el último entreno sale de la última sesión.
    if (generados.has(a.id)) {
      a.ultimo_entreno_at = entradas[0]!.sesion.fecha;
      a.updated_at = entradas[0]!.sesion.fecha;
    }
  });

  const planes = [...base.planes, ...planesNuevos];
  const { dias, ejerciciosEnRutina } = derivarDiasYEjerciciosDemo(planes, meta);

  return {
    alumnos,
    planes,
    contrataciones,
    pagos,
    historial,
    dias,
    ejerciciosEnRutina,
    ejercicios: MOCK_EJERCICIOS,
  };
}

function getNombreDiaDemo(freq: number, d: number): string {
  if (freq === 2) {
    return d === 1 ? "Día 1: Torso Pesado & Potencia" : "Día 2: Pierna Fuerza & Cadena Posterior";
  }
  if (freq === 3) {
    return d === 1
      ? "Día 1: Empuje (Push) & Pectoral"
      : d === 2
        ? "Día 2: Tracción (Pull) & Espalda"
        : "Día 3: Piernas & Core";
  }
  if (freq === 4) {
    return d === 1
      ? "Día 1: Torso Pesado & Hipertrofia"
      : d === 2
        ? "Día 2: Pierna Fuerza & Sentadilla"
        : d === 3
          ? "Día 3: Torso Volumen & Brazos"
          : "Día 4: Pierna Posterior & Glúteos";
  }
  if (freq === 5) {
    return d === 1
      ? "Día 1: Pecho & Hombros"
      : d === 2
        ? "Día 2: Espalda & Core"
        : d === 3
          ? "Día 3: Cuádriceps & Gemelos"
          : d === 4
            ? "Día 4: Brazos & Hombros"
            : "Día 5: Isquios & Glúteos";
  }
  return `Día ${d}: Full Body & Fuerza`;
}

export function derivarDiasYEjerciciosDemo(
  planes: PlanEntrenamiento[],
  meta?: Map<string, { freq: number }>,
): {
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
} {
  const dias: DiaRutina[] = [];
  const ejerciciosEnRutina: EjercicioEnRutina[] = [];

  // MOCK_DIAS canónicos para planes legacy (p101-lucas-activo)
  for (const md of MOCK_DIAS) {
    dias.push(md);
  }
  for (const me of MOCK_EJERCICIOS_RUTINA) {
    ejerciciosEnRutina.push(me);
  }

  for (const plan of planes) {
    // Si ya es el plan canónico de Lucas, ya está en MOCK_DIAS
    if (plan.id === "p101-lucas-activo") {
      continue;
    }

    // Lucas en dataset demo ("demo-plan-lucas")
    if (plan.id === "demo-plan-lucas" || plan.alumno_id === "demo-alumno-01-lucas") {
      dias.push({
        id: "d1-torso",
        plan_id: plan.id,
        nombre: "Día 1: Torso Pesado & Potencia",
        orden: 1,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      });
      dias.push({
        id: "d2-pierna",
        plan_id: plan.id,
        nombre: "Día 2: Pierna Fuerza & Cadena Posterior",
        orden: 2,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      });
      continue;
    }

    let freq = plan.alumno_id ? meta?.get(plan.alumno_id)?.freq : undefined;
    if (!freq) {
      const nLower = plan.nombre.toLowerCase();
      if (
        nLower.includes("4 días") ||
        nLower.includes("4d") ||
        nLower.includes("torso-pierna") ||
        nLower.includes("torso/pierna") ||
        nLower.includes("powerlifting") ||
        nLower.includes("upper/lower")
      ) {
        freq = 4;
      } else if (
        nLower.includes("5 días") ||
        nLower.includes("push/pull/legs") ||
        nLower.includes("recomposición")
      ) {
        freq = 5;
      } else if (nLower.includes("2 días") || nLower.includes("2x")) {
        freq = 2;
      } else {
        freq = 3;
      }
    }

    const alumnoKey = plan.alumno_id ?? plan.id;
    for (let d = 1; d <= freq; d++) {
      const diaId = `${alumnoKey}-d${d}`;
      const nombreDia = getNombreDiaDemo(freq, d);

      dias.push({
        id: diaId,
        plan_id: plan.id,
        nombre: nombreDia,
        orden: d,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      });

      for (let k = 0; k < 3; k++) {
        const ejIndex = ((d - 1) * 3 + k) % MOCK_EJERCICIOS.length;
        const ej = MOCK_EJERCICIOS[ejIndex]!;
        ejerciciosEnRutina.push({
          id: `er-${diaId}-${k + 1}`,
          dia_id: diaId,
          ejercicio_id: ej.id,
          orden: k + 1,
          series: 4,
          repeticiones: "8-10",
          descanso_segundos: 90,
          rpe_objetivo: 8.0,
          notas: "Cadencia 2-0-1 y control articular.",
          es_superserie: false,
          grupo_superserie: null,
          created_at: plan.created_at,
          updated_at: plan.updated_at,
        });
      }
    }
  }

  return { dias, ejerciciosEnRutina };
}

/** KPIs de negocio con las mismas reglas que la RPC obtener_kpis_negocio (GOZS-135). */
export function derivarKpisNegocio(
  g: DemoGimnasio,
  planesMembresia: PlanMembresia[],
  ahora: Date,
  rango?: { desde: string; hasta: string },
): KpisNegocio {
  const hoy = inicioDia(ahora);
  const hoyIso = ymd(hoy);
  const inicioMes = ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const fechaDesde = rango ? rango.desde : inicioMes;
  const fechaHasta = rango ? rango.hasta : hoyIso;
  const esActivo = (a: Perfil) => a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE";
  const activos = new Set(g.alumnos.filter((a) => a.rol === "ALUMNO" && esActivo(a)).map((a) => a.id));
  const precioPlan = (id: string | null) => planesMembresia.find((p) => p.id === id);

  const pagoEnRango = (p: { confirmado_at: string | null }) => {
    if (!p.confirmado_at) return false;
    if (rango) {
      const pFecha = p.confirmado_at.slice(0, 10);
      return pFecha >= fechaDesde && pFecha <= fechaHasta;
    }
    return mismoMes(p.confirmado_at, ahora);
  };

  const ingresos = g.pagos
    .filter((p) => p.estado === "CONFIRMADO" && pagoEnRango(p))
    .reduce((acc, p) => acc + p.monto, 0);

  // Cuotas adeudadas de activos con fecha_fin <= hoy
  const adeudadas = g.contrataciones.filter((c) => {
    const plan = precioPlan(c.plan_membresia_id);
    return plan && activos.has(c.alumno_id) && c.estado !== "EN_PAUSA" && c.fecha_fin <= hoyIso;
  });

  const cuotasVencidas = adeudadas.filter((c) => c.fecha_fin < hoyIso);
  const cuotasPorVencer = adeudadas.filter((c) => c.fecha_fin >= hoyIso);

  const vencido = cuotasVencidas.reduce((acc, c) => {
    const plan = precioPlan(c.plan_membresia_id)!;
    return acc + plan.precio / plan.duracion_meses;
  }, 0);

  const porCobrar = cuotasPorVencer.reduce((acc, c) => {
    const plan = precioPlan(c.plan_membresia_id)!;
    return acc + plan.precio / plan.duracion_meses;
  }, 0);

  const pendiente = vencido + porCobrar;
  const vencidas = cuotasVencidas.length;

  const cobrado = ingresos;
  const facturado = cobrado + porCobrar + vencido;
  const tasaCobroPct = facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0;

  const morososIds = new Set(cuotasVencidas.map((c) => c.alumno_id));
  const alumnosMorosos = morososIds.size;
  const alumnosAlDia = Math.max(0, activos.size - alumnosMorosos);

  const primeraPorAlumno = new Map<string, string>();
  for (const c of g.contrataciones) {
    const previa = primeraPorAlumno.get(c.alumno_id);
    if (!previa || c.fecha_inicio < previa) primeraPorAlumno.set(c.alumno_id, c.fecha_inicio);
  }
  const altas = [...primeraPorAlumno.values()].filter((f) => f >= fechaDesde && f <= fechaHasta).length;
  const bajas = g.alumnos.filter(
    (a) =>
      a.rol === "ALUMNO" &&
      (a.estado_membresia === "INACTIVA" || a.estado_membresia === "BAJA" || a.estado_membresia === "ARCHIVED") &&
      a.fecha_baja !== null &&
      a.fecha_baja >= fechaDesde &&
      a.fecha_baja <= fechaHasta,
  ).length;

  // Si hay pagos de meses previos en el dataset, calcular serie histórica exacta
  const tienePagosPrevios = g.pagos.some((p) => p.confirmado_at && !mismoMes(p.confirmado_at, ahora));
  let ultimos6: number[];
  let anterior: number;

  if (tienePagosPrevios) {
    ultimos6 = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const totalMes = g.pagos
        .filter((p) => p.estado === "CONFIRMADO" && p.confirmado_at && mismoMes(p.confirmado_at, d))
        .reduce((s, p) => s + p.monto, 0);
      ultimos6.push(totalMes);
    }
    anterior = ultimos6[4]!;
  } else {
    const previos = [0.62, 0.69, 0.77, 0.85, 0.92].map((f) => Math.round((ingresos * f) / 100) * 100);
    ultimos6 = [...previos, ingresos];
    anterior = previos[4]!;
  }

  const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

  // Desagregado presencial (funcional + boxeo) y online (rutinas)
  let ingresosPresencial = 0;
  let ingresosOnline = 0;
  for (const p of g.pagos) {
    if (p.estado === "CONFIRMADO" && pagoEnRango(p)) {
      const c = g.contrataciones.find((x) => x.id === p.contratacion_id);
      const plan = c ? precioPlan(c.plan_membresia_id) : null;
      const esOnline =
        c?.tipo_servicio === "ASESORIA_ONLINE" ||
        (Boolean(plan?.nombre) && /rutina|online/i.test(plan!.nombre)) ||
        (c?.actividad as string) === "RUTINAS";
      if (esOnline) {
        ingresosOnline += p.monto;
      } else {
        ingresosPresencial += p.monto;
      }
    }
  }

  if (ingresosOnline === 0 && ingresos > 0 && g.alumnos.length >= 30) {
    ingresosPresencial = Math.round((ingresos * 0.65) / 1000) * 1000;
    ingresosOnline = ingresos - ingresosPresencial;
  }

  return {
    cobrado,
    porCobrar,
    vencido,
    facturado,
    tasaCobroPct,

    ingresos_presencial: ingresosPresencial,
    ingresos_online: ingresosOnline,

    alumnos_activos: activos.size,
    cantActivas: activos.size,
    alumnos_al_dia: alumnosAlDia,
    alumnosAlDia,
    alumnos_morosos: alumnosMorosos,
    alumnosMorosos,

    sin_entrenar_7d_ids: g.alumnos
      .filter((a) => (a.rol === "ALUMNO" || !a.rol) && esSinEntrenar7d(a, ahora.getTime()))
      .map((a) => a.id),
    altas_mes: altas,
    bajas_mes: bajas,

    ingresos_mes: ingresos,
    ingresos_variacion_pct: anterior > 0 ? Math.round(((ingresos - anterior) / anterior) * 100) : 0,
    ingresos_mes_anterior_label: new Intl.DateTimeFormat("es-AR", { month: "short" }).format(mesAnterior),
    ingresos_ultimos_6_meses: ultimos6,
    a_cobrar: Math.round(pendiente),
    cobranza_pct: facturado > 0 ? Math.round((cobrado / facturado) * 100) : 100,
    cobranza_faltante: Math.round(pendiente),
    cobranza_vencidas: vencidas,
  };
}
