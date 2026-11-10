import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coach Studio para entrenadores — GOZSter",
  description:
    "La herramienta de Gonzalo Salas para entrenadores: armá rutinas con tu método, seguí a cada alumno y ordená tus clases y cuotas en un solo lugar.",
};

export default function EntrenadoresLayout({ children }: { children: React.ReactNode }) {
  return children;
}
