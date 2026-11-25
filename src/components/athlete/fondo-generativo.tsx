"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useAthleteStore } from "@/store/use-athlete-store";
import { deformedGridSvg, leerSemilla } from "@/lib/athlete/fondo";

/** Lienzo liso en el ejercicio, el onboarding de nombre y el cuestionario (01 §10). */
export function fondoEsLiso(params: {
  pathname: string;
  onboardingCompletado: boolean;
  ejercicioAbiertoId: string | null;
  cuestionarioAbierto: boolean;
}): boolean {
  if (!params.onboardingCompletado) return true;
  if (params.cuestionarioAbierto || params.pathname.startsWith("/athlete/cuestionario")) return true;
  return params.pathname === "/athlete" && params.ejercicioAbiertoId !== null;
}

/**
 * Deformed Grid Mesh II (SVG inline). La semilla se elige una vez por visita (sessionStorage);
 * se calcula por (tema, semilla), sin animación ni repintado al navegar.
 * Dos capas (claro/oscuro) conmutadas por la clase `.dark`, sin depender de JS para el tema.
 */
export function FondoGenerativo() {
  const pathname = usePathname() ?? "/athlete";
  const onboardingCompletado = useAthleteStore((s) => s.onboardingCompletado);
  const ejercicioAbiertoId = useAthleteStore((s) => s.ejercicioAbiertoId);
  const cuestionarioAbierto = useAthleteStore((s) => s.cuestionarioAbierto);
  const [semilla, setSemilla] = React.useState<number | null>(null);
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => {
    setSemilla(leerSemilla());
    // El estado persistido solo se conoce en cliente: evita el flash de la malla en el onboarding.
    setMontado(true);
  }, []);

  const claro = React.useMemo(
    () => (semilla === null ? "" : deformedGridSvg(false, semilla, `m3m-l-${semilla}`)),
    [semilla],
  );
  const oscuro = React.useMemo(
    () => (semilla === null ? "" : deformedGridSvg(true, semilla, `m3m-d-${semilla}`)),
    [semilla],
  );

  if (!montado || semilla === null) return null;
  if (fondoEsLiso({ pathname, onboardingCompletado, ejercicioAbiertoId, cuestionarioAbierto })) {
    return null;
  }

  const capa: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: -1,
    pointerEvents: "none",
  };
  return (
    <>
      <div
        aria-hidden="true"
        data-testid="fondo-generativo"
        data-semilla={semilla}
        className="dark:hidden"
        style={capa}
        dangerouslySetInnerHTML={{ __html: claro }}
      />
      <div
        aria-hidden="true"
        data-testid="fondo-generativo-oscuro"
        className="hidden dark:block"
        style={capa}
        dangerouslySetInnerHTML={{ __html: oscuro }}
      />
    </>
  );
}
