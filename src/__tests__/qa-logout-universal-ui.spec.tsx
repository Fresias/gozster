import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/studio/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id", email: "coach@gozster.com" } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

import { StudioShell } from "@/components/coach/studio-shell";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { LandingSessionCapsule } from "@/components/landing-session-capsule";
import HomePage from "@/app/page";

describe("GOZS-340 UI: Botón y accesibilidad de Cerrar Sesión en Studio, Athlete y Landing", () => {
  it("GIVEN un usuario en Coach Studio (/studio) THEN visualiza botones accesibles de Cerrar Sesión", () => {
    const html = renderToStaticMarkup(
      <StudioShell>
        <div>Contenido Studio</div>
      </StudioShell>,
    );

    // Botón visible y accesible en header y mobile
    expect(html).toContain('aria-label="Cerrar sesión"');
    expect(html).toContain("Cerrar Sesión");
  });

  it("GIVEN un alumno en Athlete App (/athlete) THEN visualiza botón accesible de Cerrar Sesión", () => {
    const html = renderToStaticMarkup(
      <AthleteShell>
        <div>Contenido Athlete</div>
      </AthleteShell>,
    );

    expect(html).toContain('aria-label="Cerrar sesión"');
    expect(html).toContain("Cerrar Sesión");
  });

  it("GIVEN la nueva Landing SaaS (HomePage) THEN incluye la cápsula de sesión para detección y logout", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("Iniciar Sesión");
    expect(html).toContain("Entrenamiento basado en evidencia");
    expect(html).toContain("Coach Studio");
    expect(html).toContain("Athlete App");
  });

  it("GIVEN sesión activa en la Landing THEN muestra cápsula con datos del usuario y botón directo Cerrar Sesión", () => {
    const html = renderToStaticMarkup(
      <LandingSessionCapsule initialUser={{ email: "atleta@gozster.com", nombre: "Atleta Pro" }} />,
    );

    expect(html).toContain('data-testid="landing-session-capsule"');
    expect(html).toContain("Atleta Pro");
    expect(html).toContain('aria-label="Cerrar sesión"');
    expect(html).toContain("Cerrar Sesión");
  });
});
