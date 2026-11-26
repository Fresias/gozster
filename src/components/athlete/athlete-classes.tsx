"use client";

import * as React from "react";
import { NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";
import { Check, CloudOff, X } from "@/components/athlete/icons";
import {
  claveDia,
  clasesUsadas,
  diasDeLaSemana,
  estadoTarjetaClase,
  horaLocal,
  inicioPeriodoRenovacion,
  ocupaCupo,
  resolverActividadesHabilitadas,
  type EstadoTarjetaClase,
} from "@/lib/clases";
import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { ActividadClase, Clase, Reserva } from "@/types/database.types";

const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "Quedan 2 lugares" · "Queda 1 lugar" · "Completa" · "Cupo libre". */
export function textoCupo(capacidad: number | null, libres: number | null): string {
  if (capacidad === null || libres === null) return "Cupo libre";
  if (libres <= 0) return "Completa";
  return libres === 1 ? "Queda 1 lugar" : `Quedan ${libres} lugares`;
}

/** "Te queda 1 clase" · "Te quedan 2 clases" · "No te quedan clases". */
export function textoRestantes(restantes: number): string {
  if (restantes <= 0) return "No te quedan clases";
  return restantes === 1 ? "Te queda 1 clase" : `Te quedan ${restantes} clases`;
}

/** Celdas del mes (lunes a domingo): `null` para los huecos previos al día 1. */
function celdasDelMes(base: Date): Array<{ clave: string; numero: number } | null> {
  const anio = base.getFullYear();
  const mes = base.getMonth();
  const primero = new Date(anio, mes, 1, 12);
  const huecos = (primero.getDay() + 6) % 7;
  const total = new Date(anio, mes + 1, 0).getDate();
  const celdas: Array<{ clave: string; numero: number } | null> = Array.from({ length: huecos }, () => null);
  for (let d = 1; d <= total; d++) celdas.push({ clave: claveDia(new Date(anio, mes, d, 12)), numero: d });
  return celdas;
}

// Athlete App v7 · Clases: semana (vista principal) o mes, cupo semanal y reservas con motivo.
export function AthleteClasses() {
  const {
    clases,
    misReservas,
    agendaReservas,
    membresia,
    plan,
    contratacionesAlumno,
    actividadesAlumno,
    actividadesHabilitadas,
    sinCupo,
    actualizadoAt,
    cargando,
    accionEnCurso,
    error,
    aviso,
    cargarClasesAlumno,
    reservar,
    cancelarReserva,
    limpiarMensajes,
  } = useClasesStore();

  const isOnline = useOfflineQueueStore((s) => s.isOnline);

  const ahora = React.useMemo(() => new Date(), []);
  const hoy = claveDia(ahora);
  const dias = React.useMemo(() => diasDeLaSemana(), []);
  const celdasMes = React.useMemo(() => celdasDelMes(ahora), [ahora]);
  const [vista, setVista] = React.useState<"semana" | "mes">("semana");
  const [dia, setDia] = React.useState(hoy);
  const [porCancelar, setPorCancelar] = React.useState<{ clase: Clase; reserva: Reserva } | null>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    void cargarClasesAlumno();
  }, [cargarClasesAlumno]);

  React.useEffect(() => {
    if (porCancelar) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [porCancelar]);

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

  const habilitadasSet = React.useMemo(() => new Set<ActividadClase>(habilitadas), [habilitadas]);

  const visibles = React.useMemo(
    () => clases.filter((c) => habilitadasSet.has(c.actividad)),
    [clases, habilitadasSet],
  );

  const reservaPorClase = new Map(
    misReservas.filter((r) => r.estado !== "CANCELADO").map((r) => [r.clase_id, r]),
  );
  const usadas = clasesUsadas(misReservas, visibles);
  const limite =
    plan?.limite_semanal ??
    actividadesAlumno.find(
      (a) => habilitadasSet.has(a.actividad as ActividadClase) && !a.pase_libre,
    )?.veces_por_semana ??
    null;
  const restantes = limite === null ? null : Math.max(limite - usadas, 0);

  const clasesPorDia = React.useMemo(() => {
    const m = new Map<string, Clase[]>();
    for (const c of visibles) {
      const k = claveDia(c.inicio);
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [visibles]);
  const diasConReserva = new Set(
    visibles.filter((c) => reservaPorClase.get(c.id)?.estado === "ANOTADO").map((c) => claveDia(c.inicio)),
  );
  const delDia = clasesPorDia.get(dia) ?? [];

  const ocupacionClase = (claseId: string) =>
    agendaReservas.filter((r) => r.clase_id === claseId && ocupaCupo(r)).length;

  const etiquetaDia = (clave: string, nombre: string) => {
    const n = clasesPorDia.get(clave)?.length ?? 0;
    const partes = [nombre];
    if (clave === hoy) partes.push("hoy");
    if (n) partes.push(n === 1 ? "1 clase" : `${n} clases`);
    if (diasConReserva.has(clave)) partes.push("reservada");
    return partes.join(", ");
  };

  const fechaSeleccionada = new Date(`${dia}T12:00:00`);
  const tituloDia = `${DIAS_LARGO[fechaSeleccionada.getDay()]} ${fechaSeleccionada.getDate()}${dia === hoy ? " · hoy" : ""}`;

  const accion = (
    estado: EstadoTarjetaClase,
    clase: Clase,
    reserva: Reserva | null,
    ocupado: boolean,
  ): React.ReactNode => {
    switch (estado) {
      case "DISPONIBLE":
        return !isOnline ? (
          <button type="button" className="a-btn" disabled data-testid="book-class-btn">
            Necesitás conexión para reservar
          </button>
        ) : (
          <button
            type="button"
            className="a-btn"
            disabled={ocupado}
            onClick={() => void reservar(clase.id)}
            data-testid="book-class-btn"
          >
            {ocupado ? "Reservando…" : "Reservar cupo"}
          </button>
        );
      case "RESERVADA":
        return !isOnline ? (
          <button
            type="button"
            className="a-btn a-ghost"
            disabled
            data-testid="cancel-booking-btn"
          >
            Necesitás conexión para cancelar
          </button>
        ) : (
          <button
            type="button"
            className="a-btn a-ghost"
            disabled={ocupado || !reserva}
            onClick={() => reserva && setPorCancelar({ clase, reserva })}
            data-testid="cancel-booking-btn"
          >
            <Check width={18} height={18} className="a-i" /> {ocupado ? "Cancelando…" : "Reservada · Cancelar"}
          </button>
        );
      case "RESERVADA_INICIADA":
        return <button type="button" className="a-btn a-ghost" disabled>Asististe</button>;
      case "AUSENTE":
        return <button type="button" className="a-btn a-ghost" disabled>Quedaste ausente · cuenta en tu semana</button>;
      case "CANCELADA":
        return (
          <button type="button" className="a-btn a-ghost" disabled>
            Clase cancelada{clase.motivo_cancelacion ? `: ${clase.motivo_cancelacion}` : ""}
          </button>
        );
      case "INICIADA":
        return <button type="button" className="a-btn a-ghost" disabled>Clase pasada</button>;
      case "SIN_CUPO":
        return <button type="button" className="a-btn a-ghost" disabled>Clase completa</button>;
      case "LIMITE":
        return (
          <button type="button" className="a-btn" disabled data-testid="attempt-limit-class-btn">
            Ya usaste tus {limite} clases de la semana
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="clases-titulo" data-testid="athlete-classes">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h1 id="clases-titulo" className="a-t-d">Clases</h1>
        <div className="a-seg" role="group" aria-label="Vista de clases" style={{ flex: "0 1 180px", minWidth: 150 }}>
          <button type="button" aria-pressed={vista === "semana"} onClick={() => setVista("semana")}>Semana</button>
          <button type="button" aria-pressed={vista === "mes"} onClick={() => setVista("mes")}>Mes</button>
        </div>
      </div>

      {!isOnline && (
        <p className="a-eb a-t-label a-offnote" role="status" data-testid="athlete-offline-banner">
          <CloudOff width={12} height={12} className="a-i" /> Sin conexión · Estás sin señal. Para reservar o cancelar clases volvé a intentarlo en verde (Online).
        </p>
      )}

      <section className="a-card a-quota" data-testid="weekly-allowance">
        {limite === null ? (
          <b className="a-t-bs">{plan || habilitadas.length > 0 ? "Pase libre esta semana" : "Sin membresía de clases"}</b>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b className="a-t-bs">{usadas} de {limite} clases usadas</b>
              <span className="a-t-label a-muted">Esta semana</span>
            </div>
            <div className="a-segbar" aria-hidden="true">
              <span style={{ ["--n" as string]: 2 }}>
                {Array.from({ length: limite }, (_, i) => (
                  <i key={i} className={i < usadas ? "a-on" : ""} />
                ))}
              </span>
            </div>
            <span className="a-t-sec a-muted">{textoRestantes(restantes ?? 0)} · la semana va de lunes a domingo</span>
          </>
        )}
      </section>

      {vista === "semana" ? (
        <div className="a-week" role="group" aria-label="Días de la semana" data-testid="days-strip">
          {dias.map((d) => {
            const reservada = diasConReserva.has(d.clave);
            const hay = (clasesPorDia.get(d.clave)?.length ?? 0) > 0;
            return (
              <button
                key={d.clave}
                type="button"
                className="a-wd"
                aria-pressed={dia === d.clave}
                aria-label={etiquetaDia(d.clave, `${d.etiqueta} ${d.numero}`)}
                onClick={() => setDia(d.clave)}
              >
                <small>{d.etiqueta}</small>
                <span className="a-t-bs">{d.numero}</span>
                <span className="a-mk">
                  {reservada ? <Check width={11} height={11} className="a-i" /> : hay ? <i className="a-dot" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <section className="a-card a-cal" data-testid="month-grid">
          <b className="a-t-bs">{MESES[ahora.getMonth()]} {ahora.getFullYear()}</b>
          <div className="a-cal-grid">
            {["L", "M", "M", "J", "V", "S", "D"].map((x, i) => (
              <span key={`dow-${i}`} className="a-dow a-t-label" aria-hidden="true">{x}</span>
            ))}
            {celdasMes.map((c, i) => {
              if (!c) return <span key={`out-${i}`} className="a-day a-out a-t-sec" aria-hidden="true" />;
              const reservada = diasConReserva.has(c.clave);
              const hay = (clasesPorDia.get(c.clave)?.length ?? 0) > 0;
              return (
                <button
                  key={c.clave}
                  type="button"
                  className={`a-day a-t-sec ${reservada ? "a-res" : ""} ${c.clave === hoy ? "a-today" : ""}`}
                  aria-pressed={dia === c.clave}
                  aria-label={etiquetaDia(c.clave, `${c.numero} de ${MESES[ahora.getMonth()]}`)}
                  onClick={() => setDia(c.clave)}
                >
                  <b>{c.numero}</b>
                  {reservada ? <Check width={11} height={11} className="a-i" /> : hay ? <i className="a-dot" /> : null}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="a-legend a-t-sec">
        <span><i className="a-lg-dot" />hay clases</span>
        <span><Check width={12} height={12} className="a-i" /> reservada</span>
        <span><i className="a-lg-today" />hoy</span>
        <span>
          <i
            className="a-lg-today"
            style={{ background: "transparent", outline: "2px solid var(--a-fg)", outlineOffset: 1 }}
          />
          día elegido
        </span>
      </div>

      {(error || aviso) && (
        <div role="alert" className="a-info a-t-sec" data-testid="alert-message">
          <span style={{ flex: 1 }}>{error ?? aviso}</span>
          <button type="button" className="a-icon-btn" onClick={limpiarMensajes} aria-label="Cerrar aviso">
            <X width={16} height={16} className="a-i" />
          </button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <p className="a-eb a-t-label">{tituloDia}</p>
        {habilitadas.length > 0 && (
          <span className="a-t-sec a-muted" data-testid="plan-activity-filter">
            {habilitadas.length === 1
              ? `Tu actividad: ${NOMBRE_ACTIVIDAD[habilitadas[0]!]}`
              : `Tus actividades: ${habilitadas.map((a) => NOMBRE_ACTIVIDAD[a]).join(" · ")}`}
          </span>
        )}
      </div>

      {cargando && clases.length === 0 ? (
        <p className="a-t-sec a-muted" role="status" style={{ textAlign: "center" }}>Cargando clases…</p>
      ) : habilitadas.length === 0 ? (
        <section className="a-card a-state" data-testid="no-enabled-activities-empty">
          <b className="a-t-bs">Todavía no tenés actividades habilitadas</b>
          <p className="a-t-sec">
            Pedile a tu entrenador que habilite Funcional o Boxeo desde Studio para ver y reservar tus clases.
          </p>
        </section>
      ) : delDia.length === 0 ? (
        <section className="a-card a-state">
          <b className="a-t-bs">{actualizadoAt ? "No hay clases este día" : "Todavía no hay clases cargadas"}</b>
          <p className="a-t-sec">Elegí otro día de la semana.</p>
        </section>
      ) : (
        delDia.map((clase) => {
          const reserva = reservaPorClase.get(clase.id) ?? null;
          const libres = clase.capacidad !== null ? Math.max(0, clase.capacidad - ocupacionClase(clase.id)) : null;
          const llena = sinCupo.includes(clase.id) || (clase.capacidad !== null && libres === 0);
          const estado = estadoTarjetaClase({ clase, reserva, usadas, limiteSemanal: limite, sinCupo: llena });
          const renovacion = inicioPeriodoRenovacion(clase, membresia);
          const ocupado = accionEnCurso === clase.id || (reserva !== null && accionEnCurso === reserva.id);
          return (
            <section key={clase.id} className="a-card a-ccl" data-testid="class-booking-card">
              <div className="a-m">
                <span className="a-t-mm">{horaLocal(clase.inicio)}</span>
                <span className="a-chip a-t-label" data-testid="class-status" data-estado={estado}>
                  {NOMBRE_ACTIVIDAD[clase.actividad]}
                </span>
              </div>
              <span className="a-t-sec a-muted" data-testid="class-spots">
                {clase.duracion_minutos} min · {textoCupo(clase.capacidad, libres)}
              </span>
              {(estado === "RESERVADA" || estado === "RESERVADA_INICIADA") &&
                Boolean(clase.nota?.trim()) && (
                  <p className="a-t-sec" data-testid="clase-reservada-nota">
                    {clase.nota!.trim()}
                  </p>
                )}
              {renovacion && estado === "DISPONIBLE" && (
                <p className="a-info a-t-sec" data-testid="renewal-period-banner">
                  Esta clase corresponde a tu período de renovación a partir del {renovacion}.
                </p>
              )}
              {accion(estado, clase, reserva, ocupado)}
            </section>
          );
        })
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setPorCancelar(null)}
        className="a-card"
        style={{ margin: "auto", width: "min(92vw, 24rem)", padding: 20 }}
        aria-labelledby="cancelar-reserva-titulo"
      >
        {porCancelar && (
          <div className="flex flex-col gap-3">
            <h2 id="cancelar-reserva-titulo" className="a-t-h">¿Cancelar tu reserva?</h2>
            <p className="a-t-body a-muted">
              {NOMBRE_ACTIVIDAD[porCancelar.clase.actividad]} a las {horaLocal(porCancelar.clase.inicio)}. Liberás el cupo y
              la clase deja de contar en tu semana. Podés cancelar hasta que empiece.
            </p>
            <button
              type="button"
              className="a-btn a-danger"
              onClick={() => {
                const { reserva } = porCancelar;
                setPorCancelar(null);
                void cancelarReserva(reserva.id);
              }}
              data-testid="confirm-cancel-reserva-btn"
            >
              Sí, cancelar
            </button>
            <button type="button" className="a-btn a-ghost" onClick={() => setPorCancelar(null)}>
              Mantener reserva
            </button>
          </div>
        )}
      </dialog>
    </section>
  );
}
