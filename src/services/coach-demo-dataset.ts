import type { ActividadClase, AlumnoActividad, Clase, Contratacion, EstadoReserva, Perfil, PlanEntrenamiento, PlanMembresia, Reserva } from "@/types/database.types";
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
 *    - Vigencia Rutina: 🟡 Por renovar (hace 18 días, 16-21d)
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
 *    - Vigencia Rutina: 🟢 Vigente (hace 10 días, 0-15d)
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
 *    - Vigencia Rutina: 🟡 Por renovar (hace 19 días, 16-21d)
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
    peso_corporal_kg: 78.0,
    sexo: "M",
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
    peso_corporal_kg: 58.0,
    sexo: "F",
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
    peso_corporal_kg: 82.5,
    sexo: "M",
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
    peso_corporal_kg: 60.0,
    sexo: "F",
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
    peso_corporal_kg: 85.0,
    sexo: "M",
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
    peso_corporal_kg: 64.0,
    sexo: "F",
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
    peso_corporal_kg: 74.0,
    sexo: "M",
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
    peso_corporal_kg: 55.0,
    sexo: "F",
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
    peso_corporal_kg: 80.0,
    sexo: "M",
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
    peso_corporal_kg: 62.0,
    sexo: "F",
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
    fecha_inicio: getRelativeDateStr(-18),
    fecha_fin: getRelativeDateStr(42),
    comentarios: "Semana de deload previa a nuevo mesociclo.",
    created_at: getRelativeIsoStr(-18),
    updated_at: getRelativeIsoStr(-18),
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
    fecha_inicio: getRelativeDateStr(-10),
    fecha_fin: getRelativeDateStr(50),
    comentarios: "Sobrecarga lineal semanal.",
    created_at: getRelativeIsoStr(-10),
    updated_at: getRelativeIsoStr(-10),
  },
  // Bautista Benítez no tiene plan asignado (alumno huérfano / Sin Plan)
  {
    id: "demo-plan-camila",
    profesor_id: DEMO_PROFESOR_ID,
    alumno_id: "demo-alumno-08-camila",
    nombre: "Tren Superior & Core Avanzado",
    estado: "ACTIVO",
    fecha_inicio: getRelativeDateStr(-19),
    fecha_fin: getRelativeDateStr(41),
    comentarios: "Ajustar variantes de tríceps si persiste molestia.",
    created_at: getRelativeIsoStr(-19),
    updated_at: getRelativeIsoStr(-19),
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
    peso_corporal_kg: 62.0,
    sexo: "F",
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
    peso_corporal_kg: 56.5,
    sexo: "F",
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
    peso_corporal_kg: 78.0,
    sexo: "M",
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
    peso_corporal_kg: 84.0,
    sexo: "M",
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

export const DEMO_ALUMNO_ACTIVIDADES: AlumnoActividad[] = [
  {
    id: "demo-act-valentina",
    alumno_id: "demo-alumno-valentina",
    actividad: "FUNCIONAL",
    veces_por_semana: 2,
    pase_libre: false,
    created_at: getRelativeIsoStr(-60),
    updated_at: getRelativeIsoStr(-1),
  },
  {
    id: "demo-act-sofia-func",
    alumno_id: "demo-alumno-sofia",
    actividad: "FUNCIONAL",
    veces_por_semana: null,
    pase_libre: true,
    created_at: getRelativeIsoStr(-45),
    updated_at: getRelativeIsoStr(0),
  },
  {
    id: "demo-act-sofia-box",
    alumno_id: "demo-alumno-sofia",
    actividad: "BOXEO",
    veces_por_semana: null,
    pase_libre: true,
    created_at: getRelativeIsoStr(-45),
    updated_at: getRelativeIsoStr(0),
  },
  {
    id: "demo-act-joaquin",
    alumno_id: "demo-alumno-joaquin",
    actividad: "FUNCIONAL",
    veces_por_semana: 2,
    pase_libre: false,
    created_at: getRelativeIsoStr(-5),
    updated_at: getRelativeIsoStr(-5),
  },
  {
    id: "demo-act-tomas",
    alumno_id: "demo-alumno-tomas",
    actividad: "FUNCIONAL",
    veces_por_semana: 2,
    pase_libre: false,
    created_at: getRelativeIsoStr(-40),
    updated_at: getRelativeIsoStr(-10),
  },
  {
    id: "demo-act-lucas",
    alumno_id: "demo-alumno-01-lucas",
    actividad: "RUTINAS",
    veces_por_semana: null,
    pase_libre: true,
    created_at: getRelativeIsoStr(-120),
    updated_at: getRelativeIsoStr(-1),
  },
  {
    id: "demo-act-celeste",
    alumno_id: "demo-alumno-02-celeste",
    actividad: "RUTINAS",
    veces_por_semana: null,
    pase_libre: true,
    created_at: getRelativeIsoStr(-90),
    updated_at: getRelativeIsoStr(0),
  },
  {
    id: "demo-act-facundo",
    alumno_id: "demo-alumno-03-facundo",
    actividad: "RUTINAS",
    veces_por_semana: null,
    pase_libre: true,
    created_at: getRelativeIsoStr(-60),
    updated_at: getRelativeIsoStr(-9),
  },
  {
    id: "demo-act-sofia-alb",
    alumno_id: "demo-alumno-04-sofia",
    actividad: "RUTINAS",
    veces_por_semana: null,
    pase_libre: true,
    created_at: getRelativeIsoStr(-150),
    updated_at: getRelativeIsoStr(-18),
  },
  {
    id: "demo-act-mateo-box",
    alumno_id: "demo-alumno-05-mateo",
    actividad: "BOXEO",
    veces_por_semana: 2,
    pase_libre: false,
    created_at: getRelativeIsoStr(-80),
    updated_at: getRelativeIsoStr(-2),
  },
  {
    id: "demo-act-mateo-alias",
    alumno_id: "demo-alumno-mateo",
    actividad: "BOXEO",
    veces_por_semana: 2,
    pase_libre: false,
    created_at: getRelativeIsoStr(-80),
    updated_at: getRelativeIsoStr(-2),
  },
  {
    id: "demo-act-val-quiroga",
    alumno_id: "demo-alumno-06-valentina",
    actividad: "FUNCIONAL",
    veces_por_semana: 2,
    pase_libre: false,
    created_at: getRelativeIsoStr(-75),
    updated_at: getRelativeIsoStr(-3),
  },
  {
    id: "demo-act-bautista",
    alumno_id: "demo-alumno-07-bautista",
    actividad: "BOXEO",
    veces_por_semana: null,
    pase_libre: true,
    created_at: getRelativeIsoStr(-180),
    updated_at: getRelativeIsoStr(-25),
  },
  {
    id: "demo-act-camila",
    alumno_id: "demo-alumno-08-camila",
    actividad: "RUTINAS",
    veces_por_semana: null,
    pase_libre: true,
    created_at: getRelativeIsoStr(-80),
    updated_at: getRelativeIsoStr(-4),
  },
  {
    id: "demo-act-esteban",
    alumno_id: "demo-alumno-09-esteban",
    actividad: "FUNCIONAL",
    veces_por_semana: 3,
    pase_libre: false,
    created_at: getRelativeIsoStr(-100),
    updated_at: getRelativeIsoStr(-2),
  },
  {
    id: "demo-act-martina",
    alumno_id: "demo-alumno-10-martina",
    actividad: "BOXEO",
    veces_por_semana: 2,
    pase_libre: false,
    created_at: getRelativeIsoStr(-70),
    updated_at: getRelativeIsoStr(-1),
  },
];

// Horario ficticio (GOZS-194). dia: 0 = lunes ... 4 = viernes.
const HORARIO_DEMO: Array<{
  id: string;
  actividad: ActividadClase;
  dia: number;
  hora: string;
  capacidad: number;
  cancelada?: boolean;
}> = [
  { id: "demo-clase-func-lunes", actividad: "FUNCIONAL", dia: 0, hora: "18:00", capacidad: 3 },
  { id: "demo-clase-func-martes", actividad: "FUNCIONAL", dia: 1, hora: "18:00", capacidad: 8 },
  { id: "demo-clase-func-miercoles", actividad: "FUNCIONAL", dia: 2, hora: "18:00", capacidad: 3 },
  { id: "demo-clase-func-jueves", actividad: "FUNCIONAL", dia: 3, hora: "18:00", capacidad: 8 },
  { id: "demo-clase-func-viernes", actividad: "FUNCIONAL", dia: 4, hora: "18:00", capacidad: 8, cancelada: true },
  { id: "demo-clase-func-martes-17", actividad: "FUNCIONAL", dia: 1, hora: "17:00", capacidad: 6 },
  { id: "demo-clase-func-jueves-17", actividad: "FUNCIONAL", dia: 3, hora: "17:00", capacidad: 6 },
  { id: "demo-clase-box-lunes", actividad: "BOXEO", dia: 0, hora: "19:30", capacidad: 10 },
  { id: "demo-clase-box-miercoles", actividad: "BOXEO", dia: 2, hora: "19:30", capacidad: 10 },
  { id: "demo-clase-box-viernes", actividad: "BOXEO", dia: 4, hora: "19:30", capacidad: 10 },
];

export function generarDemoClasesSemana(fechaRef: Date = new Date()): Clase[] {
  const dias = diasDeLaSemana(fechaRef);
  const ahora = new Date().toISOString();
  return HORARIO_DEMO.map((h) => ({
    id: h.id,
    horario_id: `demo-horario-${h.id.slice("demo-clase-".length)}`,
    actividad: h.actividad,
    inicio: new Date(`${dias[h.dia]?.clave}T${h.hora}:00-03:00`).toISOString(),
    duracion_minutos: 60,
    capacidad: h.capacidad,
    estado: h.cancelada ? "CANCELADA" : "PROGRAMADA",
    motivo_cancelacion: h.cancelada ? "Feriado: el gimnasio no abre" : null,
    created_at: ahora,
    updated_at: ahora,
  }));
}

// Anotados ficticios: cupo libre (lunes, sin anotados), casi llena (martes 17), llena con espera (miércoles)
// y una reserva cancelada (jueves 17). Ids fijos: recargar el seed no duplica filas.
const ANOTADOS_DEMO: Array<[claseId: string, sufijo: string, nombre: string, estado: EstadoReserva]> = [
  ["demo-clase-func-miercoles", "mie-1", "Camila Navarro", "ANOTADO"],
  ["demo-clase-func-miercoles", "mie-2", "Lucas Giménez", "ANOTADO"],
  ["demo-clase-func-miercoles", "mie-3", "Mateo Rossi", "ANOTADO"],
  ["demo-clase-func-miercoles", "mie-4", "Renata Quiroga", "EN_ESPERA"],
  ["demo-clase-func-miercoles", "mie-5", "Emilia Castro", "EN_ESPERA"],
  ["demo-clase-func-martes-17", "mar17-1", "Ignacio Duarte", "ANOTADO"],
  ["demo-clase-func-martes-17", "mar17-2", "Julieta Sosa", "ANOTADO"],
  ["demo-clase-func-martes-17", "mar17-3", "Federico Bravo", "ANOTADO"],
  ["demo-clase-func-martes-17", "mar17-4", "Agustina Peralta", "ANOTADO"],
  ["demo-clase-func-martes-17", "mar17-5", "Martina Luna", "ANOTADO"],
  ["demo-clase-func-jueves-17", "jue17-1", "Santiago Vera", "ANOTADO"],
  ["demo-clase-func-jueves-17", "jue17-2", "Paula Medina", "CANCELADO"],
  ["demo-clase-box-lunes", "boxlun-1", "Nicolás Herrera", "ANOTADO"],
  ["demo-clase-box-lunes", "boxlun-2", "Abril Domínguez", "ANOTADO"],
  ["demo-clase-box-viernes", "boxvie-1", "Diego Molina", "ANOTADO"],
];

const MAPA_ALUMNO_ID_DEMO: Record<string, string> = {
  "Camila Navarro": "demo-alumno-08-camila",
  "Lucas Giménez": "demo-alumno-01-lucas",
  "Mateo Rossi": "demo-alumno-05-mateo",
};

export function generarDemoReservasIniciales(): Array<Reserva & { alumno_nombre: string }> {
  const ahora = new Date().toISOString();
  return ANOTADOS_DEMO.map(([clase_id, sufijo, alumno_nombre, estado]) => ({
    id: `demo-res-${sufijo}`,
    clase_id,
    alumno_id: MAPA_ALUMNO_ID_DEMO[alumno_nombre] ?? `demo-alumno-ext-${sufijo}`,
    alumno_nombre,
    estado,
    created_at: ahora,
    updated_at: ahora,
  }));
}

// ============================================================================
// KPIs de negocio para el dueño (GOZS-136). Conexión real: GOZS-137.
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
