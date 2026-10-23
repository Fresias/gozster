import { describe, it, expect, beforeEach } from "vitest";
import { useAthleteStore } from "@/store/use-athlete-store";
import { OnboardingAlumno } from "@/components/athlete/onboarding-alumno";

/**
 * GOZS-145 — Onboarding de primera vez (vista + descanso).
 *
 * Este sub-issue es el dueño de `onboardingCompletado` y `mostrarTimerDescanso`
 * en use-athlete-store. El entorno de tests es node (sin DOM), así que cubrimos
 * el contrato del store: defaults, setters, persistencia (partialize) y las dos
 * secuencias que dispara el componente: "Saltar" (valores por defecto) y
 * "Finalizar" (elección explícita del alumno).
 */

const STORAGE_KEY = "gozster-athlete-store";

type PersistedSnapshot = {
  state: {
    onboardingCompletado?: boolean;
    mostrarTimerDescanso?: boolean;
    vistaElegidaPorAlumno?: unknown;
    nivelVistaAlumno?: unknown;
  };
};

/** Aplica los valores por defecto, igual que el handler "Saltar" del onboarding. */
function saltarOnboarding() {
  const s = useAthleteStore.getState();
  s.usarVistaRecomendada();
  s.setMostrarTimerDescanso(true);
  s.setOnboardingCompletado(true);
}

/** Guarda la elección del alumno, igual que el handler "Finalizar" del onboarding. */
function finalizarOnboarding(
  vista: "SIMPLE" | "TECNICA",
  mostrarTimer: boolean,
) {
  const s = useAthleteStore.getState();
  s.setNivelVistaAlumno(vista);
  s.setMostrarTimerDescanso(mostrarTimer);
  s.setOnboardingCompletado(true);
}

describe("GOZS-145: onboarding del alumno — preferencias de vista y descanso", () => {
  beforeEach(() => {
    // Volver a un estado de primera vez, con el coach recomendando SIMPLE.
    useAthleteStore.setState({
      onboardingCompletado: false,
      mostrarTimerDescanso: true,
      vistaElegidaPorAlumno: null,
      nivelVistaAlumno: "SIMPLE",
      vistaRecomendadaCoach: "SIMPLE",
    });
  });

  it("exporta el componente de onboarding", () => {
    expect(typeof OnboardingAlumno).toBe("function");
  });

  it("arranca con los valores por defecto: onboarding sin completar y timer visible", () => {
    const state = useAthleteStore.getState();
    expect(state.onboardingCompletado).toBe(false);
    expect(state.mostrarTimerDescanso).toBe(true);
  });

  it("'Saltar' aplica los valores por defecto (vista recomendada + timer visible)", () => {
    // El coach recomienda TECNICA; el alumno no elige nada y salta.
    useAthleteStore.setState({ vistaRecomendadaCoach: "TECNICA" });

    saltarOnboarding();

    const state = useAthleteStore.getState();
    expect(state.onboardingCompletado).toBe(true);
    // Timer visible por defecto.
    expect(state.mostrarTimerDescanso).toBe(true);
    // Se aplica la vista recomendada por el coach, sin fijar una elección propia.
    expect(state.vistaElegidaPorAlumno).toBeNull();
    expect(state.nivelVistaAlumno).toBe("TECNICA");
  });

  it("'Finalizar' guarda la elección explícita del alumno en vistaElegidaPorAlumno", () => {
    // El coach recomienda SIMPLE pero el alumno elige TECNICA y apaga el timer.
    finalizarOnboarding("TECNICA", false);

    const state = useAthleteStore.getState();
    expect(state.onboardingCompletado).toBe(true);
    expect(state.mostrarTimerDescanso).toBe(false);
    expect(state.vistaElegidaPorAlumno).toBe("TECNICA");
    expect(state.nivelVistaAlumno).toBe("TECNICA");
  });

  it("persiste las preferencias del onboarding (partialize) para que no reaparezca al recargar", () => {
    finalizarOnboarding("SIMPLE", false);

    const storage = useAthleteStore.persist.getOptions().storage;
    expect(storage).toBeDefined();

    const snapshot = storage!.getItem(STORAGE_KEY) as PersistedSnapshot | null;
    expect(snapshot).not.toBeNull();
    // Ambos campos quedan en el snapshot persistido.
    expect(snapshot!.state.onboardingCompletado).toBe(true);
    expect(snapshot!.state.mostrarTimerDescanso).toBe(false);
  });

  it("al rehidratar desde storage conserva que el onboarding ya se completó", () => {
    // Simula un estado persistido de una sesión previa y rehidrata.
    const storage = useAthleteStore.persist.getOptions().storage!;
    storage.setItem(STORAGE_KEY, {
      state: {
        onboardingCompletado: true,
        mostrarTimerDescanso: false,
      },
      version: 0,
    } as never);

    useAthleteStore.persist.rehydrate();

    const state = useAthleteStore.getState();
    expect(state.onboardingCompletado).toBe(true);
    expect(state.mostrarTimerDescanso).toBe(false);
  });
});
