"use client";

import * as React from "react";
import Link from "next/link";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useClasesStore } from "@/store/use-clases-store";
import { calcularRachaAsistenciasClases } from "@/lib/athlete-dias";
import {
  clasesUsadasEstaSemana,
  obtenerLimiteSemanalClases,
  obtenerProximaClaseReservada,
  resolverActividadesHabilitadas,
  textoRestantes,
} from "@/lib/clases";
import { Calendar } from "@/components/athlete/icons";
import { IndicadorRachaSemanas } from "@/components/athlete/indicador-racha-semanas";
import { InstalarAppCard } from "@/components/athlete/instalar-app-card";
import { RecordatorioPesoCard } from "@/components/athlete/recordatorio-peso-card";
import type { ActividadClase } from "@/types/database.types";

export interface InicioClasesProps {
  bannerMensajeNoLeido?: React.ReactNode;
}

/**
 * Inicio de Athlete App (`/athlete`) para alumnos que solo asisten a clases
 * presenciales (Funcional / Boxeo) sin plan de musculación asignado.
 */
export function InicioClases({ bannerMensajeNoLeido }: InicioClasesProps) {
  const student = useAthleteStore((s) => s.planAlumno?.alumnos[0]);
  const clases = useClasesStore((s) => s.clases);
  const misReservas = useClasesStore((s) => s.misReservas);
  const membresia = useClasesStore((s) => s.membresia);
  const plan = useClasesStore((s) => s.plan);
  const contratacionesAlumno = useClasesStore((s) => s.contratacionesAlumno);
  const actividadesAlumno = useClasesStore((s) => s.actividadesAlumno);
  const actividadesHabilitadas = useClasesStore((s) => s.actividadesHabilitadas);
  const testAhora = useClasesStore((s) => s.testAhora);

  const ahora = React.useMemo(
    () => (testAhora ? new Date(testAhora) : new Date()),
    [testAhora],
  );

  const habilitadas = React.useMemo(() => {
    if (actividadesHabilitadas.length > 0) return actividadesHabilitadas;
    return resolverActividadesHabilitadas({
      contrataciones: contratacionesAlumno,
      actividadesAlumno,
      membresia,
      plan,
      ahora,
    });
  }, [actividadesHabilitadas, contratacionesAlumno, actividadesAlumno, membresia, plan, ahora]);

  const clasesComputables = React.useMemo(() => {
    if (habilitadas.length === 0) return clases;
    const set = new Set<ActividadClase>(habilitadas);
    return clases.filter((c) => set.has(c.actividad));
  }, [clases, habilitadas]);

  const usadas = React.useMemo(
    () => clasesUsadasEstaSemana(misReservas, clasesComputables, ahora),
    [misReservas, clasesComputables, ahora],
  );

  const limite = React.useMemo(
    () => obtenerLimiteSemanalClases({ plan, actividadesAlumno, habilitadas }),
    [plan, actividadesAlumno, habilitadas],
  );

  const restantes = limite === null ? null : Math.max(limite - usadas, 0);

  const proximaClaseReservada = React.useMemo(
    () => obtenerProximaClaseReservada(misReservas, clases, ahora),
    [misReservas, clases, ahora],
  );

  const rachaSemanas = React.useMemo(
    () => calcularRachaAsistenciasClases(misReservas, clases, ahora),
    [misReservas, clases, ahora],
  );

  return (
    <div className="a-view a-anim" data-testid="inicio-clases-container">
      <div className="a-hello" data-testid="inicio-cabecera-hola">
        <h1 className="a-hello-week uppercase" data-testid="clases-inicio-titulo">
          MIS CLASES
        </h1>
        {rachaSemanas >= 1 && (
          <IndicadorRachaSemanas
            semanas={rachaSemanas}
            descripcion="Sumás racha asistiendo a al menos 1 clase por semana. La semana en curso no corta tu racha mientras siga abierta."
          />
        )}
      </div>

      {bannerMensajeNoLeido}

      <InstalarAppCard />

      <RecordatorioPesoCard student={student} />

      {proximaClaseReservada ? (
        <section
          aria-label="Próxima clase reservada"
          className="a-hero"
          data-testid="clase-reservada-card"
        >
          <div className="a-hp">
            <span className="a-t-label a-eh">PRÓXIMA CLASE</span>
            <h2 className="a-t-d uppercase mt-[6px]">
              {proximaClaseReservada.actividadLabel}
            </h2>
            <small className="a-t-sec">{proximaClaseReservada.horarioLabel}</small>
          </div>
          <Link
            href="/athlete/clases"
            className="a-btn a-hero-ghost"
            data-testid="ver-clases-btn"
          >
            Ver mis clases
          </Link>
        </section>
      ) : (
        <section
          aria-label="Sin próximas clases reservadas"
          className="a-hero"
          data-testid="sin-proxima-clase-card"
        >
          <div className="a-hp">
            <span className="a-t-label a-eh">PRÓXIMA CLASE</span>
            <h2 className="a-t-d mt-[6px]">Sin reservas futuras</h2>
            <small className="a-t-sec">Elegí tu horario para esta semana.</small>
          </div>
          <Link
            href="/athlete/clases"
            className="a-btn a-hbtn a-gym"
            data-testid="reservar-proxima-clase-cta"
          >
            <Calendar width={16} height={16} className="a-i" />
            <span>Reservá tu próxima clase</span>
          </Link>
        </section>
      )}

      <section
        className="a-card a-quota"
        aria-label="Clases de esta semana"
        data-testid="inicio-clases-contador"
      >
        {limite === null ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b className="a-t-bs">
                {usadas} {usadas === 1 ? "clase" : "clases"} esta semana
              </b>
              <span className="a-t-label a-muted">Pase libre</span>
            </div>
            <span className="a-t-sec a-muted">La semana va de lunes a domingo</span>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b className="a-t-bs">
                {usadas} de {limite} clases esta semana
              </b>
              <span className="a-t-label a-muted">Esta semana</span>
            </div>
            <div className="a-segbar" aria-hidden="true">
              <span style={{ ["--n" as string]: 2 }}>
                {Array.from({ length: limite }, (_, i) => (
                  <i key={i} className={i < usadas ? "a-on" : ""} />
                ))}
              </span>
            </div>
            <span className="a-t-sec a-muted">
              {textoRestantes(restantes ?? 0)} · la semana va de lunes a domingo
            </span>
          </>
        )}
      </section>
    </div>
  );
}
