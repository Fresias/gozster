import * as React from "react";
import * as fs from "node:fs";
import * as path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@/test-utils/no-demo-literals";
import { supabase } from "@/lib/supabase/client";
import * as alumnosService from "@/services/alumnos-service";

vi.mock("next/navigation", () => ({
  usePathname: () => "/athlete/historial",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-id", email: "atleta@gozster.com" } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
  SUPABASE_URL: "http://127.0.0.1:9",
  SUPABASE_ANON_KEY: "test-anon-key",
}));

vi.mock("@/lib/supabase/client", async () => {
  const { createSupabaseClientMock } = await import("./helpers/supabase-client-mock");
  return { supabase: createSupabaseClientMock({ rpcData: true }) };
});

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) =>
      sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState(),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) =>
      sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState(),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

vi.mock("@/store/use-chat-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-chat-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) =>
      sel ? sel(mod.useChatStore.getState()) : mod.useChatStore.getState(),
    mod.useChatStore,
  );
  return { ...mod, useChatStore: hook };
});

import { AthleteShell } from "@/components/athlete/athlete-shell";
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import { OnboardingAlumno } from "@/components/athlete/onboarding-alumno";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("Athlete v7 · FE-11 Onboarding de 4 pasos y cierre", () => {
  const onboardingPath = path.resolve(__dirname, "../components/athlete/onboarding-alumno.tsx");
  const cierrePath = path.resolve(__dirname, "../components/athlete/cierre-dia-modal.tsx");
  const onboardingCode = fs.readFileSync(onboardingPath, "utf8");
  const cierreCode = fs.readFileSync(cierrePath, "utf8");

  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      planAlumno: null,
      onboardingCompletado: false,
      onboardingCompletadoPendiente: false,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "SIMPLE",
      vistaRecomendadaCoach: "SIMPLE",
      nombrePreferido: null,
      nombrePreferidoPendiente: undefined,
      cierreAbierto: false,
      toastSesion: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Onboarding de 4 pasos (02-pantallas.md §10)", () => {
    it("define los 4 pasos, paso 2 con testid onboarding-paso-nombre, autocomplete=nickname, maxLength=30 y guardarNombrePreferido", () => {
      expect(onboardingCode).toContain("Paso 1 de 4");
      expect(onboardingCode).toContain("Paso {paso} de 4");
      expect(onboardingCode).toContain('data-testid="onboarding-paso-nombre"');
      expect(onboardingCode).toContain('autoComplete="nickname"');
      expect(onboardingCode).toContain("maxLength={30}");
      expect(onboardingCode).toContain("guardarNombrePreferido");
      expect(onboardingCode).toContain("¿Cómo querés que te llamemos?");
      expect(onboardingCode).toContain("¿Cómo querés ver tus ejercicios?");
      expect(onboardingCode).toContain("¿Querés ver el descanso después de cada serie?");
      expect(onboardingCode).toContain("Listo, ver mis días");
    });

    it("usa clases v7 (.a-dk, .a-onb-wrap, .a-preview, .a-opt) sin colores viejos ni emojis", () => {
      expect(onboardingCode).toContain("a-dk a-dk-onb");
      expect(onboardingCode).toContain("a-onb-wrap");
      expect(onboardingCode).toContain("a-preview");
      expect(onboardingCode).toContain("a-opt");
      expect(onboardingCode).not.toContain("a-chev");
      expect(onboardingCode).not.toMatch(/🎬|🏆|#[0-9a-fA-F]{6}/);
    });

    it("no renderiza cuando onboardingCompletado es true", () => {
      useAthleteStore.setState({ onboardingCompletado: true });
      const html = renderToStaticMarkup(<OnboardingAlumno nombreAlumno="Lucía Fernández" />);
      expect(html).toBe("");
    });

    it("sin nombreAlumno prop y con planAlumno null devuelve vacío aunque currentSession sea Tomás Villalba (GH #548)", () => {
      const { container } = render(<OnboardingAlumno />);
      expect(container.innerHTML).toBe("");
      expect(container.textContent).not.toContain("Fernando");
    });

    it("con planAlumno cargado (Gabriel Sanchez) muestra 'Hola, Gabriel.' y al completar o saltar llama a completar_onboarding_alumno", async () => {
      const rpc = vi
        .spyOn(supabase, "rpc")
        .mockResolvedValue({ data: true, error: null } as never);

      useAthleteStore.setState({
        planAlumno: {
          alumnos: [
            {
              id: "11111111-1111-4111-8111-111111111109",
              email: "gabriel@gozster.test",
              nombre_completo: "Gabriel Sanchez",
              rol: "ALUMNO",
              estado_membresia: "ACTIVA",
              profesor_asignado_id: null,
              fecha_baja: null,
              created_at: "2026-11-01T00:00:00Z",
              updated_at: "2026-11-01T00:00:00Z",
              onboarding_completado: false,
            } as any,
          ],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
        },
      });

      const { container, getByRole } = render(<OnboardingAlumno />);
      expect(container.textContent).toContain("Hola, Gabriel.");
      expect(container.textContent).not.toContain("Fernando");

      fireEvent.click(getByRole("button", { name: "Empezar" }));
      fireEvent.click(getByRole("button", { name: "Continuar" }));
      fireEvent.click(getByRole("button", { name: /Continuar con/i }));
      fireEvent.click(getByRole("button", { name: "Listo, ver mis días" }));

      await vi.waitFor(() => {
        expect(rpc).toHaveBeenCalledWith("completar_onboarding_alumno");
      });
      expect(useAthleteStore.getState().onboardingCompletado).toBe(true);
      expect(useAthleteStore.getState().onboardingCompletadoPendiente).toBe(false);

      rpc.mockClear();
      useAthleteStore.setState({ onboardingCompletado: false, onboardingCompletadoPendiente: false });
      const { getByRole: getByRoleSaltar } = render(<OnboardingAlumno />);
      fireEvent.click(getByRoleSaltar("button", { name: "Saltar" }));
      await vi.waitFor(() => {
        expect(rpc).toHaveBeenCalledWith("completar_onboarding_alumno");
      });
      expect(useAthleteStore.getState().onboardingCompletado).toBe(true);
    });

    it("cargarPlanAlumno() sincroniza onboardingCompletado desde perfiles.onboarding_completado y limpia defaultSession sin días (GH #548)", async () => {
      const fetchSpy = vi.spyOn(alumnosService, "fetchPlanAlumno").mockResolvedValue({
        alumnos: [
          {
            id: "11111111-1111-4111-8111-111111111109",
            email: "gabriel@gozster.test",
            nombre_completo: "Gabriel Sanchez",
            rol: "ALUMNO",
            estado_membresia: "ACTIVA",
            profesor_asignado_id: null,
            fecha_baja: null,
            created_at: "2026-11-01T00:00:00Z",
            updated_at: "2026-11-01T00:00:00Z",
            onboarding_completado: true,
          } as any,
        ],
        planes: [],
        dias: [],
        ejerciciosEnRutina: [],
        ejercicios: [],
      });

      await useAthleteStore.getState().cargarPlanAlumno();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const state = useAthleteStore.getState();
      expect(state.onboardingCompletado).toBe(true);
      expect(state.currentSession.studentId).toBe("11111111-1111-4111-8111-111111111109");
      expect(state.currentSession.studentName).toBe("Gabriel Sanchez");
      expect(state.currentSession.ejercicios).toEqual([]);

      const { container } = render(<OnboardingAlumno />);
      expect(container.innerHTML).toBe("");
    });

    it("completarOnboarding() guarda pendiente offline y sincronizarOnboardingPendiente() reintenta al volver online", async () => {
      useOfflineQueueStore.setState({ isOnline: false });
      const rpc = vi
        .spyOn(supabase, "rpc")
        .mockResolvedValue({ data: true, error: null } as never);

      const resOffline = await useAthleteStore.getState().completarOnboarding();
      expect(resOffline).toEqual({ success: true, offline: true });
      expect(rpc).not.toHaveBeenCalled();
      expect(useAthleteStore.getState().onboardingCompletado).toBe(true);
      expect(useAthleteStore.getState().onboardingCompletadoPendiente).toBe(true);

      useOfflineQueueStore.setState({ isOnline: true });
      const synced = await useAthleteStore.getState().sincronizarOnboardingPendiente();
      expect(synced).toBe(true);
      expect(rpc).toHaveBeenCalledWith("completar_onboarding_alumno");
      expect(useAthleteStore.getState().onboardingCompletadoPendiente).toBe(false);

      const shellCode = fs.readFileSync(
        path.resolve(__dirname, "../components/athlete/athlete-shell.tsx"),
        "utf8",
      );
      expect(shellCode).toContain("sincronizarOnboardingPendiente");
    });
  });

  describe("Cierre de sesión v7 (02-pantallas.md §4)", () => {
    it("muestra pantalla oscura .a-dk.a-dk-cierre con nombrePreferido y sin ranking (D-33)", () => {
      const html = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={2400}
          seriesCompletadas={13}
          totalSeries={13}
          duracionMinutos={54}
          metaDiasSemana={3}
          diasCompletadosSemana={1}
          studentName="Lucía Fernández"
          nombrePreferido="Lu"
          diaNombre="DÍA 1"
        />,
      );

      expect(html).toContain('class="a-dk a-dk-cierre"');
      expect(html).toContain("Guardada y sincronizada");
      expect(html).toContain("¡Gran entrenamiento, Lu!");
      expect(html).toContain("Completaste DÍA 1");
      expect(html).toContain("13/13");
      expect(html).toContain("100% completadas");
      expect(html).toContain("54&#x27;");
      expect(html).toContain("Racha semanal: 1 de 3 días");
      expect(html).toContain("Volver al inicio");
      expect(html).not.toContain("cierre-dia-ranking-constancia");
      expect(html).not.toContain("🏆");
    });

    it("muestra estado sin señal con series pendientes en el teléfono", () => {
      const html = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1200}
          seriesCompletadas={13}
          totalSeries={13}
          duracionMinutos={54}
          studentName="Lucía Fernández"
          diaNombre="DÍA 1"
          isOffline={true}
          seriesPendientes={3}
        />,
      );

      expect(html).toContain("Guardada en el teléfono");
      expect(html).toContain("Completaste DÍA 1 · 3 series se envían cuando vuelva la señal");
    });

    it("oculta 1RM en vista Simple y lo muestra en vista Técnica dentro de tarjetas PR doradas (.a-prc)", () => {
      const prs = [
        {
          exerciseName: "Press banca plano",
          peso_kg: 47.5,
          reps_hechas: 8,
          epley_kg: 60,
        },
      ];

      const htmlSimple = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1000}
          seriesCompletadas={10}
          totalSeries={10}
          recordsObtenidos={prs}
          esVistaTecnica={false}
        />,
      );
      expect(htmlSimple).toContain('class="a-prc"');
      expect(htmlSimple).toContain("Nuevo PR · Press banca plano");
      expect(htmlSimple).toContain("47,5 kg × 8");
      expect(htmlSimple).not.toContain("1RM ~60 kg");

      const htmlTec = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1000}
          seriesCompletadas={10}
          totalSeries={10}
          recordsObtenidos={prs}
          esVistaTecnica={true}
        />,
      );
      expect(htmlTec).toContain("47,5 kg × 8 · 1RM ~60 kg");
      expect(cierreCode).not.toMatch(/border-amber-|🏆|#[0-9a-fA-F]{6}/);
    });

    it("redondea 1RM decimal y formatea peso corporal sin '0 kg' en .a-prc (FE-06 CP2)", () => {
      const html = renderToStaticMarkup(
        <CierreDiaModal
          isOpen={true}
          onClose={() => {}}
          tonelajeKg={1000}
          seriesCompletadas={10}
          totalSeries={10}
          recordsObtenidos={[
            {
              exerciseName: "Press banca plano",
              peso_kg: 47.5,
              reps_hechas: 8,
              epley_kg: 60.1667,
            },
            {
              exerciseName: "Dominadas",
              peso_kg: 0,
              reps_hechas: 14,
              epley_kg: null,
            },
          ]}
          esVistaTecnica={true}
        />,
      );
      expect(html).toContain("47,5 kg × 8 · 1RM ~60 kg");
      expect(html).not.toContain("60.1667");
      expect(html).toContain("14 reps");
      expect(html).not.toContain("0 kg × 14");
    });
  });

  describe("Toast de sesión guardada (toast-sesion)", () => {
    it("AthleteShell renderiza toast-sesion con estilo .a-toast.a-ok.a-show al volver del cierre", () => {
      useAthleteStore.setState({
        onboardingCompletado: true,
        toastSesion: {
          mensaje: "Sesión guardada en tu historial",
          tipo: "ok",
          irAHistorial: false,
        },
      });

      const html = renderToStaticMarkup(
        <AthleteShell>
          <div>Historial</div>
        </AthleteShell>,
      );

      expect(html).toContain('data-testid="toast-sesion"');
      expect(html).toContain("a-toast a-t-sec a-show a-ok");
      expect(html).toContain("Sesión guardada en tu historial");
    });

    it("AthleteShell renderiza toast-record con estilo .a-toast.a-rec y copa sin fondo (01 §8)", () => {
      useAthleteStore.setState({
        onboardingCompletado: true,
        toastSesion: {
          mensaje: "Nuevo récord en Press banca plano",
          tipo: "rec",
        },
      });

      const html = renderToStaticMarkup(
        <AthleteShell>
          <div>Ejercicio</div>
        </AthleteShell>,
      );

      expect(html).toContain('data-testid="toast-sesion"');
      expect(html).toContain("a-toast a-t-sec a-show a-rec");
      expect(html).toContain('class="a-tic"');
      expect(html).toContain("Nuevo récord en Press banca plano");
      useAthleteStore.setState({ toastSesion: null });
    });
  });
});
