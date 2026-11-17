// Pantallas y estados de /athlete. `datos` controla el servidor de ejemplo, `store` siembra el
// store local del alumno (localStorage del navegador de captura) y `pasos` abre modales o pestañas
// SIN confirmar nada (las escrituras a Supabase están bloqueadas igual).
const ID = (k) => `0f0f0f0f-0000-4000-8000-${String(k).padStart(12, "0")}`;
const clic = (...sels) => async (page) => { for (const s of sels) { await page.click(s); await page.waitForTimeout(1000); } };
const boton = (nombre) => async (page) => { await page.getByRole("button", { name: nombre, exact: true }).click(); await page.waitForTimeout(800); };
const empezar = async (page) => { await page.click('[data-testid="empezar-dia-btn"]'); await page.waitForSelector('[data-testid="live-workout-container"]'); await page.waitForTimeout(1500); };
const offline = async (page, ctx) => { await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event("offline"))); await page.waitForTimeout(1200); };
const serie = (...fns) => async (page, ctx) => { for (const f of fns) await f(page, ctx); };
// Historial depende del plan cacheado (planAlumno): se entra como el alumno, desde Inicio.
const irHistorial = async (page) => { await page.click('nav[aria-label="Secciones Athlete"] a[href="/athlete/historial"]'); await page.waitForSelector('[data-testid="historial-sesiones-container"]'); await page.waitForTimeout(2500); };
const HERO = '[data-testid="hero-dia-hoy"]';
const LW = { ruta: "/athlete", esperar: HERO };
const B_PRIMERO = { orden: ["B", "A", "C"] };
const TECNICA = { vistaElegidaPorAlumno: "TECNICA", nivelVistaAlumno: "TECNICA" };

export const ESCENARIOS = [
  // Shell + Inicio
  { id: "inicio", grupo: "Inicio", titulo: "Inicio · Mis días (con datos)", ruta: "/athlete", esperar: HERO, viewports: ["movil", "desktop"] },
  { id: "inicio-sheet-otro-dia", grupo: "Inicio", titulo: "Inicio · hoja «Hacer otro día»", ruta: "/athlete", esperar: HERO, pasos: clic('[data-testid="hacer-otro-dia-btn"]') },
  { id: "inicio-sin-plan", grupo: "Inicio", titulo: "Inicio · sin plan (vacío)", ruta: "/athlete", esperar: '[data-testid="inicio-sin-plan"]', datos: { sinPlan: true, sinSesiones: true } },
  { id: "inicio-cargando", grupo: "Inicio", titulo: "Inicio · cargando (el plan no llega)", ruta: "/athlete", datos: { colgar: ["perfiles", "planes_entrenamiento"] } },
  { id: "inicio-offline", grupo: "Inicio", titulo: "Inicio · Modo Avión (offline)", ruta: "/athlete", esperar: HERO, pasos: offline },
  { id: "membresia-vencida", grupo: "Paywall", titulo: "Membresía vencida · diálogo al abrir la app", ruta: "/athlete", esperar: HERO, store: { membershipStatus: "EXPIRED_PAYMENT_PENDING" } },
  { id: "membresia-vencida-banner", grupo: "Paywall", titulo: "Membresía vencida · banner en Inicio (diálogo cerrado)", ruta: "/athlete", esperar: HERO, store: { membershipStatus: "EXPIRED_PAYMENT_PENDING" }, pasos: async (p) => { await p.keyboard.press("Escape"); await p.waitForTimeout(800); } },
  { id: "chat-abierto", grupo: "Chat", titulo: "Chat GOZS abierto", ruta: "/athlete", esperar: HERO, pasos: async (p) => { await p.getByLabel("Abrir chat con el equipo GOZS").click(); await p.waitForTimeout(1200); } },
  { id: "onboarding-1", grupo: "Onboarding", titulo: "Onboarding · paso 1", ruta: "/athlete", store: { onboardingCompletado: false }, esperar: '[aria-label="Bienvenida a GOZSter"]' },
  { id: "onboarding-2", grupo: "Onboarding", titulo: "Onboarding · paso 2 (vista)", ruta: "/athlete", store: { onboardingCompletado: false }, esperar: '[aria-label="Bienvenida a GOZSter"]', pasos: boton("Empezar") },
  { id: "onboarding-3", grupo: "Onboarding", titulo: "Onboarding · paso 3 (timer)", ruta: "/athlete", store: { onboardingCompletado: false }, esperar: '[aria-label="Bienvenida a GOZSter"]', pasos: serie(boton("Empezar"), boton("Continuar con Simple")) },

  // Live workout
  { id: "lw-aproximacion", grupo: "Entrenamiento en vivo", titulo: "Live workout · ejercicio con aproximación", ...LW, pasos: empezar },
  { id: "lw-superserie", grupo: "Entrenamiento en vivo", titulo: "Live workout · superserie", ...LW, pasos: serie(empezar, clic(`[data-testid="exercise-select-btn-${ID(2)}"]`)), viewports: ["movil", "desktop"] },
  { id: "lw-tiempo", grupo: "Entrenamiento en vivo", titulo: "Live workout · ejercicio por tiempo", ...LW, pasos: serie(empezar, clic(`[data-testid="exercise-select-btn-${ID(4)}"]`)) },
  { id: "lw-dropset", grupo: "Entrenamiento en vivo", titulo: "Live workout · drop set", ...LW, datos: B_PRIMERO, pasos: empezar },
  { id: "lw-unilateral", grupo: "Entrenamiento en vivo", titulo: "Live workout · unilateral", ...LW, datos: B_PRIMERO, pasos: serie(empezar, clic(`[data-testid="exercise-select-btn-${ID(3)}"]`)) },
  { id: "lw-tecnica", grupo: "Entrenamiento en vivo", titulo: "Live workout · vista Técnica", ...LW, store: TECNICA, pasos: serie(empezar, clic(`[data-testid="exercise-select-btn-${ID(2)}"]`)) },
  { id: "lw-registro-dia", grupo: "Entrenamiento en vivo", titulo: "Live workout · Registro del día (vacío)", ...LW, pasos: serie(empezar, clic('[data-testid="tab-registro-dia"]')) },
  { id: "lw-ajustes", grupo: "Entrenamiento en vivo", titulo: "Live workout · ajustes de vista", ...LW, pasos: serie(empezar, clic('[data-testid="athlete-settings-btn"]')) },
  { id: "lw-cuestionario", grupo: "Cuestionario inicial", titulo: "Cuestionario inicial (formulario)", ...LW, pasos: serie(empezar, clic('[data-testid="athlete-settings-btn"]', '[data-testid="tab-cuestionario"]')) },
  { id: "lw-cuestionario-completado", grupo: "Cuestionario inicial", titulo: "Cuestionario inicial (resumen completado)", ...LW, store: { cuestionarioInicial: { alumno_id: "x", objetivo_principal: "Hipertrofia / Ganancia Muscular", experiencia_previa: "Intermedio (1 a 3 años entrenando)", dias_disponibles_semana: 3, molestias_o_lesiones_previas: "Molestia leve en hombro derecho al empujar por encima de la cabeza.", equipamiento_disponible: ["Gimnasio comercial completo"], respuestas_extra: { comentarios: "Prefiero entrenar a la tarde." }, completado_at: "2026-11-02T12:00:00.000Z", updated_at: "2026-11-02T12:00:00.000Z" } }, pasos: serie(empezar, clic('[data-testid="athlete-settings-btn"]', '[data-testid="tab-cuestionario"]')) },
  { id: "lw-offline", grupo: "Entrenamiento en vivo", titulo: "Live workout · Modo Avión", ...LW, pasos: serie(empezar, offline) },
  { id: "lw-popover-descanso", grupo: "Entrenamiento en vivo", titulo: "Live workout · popover de descanso", ...LW, pasos: serie(empezar, clic(`[data-testid="descanso-chip-${ID(1)}"]`)) },
  { id: "modal-notas", grupo: "Modales", titulo: "Modal · notas del ejercicio", ...LW, pasos: serie(empezar, clic(`[data-testid="exercise-notes-btn-${ID(1)}"]`)) },
  { id: "modal-video", grupo: "Modales", titulo: "Modal · video del ejercicio", ...LW, pasos: serie(empezar, clic(`[data-testid="exercise-select-btn-${ID(2)}"]`, `[data-testid="demo-technique-btn-${ID(2)}"]`)) },
  { id: "modal-calentamiento", grupo: "Modales", titulo: "Modal · calentamiento / aproximación (vista Técnica)", ...LW, store: TECNICA, pasos: serie(empezar, clic(`[data-testid="warmup-btn-${ID(1)}"]`)) },
  { id: "modal-molestia", grupo: "Modales", titulo: "Modal · reportar molestia", ...LW, pasos: serie(empezar, clic('[data-testid="header-pain-report-btn"]')) },

  // Historial
  { id: "historial", grupo: "Historial", titulo: "Historial · con datos", ruta: "/athlete", esperar: HERO, pasos: irHistorial },
  { id: "historial-detalle", grupo: "Historial", titulo: "Historial · sesión expandida", ruta: "/athlete", esperar: HERO, pasos: serie(irHistorial, async (p) => { await p.locator('[data-testid^="btn-expand-sesion-"]').first().click(); await p.waitForTimeout(1000); }) },
  { id: "historial-dashboard", grupo: "Historial", titulo: "Historial · progreso (mini-dash)", ruta: "/athlete", esperar: HERO, pasos: serie(irHistorial, clic('[data-testid="tab-dashboard"]')) },
  { id: "historial-vacio", grupo: "Historial", titulo: "Historial · vacío", ruta: "/athlete/historial", datos: { sinSesiones: true } },
  { id: "historial-offline", grupo: "Historial", titulo: "Historial · Modo Avión", ruta: "/athlete", esperar: HERO, pasos: serie(irHistorial, offline) },

  // Progreso
  { id: "progreso", grupo: "Progreso", titulo: "Mi progreso · con datos (Simple)", ruta: "/athlete/progreso", esperar: '[data-testid="progreso-ejercicio"]' },
  { id: "progreso-tecnica", grupo: "Progreso", titulo: "Mi progreso · con datos (Técnica)", ruta: "/athlete/progreso", store: TECNICA, esperar: '[data-testid="progreso-ejercicio"]' },
  { id: "progreso-vacio", grupo: "Progreso", titulo: "Mi progreso · vacío", ruta: "/athlete/progreso", datos: { sinSesiones: true } },
  { id: "progreso-cargando", grupo: "Progreso", titulo: "Mi progreso · cargando", ruta: "/athlete/progreso", datos: { colgar: ["registro_sesiones", "registro_series"] }, espera: 1500 },
  { id: "progreso-offline", grupo: "Progreso", titulo: "Mi progreso · Modo Avión con datos guardados", ruta: "/athlete/progreso", esperar: '[data-testid="progreso-ejercicio"]', pasos: offline },
  { id: "progreso-offline-sin-datos", grupo: "Progreso", titulo: "Mi progreso · Modo Avión sin datos", ruta: "/athlete/progreso", datos: { colgar: ["registro_sesiones", "registro_series"] }, espera: 1500, pasos: offline },

  // Clases
  { id: "clases", grupo: "Clases", titulo: "Clases · sin clases cargadas", ruta: "/athlete/clases", esperar: '[data-testid="athlete-classes"]' },
  { id: "clases-con-datos", grupo: "Clases", titulo: "Clases · semana con clases (dataset demo)", ruta: "/athlete/clases", esperar: '[data-testid="athlete-classes"]', pasos: clic('[data-testid^="select-demo-"]') },
  { id: "clases-offline", grupo: "Clases", titulo: "Clases · Modo Avión", ruta: "/athlete/clases", esperar: '[data-testid="athlete-classes"]', pasos: offline },
];
