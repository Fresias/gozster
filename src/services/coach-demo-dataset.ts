import type { Clase, Contratacion, Perfil, PlanEntrenamiento, PlanMembresia, Reserva } from "@/types/database.types";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import type { CriticalAlert } from "@/components/coach/critical-alerts-inbox";
import { diasDeLaSemana } from "@/lib/clases";
import { derivarKpisNegocio, generarDemoGimnasio, type KpisNegocio } from "@/services/coach-demo-generator";

export const DEMO_PROFESOR_ID = "00000000-0000-4000-a000-000000000001";

/**
 * Helper para generar fechas relativas al día de hoy para que las pruebas
 * de semáforos siempre se mantengan vigentes en cualquier fecha de ejecución.
 */
function getRelativeDateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const parts = d.toISOString().split("T");
  return parts[0] ?? d.toISOString().substring(0, 10);
}

function getRelativeIsoStr(daysOffset: number, hoursOffset: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(d.getHours() + hoursOffset);
  return d.toISOString();
}

/**
 * 10 Atletas Ficticios diseñados para demostrar todos los semáforos del Cuadro INDEC:
 *
 * 1. Lucas Giménez:
 *    - Cuota: 🟢 AL DÍA (vence en 20 días)
 *    - Score Salud [SH]: 🟢 [ 88 ]
 *    - Vigencia Rutina: 🟢 Vigente (hace 10 días, < 30d)
 *    - Actividad: 🟢 Reciente (hace 1 día, < 7d)
 *    - Alertas: [ 🚨 Hombro ] + [ ⚡ PR Banca ] (múltiples simultáneos)
 *
 * 2. Celeste Gerardi:
 *    - Cuota: 🟢 AL DÍA (vence en 15 días)
 *    - Score Salud [SH]: 🟡 [ 76 ]
 *    - Vigencia Rutina: 🟢 Vigente (hace 14 días, < 30d)
 *    - Actividad: 🟢 Reciente (hoy, < 7d)
 *    - Alertas: [ 🚨 Rodilla ] (dolor concéntrico)
 *
 * 3. Facundo Medina:
 *    - Cuota: 🟡 PENDIENTE (vence en 2 días, ≤ 3d)
 *    - Score Salud [SH]: 🟡 [ 64 ]
 *    - Vigencia Rutina: 🟡 Por renovar (hace 42 días, 30-60d)
 *    - Actividad: 🟡 Advertencia (hace 9 días, 7-14d)
 *    - Alertas: [ 🚨 Lumbar ]
 *
 * 4. Sofía Albarracín:
 *    - Cuota: 🔴 VENCIDA (hace 12 días)
 *    - Score Salud [SH]: 🔴 [ 48 ]
 *    - Vigencia Rutina: 🔴 Vencida (hace 70 días, > 60d)
 *    - Actividad: 🔴 Inactiva (hace 18 días, > 14d)
 *    - Alertas: — (alerta de retención)
 *
 * 5. Mateo Rossi:
 *    - Cuota: 🟢 AL DÍA (vence en 25 días)
 *    - Score Salud [SH]: 🟢 [ 96 ]
 *    - Vigencia Rutina: 🟢 Vigente (hace 5 días, < 30d)
 *    - Actividad: 🟢 Reciente (hoy, < 7d)
 *    - Alertas: [ ⚡ PR Sentadilla ] (160 kg)
 *
 * 6. Valentina Quiroga:
 *    - Cuota: 🟡 PENDIENTE (vence en 1 día, ≤ 3d)
 *    - Score Salud [SH]: 🟢 [ 82 ]
 *    - Vigencia Rutina: 🟢 Vigente (hace 20 días, < 30d)
 *    - Actividad: 🟢 Reciente (hace 3 días, < 7d)
 *    - Alertas: [ ⚡ PR Peso Muerto ] (140 kg)
 *
 * 7. Bautista Benítez:
 *    - Cuota: 🔴 VENCIDA (hace 5 días)
 *    - Score Salud [SH]: 🔴 [ 35 ]
 *    - Vigencia Rutina: 🔴 Sin Plan asignado (Huérfano)
 *    - Actividad: 🔴 Inactivo (hace 25 días, > 14d)
 *    - Alertas: — (caso de deserción extrema)
 *
 * 8. Camila Navarro:
 *    - Cuota: 🟢 AL DÍA (vence en 18 días)
 *    - Score Salud [SH]: 🟡 [ 71 ]
 *    - Vigencia Rutina: 🟡 Por renovar (hace 49 días, 30-60d)
 *    - Actividad: 🟢 Reciente (hace 4 días, < 7d)
 *    - Alertas: [ 🚨 Codo ] (molestia en tríceps)
 *
 * 9. Esteban Papic:
 *    - Cuota: 🟢 AL DÍA (vence en 22 días)
 *    - Score Salud [SH]: 🟢 [ 91 ]
 *    - Vigencia Rutina: 🟢 Vigente (hace 15 días, < 30d)
 *    - Actividad: 🟢 Reciente (hace 2 días, < 7d)
 *    - Alertas: — (atleta nominal de alto rendimiento)
 *
 * 10. Martina Gómez:
 *     - Cuota: 🟡 PENDIENTE (vence hoy, 0 días)
 *     - Score Salud [SH]: 🔴 [ 58 ]
 *     - Vigencia Rutina: 🔴 Vencida (hace 65 días, > 60d)
 *     - Actividad: 🟡 Advertencia (hace 8 días, 7-14d)
 *     - Alertas: [ 🚨 Rodilla ] + [ ⚡ PR Prensa ] (múltiples simultáneos)
 */

export const DEMO_ALUMNOS: Perfil[] = [
  {
    id: "demo-alumno-01-lucas",
    nombre_completo: "Lucas Giménez",
    email: "lucas.gimenez@ficticio.ar",
    telefono: "+54 9 11 4589-2101",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(20),
    ultimo_entreno_at: getRelativeIsoStr(-1, -2),
    created_at: getRelativeIsoStr(-120),
    updated_at: getRelativeIsoStr(-1),
  },
  {
    id: "demo-alumno-02-celeste",
    nombre_completo: "Celeste Gerardi",
    email: "celeste.gerardi@ficticio.ar",
    telefono: "+54 9 11 5123-4567",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(15),
    ultimo_entreno_at: getRelativeIsoStr(0, -3),
    created_at: getRelativeIsoStr(-90),
    updated_at: getRelativeIsoStr(0),
  },
  {
    id: "demo-alumno-03-facundo",
    nombre_completo: "Facundo Medina",
    email: "facundo.medina@ficticio.ar",
    telefono: "+54 9 11 6789-0123",
    rol: "ALUMNO",
    estado_membresia: "PENDIENTE",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(2),
    ultimo_entreno_at: getRelativeIsoStr(-9),
    created_at: getRelativeIsoStr(-60),
    updated_at: getRelativeIsoStr(-9),
  },
  {
    id: "demo-alumno-04-sofia",
    nombre_completo: "Sofía Albarracín",
    email: "sofia.albarracin@ficticio.ar",
    telefono: "+54 9 11 7890-1234",
    rol: "ALUMNO",
    estado_membresia: "INACTIVA",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(-12),
    ultimo_entreno_at: getRelativeIsoStr(-18),
    created_at: getRelativeIsoStr(-150),
    updated_at: getRelativeIsoStr(-18),
  },
  {
    id: "demo-alumno-05-mateo",
    nombre_completo: "Mateo Rossi",
    email: "mateo.rossi@ficticio.ar",
    telefono: "+54 9 11 8901-2345",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(25),
    ultimo_entreno_at: getRelativeIsoStr(0, -1),
    created_at: getRelativeIsoStr(-45),
    updated_at: getRelativeIsoStr(0),
  },
  {
    id: "demo-alumno-06-valentina",
    nombre_completo: "Valentina Quiroga",
    email: "valentina.quiroga@ficticio.ar",
    telefono: "+54 9 11 9012-3456",
    rol: "ALUMNO",
    estado_membresia: "PENDIENTE",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(1),
    ultimo_entreno_at: getRelativeIsoStr(-3),
    created_at: getRelativeIsoStr(-75),
    updated_at: getRelativeIsoStr(-3),
  },
  {
    id: "demo-alumno-07-bautista",
    nombre_completo: "Bautista Benítez",
    email: "bautista.benitez@ficticio.ar",
    telefono: "+54 9 11 2345-6789",
    rol: "ALUMNO",
    estado_membresia: "INACTIVA",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(-5),
    ultimo_entreno_at: getRelativeIsoStr(-25),
    created_at: getRelativeIsoStr(-180),
    updated_at: getRelativeIsoStr(-25),
  },
  {
    id: "demo-alumno-08-camila",
    nombre_completo: "Camila Navarro",
    email: "camila.navarro@ficticio.ar",
    telefono: "+54 9 11 3456-7890",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(18),
    ultimo_entreno_at: getRelativeIsoStr(-4),
    created_at: getRelativeIsoStr(-80),
    updated_at: getRelativeIsoStr(-4),
  },
  {
    id: "demo-alumno-09-esteban",
    nombre_completo: "Esteban Papic",
    email: "esteban.papic@ficticio.ar",
    telefono: "+54 9 11 4567-8901",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(22),
    ultimo_entreno_at: getRelativeIsoStr(-2),
    created_at: getRelativeIsoStr(-100),
    updated_at: getRelativeIsoStr(-2),
  },
  {
    id: "demo-alumno-10-martina",
    nombre_completo: "Martina Gómez",
    email: "martina.gomez@ficticio.ar",
    telefono: "+54 9 11 5678-9012",
    rol: "ALUMNO",
    estado_membresia: "PENDIENTE",
    profesor_asignado_id: DEMO_PROFESOR_ID,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(1),
    ultimo_entreno_at: getRelativeIsoStr(-8),
    created_at: getRelativeIsoStr(-110),
    updated_at: getRelativeIsoStr(-8),
  },
];

export const DEMO_PLANES: PlanEntrenamiento[] = [
  {
    id: "demo-plan-lucas",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-01-lucas",
    nombre: "Hipertrofia & Fuerza Torso-Pierna v2",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-10),
    fecha_fin: getRelativeDateStr(50),
    comentarios: "Foco en press banca y sentadilla pesada.",
    created_at: getRelativeIsoStr(-10),
    updated_at: getRelativeIsoStr(-10),
  },
  {
    id: "demo-plan-celeste",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-02-celeste",
    nombre: "Fuerza Femenina & Glúteos 4D",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-14),
    fecha_fin: getRelativeDateStr(46),
    comentarios: "Control articular en sentadillas profundas.",
    created_at: getRelativeIsoStr(-14),
    updated_at: getRelativeIsoStr(-14),
  },
  {
    id: "demo-plan-facundo",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-03-facundo",
    nombre: "Potencia & Acondicionamiento Físico",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-42),
    fecha_fin: getRelativeDateStr(18),
    comentarios: "Semana de deload previa a nuevo mesociclo.",
    created_at: getRelativeIsoStr(-42),
    updated_at: getRelativeIsoStr(-42),
  },
  {
    id: "demo-plan-sofia",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-04-sofia",
    nombre: "Iniciación a la Fuerza Básica",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-70),
    fecha_fin: getRelativeDateStr(-10),
    comentarios: "Plan expirado que requiere renovación urgente.",
    created_at: getRelativeIsoStr(-70),
    updated_at: getRelativeIsoStr(-70),
  },
  {
    id: "demo-plan-mateo",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-05-mateo",
    nombre: "Powerlifting Peaking Program",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-5),
    fecha_fin: getRelativeDateStr(55),
    comentarios: "RPE 9-10 en básicos de competición.",
    created_at: getRelativeIsoStr(-5),
    updated_at: getRelativeIsoStr(-5),
  },
  {
    id: "demo-plan-valentina",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-06-valentina",
    nombre: "Empuje-Tracción-Pierna Pro",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-20),
    fecha_fin: getRelativeDateStr(40),
    comentarios: "Sobrecarga lineal semanal.",
    created_at: getRelativeIsoStr(-20),
    updated_at: getRelativeIsoStr(-20),
  },
  // Bautista Benítez no tiene plan asignado (alumno huérfano / Sin Plan)
  {
    id: "demo-plan-camila",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-08-camila",
    nombre: "Tren Superior & Core Avanzado",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-49),
    fecha_fin: getRelativeDateStr(11),
    comentarios: "Ajustar variantes de tríceps si persiste molestia.",
    created_at: getRelativeIsoStr(-49),
    updated_at: getRelativeIsoStr(-49),
  },
  {
    id: "demo-plan-esteban",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-09-esteban",
    nombre: "Full Body Fuerza Atlética 3x",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-15),
    fecha_fin: getRelativeDateStr(45),
    comentarios: "Técnica pulida y progresión constante.",
    created_at: getRelativeIsoStr(-15),
    updated_at: getRelativeIsoStr(-15),
  },
  {
    id: "demo-plan-martina",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-10-martina",
    nombre: "Fuerza General & Tren Inferior",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-65),
    fecha_fin: getRelativeDateStr(-5),
    comentarios: "Plan vencido hace 5 días.",
    created_at: getRelativeIsoStr(-65),
    updated_at: getRelativeIsoStr(-65),
  },
];

export const DEMO_CRITICAL_ALERTS: CriticalAlert[] = [
  {
    id: "demo-alert-celeste-rodilla",
    type: "DOLOR",
    alumnoId: "demo-alumno-02-celeste",
    alumnoNombre: "Celeste Gerardi",
    ejercicioNombre: "Sentadilla Trasera con Barra",
    setNumber: 3,
    detalle: "[Dolor: MODERADO] Rodilla - Pinchazo en la fase concéntrica al subir",
    fecha: "Hoy, 10:45",
    resolved: false,
  },
  {
    id: "demo-alert-lucas-hombro",
    type: "DOLOR",
    alumnoId: "demo-alumno-01-lucas",
    alumnoNombre: "Lucas Giménez",
    ejercicioNombre: "Press de Banca Plano",
    setNumber: 2,
    detalle: "[Dolor: LEVE] Hombro - Molestia anterior al descender la barra",
    fecha: "Ayer, 18:30",
    resolved: false,
  },
  {
    id: "demo-alert-facundo-lumbar",
    type: "DOLOR",
    alumnoId: "demo-alumno-03-facundo",
    alumnoNombre: "Facundo Medina",
    ejercicioNombre: "Peso Muerto Rumano",
    setNumber: 4,
    detalle: "[Dolor: MODERADO] Lumbar - Fatiga aguda en zona baja de espalda",
    fecha: "Hace 2 días",
    resolved: false,
  },
  {
    id: "demo-alert-camila-codo",
    type: "DOLOR",
    alumnoId: "demo-alumno-08-camila",
    alumnoNombre: "Camila Navarro",
    ejercicioNombre: "Press Francés con Barra Z",
    setNumber: 2,
    detalle: "[Dolor: LEVE] Codo - Sobrecarga en tendón de tríceps",
    fecha: "Hace 4 días",
    resolved: false,
  },
  {
    id: "demo-alert-martina-rodilla",
    type: "DOLOR",
    alumnoId: "demo-alumno-10-martina",
    alumnoNombre: "Martina Gómez",
    ejercicioNombre: "Prensa de Piernas 45°",
    setNumber: 3,
    detalle: "[Dolor: AGUDO] Rodilla - Molestia patelar en flexión profunda",
    fecha: "Hace 5 días",
    resolved: false,
  },
];

/**
 * Retorna las alertas e insignias correspondientes para los atletas del dataset de demostración
 */
export function getDemoAlumnoAlerts(alumnoIdOrName: string) {
  const q = alumnoIdOrName.toLowerCase();

  if (q.includes("lucas")) {
    return [
      {
        type: "pain" as const,
        label: "🚨 Hombro",
        title: "Molestia articular en Hombro - Tocar para Sustituir Ejercicio",
        zona: "Hombro",
        ejercicio: "Press de Banca Plano",
        detalle: "[Dolor: LEVE] Hombro - Molestia anterior al descender la barra",
      },
      {
        type: "pr" as const,
        label: "⚡ PR Banca",
        title: "Nuevo Récord Personal en Press de Banca - Tocar para felicitar por WhatsApp",
        ejercicio: "Press de Banca Plano",
      },
    ];
  }

  if (q.includes("celeste")) {
    return [
      {
        type: "pain" as const,
        label: "🚨 Rodilla",
        title: "Molestia articular en Rodilla - Tocar para Sustituir Ejercicio",
        zona: "Rodilla",
        ejercicio: "Sentadilla Trasera con Barra",
        detalle: "[Dolor: MODERADO] Rodilla - Pinchazo en fase concéntrica",
      },
    ];
  }

  if (q.includes("facundo")) {
    return [
      {
        type: "pain" as const,
        label: "🚨 Lumbar",
        title: "Molestia articular en Lumbar - Tocar para Sustituir Ejercicio",
        zona: "Lumbar",
        ejercicio: "Peso Muerto Rumano",
        detalle: "[Dolor: MODERADO] Lumbar - Fatiga aguda en zona baja de espalda",
      },
    ];
  }

  if (q.includes("mateo")) {
    return [
      {
        type: "pr" as const,
        label: "⚡ PR Sentadilla",
        title: "Nuevo Récord Personal en Sentadilla (160 kg) - Tocar para felicitar por WhatsApp",
        ejercicio: "Sentadilla Trasera con Barra",
      },
    ];
  }

  if (q.includes("valentina")) {
    return [
      {
        type: "pr" as const,
        label: "⚡ PR Peso Muerto",
        title: "Nuevo Récord Personal en Peso Muerto (140 kg) - Tocar para felicitar por WhatsApp",
        ejercicio: "Peso Muerto Convencional",
      },
    ];
  }

  if (q.includes("camila")) {
    return [
      {
        type: "pain" as const,
        label: "🚨 Codo",
        title: "Molestia articular en Codo - Tocar para Sustituir Ejercicio",
        zona: "Codo",
        ejercicio: "Press Francés con Barra Z",
        detalle: "[Dolor: LEVE] Codo - Sobrecarga en tendón de tríceps",
      },
    ];
  }

  if (q.includes("martina")) {
    return [
      {
        type: "pain" as const,
        label: "🚨 Rodilla",
        title: "Molestia articular en Rodilla - Tocar para Sustituir Ejercicio",
        zona: "Rodilla",
        ejercicio: "Prensa de Piernas 45°",
        detalle: "[Dolor: AGUDO] Rodilla - Molestia patelar en flexión profunda",
      },
      {
        type: "pr" as const,
        label: "⚡ PR Prensa",
        title: "Nuevo Récord Personal en Prensa 45° (280 kg) - Tocar para felicitar",
        ejercicio: "Prensa de Piernas 45°",
      },
    ];
  }

  return [];
}


// ============================================================================
// GH #122: Dataset ficticio para membresías, clases presenciales y reservas
// Coach: Lucía Ferraro (coach.lucia@gozster.test)
// Planes: "Funcional 2x semana" y "Pase libre Funcional + Boxeo"
// Clases: Funcional lun, mié, jue 19:00 y Boxeo vie 20:00
// Alumnos: Valentina Ríos, Sofía Benítez, Joaquín Paz, Tomás Ledesma
// ============================================================================

export const DEMO_COACH_LUCIA: Perfil = {
  id: "demo-coach-lucia",
  email: "coach.lucia@gozster.test",
  nombre_completo: "Lucía Ferraro",
  telefono: "+54 9 11 3456-7890",
  rol: "ENTRENADOR",
  estado_membresia: "ACTIVA",
  profesor_asignado_id: null,
  fecha_baja: null,
  fecha_vencimiento_cuota: null,
  ultimo_entreno_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const DEMO_PLANES_MEMBRESIA: PlanMembresia[] = [
  {
    id: "demo-plan-funcional-2x",
    nombre: "Funcional 2x semana",
    limite_semanal: 2,
    cantidad_actividades: 1,
    duracion_meses: 1,
    precio: 25000,
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-plan-pase-libre",
    nombre: "Pase libre Funcional + Boxeo",
    limite_semanal: null,
    cantidad_actividades: 2,
    duracion_meses: 1,
    precio: 40000,
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEMO_ALUMNOS_CLASES: Perfil[] = [
  {
    id: "demo-alumno-valentina",
    nombre_completo: "Valentina Ríos",
    email: "valentina.rios@gozster.test",
    telefono: "+54 9 11 4123-1111",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: DEMO_COACH_LUCIA.id,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(20),
    ultimo_entreno_at: getRelativeIsoStr(-1),
    created_at: getRelativeIsoStr(-60),
    updated_at: getRelativeIsoStr(-1),
  },
  {
    id: "demo-alumno-sofia",
    nombre_completo: "Sofía Benítez",
    email: "sofia.benitez@gozster.test",
    telefono: "+54 9 11 4123-2222",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: DEMO_COACH_LUCIA.id,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(15),
    ultimo_entreno_at: getRelativeIsoStr(0),
    created_at: getRelativeIsoStr(-45),
    updated_at: getRelativeIsoStr(0),
  },
  {
    id: "demo-alumno-joaquin",
    nombre_completo: "Joaquín Paz",
    email: "joaquin.paz@gozster.test",
    telefono: "+54 9 11 4123-3333",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: DEMO_COACH_LUCIA.id,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(30),
    ultimo_entreno_at: null,
    created_at: getRelativeIsoStr(-5),
    updated_at: getRelativeIsoStr(-5),
  },
  {
    id: "demo-alumno-tomas",
    nombre_completo: "Tomás Ledesma",
    email: "tomas.ledesma@gozster.test",
    telefono: "+54 9 11 4123-4444",
    rol: "ALUMNO",
    estado_membresia: "INACTIVA",
    profesor_asignado_id: DEMO_COACH_LUCIA.id,
    fecha_baja: null,
    fecha_vencimiento_cuota: getRelativeDateStr(-10),
    ultimo_entreno_at: getRelativeIsoStr(-15),
    created_at: getRelativeIsoStr(-90),
    updated_at: getRelativeIsoStr(-10),
  },
];

export const DEMO_CONTRATACIONES_CLASES: Contratacion[] = [
  {
    id: "demo-cont-valentina",
    alumno_id: "demo-alumno-valentina",
    tipo_servicio: "PRESENCIAL",
    plan_membresia_id: "demo-plan-funcional-2x",
    actividad: "FUNCIONAL",
    dia_vencimiento: 10,
    fecha_inicio: getRelativeDateStr(-10),
    fecha_fin: getRelativeDateStr(20),
    estado: "VIGENTE",
    dias_aviso_previo: 5,

    precio_pactado: null,
    created_at: getRelativeIsoStr(-10),
    updated_at: getRelativeIsoStr(-10),
  },
  {
    id: "demo-cont-sofia",
    alumno_id: "demo-alumno-sofia",
    tipo_servicio: "PRESENCIAL",
    plan_membresia_id: "demo-plan-pase-libre",
    actividad: null,
    dia_vencimiento: 15,
    fecha_inicio: getRelativeDateStr(-15),
    fecha_fin: getRelativeDateStr(15),
    estado: "VIGENTE",
    dias_aviso_previo: 5,

    precio_pactado: null,
    created_at: getRelativeIsoStr(-15),
    updated_at: getRelativeIsoStr(-15),
  },
  {
    id: "demo-cont-joaquin",
    alumno_id: "demo-alumno-joaquin",
    tipo_servicio: "PRESENCIAL",
    plan_membresia_id: "demo-plan-funcional-2x",
    actividad: "FUNCIONAL",
    dia_vencimiento: 1,
    fecha_inicio: getRelativeDateStr(30),
    fecha_fin: getRelativeDateStr(60),
    estado: "VIGENTE",
    dias_aviso_previo: 5,

    precio_pactado: null,
    created_at: getRelativeIsoStr(-2),
    updated_at: getRelativeIsoStr(-2),
  },
  {
    id: "demo-cont-tomas",
    alumno_id: "demo-alumno-tomas",
    tipo_servicio: "PRESENCIAL",
    plan_membresia_id: "demo-plan-funcional-2x",
    actividad: "FUNCIONAL",
    dia_vencimiento: 5,
    fecha_inicio: getRelativeDateStr(-40),
    fecha_fin: getRelativeDateStr(-10),
    estado: "VENCIDA",
    dias_aviso_previo: 5,

    precio_pactado: null,
    created_at: getRelativeIsoStr(-40),
    updated_at: getRelativeIsoStr(-10),
  },
];

// ============================================================================
// Cronograma semanal de clases de Coach Studio (GOZS-189 / GH #189, épica GOZS-181)
// - Funcional 18:00: lunes a viernes (cupo 15)
// - Funcional 17:00: martes y jueves turno extra (cupo 15)
// - Boxeo 19:30: lunes, miércoles y viernes (cupo 15)
// 10 clases en total, todas con cupo flexible 15.
// ============================================================================

export function generarDemoClasesSemana(fechaRef: Date = new Date()): Clase[] {
  const dias = diasDeLaSemana(fechaRef);
  const ahoraIso = new Date().toISOString();

  return [
    // Lunes
    {
      id: "demo-clase-func-lunes",
      horario_id: "demo-horario-func-lun-18",
      actividad: "FUNCIONAL",
      inicio: new Date(`${dias[0]?.clave}T18:00:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },
    {
      id: "demo-clase-box-lunes",
      horario_id: "demo-horario-box-lun-1930",
      actividad: "BOXEO",
      inicio: new Date(`${dias[0]?.clave}T19:30:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },

    // Martes
    {
      id: "demo-clase-func-martes-17",
      horario_id: "demo-horario-func-mar-17",
      actividad: "FUNCIONAL",
      inicio: new Date(`${dias[1]?.clave}T17:00:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },
    {
      id: "demo-clase-func-martes",
      horario_id: "demo-horario-func-mar-18",
      actividad: "FUNCIONAL",
      inicio: new Date(`${dias[1]?.clave}T18:00:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },

    // Miércoles
    {
      id: "demo-clase-func-miercoles",
      horario_id: "demo-horario-func-mie-18",
      actividad: "FUNCIONAL",
      inicio: new Date(`${dias[2]?.clave}T18:00:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },
    {
      id: "demo-clase-box-miercoles",
      horario_id: "demo-horario-box-mie-1930",
      actividad: "BOXEO",
      inicio: new Date(`${dias[2]?.clave}T19:30:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },

    // Jueves
    {
      id: "demo-clase-func-jueves-17",
      horario_id: "demo-horario-func-jue-17",
      actividad: "FUNCIONAL",
      inicio: new Date(`${dias[3]?.clave}T17:00:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },
    {
      id: "demo-clase-func-jueves",
      horario_id: "demo-horario-func-jue-18",
      actividad: "FUNCIONAL",
      inicio: new Date(`${dias[3]?.clave}T18:00:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },

    // Viernes
    {
      id: "demo-clase-func-viernes",
      horario_id: "demo-horario-func-vie-18",
      actividad: "FUNCIONAL",
      inicio: new Date(`${dias[4]?.clave}T18:00:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },
    {
      id: "demo-clase-box-viernes",
      horario_id: "demo-horario-box-vie-1930",
      actividad: "BOXEO",
      inicio: new Date(`${dias[4]?.clave}T19:30:00-03:00`).toISOString(),
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    },
  ];
}

/**
 * Semilla de reservas iniciales en Modo Testeo (GOZS-189).
 * - Reparto de alumnos con ocupaciones variadas (vacía, con cupo libre, casi llena, llena y sobrecupo).
 * - Ningún alumno supera 3 clases por semana (consistente con 1x, 2x, 3x o pase libre).
 * - Alumnos que combinan Funcional y Boxeo en días distintos (ej. Sofía Benítez, Lucas, Celeste).
 * - Incluye caso de lista de espera / sobrecupo (Boxeo Miércoles: 16/15) y pase libre (Sofía Benítez).
 */
const SEED_RESERVAS_DEMO: Array<[claseId: string, alumnoId: string, alumnoNombre: string]> = [
  // 1. Lunes 18:00 Funcional (0/15 - vacía / cupo libre, preservada para tests de reserva)
  // (Sin reservas iniciales)

  // 2. Lunes 19:30 Boxeo (11/15 - cupo libre)
  ["demo-clase-box-lunes", "demo-alumno-01-lucas", "Lucas Giménez"],
  ["demo-clase-box-lunes", "demo-alumno-03-facundo", "Facundo Medina"],
  ["demo-clase-box-lunes", "demo-alumno-07-bautista", "Bautista Benítez"],
  ["demo-clase-box-lunes", "demo-alumno-12-ignacio", "Ignacio Duarte"],
  ["demo-clase-box-lunes", "demo-alumno-14-franco", "Franco Ibarra"],
  ["demo-clase-box-lunes", "demo-alumno-17-agustin", "Agustín Molina"],
  ["demo-clase-box-lunes", "demo-alumno-19-tobias", "Tobías Aguirre"],
  ["demo-clase-box-lunes", "demo-alumno-21-federico", "Federico Luna"],
  ["demo-clase-box-lunes", "demo-alumno-23-gonzalo", "Gonzalo Peralta"],
  ["demo-clase-box-lunes", "demo-alumno-25-santiago", "Santiago Ojeda"],
  ["demo-clase-box-lunes", "demo-alumno-34-dante", "Dante Quinteros"],

  // 3. Martes 17:00 Funcional turno extra (7/15 - cupo libre)
  ["demo-clase-func-martes-17", "demo-alumno-02-celeste", "Celeste Gerardi"],
  ["demo-clase-func-martes-17", "demo-alumno-09-esteban", "Esteban Papic"],
  ["demo-clase-func-martes-17", "demo-alumno-16-daniela", "Daniela Ponce"],
  ["demo-clase-func-martes-17", "demo-alumno-22-brenda", "Brenda Acosta"],
  ["demo-clase-func-martes-17", "demo-alumno-27-emiliano", "Emiliano Correa"],
  ["demo-clase-func-martes-17", "demo-alumno-32-camino", "Camino Rivas"],
  ["demo-clase-func-martes-17", "demo-alumno-35-noelia", "Noelia Barrios"],

  // 4. Martes 18:00 Funcional (14/15 - casi llena, 1 cupo restante)
  ["demo-clase-func-martes", "demo-alumno-sofia", "Sofía Benítez"], // Pase libre
  ["demo-clase-func-martes", "demo-alumno-04-sofia", "Sofía Albarracín"],
  ["demo-clase-func-martes", "demo-alumno-06-valentina", "Valentina Quiroga"],
  ["demo-clase-func-martes", "demo-alumno-08-camila", "Camila Navarro"],
  ["demo-clase-func-martes", "demo-alumno-10-martina", "Martina Gómez"],
  ["demo-clase-func-martes", "demo-alumno-11-julieta", "Julieta Sosa"],
  ["demo-clase-func-martes", "demo-alumno-13-abril", "Abril Figueroa"],
  ["demo-clase-func-martes", "demo-alumno-15-nahuel", "Nahuel Cabrera"],
  ["demo-clase-func-martes", "demo-alumno-18-rocio", "Rocío Herrera"],
  ["demo-clase-func-martes", "demo-alumno-20-micaela", "Micaela Vera"],
  ["demo-clase-func-martes", "demo-alumno-24-lara", "Lara Domínguez"],
  ["demo-clase-func-martes", "demo-alumno-26-pilar", "Pilar Sánchez"],
  ["demo-clase-func-martes", "demo-alumno-28-victoria", "Victoria Maldonado"],
  ["demo-clase-func-martes", "demo-alumno-30-antonella", "Antonella Bustos"],

  // 5. Miércoles 18:00 Funcional (15/15 - LLENA, sin cupo)
  // Las primeras 3 conservan los IDs históricos requeridos por specs existentes (demo-res-mie-1/2/3)
  ["demo-clase-func-miercoles", "demo-alumno-08-camila", "Camila Navarro"], // demo-res-mie-1
  ["demo-clase-func-miercoles", "demo-alumno-01-lucas", "Lucas Giménez"],   // demo-res-mie-2
  ["demo-clase-func-miercoles", "demo-alumno-05-mateo", "Mateo Rossi"],     // demo-res-mie-3
  ["demo-clase-func-miercoles", "demo-alumno-06-valentina", "Valentina Quiroga"],
  ["demo-clase-func-miercoles", "demo-alumno-10-martina", "Martina Gómez"],
  ["demo-clase-func-miercoles", "demo-alumno-11-julieta", "Julieta Sosa"],
  ["demo-clase-func-miercoles", "demo-alumno-13-abril", "Abril Figueroa"],
  ["demo-clase-func-miercoles", "demo-alumno-16-daniela", "Daniela Ponce"],
  ["demo-clase-func-miercoles", "demo-alumno-18-rocio", "Rocío Herrera"],
  ["demo-clase-func-miercoles", "demo-alumno-20-micaela", "Micaela Vera"],
  ["demo-clase-func-miercoles", "demo-alumno-22-brenda", "Brenda Acosta"],
  ["demo-clase-func-miercoles", "demo-alumno-24-lara", "Lara Domínguez"],
  ["demo-clase-func-miercoles", "demo-alumno-26-pilar", "Pilar Sánchez"],
  ["demo-clase-func-miercoles", "demo-alumno-28-victoria", "Victoria Maldonado"],
  ["demo-clase-func-miercoles", "demo-alumno-30-antonella", "Antonella Bustos"],

  // 6. Miércoles 19:30 Boxeo (16/15 - LLENA CON LISTA DE ESPERA / SOBRECUPO)
  ["demo-clase-box-miercoles", "demo-alumno-sofia", "Sofía Benítez"], // Pase libre combinando Boxeo
  ["demo-clase-box-miercoles", "demo-alumno-02-celeste", "Celeste Gerardi"],
  ["demo-clase-box-miercoles", "demo-alumno-07-bautista", "Bautista Benítez"],
  ["demo-clase-box-miercoles", "demo-alumno-09-esteban", "Esteban Papic"],
  ["demo-clase-box-miercoles", "demo-alumno-12-ignacio", "Ignacio Duarte"],
  ["demo-clase-box-miercoles", "demo-alumno-14-franco", "Franco Ibarra"],
  ["demo-clase-box-miercoles", "demo-alumno-17-agustin", "Agustín Molina"],
  ["demo-clase-box-miercoles", "demo-alumno-19-tobias", "Tobías Aguirre"],
  ["demo-clase-box-miercoles", "demo-alumno-21-federico", "Federico Luna"],
  ["demo-clase-box-miercoles", "demo-alumno-23-gonzalo", "Gonzalo Peralta"],
  ["demo-clase-box-miercoles", "demo-alumno-25-santiago", "Santiago Ojeda"],
  ["demo-clase-box-miercoles", "demo-alumno-29-ramiro", "Ramiro Cáceres"],
  ["demo-clase-box-miercoles", "demo-alumno-31-leandro", "Leandro Funes"],
  ["demo-clase-box-miercoles", "demo-alumno-34-dante", "Dante Quinteros"],
  ["demo-clase-box-miercoles", "demo-alumno-36-ezequiel", "Ezequiel Soria"],
  ["demo-clase-box-miercoles", "demo-alumno-37-matias", "Matías Blanco"], // #16 en sobrecupo / lista de espera

  // 7. Jueves 17:00 Funcional turno extra (8/15 - cupo libre)
  ["demo-clase-func-jueves-17", "demo-alumno-03-facundo", "Facundo Medina"],
  ["demo-clase-func-jueves-17", "demo-alumno-09-esteban", "Esteban Papic"],
  ["demo-clase-func-jueves-17", "demo-alumno-22-brenda", "Brenda Acosta"],
  ["demo-clase-func-jueves-17", "demo-alumno-27-emiliano", "Emiliano Correa"],
  ["demo-clase-func-jueves-17", "demo-alumno-32-camino", "Camino Rivas"],
  ["demo-clase-func-jueves-17", "demo-alumno-33-paula", "Paula Medrano"],
  ["demo-clase-func-jueves-17", "demo-alumno-35-noelia", "Noelia Barrios"],
  ["demo-clase-func-jueves-17", "demo-alumno-36-ezequiel", "Ezequiel Soria"],

  // 8. Jueves 18:00 Funcional (12/15 - cupo libre)
  ["demo-clase-func-jueves", "demo-alumno-02-celeste", "Celeste Gerardi"],
  ["demo-clase-func-jueves", "demo-alumno-04-sofia", "Sofía Albarracín"],
  ["demo-clase-func-jueves", "demo-alumno-15-nahuel", "Nahuel Cabrera"],
  ["demo-clase-func-jueves", "demo-alumno-16-daniela", "Daniela Ponce"],
  ["demo-clase-func-jueves", "demo-alumno-19-tobias", "Tobías Aguirre"],
  ["demo-clase-func-jueves", "demo-alumno-27-emiliano", "Emiliano Correa"],
  ["demo-clase-func-jueves", "demo-alumno-29-ramiro", "Ramiro Cáceres"],
  ["demo-clase-func-jueves", "demo-alumno-31-leandro", "Leandro Funes"],
  ["demo-clase-func-jueves", "demo-alumno-32-camino", "Camino Rivas"],
  ["demo-clase-func-jueves", "demo-alumno-33-paula", "Paula Medrano"],
  ["demo-clase-func-jueves", "demo-alumno-34-dante", "Dante Quinteros"],
  ["demo-clase-func-jueves", "demo-alumno-35-noelia", "Noelia Barrios"],

  // 9. Viernes 18:00 Funcional (15/15 - LLENA)
  ["demo-clase-func-viernes", "demo-alumno-sofia", "Sofía Benítez"], // Pase libre
  ["demo-clase-func-viernes", "demo-alumno-04-sofia", "Sofía Albarracín"],
  ["demo-clase-func-viernes", "demo-alumno-06-valentina", "Valentina Quiroga"],
  ["demo-clase-func-viernes", "demo-alumno-08-camila", "Camila Navarro"],
  ["demo-clase-func-viernes", "demo-alumno-10-martina", "Martina Gómez"],
  ["demo-clase-func-viernes", "demo-alumno-11-julieta", "Julieta Sosa"],
  ["demo-clase-func-viernes", "demo-alumno-13-abril", "Abril Figueroa"],
  ["demo-clase-func-viernes", "demo-alumno-14-franco", "Franco Ibarra"],
  ["demo-clase-func-viernes", "demo-alumno-15-nahuel", "Nahuel Cabrera"],
  ["demo-clase-func-viernes", "demo-alumno-18-rocio", "Rocío Herrera"],
  ["demo-clase-func-viernes", "demo-alumno-20-micaela", "Micaela Vera"],
  ["demo-clase-func-viernes", "demo-alumno-24-lara", "Lara Domínguez"],
  ["demo-clase-func-viernes", "demo-alumno-26-pilar", "Pilar Sánchez"],
  ["demo-clase-func-viernes", "demo-alumno-28-victoria", "Victoria Maldonado"],
  ["demo-clase-func-viernes", "demo-alumno-30-antonella", "Antonella Bustos"],

  // 10. Viernes 19:30 Boxeo (9/15 - cupo libre)
  ["demo-clase-box-viernes", "demo-alumno-01-lucas", "Lucas Giménez"],
  ["demo-clase-box-viernes", "demo-alumno-05-mateo", "Mateo Rossi"],
  ["demo-clase-box-viernes", "demo-alumno-07-bautista", "Bautista Benítez"],
  ["demo-clase-box-viernes", "demo-alumno-12-ignacio", "Ignacio Duarte"],
  ["demo-clase-box-viernes", "demo-alumno-17-agustin", "Agustín Molina"],
  ["demo-clase-box-viernes", "demo-alumno-21-federico", "Federico Luna"],
  ["demo-clase-box-viernes", "demo-alumno-23-gonzalo", "Gonzalo Peralta"],
  ["demo-clase-box-viernes", "demo-alumno-25-santiago", "Santiago Ojeda"],
  ["demo-clase-box-viernes", "demo-alumno-29-ramiro", "Ramiro Cáceres"],
];

export function generarDemoReservasIniciales(): Array<Reserva & { alumno_nombre: string }> {
  const ahoraIso = new Date().toISOString();
  let mieCount = 0;

  return SEED_RESERVAS_DEMO.map(([clase_id, alumno_id, alumno_nombre], idx) => {
    let id = `demo-res-${clase_id.replace("demo-clase-", "")}-${idx + 1}`;
    if (clase_id === "demo-clase-func-miercoles") {
      mieCount++;
      if (mieCount === 1) id = "demo-res-mie-1";
      else if (mieCount === 2) id = "demo-res-mie-2";
      else if (mieCount === 3) id = "demo-res-mie-3";
    }
    return {
      id,
      clase_id,
      alumno_id,
      alumno_nombre,
      estado: "ANOTADO" as const,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    };
  });
}

// ============================================================================
// KPIs de negocio para el dueño (GOZS-136, solo Modo Testeo). Conexión real: GOZS-137.
// ============================================================================

const AHORA_DEMO = new Date();

/** Gimnasio demo ampliado (GOZS-139): ~40 alumnos con un mes de historia, generado en coach-demo-generator. */
export const DEMO_GIMNASIO = generarDemoGimnasio(
  {
    profesorId: DEMO_PROFESOR_ID,
    alumnos: [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES],
    planes: DEMO_PLANES,
    contrataciones: DEMO_CONTRATACIONES_CLASES,
    planesMembresia: DEMO_PLANES_MEMBRESIA,
  },
  AHORA_DEMO,
);

export const DEMO_KPIS_NEGOCIO: KpisNegocio = derivarKpisNegocio(DEMO_GIMNASIO, DEMO_PLANES_MEMBRESIA, AHORA_DEMO);

export type { KpisNegocio };
