import * as React from "react";
import localFont from "next/font/local";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { OnboardingAlumno } from "@/components/athlete/onboarding-alumno";
import "./athlete-v7.css";

const archivo = localFont({
  src: "./fonts/archivo-latin.woff2",
  weight: "800 900",
  variable: "--a-f-display",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

const geist = localFont({
  src: "./fonts/geist-latin.woff2",
  weight: "400 700",
  variable: "--a-f-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  weight: "600 700",
  variable: "--a-f-mono",
  display: "swap",
});

export default function AthleteAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`theme-athlete ${archivo.variable} ${geist.variable} ${geistMono.variable}`}
      data-v7=""
    >
      {/* Onboarding de primera vez (GOZS-145): se monta en el layout, no en page.tsx,
          para no chocar con el sub-issue del Inicio. Se auto-oculta si ya se completó. */}
      <OnboardingAlumno />
      <AthleteShell>{children}</AthleteShell>
    </div>
  );
}
