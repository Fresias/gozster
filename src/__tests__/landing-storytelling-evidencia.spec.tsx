import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import HomePage from "@/app/page";
import EntrenadoresPage from "@/app/entrenadores/page";
import * as landingSessionModule from "@/lib/use-landing-session";

const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

const leer = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
const existe = (rel: string) => fs.existsSync(path.resolve(__dirname, rel));

type Sesion = { id: string; email: string; displayName: string; rol: "ADMIN" | "ALUMNO" } | null;
const conSesion = (user: Sesion) =>
  vi.spyOn(landingSessionModule, "useLandingSession").mockReturnValue({ user, loading: false } as ReturnType<
    typeof landingSessionModule.useLandingSession
  >);

const PROHIBIDOS =
  /telemetr|\bRPE\b|halterofilia|carga efectiva|biomec|\b1RM\b|hipertrofia|microciclo|tonelaje|antropom|churn|offline|\bPWA\b|mynter/i;
const SECCION_VIEWPORT = /landing-section[^"]*min-h-\[calc\(100svh-4rem\)\]/g;
const siguientes = (h: string) => [...h.matchAll(/<a href="#([a-z-]+)"[^>]*data-siguiente/g)].map((m) => m[1]);
const bloque = (h: string, testid: string) => h.split(`data-testid="${testid}"`)[1] ?? "";
const heroCta = (h: string) => bloque(h, "hero-cta").split("</div>")[0] ?? "";
const principal = (h: string) => h.split("<main")[1]?.split("</main>")[0] ?? "";
const cabecera = (h: string) => h.split("</header>")[0] ?? "";

const homeCode = leer("../app/page.tsx");
const entrenadoresCode = leer("../app/entrenadores/page.tsx");
const kitCode = leer("../components/landing/kit.tsx");
const landingCode = homeCode + entrenadoresCode + kitCode;
const globalsCode = leer("../app/globals.css");

afterEach(() => vi.restoreAllMocks());

describe("Home (/) para alumnos: 'Entrenamiento basado en evidencia, no en tendencias'", () => {
  const html = renderToStaticMarkup(createElement(HomePage));
  const text = texto(html);

  describe("1. Narrativa", () => {
    it("el hero presenta la promesa y a Gonzalo Salas como Head Coach", () => {
      expect(html).toMatch(/<h1[^>]*>.*Entrenamiento basado en evidencia,.*tendencias.*<\/h1>/s);
      expect(text).toContain("Gonzalo Salas · Head Coach");
      expect((html.match(/<h1/g) ?? []).length).toBe(1);
    });

    it("tacha 'no tendencias' completo y el punto de presencia no usa el verde", () => {
      expect(html).toMatch(/<s[^>]*landing-strike[^>]*>no tendencias<\/s>/);
      expect(text).not.toContain("no en tendencias");
      expect(landingCode).not.toContain("bg-success");
      expect(landingCode).not.toContain("text-success");
    });

    it("el hero destaca solo las dos métricas con peso y empuja a seguir el relato", () => {
      const metricas = texto(bloque(html, "hero-metricas").split("</dl>")[0] ?? "");
      expect(metricas).toContain("+150");
      expect(metricas).toContain("alumnos acompañados");
      expect(metricas).toContain("5+");
      expect(metricas).toContain("años entrenando personas");
      expect(text).not.toContain("formas de entrenar");
      expect(html).not.toContain('data-testid="hero-puerta-entrenadores"');
    });

    it("cuenta el relato en orden (la autoridad de Gonzalo apenas termina el hero), un capítulo por pantalla", () => {
      const ids = ["gonzalo", "problema", "metodo", "como", "alumnos", "modalidades", "testimonios", "puente-entrenadores", "faq", "empezar"];
      const posiciones = ids.map((id) => html.indexOf(`id="${id}"`));
      expect(posiciones.every((p) => p > 0)).toBe(true);
      expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
      // hero + 10 capítulos, cada uno con alto mínimo de un viewport (menos el header fijo)
      expect((html.match(SECCION_VIEWPORT) ?? []).length).toBe(11);
      expect(html).not.toContain('data-testid="studio-pantalla"');
    });

    it("el hero y cada capítulo terminan con un enlace que invita a seguir al siguiente", () => {
      expect(siguientes(html)).toEqual(["gonzalo", "problema", "metodo", "como", "alumnos", "modalidades", "testimonios", "puente-entrenadores", "faq", "empezar"]);
    });

    it("habla desde el dolor del alumno", () => {
      expect(text).toMatch(/Vas al gimnasio,\s+cumplís\s+y aun así\s+no avanzás/);
      expect(text).not.toContain("Cumplís. Y aun así");
      expect(text).toContain("Tu rutina es una fotocopia.");
      expect(text).toContain("Nadie te mira entrenar.");
      expect(html).toContain('data-testid="contraste-tendencia-evidencia"');
      expect(html).toContain('data-testid="tendencias-tachadas"');
      expect(html).toContain('data-testid="mensaje-coach"');
    });

    it("no usa tecnicismos ni nombra a otras apps en el texto visible", () => {
      expect(text).not.toMatch(PROHIBIDOS);
      expect(landingCode).not.toMatch(/mynter/i);
    });

    it("mantiene las funciones vigentes y no lista la Calculadora de Discos", () => {
      expect(text).toContain("Cronómetro Inteligente");
      expect(text).toContain("Calentamiento Específico");
      expect(text).not.toContain("Calculadora de Discos");
    });
  });

  describe("2. Contenido para quien quiere entrenar", () => {
    it("ofrece las tres modalidades con contacto por WhatsApp", () => {
      for (const m of ["Funcional", "Boxeo", "Rutinas online"]) expect(text).toContain(`Consultar por ${m}`);
      // +54 9 11 6275-2515
      expect(html).toContain("https://wa.me/5491162752515");
      expect(html).not.toContain("wa.me/541162752515");
    });

    it("incluye testimonios y preguntas frecuentes solo de alumnos", () => {
      for (const nombre of ["Mirko", "Franco", "German"]) expect(text).toContain(nombre);
      expect(html).toContain('data-testid="seccion-faq"');
      expect(text).toContain("Si querés entrenar");
      expect(text).not.toContain("Si sos entrenador");
      expect((html.match(/<details/g) ?? []).length).toBe(5);
    });

    it("respalda el relato con las 4 credenciales de Gonzalo Salas", () => {
      for (const n of [1, 2, 3, 4]) expect(html).toContain(`data-testid="franja-cv-${n}"`);
      expect(text).toContain("Profesor Nacional de Educación Física");
      expect(text).toContain('ISEF N°1 "Dr. Enrique Romero Brest"');
      expect(text).toContain("Personal Trainer Certificado");
      expect(text).toContain("Centro Europeo de Educación Física");
      expect(text).toContain("Grupo GPO Latam");
      expect(text).toContain("Director Técnico de Boxeo");
      expect(text).toContain("Federación Argentina de Boxeo (FAB)");
      expect(homeCode).toContain("hover:bg-foreground hover:text-background");
    });
  });

  describe("3. El entrenador encuentra su página desde el primer pantallazo", () => {
    it("el selector de público del header marca 'Para entrenar' y enlaza a /entrenadores", () => {
      const selector = bloque(html, "selector-publico").split("</nav>")[0] ?? "";
      expect(selector).toMatch(/href="\/"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/"/);
      expect(selector).toContain('href="/entrenadores"');
      expect(texto(selector)).toContain("Para entrenadores");
    });

    it("el hero, el puente y el cierre llevan a /entrenadores", () => {
      expect(heroCta(html)).toContain('href="/entrenadores"');
      expect(texto(heroCta(html))).toContain("Soy entrenador: ver Coach Studio");
      const puente = bloque(html, "puente-entrenadores").split("</section>")[0] ?? "";
      expect(puente).toContain('href="/entrenadores"');
      expect(texto(puente)).toContain("¿Entrenás a otros ?");
      expect(texto(puente)).toContain("Conocer Coach Studio");
      expect(texto(puente)).toContain("Pedir una demo");
      expect(texto(puente)).not.toContain("Ya lo uso");
      expect(puente).toContain("/landing/studio-inicio.jpg");
      expect(bloque(html, "camino-02").slice(0, 400) + html.split('data-testid="camino-02"')[0]!.slice(-300)).toContain('href="/entrenadores"');
      expect(bloque(html, "barra-accion-movil")).toContain('href="/entrenadores"');
      expect(html).not.toContain('href="#entrenadores"');
    });
  });

  describe("4. El relato invita a empezar; el acceso de quien ya tiene cuenta vive en el header", () => {
    const render = (user: Sesion) => {
      conSesion(user);
      return renderToStaticMarkup(createElement(HomePage));
    };
    const barra = (h: string) => texto(bloque(h, "barra-accion-movil"));

    it("visitante: la acción principal es escribirle a Gonzalo en hero, header, barra móvil y cierre", () => {
      const h = render(null);
      expect(texto(heroCta(h))).toContain("Quiero empezar a entrenar");
      expect(heroCta(h)).toContain("https://wa.me/5491162752515");
      expect(cabecera(h)).toContain("https://wa.me/5491162752515");
      expect(barra(h)).toContain("Quiero entrenar");
      expect(barra(h)).toContain("Soy entrenador");
      expect(texto(cabecera(h))).toContain("Iniciar Sesión");
      expect(bloque(h, "camino-01").slice(0, 200) + h.split('data-testid="camino-01"')[0]!.slice(-700)).toContain("https://wa.me/5491162752515");
      expect(h).not.toContain('data-testid="camino-03"');
    });

    it("ninguna sección del relato llama a iniciar sesión ni a entrar a las apps", () => {
      for (const user of [null, { id: "a", email: "a@example.com", displayName: "admin", rol: "ADMIN" as const }, { id: "b", email: "b@example.com", displayName: "Celeste", rol: "ALUMNO" as const }]) {
        const m = principal(render(user));
        for (const destino of ['href="/login"', 'href="/studio"', 'href="/athlete"']) expect(m).not.toContain(destino);
        expect(texto(m)).not.toMatch(/Ya lo uso|Ya entreno|Abrir mi rutina|Ingresar/);
        expect(texto(m)).toContain("Quiero empezar a entrenar");
      }
    });

    it("ADMIN: el header y la barra móvil llevan a Coach Studio", () => {
      const h = render({ id: "admin-1", email: "admin@example.com", displayName: "admin", rol: "ADMIN" });
      expect(cabecera(h)).toContain('href="/studio"');
      expect(texto(cabecera(h))).toContain("Ir a Coach Studio");
      expect(barra(h)).toContain("Ir a Coach Studio");
      expect(texto(h)).toContain("admin (Admin)");
    });

    it("ALUMNO: el header y la barra móvil abren su rutina", () => {
      const h = render({ id: "alumno-1", email: "celeste@example.com", displayName: "Celeste Gerardi", rol: "ALUMNO" });
      expect(cabecera(h)).toContain('href="/athlete"');
      expect(texto(cabecera(h))).toContain("Abrir mi rutina");
      expect(barra(h)).toContain("Abrir mi rutina");
      expect(texto(h)).toContain("Celeste Gerardi (Atleta)");
    });
  });

  it("la app se muestra con un récord, como lo anuncia la app real", () => {
    expect(text).toContain("¡Nuevo récord!");
    expect(text).toContain("62,5 kg");
  });

  it("el ejemplo de la app se declara ilustrativo y toda imagen declara alt", () => {
    expect((html.match(/role="img"/g) ?? []).length).toBe(1);
    expect(text).toContain("Ejemplo ilustrativo de la app.");
    expect(html).not.toMatch(/<img(?![^>]*\salt=")[^>]*>/);
    // solo el retrato decorativo del hero deja el alt vacío
    expect((html.match(/<img[^>]*alt=""/g) ?? []).length).toBe(1);
    expect(html).toContain('alt="Retrato de Gonzalo Salas, Head Coach"');
    expect(existe("../../public/landing/gonzalo-salas.jpg")).toBe(true);
  });
});

describe("Página /entrenadores: Coach Studio para quienes entrenan a otros", () => {
  const html = renderToStaticMarkup(createElement(EntrenadoresPage));
  const text = texto(html);

  it("abre con 'Lo pensó un entrenador, para entrenadores', el producto a la vista y un único h1", () => {
    expect(html).toMatch(/<h1[^>]*>.*Lo pensó un.*entrenador,.*para.*entrenadores\..*<\/h1>/s);
    expect(bloque(html, "hero-entrenadores").split("</section>")[0]).toContain("/landing/studio-inicio.jpg");
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(text).toContain("Coach Studio · Para entrenadores");
    const dolores = texto(bloque(html, "dolores-entrenador").split("</ul>")[0] ?? "");
    for (const d of ["Planillas que solo vos entendés", "Rutinas por PDF y audios de WhatsApp", "Perseguir cuotas por chat"]) {
      expect(dolores).toContain(d);
    }
  });

  it("recorre Coach Studio en orden, un capítulo por pantalla, con imágenes del producto", () => {
    const ids = ["studio-hoy", "studio-rutinas", "studio-alumno", "studio-negocio", "faq", "empezar"];
    const posiciones = ids.map((id) => html.indexOf(`id="${id}"`));
    expect(posiciones.every((p) => p > 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    expect((html.match(SECCION_VIEWPORT) ?? []).length).toBe(7);
    expect(siguientes(html)).toEqual(["studio-hoy", "studio-rutinas", "studio-alumno", "studio-negocio", "faq", "empezar"]);

    expect((html.match(/data-testid="studio-pantalla"/g) ?? []).length).toBe(4);
    for (const img of ["studio-inicio", "studio-rutinas", "studio-alumno", "studio-cobros", "studio-movil"]) {
      expect(html).toContain(`/landing/${img}.jpg`);
      expect(existe(`../../public/landing/${img}.jpg`)).toBe(true);
    }
    expect(text).toContain("Pantalla de Coach Studio con datos de ejemplo.");
    expect(html).not.toMatch(/<img(?![^>]*\salt="[^"]+")[^>]*>/);
  });

  it("'Tus rutinas' ofrece dos vistas: la biblioteca y el constructor", () => {
    const rutinas = html.split('id="studio-rutinas"')[1]?.split("</section>")[0] ?? "";
    const pestanas = texto(bloque(rutinas, "vistas-rutinas").split("</div>")[0] ?? "");
    expect(pestanas).toContain("Biblioteca");
    expect(pestanas).toContain("Constructor");
    expect((rutinas.match(/role="tab"/g) ?? []).length).toBe(2);
    expect(rutinas).toContain('data-testid="vista-constructor"');
    expect(rutinas).toContain("/landing/studio-rutinas.jpg");
    expect((html.match(/role="img"/g) ?? []).length).toBe(1);
    expect(entrenadoresCode).toContain("Vista ilustrativa del constructor de rutinas.");
  });

  it("la acción principal es coordinar una demo, no iniciar sesión: hero, header, cierre y barra móvil", () => {
    const demo = "https://wa.me/5491162752515";
    expect(heroCta(html)).toContain(demo);
    expect(texto(heroCta(html))).toContain("Pedir una demo");
    expect(heroCta(html)).toContain('href="#studio-hoy"');
    expect(cabecera(html)).toContain(demo);
    const cierre = bloque(html, "cierre-entrenadores").split("</section>")[0] ?? "";
    expect(cierre).toContain(demo);
    expect(texto(cierre)).toContain("Coordinar una demo con Gonzalo");
    expect(bloque(html, "barra-accion-movil")).toContain(demo);
    for (const destino of ['href="/login"', 'href="/studio"', 'href="/athlete"']) expect(principal(html)).not.toContain(destino);
    expect(texto(principal(html))).not.toContain("Ingresar");
    expect(text).toContain("Gratis, sin tarjeta.");
  });

  it("ADMIN entra a su panel desde el header; la página sigue invitando a la demo", () => {
    conSesion({ id: "admin-1", email: "admin@example.com", displayName: "admin", rol: "ADMIN" });
    const h = renderToStaticMarkup(createElement(EntrenadoresPage));
    expect(cabecera(h)).toContain('href="/studio"');
    expect(texto(cabecera(h))).toContain("Ir a Coach Studio");
    expect(texto(heroCta(h))).toContain("Pedir una demo");
    expect(principal(h)).not.toContain('href="/studio"');
  });

  it("el selector marca 'Para entrenadores' y el cierre no desvía hacia la página de alumnos", () => {
    const selector = bloque(html, "selector-publico").split("</nav>")[0] ?? "";
    expect(selector).toMatch(/href="\/entrenadores"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/entrenadores"/);
    expect(selector).toContain('href="/"');
    expect(text).not.toContain("¿Buscabas entrenar con Gonzalo?");
    expect(text).not.toContain("Ir a la página para alumnos");
  });

  it("responde solo las preguntas de entrenadores y evita tecnicismos", () => {
    expect(text).toContain("Si sos entrenador");
    expect(text).not.toContain("Si querés entrenar");
    expect((html.match(/<details/g) ?? []).length).toBe(4);
    expect(text).not.toMatch(PROHIBIDOS);
  });

  it("declara su propio título y descripción", () => {
    const layout = leer("../app/entrenadores/layout.tsx");
    expect(layout).toContain("export const metadata");
    expect(layout).toContain("Coach Studio para entrenadores");
  });
});

describe("Landing: invariantes de diseño, ergonomía y accesibilidad (ambas páginas)", () => {
  it("usa tokens zinc de Coach Studio y no el scope .theme-athlete", () => {
    expect(landingCode).not.toContain("theme-athlete");
    for (const token of ["bg-background", "text-foreground", "bg-card", "border-border", "text-muted-foreground"]) {
      expect(landingCode).toContain(token);
    }
  });

  it("header fijo compartido con logo, selector de público, cápsula de sesión y ThemeToggle", () => {
    for (const Page of [HomePage, EntrenadoresPage]) {
      const html = renderToStaticMarkup(createElement(Page));
      expect(html).toContain("<header");
      expect(html).toContain("sticky top-0");
      expect(html).toContain('data-testid="selector-publico"');
      expect(html).toContain('data-testid="theme-toggle"');
      expect(html).toContain("Iniciar Sesión");
      // menú liviano: los enlaces a secciones quedan en el pie, no en el header
      expect(cabecera(html)).not.toContain('aria-label="Navegación principal"');
      expect((cabecera(html).match(/<a /g) ?? []).length).toBeLessThanOrEqual(5);
    }
    expect(kitCode).toContain("size-8 items-center justify-center rounded-lg bg-primary");
  });

  it("áreas táctiles de 48px y sin desborde horizontal (sin romper el header fijo)", () => {
    expect(kitCode).toContain("min-h-[48px]");
    for (const code of [homeCode, entrenadoresCode]) {
      expect(code).toContain("overflow-x-clip");
      expect(code).not.toContain("overflow-x-hidden");
    }
  });

  it("anti-slop: sin emojis, sin blur-3xl, sin clip-path ni polígonos, iconos SVG de trazo", () => {
    expect(landingCode).not.toMatch(/🏋️|🏋️‍♂️|📊|⚡|🔥|👥|📈|💪/);
    expect(landingCode).not.toContain("blur-3xl");
    expect(landingCode).not.toContain("clip-path");
    expect(landingCode).not.toContain("polygon");
    expect(kitCode).toContain('stroke="currentColor"');
  });

  it("todas las animaciones del relato se apagan con prefers-reduced-motion", () => {
    const reduced = globalsCode.slice(globalsCode.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const sel of [
      ".landing-nudge",
      "html.landing-scroll",
      ".landing-rise",
      ".landing-marquee-track",
      ".landing-progress",
      ".landing-strike::after",
      "[data-reveal]",
      ".landing-dot::after",
      ".landing-float",
      ".landing-pop",
      ".landing-tilt",
      ".landing-card",
      ".landing-shine::before",
    ]) {
      expect(reduced).toContain(sel);
    }
    expect(reduced).toContain("animation: none !important");
    expect(reduced).toContain("transform: none !important");
  });

  it("los enlaces internos encuadran la sección completa: el header se descuenta una sola vez", () => {
    expect(globalsCode).toMatch(/html\.landing-scroll \{[^}]*scroll-padding-top: 4rem/);
    expect(landingCode).not.toContain("scroll-mt-");
    // en pantallas bajas el capítulo se achica para entrar en un viewport
    expect(globalsCode).toContain("--landing-zoom");
  });

  it("el texto seleccionado se lee sobre cualquier fondo, también en los botones oscuros", () => {
    expect(globalsCode).toMatch(/\.landing-root \*::selection \{[^}]*color: currentColor/);
    for (const code of [homeCode, entrenadoresCode]) {
      expect(code).toContain("landing-root");
      expect(code).not.toContain("selection:text-primary");
    }
  });
});
