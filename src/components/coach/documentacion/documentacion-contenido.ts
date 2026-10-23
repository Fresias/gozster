// Contenido de la guía Documentación (GOZS-142). Texto para el dueño/entrenador: sin jerga técnica.
// Cada afirmación está verificada contra supabase/migrations/ y docs/GLOSSARY.md.
import type { EjemplosDocumentacion } from "@/lib/documentacion-ejemplos";

export const SECCIONES = [
  { id: "para-que-sirve", titulo: "Para qué sirve" },
  { id: "glosario", titulo: "Glosario" },
  { id: "mapa", titulo: "Mapa" },
  { id: "fichas", titulo: "Fichas" },
  { id: "recorridos", titulo: "Recorridos" },
  { id: "metricas", titulo: "Métricas" },
  { id: "quien-ve-que", titulo: "Quién ve qué" },
  { id: "preguntas", titulo: "Preguntas" },
] as const;

export const GLOSARIO: ReadonlyArray<readonly [string, string]> = [
  ["Alumno", "Persona que entrena con GOZS. Ve su rutina, registra sus entrenamientos y reserva clases."],
  ["Entrenador", "Arma rutinas, sigue a sus alumnos y atiende las alertas de dolor."],
  ["Dueño (Admin)", "Ve todo, incluida la facturación. Es el único que ve los montos de ingresos."],
  ["Plan de membresía", "Lo que el alumno contrata. Ej.: \"Funcional 2x semana\" ($ 25.000) o \"Pase libre\" ($ 40.000)."],
  ["Contratación", "El plan de un alumno con su fecha de inicio y de vencimiento."],
  ["Cuota", "Lo que corresponde cobrar por mes de una contratación."],
  ["Pago", "Un cobro registrado: monto, medio (transferencia, efectivo u online) y estado."],
  ["Rutina", "Plan de entrenamiento que el entrenador arma para un alumno."],
  ["Día de rutina", "Cada jornada de la rutina. Ej.: \"Día A · Piernas\"."],
  ["Ejercicio", "Un movimiento del catálogo, con su video. Ej.: Sentadilla Trasera con Barra."],
  ["Sesión de entrenamiento", "Un entrenamiento que el alumno hizo de verdad, con fecha."],
  ["Serie", "Cada tanda dentro de la sesión: peso, repeticiones y esfuerzo."],
  ["Clase", "Actividad grupal con día, hora y cupo."],
  ["Reserva", "El lugar que un alumno toma en una clase."],
  ["Alerta de dolor", "Aviso al equipo cuando un alumno reporta una molestia."],
  ["Chat GOZS", "Conversación del alumno con el equipo. Siempre ve \"GOZS\", sin nombre propio."],
];

interface Grupo { tema: string; cajas: string[]; frases: string[] }

export const MAPA: Grupo[] = [
  { tema: "Personas", cajas: ["Perfil", "Entrenador–alumno"], frases: ["Cada persona tiene un perfil con su rol y su estado.", "Un alumno se vincula con uno o más entrenadores."] },
  { tema: "Membresías y pagos", cajas: ["Plan", "Precios históricos", "Contratación", "Pagos"], frases: ["Un plan guarda todos sus precios, cada uno con la fecha desde la que rige.", "Un alumno tiene una contratación → la contratación tiene pagos."] },
  { tema: "Rutinas", cajas: ["Rutina", "Días", "Ejercicios en la rutina", "Catálogo"], frases: ["Una rutina tiene días → cada día tiene ejercicios con series y repeticiones.", "Cada ejercicio de la rutina apunta a un ejercicio del catálogo."] },
  { tema: "Entrenamientos registrados", cajas: ["Sesión", "Series"], frases: ["Cada vez que el alumno entrena se guarda una sesión → la sesión tiene sus series."] },
  { tema: "Clases", cajas: ["Horarios", "Clases", "Reservas"], frases: ["Un horario genera clases → los alumnos reservan lugar en cada clase."] },
  { tema: "Salud", cajas: ["Cuestionario inicial", "Historial de dolor", "Alertas", "Sustituciones"], frases: ["Un reporte de dolor queda en el historial → avisa al entrenador → el entrenador puede reemplazar el ejercicio."] },
  { tema: "Comunicación", cajas: ["Conversación", "Mensajes"], frases: ["Cada alumno tiene una conversación → la conversación tiene mensajes; queda registrado quién escribió cada uno."] },
  { tema: "Auditoría", cajas: ["Registro de cambios"], frases: ["Los cambios importantes (extensiones, traspasos, cambios de rutina) dejan un registro con quién, cuándo y por qué."] },
];

interface Ficha { nombre: string; guarda: string; ejemplo: string; quien: string }

export const FICHAS: Ficha[] = [
  { nombre: "Perfil", guarda: "Nombre, contacto, rol, estado (activo, suspendido, baja) y nivel de vista del alumno.", ejemplo: "Celeste Gerardi: alumna activa, entrena con el profe de la demo.", quien: "Cada persona ve el suyo; el entrenador ve el de sus alumnos; el dueño ve todos. Solo el dueño puede borrar un perfil." },
  { nombre: "Plan de membresía", guarda: "Nombre, cuántas clases por semana, duración, precio y si está activo.", ejemplo: "\"Funcional 2x semana\" (hasta 2 clases por semana) y \"Pase libre\" (sin límite).", quien: "Lo ven todos los que tienen cuenta. Lo crean y modifican entrenador y dueño." },
  { nombre: "Contratación", guarda: "El plan del alumno, desde cuándo, hasta cuándo y el día de vencimiento.", ejemplo: "Celeste contrata \"Funcional 2x semana\" y vence el 10 de cada mes.", quien: "La ve el alumno, su entrenador y el dueño. La modifican entrenador y dueño." },
  { nombre: "Pago", guarda: "Monto, medio de pago, estado (pendiente, confirmado, rechazado) y quién lo confirmó.", ejemplo: "Transferencia de $ 25.000 confirmada por el profe.", quien: "Lo ve el alumno (los suyos), su entrenador y el dueño." },
  { nombre: "Rutina", guarda: "Los días, los ejercicios, las series, repeticiones y descansos de cada alumno.", ejemplo: "Rutina de Celeste: 3 días por semana con sentadilla, press y remo.", quien: "La ve el alumno y su entrenador; la arma y modifica el entrenador." },
  { nombre: "Ejercicio", guarda: "Nombre, grupo muscular y video de demostración.", ejemplo: "Sentadilla Trasera con Barra, con su video de YouTube.", quien: "Lo ven todos. Lo editan entrenador y dueño." },
  { nombre: "Sesión y series", guarda: "Qué hizo el alumno, cuándo, con qué peso, repeticiones y esfuerzo.", ejemplo: "Celeste hizo 3 series de sentadilla con 60 kg.", quien: "Las registra el alumno; las ven él, su entrenador y el dueño." },
  { nombre: "Clase y reserva", guarda: "Día, hora, cupo, actividad y quién reservó.", ejemplo: "Funcional del martes 19 h, cupo 12.", quien: "Las clases las ven todos; la reserva la ven el alumno y el equipo." },
  { nombre: "Salud", guarda: "Cuestionario inicial, reportes de dolor, alertas y reemplazos de ejercicios.", ejemplo: "Celeste avisa dolor de rodilla en la sentadilla: queda la zona, la intensidad y el ejercicio.", quien: "Lo carga el alumno; lo atiende el entrenador. Solo el entrenador puede elegir el ejercicio de reemplazo." },
  { nombre: "Chat y registro de cambios", guarda: "Mensajes con el equipo GOZS y el historial de cambios importantes.", ejemplo: "Celeste escribe a \"GOZS\"; adentro queda qué profe respondió.", quien: "El chat lo ven el alumno y el equipo asignado. El registro de cambios lo ve el equipo (el entrenador solo lo de contrataciones)." },
];

interface Recorrido { titulo: string; pasos: string[]; ejemplo: string }

export const RECORRIDOS = (e: EjemplosDocumentacion): Recorrido[] => [
  { titulo: "Alta de un alumno y primer ingreso", pasos: ["El entrenador da de alta al alumno con una contraseña temporal.", "El alumno entra por primera vez y la app le pide elegir su propia contraseña.", "Desde ahí accede a su rutina; el cuestionario inicial es opcional y no frena nada."], ejemplo: "Celeste recibe su usuario, entra, cambia la contraseña y ya ve su rutina." },
  { titulo: "Asignar una rutina", pasos: ["El entrenador elige una plantilla o arma una desde cero.", "Si usa una plantilla, el sistema la copia: la del alumno es independiente.", "Cada cambio posterior en la rutina queda en el registro de cambios."], ejemplo: "Se copia \"Fuerza base 3 días\" para Celeste y se le baja la carga de sentadilla sin tocar la plantilla." },
  { titulo: "El alumno entrena, incluso sin señal", pasos: ["El alumno abre el entrenamiento y marca cada serie con peso, repeticiones y esfuerzo.", "Sin internet, todo se guarda en el teléfono y la app sigue funcionando.", "Cuando vuelve la conexión, se sincroniza solo con GOZS."], ejemplo: "Celeste entrena en un sótano sin señal: 12 series quedan en su teléfono y se suben al salir." },
  { titulo: "Pago y renovación con ciclo fijo", pasos: ["La cuota vence el día 10.", "El alumno paga el 18; el pago se confirma.", `La próxima fecha de vencimiento es el 10 del mes siguiente (${e.ciclo.proximoVencimiento}), no el 18.`, "Si se repite la misma operación de pago, no se cobra dos veces ni se corre la fecha dos veces."], ejemplo: `Vence el 10/10, paga el 18/10 → vuelve a vencer el ${e.ciclo.proximoVencimiento.split("-").reverse().join("/")}.` },
  { titulo: "Estados de la cuota", pasos: ["Vigente: falta más de 5 días para el vencimiento.", "Por vencer: faltan 5 días o menos.", "Vencida: pasó el día de vencimiento.", "El alumno vencido sigue entrando a la app y al Chat GOZS, con un aviso arriba para hablar con el equipo. No puede reservar clases hasta renovar."], ejemplo: `Con vencimiento el 10/10: el 20/9 está ${etiqueta(e.estados.vigente)}; el 5/10, ${etiqueta(e.estados.porVencer)}; el 11/10, ${etiqueta(e.estados.vencida)}.` },
  { titulo: "Cambio de precio", pasos: ["Se carga el precio nuevo con la fecha desde la que rige; el anterior queda guardado.", "Una cuota que venció antes de esa fecha se cobra al precio viejo.", "La siguiente se cobra al precio nuevo.", "Lo que ya se cobró no cambia nunca."], ejemplo: "\"Funcional 2x semana\" pasa de $ 20.000 a $ 22.000 desde el 15/11. La cuota del 10/11 se cobra $ 20.000; la del 10/12, $ 22.000. Los pagos ya hechos siguen igual." },
  { titulo: "Reserva de clase y límite semanal", pasos: ["El alumno reserva solo clases de la semana en curso que todavía no empezaron.", "Se revisa que la membresía esté al día, que el plan incluya la actividad y que haya cupo.", "Si el plan tiene límite semanal y ya lo usó, no puede reservar más."], ejemplo: "Con \"Funcional 2x semana\", Celeste reserva martes y jueves; el viernes ve \"Alcanzaste el límite semanal de 2 clases\". Con \"Pase libre\" no hay límite." },
  { titulo: "Dolor → alerta → cambio de ejercicio", pasos: ["El alumno toca \"Tengo una molestia\" y cuenta zona, intensidad y cuándo apareció.", "El equipo recibe una alerta. Si hay señales de alarma, la alerta es crítica y se le recomienda frenar por hoy.", "El caso pasa de pendiente a atendido y luego cerrado.", "El entrenador puede reemplazar el ejercicio para toda la rutina vigente; las sesiones ya hechas no se tocan."], ejemplo: "Celeste avisa dolor moderado de rodilla en la sentadilla. El profe la atiende y cambia la sentadilla por otra variante." },
  { titulo: "Baja administrativa", pasos: ["El equipo da de baja al alumno: su estado pasa a baja administrativa.", "Rutinas, sesiones, evaluaciones, mensajes y reportes de dolor se conservan.", "Nunca se borra el historial."], ejemplo: "Si Celeste se va, sus 90 días de entrenamientos siguen guardados y se cuentan como una baja en las métricas." },
];

function etiqueta(estado: string): string {
  return ({ VIGENTE: "vigente", POR_VENCER: "por vencer", VENCIDA: "vencida" } as Record<string, string>)[estado] ?? estado;
}

interface Metrica { nombre: string; significa: string; calculo: string; ejemplo: string }

export const metricasDocumentacion = (e: EjemplosDocumentacion): Metrica[] => [
  { nombre: "Ingresos del mes", significa: "Lo que realmente se cobró en el mes.", calculo: "Suma de los pagos confirmados del mes, comparada con la del mes anterior. Solo lo ve el dueño.", ejemplo: `Este mes ${e.ingresos.mes}; el mes anterior ${e.ingresos.anterior} (${e.ingresos.variacionPct > 0 ? "+" : ""}${e.ingresos.variacionPct}%).` },
  { nombre: "Cobranza esperada y pendiente", significa: "Cuánto se esperaba cobrar y cuánto falta.", calculo: "Pendiente = una cuota mensual (precio del plan dividido su duración en meses) por cada vencimiento cumplido sin renovar, de alumnos activos. Esperada = cobrado + pendiente.", ejemplo: `Esperada ${e.cobranza.esperada}; pendiente ${e.cobranza.pendiente}.` },
  { nombre: "Cuotas vencidas", significa: "Cuántos alumnos activos tienen la cuota vencida.", calculo: "Cantidad de contrataciones activas cuya fecha de vencimiento ya pasó.", ejemplo: `${e.cobranza.vencidas} cuotas vencidas.` },
  { nombre: "Alumnos activos, altas y bajas", significa: "Cuánta gente entrena hoy y cuánta entró o salió.", calculo: "Activos = alumnos con membresía activa. Altas = alumnos que contrataron por primera vez en el período. Bajas = los que se dieron de baja en el período.", ejemplo: "Empezás el mes con 38 activos, entran 4 y salen 2: terminás con 40." },
  { nombre: "Sin entrenar 7 días", significa: "Alumnos activos que se están alejando.", calculo: "Membresía activa y último entrenamiento hace más de 7 días, o ninguno.", ejemplo: `Celeste entrenó hace 3 horas: ${e.actividad.celesteSinEntrenar ? "figura" : "no figura"}. Facundo hace 9 días: ${e.actividad.facundoSinEntrenar ? "figura" : "no figura"}.` },
  { nombre: "Alumno nuevo (90 días)", significa: "Quién se sumó hace poco.", calculo: "Alumno dado de alta en los últimos 90 días.", ejemplo: `Alta hace 30 días: ${e.actividad.nuevo ? "es nuevo" : "no es nuevo"}. Alta hace 120 días: ${e.actividad.noNuevo ? "es nuevo" : "no es nuevo"}.` },
  { nombre: "Fuerza máxima estimada (1RM)", significa: "El peso máximo que el alumno podría levantar una sola vez.", calculo: "Epley: peso × (1 + repeticiones ÷ 30). Brzycki: peso ÷ (1,0278 − 0,0278 × repeticiones).", ejemplo: `80 kg × 5 repeticiones → Epley ${e.fuerza.epley} kg; Brzycki ${e.fuerza.brzycki} kg.` },
  { nombre: "Volumen y tonelaje", significa: "Cuánto trabajo total hizo el alumno.", calculo: "Series × repeticiones × peso. El volumen efectivo no cuenta las series de entrada en calor.", ejemplo: `3×10 con 60 kg y 4×8 con 80 kg → tonelaje ${e.fuerza.tonelaje}. Entrada en calor 40×10 + dos series de 80×5 → efectivo ${e.fuerza.volumenEfectivo}.` },
  { nombre: "Health Score", significa: "Semáforo de qué tan constante es el alumno (0 a 100).", calculo: "40% adherencia + 30% frecuencia semanal + 20% charla con el equipo + 10% estado de la cuota. Verde desde 75, amarillo desde 50, rojo por debajo.", ejemplo: `Adherencia 80, frecuencia 75, chat 70, cuota al día (100) → ${e.fuerza.saludPuntaje}: ${e.fuerza.saludEstado}.` },
  { nombre: "Sobrecarga progresiva", significa: "El alumno está levantando más que antes en un ejercicio.", calculo: "Hay sobrecarga cuando el peso máximo o el volumen del ejercicio superan a los de la sesión anterior.", ejemplo: `Press de banca: 70 kg la semana pasada y 75 kg hoy → ${e.fuerza.sobrecargaDelta}.` },
];

export const QUIEN_VE_QUE: ReadonlyArray<readonly [string, string, string, string]> = [
  ["Su propio perfil, rutina y entrenamientos", "Sí", "Los de sus alumnos", "Todos"],
  ["Montos de facturación e ingresos", "No", "No", "Sí"],
  ["Pagos", "Los suyos", "Los de sus alumnos", "Todos"],
  ["Contratación y vencimiento", "La suya", "Las de sus alumnos", "Todas"],
  ["Armar y cambiar rutinas", "No", "Sí", "Sí"],
  ["Elegir el ejercicio de reemplazo por dolor", "No", "Sí", "Sí"],
  ["Catálogo de ejercicios", "Ver", "Ver y editar", "Ver y editar"],
  ["Planes de membresía", "Ver", "Ver y editar", "Ver y editar"],
  ["Registro de cambios", "No", "Solo contrataciones", "Todo"],
  ["Borrar un perfil", "No", "No", "Sí"],
];

export const FAQ: ReadonlyArray<readonly [string, string]> = [
  ["¿Si subo el precio, cambia lo que ya me pagaron?", "No. Lo cobrado queda como estaba. El precio nuevo rige desde la fecha que cargues: una cuota que venció antes se cobra al precio viejo y la siguiente al nuevo."],
  ["¿Si doy de baja a un alumno pierdo su historial?", "No. La baja administrativa nunca borra rutinas, entrenamientos, evaluaciones, mensajes ni reportes de dolor."],
  ["¿Qué pasa si el alumno entrena sin internet?", "Puede entrenar completo. Todo se guarda en su teléfono y se sincroniza cuando vuelve la conexión."],
  ["¿Por qué un alumno figura vencido si pagó?", "Revisá que el pago esté confirmado: uno pendiente o rechazado no renueva. Además, el estado se actualiza una vez por día, así que puede tardar hasta la próxima corrida."],
  ["¿Por qué la próxima cuota no vence 30 días después del pago?", "Porque el ciclo es fijo: si vence el 10 y paga el 18, la siguiente vence el 10 del mes que viene."],
  ["¿Puede el alumno elegir otro ejercicio si le duele algo?", "No. Reporta la molestia y el entrenador decide el reemplazo."],
];
