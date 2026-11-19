import * as React from "react";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { AthleteSessionNavigator } from "@/components/athlete/athlete-session-navigator";
import { OnboardingAlumno } from "@/components/athlete/onboarding-alumno";
import "./athlete-v7.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--a-f-display",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--a-f-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["600", "700"],
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
      <AthleteSessionNavigator />
      <AthleteShell>{children}</AthleteShell>
    </div>
  );
}
