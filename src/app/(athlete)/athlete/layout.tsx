import * as React from "react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { OnboardingAlumno } from "@/components/athlete/onboarding-alumno";

export default function AthleteAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* Onboarding de primera vez (GOZS-145): se monta en el layout, no en page.tsx,
          para no chocar con el sub-issue del Inicio. Se auto-oculta si ya se completó. */}
      <OnboardingAlumno />
      <AthleteShell>{children}</AthleteShell>
    </>
  );
}
