"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Dumbbell, History, TrendingUp } from "@/components/athlete/icons";

export const SECCIONES_ATHLETE = [
  { href: "/athlete", label: "Entrenar", Icon: Dumbbell },
  { href: "/athlete/historial", label: "Historial", Icon: History },
  { href: "/athlete/progreso", label: "Progreso", Icon: TrendingUp },
  { href: "/athlete/clases", label: "Clases", Icon: Calendar },
] as const;

/**
 * Barra de navegación inferior v7 de Athlete App.
 * Fija al pie, 4 ítems con pastilla de tinta en el activo (`aria-current="page"`).
 */
export function AthleteBottomNav() {
  const pathname = usePathname() ?? "/athlete";

  return (
    <nav className="a-bnav" aria-label="Secciones" data-testid="nav-inferior">
      {SECCIONES_ATHLETE.map(({ href, label, Icon }) => {
        const activo =
          href === "/athlete" ? pathname === "/athlete" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
          >
            <span className="a-ni">
              <Icon width={20} height={20} className="a-i" />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
