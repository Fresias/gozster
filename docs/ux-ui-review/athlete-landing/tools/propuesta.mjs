// Propuesta: bloque .theme-athlete nuevo + cambios de clases (solo visuales) que llevan el lenguaje
// de la landing a /athlete. `transformar` se ejecuta en el navegador sobre el DOM real capturado.

/** Reemplazo de los bloques .theme-athlete de globals.css (P01 + GOZS-448, solo las variables). */
export const PROPUESTA_CSS = `/* Athlete App con el lenguaje de la landing.
   Sin overrides de --primary/--ring/--background/--card: rige la paleta zinc de :root y .dark
   (primary #18181B en claro, #FAFAFA en oscuro; fondo y tarjetas #FFFFFF / #09090B). */
.theme-athlete {
  --rest-timer-bg: var(--card);
  --rest-timer-time-fg: var(--foreground);
  --rest-timer-track-bg: var(--muted);
  --rest-timer-fill-bg: var(--primary);
  --rest-timer-fill-bg-paused: var(--warning-soft-foreground);

  /* Superserie y drop set: el violeta del constructor de rutinas como token semántico
     (hoy son purple-* de Tailwind hardcodeados; valores = purple-600 / purple-800 / purple-500). */
  --superset: 271 81% 56%;            /* #9333EA  ordinal y badge sólido (texto blanco 5.4:1) */
  --superset-foreground: 0 0% 100%;
  --superset-soft: 271 91% 65%;       /* #A855F7  fondos /10–/20 y bordes /30–/40 */
  --superset-soft-foreground: 273 67% 39%; /* #6B21A8  texto sobre el tinte (purple-800) */
}
.dark .theme-athlete,
.theme-athlete .dark {
  --superset-soft-foreground: 269 100% 92%; /* #E9D5FF  purple-200 */
  /* --neutral-soft de .dark es azul pizarra (217 33% 17%): en athlete pasa a zinc como el resto. */
  --neutral-soft: 240 3.7% 15.9%;
  --neutral-soft-foreground: 0 0% 98%;
  --neutral-soft-border: 240 5.3% 26%;
}
/* Selección de texto de la landing (.landing-root ::selection): legible también sobre botones primary. */
.theme-athlete ::selection { background: hsl(240 5% 52% / 0.4); color: currentColor; }`;

/** Lista documentada de cambios de clase (la usa el README y la issue de implementación). */
export const REGLAS = [
  { id: "T2", titulo: "Texto sobre primary", archivos: ["src/components/athlete/live-workout.tsx:1166"], antes: "bg-primary text-white", despues: "bg-primary text-primary-foreground", motivo: "En oscuro el primary pasa a #FAFAFA: el blanco fijo desaparece.", layout: "Ninguno" },
  { id: "T3", titulo: "Tarjeta «Te toca hoy» y toast de cambio de día como isla oscura de la landing", archivos: ["src/components/athlete/inicio-mis-dias.tsx:429", "src/components/athlete/inicio-mis-dias.tsx:460", "src/components/athlete/inicio-mis-dias.tsx:774"], antes: "bg-[#0F172A] text-white (h2: text-white)", despues: "dark bg-background text-foreground (h2: text-foreground)", motivo: "#0F172A es pizarra azulada y deja «Hacer otro día» ilegible en claro (text-foreground oscuro sobre fondo oscuro). La landing usa el mismo recurso con la clase .dark (figure.landing-media dark).", layout: "Ninguno" },
  { id: "T4", titulo: "Botón «Empezar Día N»", archivos: ["src/components/athlete/inicio-mis-dias.tsx:474 (empezar-dia-btn)"], antes: "rounded-[14px] bg-[#38BDF8] text-[#0F172A] shadow-md hover:bg-[#38BDF8]/90", despues: "rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90", motivo: "Cian hardcodeado (decisión 1). Receta BTN_PRIMARY de la landing.", layout: "Ninguno (mismo alto h-14)" },
  { id: "T5", titulo: "Acciones principales con forma BTN_PRIMARY", archivos: ["src/components/athlete/live-workout.tsx:2092, 2161, 2520 (registrar-serie-btn, terminar-entrenamiento-btn*)", "onboarding-alumno.tsx:481/490/499", "cuestionario-inicial.tsx (submit-cuestionario-btn)", "pain-report-modal.tsx (submit-pain-report-btn)", "cierre-dia-modal.tsx (cierre-dia-volver-athlete-btn)", "historial-sesiones.tsx / mi-progreso.tsx (CTA de vacío)"], antes: "rounded-lg | rounded-xl | rounded-[14px] + shadow-*", despues: "rounded-full shadow-lg shadow-primary/20", motivo: "BTN_PRIMARY (kit.tsx:23). Se aplica a botones bg-primary de ≥44 px de alto y ≥160 px de ancho.", layout: "Ninguno (solo radio y sombra)" },
  { id: "T6", titulo: "Acciones secundarias con forma BTN_GHOST", archivos: ["src/components/athlete/inicio-mis-dias.tsx:485 (hacer-otro-dia-btn)", "modales: botones Volver/Cancelar de ancho completo"], antes: "rounded-[12px] | rounded-xl | rounded-lg", despues: "rounded-full", motivo: "BTN_GHOST (kit.tsx:26): borde 1px y pastilla.", layout: "Ninguno" },
  { id: "T7", titulo: "Pestañas y segmentados como el selector de público de la landing", archivos: ["src/components/athlete/athlete-shell.tsx:126", "live-workout.tsx (tab-entrenar / tab-registro-dia)", "historial-sesiones.tsx (tab-sesiones / tab-dashboard)"], antes: "rounded-xl / rounded-lg", despues: "rounded-full", motivo: "Selector de público (kit.tsx:268-279): contenedor y opción activa en pastilla.", layout: "Ninguno" },
  { id: "T8", titulo: "Micro-etiquetas en mayúsculas → MICRO_LABEL", archivos: ["inicio-mis-dias.tsx («Te toca hoy», «Tus días»)", "live-workout.tsx («Rutina», «Peso», «Repeticiones»)", "rest-timer.tsx:«Descanso»", "y el resto de etiquetas uppercase sin fondo"], antes: "uppercase tracking-wider|tracking-widest|tracking-[0.12em] font-bold|font-extrabold", despues: "uppercase font-mono tracking-[0.18em] font-semibold", motivo: "MICRO_LABEL (kit.tsx:17). Se conserva el tamaño y el color de cada etiqueta (no se fuerza text-xs ni muted) para no mover bloques.", layout: "Solo ancho del texto (mono + tracking); alto igual" },
  { id: "T9", titulo: "Títulos con el peso de la landing", archivos: ["live-workout.tsx:779 (h1 del día)", "inicio-mis-dias.tsx (h1 del plan, h2 del hero)", "historial-sesiones.tsx / mi-progreso.tsx / athlete-classes.tsx (h1/h2)"], antes: "font-bold | font-extrabold + tracking-tight", despues: "font-black tracking-tighter", motivo: "H2 de la landing (kit.tsx:31). No se toma leading-[0.98] porque cambiaría el alto de los bloques.", layout: "Ninguno en alto; el ancho de la línea cambia levemente" },
  { id: "T10", titulo: "Punto «Online» con pulso de presencia", archivos: ["src/components/athlete/athlete-shell.tsx:35-38"], antes: "size-2 rounded-full bg-success", despues: "landing-dot size-2 rounded-full bg-success text-success", motivo: "landing-dot (globals.css:468). Respeta prefers-reduced-motion.", layout: "Ninguno" },
  { id: "T11", titulo: "Violeta legible en modo claro", archivos: ["live-workout.tsx:1168, 1189, 1220, 1291, 1294, 1298, 1301 y resto de text-purple-300/200 sin variante dark:"], antes: "text-purple-300 | text-purple-200 | text-purple-300/80 (iguales en claro y oscuro)", despues: "text-purple-700 dark:text-purple-300 | text-purple-800 dark:text-purple-200 | text-purple-700 dark:text-purple-300/80", motivo: "purple-300 sobre blanco da ~1.5:1. Se ajusta solo el tono dentro de la familia purple (regla de contraste). En oscuro no cambia.", layout: "Ninguno" },
  { id: "T12", titulo: "Tarjetas grandes con radio de la landing", archivos: ["inicio-mis-dias.tsx (hero rounded-[20px])", "live-workout.tsx / historial-sesiones.tsx / modales (contenedores rounded-xl ≥300 px)"], antes: "rounded-xl | rounded-[14px] | rounded-[20px]", despues: "rounded-2xl", motivo: "Tarjetas de la landing: rounded-2xl border border-border bg-card.", layout: "Ninguno" },
  { id: "T13", titulo: "Avatar «Tú» del chat legible", archivos: ["src/components/athlete/athlete-chat.tsx:312"], antes: "bg-primary/30 text-primary-foreground", despues: "bg-primary text-primary-foreground", motivo: "Texto claro sobre un tinte del 30 %: 1.5:1 hoy (azul) y 1.9:1 con zinc. Sólido: 17:1.", layout: "Ninguno" },
];

/** Se ejecuta en el navegador. Devuelve cuántos elementos tocó cada regla. */
export function transformar() {
  const n = {};
  const cuenta = (id) => (n[id] = (n[id] || 0) + 1);
  const swap = (el, de, a) => {
    if (!el.classList.contains(de)) return false;
    el.classList.remove(de);
    for (const c of a.split(" ").filter(Boolean)) el.classList.add(c);
    return true;
  };
  const quitarRadios = (el) => [...el.classList].filter((c) => /^rounded(-(none|sm|md|lg|xl|2xl|3xl|\[[^\]]+\]))?$/.test(c)).forEach((c) => el.classList.remove(c));
  const box = (el) => el.getBoundingClientRect();

  // T2
  for (const el of document.querySelectorAll(".bg-primary.text-white")) if (swap(el, "text-white", "text-primary-foreground")) cuenta("T2");

  // T3 + T4
  for (const el of document.querySelectorAll('[data-testid="hero-dia-hoy"], [data-testid="toast-cambio-dia"]')) {
    el.classList.add("dark");
    swap(el, "bg-[#0F172A]", "bg-background");
    swap(el, "text-white", "text-foreground");
    for (const h of el.querySelectorAll(".text-white")) swap(h, "text-white", "text-foreground");
    cuenta("T3");
  }
  for (const el of document.querySelectorAll('[class*="bg-[#38BDF8]"]')) {
    swap(el, "bg-[#38BDF8]", "bg-primary");
    swap(el, "text-[#0F172A]", "text-primary-foreground");
    swap(el, "hover:bg-[#38BDF8]/90", "hover:bg-primary/90");
    cuenta("T4");
  }

  // T5 / T6: botones de acción (antes de medir, sin tocar todavía nada que mueva layout)
  const botones = [...document.querySelectorAll("button, a[role=button], a[href]")].map((b) => ({ b, r: box(b) }));
  for (const { b, r } of botones) {
    const txt = (b.innerText || "").trim();
    if (r.height < 44 || r.height > 64 || r.width < 160 || txt.length === 0 || txt.length > 40 || txt.includes("\n")) continue;
    if (b.closest('nav[aria-label="Secciones Athlete"], [role=tablist]')) continue;
    if (b.classList.contains("bg-primary")) {
      quitarRadios(b);
      [...b.classList].filter((c) => /^shadow(-(xs|sm|md|lg|xl|2xl))?$/.test(c)).forEach((c) => b.classList.remove(c));
      b.classList.add("rounded-full", "shadow-lg", "shadow-primary/20");
      cuenta("T5");
    } else if ([...b.classList].some((c) => c === "border" || c.startsWith("border-")) && /justify-center/.test(b.className)) {
      quitarRadios(b);
      b.classList.add("rounded-full");
      cuenta("T6");
    }
  }

  // T7
  for (const a of document.querySelectorAll('nav[aria-label="Secciones Athlete"] > a')) { quitarRadios(a); a.classList.add("rounded-full"); cuenta("T7"); }
  for (const tl of document.querySelectorAll("[role=tablist]")) {
    quitarRadios(tl); tl.classList.add("rounded-full");
    for (const t of tl.querySelectorAll("[role=tab]")) { quitarRadios(t); t.classList.add("rounded-full"); }
    cuenta("T7");
  }

  // T8
  for (const el of document.querySelectorAll(".uppercase")) {
    const cl = [...el.classList];
    const tracking = cl.find((c) => /^tracking-(wider|widest|\[0\.1\dem\])$/.test(c));
    if (!tracking) continue;
    if (cl.some((c) => /^(bg-|border$|border-|rounded)/.test(c))) continue; // badges y chips: no
    if (el.closest("button")) continue;
    el.classList.remove(tracking);
    el.classList.add("tracking-[0.18em]", "font-mono");
    if (!swap(el, "font-bold", "font-semibold")) swap(el, "font-extrabold", "font-semibold");
    cuenta("T8");
  }

  // T9
  for (const h of document.querySelectorAll("h1, h2")) {
    if (parseFloat(getComputedStyle(h).fontSize) < 20 || h.classList.contains("font-mono")) continue;
    ["font-bold", "font-extrabold", "font-semibold"].forEach((c) => h.classList.remove(c));
    h.classList.remove("tracking-tight");
    h.classList.add("font-black", "tracking-tighter");
    cuenta("T9");
  }

  // T10
  for (const dot of document.querySelectorAll("[role=status] > span.size-2.bg-success")) { dot.classList.add("landing-dot", "text-success"); cuenta("T10"); }

  // T11
  for (const el of document.querySelectorAll('[class*="text-purple-"]')) {
    const tieneDark = [...el.classList].some((c) => c.startsWith("dark:text-purple-"));
    if (tieneDark) continue;
    if (swap(el, "text-purple-300/80", "text-purple-700 dark:text-purple-300/80") || swap(el, "text-purple-300", "text-purple-700 dark:text-purple-300") || swap(el, "text-purple-200", "text-purple-800 dark:text-purple-200")) cuenta("T11");
  }

  // T12
  for (const el of document.querySelectorAll('[class*="rounded-xl"], [class*="rounded-[14px]"], [class*="rounded-[20px]"]')) {
    if (el.matches("button, a, input, select, textarea, [role=tab], [role=tablist]") || el.closest("nav")) continue;
    const r = box(el);
    if (r.width < 300 || r.height < 80) continue;
    if (!el.classList.contains("rounded-xl") && !el.classList.contains("rounded-[14px]") && !el.classList.contains("rounded-[20px]")) continue;
    quitarRadios(el); el.classList.add("rounded-2xl"); cuenta("T12");
  }
  // T13
  for (const el of document.querySelectorAll('[aria-label="Tu avatar"].text-primary-foreground')) if (swap(el, "bg-primary/30", "bg-primary")) cuenta("T13");
  return n;
}
