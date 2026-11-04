"use client";

import * as React from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { useClasesStore } from "@/store/use-clases-store";

export type ActividadTipo = "FUNCIONAL" | "BOXEO" | "RUTINAS";

export interface ActividadConfiguracion {
  actividad: ActividadTipo;
  veces_por_semana: number | null; // 1..7 o null si pase_libre
  pase_libre: boolean;
}

export interface HorarioClaseDisponible {
  id: string;
  actividad: "FUNCIONAL" | "BOXEO";
  dia_semana: number; // 1 = Lunes ... 7 = Domingo
  dia_nombre: string;
  hora_inicio: string; // "18:00"
  duracion_minutos?: number;
  capacidad?: number | null;
}

export const HORARIOS_PREDETERMINADOS: HorarioClaseDisponible[] = [
  { id: "horario-func-lun-18", actividad: "FUNCIONAL", dia_semana: 1, dia_nombre: "Lunes", hora_inicio: "18:00", duracion_minutos: 60, capacidad: 8 },
  { id: "horario-func-mar-17", actividad: "FUNCIONAL", dia_semana: 2, dia_nombre: "Martes", hora_inicio: "17:00", duracion_minutos: 60, capacidad: 6 },
  { id: "horario-func-mar-18", actividad: "FUNCIONAL", dia_semana: 2, dia_nombre: "Martes", hora_inicio: "18:00", duracion_minutos: 60, capacidad: 8 },
  { id: "horario-func-mie-18", actividad: "FUNCIONAL", dia_semana: 3, dia_nombre: "Miércoles", hora_inicio: "18:00", duracion_minutos: 60, capacidad: 8 },
  { id: "horario-func-jue-17", actividad: "FUNCIONAL", dia_semana: 4, dia_nombre: "Jueves", hora_inicio: "17:00", duracion_minutos: 60, capacidad: 6 },
  { id: "horario-func-jue-18", actividad: "FUNCIONAL", dia_semana: 4, dia_nombre: "Jueves", hora_inicio: "18:00", duracion_minutos: 60, capacidad: 8 },
  { id: "horario-func-vie-18", actividad: "FUNCIONAL", dia_semana: 5, dia_nombre: "Viernes", hora_inicio: "18:00", duracion_minutos: 60, capacidad: 8 },
  { id: "horario-box-lun-1930", actividad: "BOXEO", dia_semana: 1, dia_nombre: "Lunes", hora_inicio: "19:30", duracion_minutos: 60, capacidad: 10 },
  { id: "horario-box-mie-1930", actividad: "BOXEO", dia_semana: 3, dia_nombre: "Miércoles", hora_inicio: "19:30", duracion_minutos: 60, capacidad: 10 },
  { id: "horario-box-vie-1930", actividad: "BOXEO", dia_semana: 5, dia_nombre: "Viernes", hora_inicio: "19:30", duracion_minutos: 60, capacidad: 10 },
];

export interface InviteStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se invoca tras un alta exitosa (201) para recargar la lista de alumnos del entrenador. */
  onInvited: () => void | Promise<void>;
  /** Horarios disponibles para seleccionar clases fijas (opcional) */
  horariosDisponibles?: HorarioClaseDisponible[];
}

/** Respuesta 201 de la Edge Function `alta-alumno-directa` enriquecida con actividades y clases fijas. */
export interface AltaExitosa {
  alumno_id: string;
  email: string;
  password_temporal: string;
  email_enviado: boolean;
  mensaje: string;
  actividades?: ActividadConfiguracion[];
  clases_fijas?: HorarioClaseDisponible[];
  sexo?: "F" | "M";
  peso_corporal_kg?: number | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Traduce el status de la Edge Function `alta-alumno-directa` a un mensaje para el entrenador. */
function mensajePorStatus(status: number, serverMsg?: string): string {
  switch (status) {
    case 400:
      return serverMsg || "Datos inválidos. Revisá el email del alumno.";
    case 401:
    case 403:
      return "No tenés permisos para dar de alta alumnos. Iniciá sesión como entrenador.";
    case 409:
      return "Ya existe un usuario registrado con ese email.";
    case 500:
    case 502:
      return "No se pudo crear el alumno por un error del servidor. Intentá de nuevo en unos minutos.";
    default:
      return serverMsg || "No se pudo completar el alta. Intentá de nuevo.";
  }
}

/** Arma el mensaje de WhatsApp con las credenciales, actividades y clases fijas listas para pegar al alumno. */
export function mensajeWhatsApp(
  alta: AltaExitosa,
  nombre: string,
  actividades: ActividadConfiguracion[] = [],
  clasesFijas: HorarioClaseDisponible[] = [],
): string {
  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/login` : "https://gozster.vercel.app/login";
  const saludo = nombre ? `Hola ${nombre}!` : "Hola!";
  const lineas = [
    saludo,
    "",
    "Te di de alta en GOZSter. Ingresá con estos datos:",
    `Email: ${alta.email}`,
    `Contraseña temporal: ${alta.password_temporal}`,
  ];

  if (actividades.length > 0) {
    lineas.push("");
    lineas.push("Tus actividades:");
    actividades.forEach((act) => {
      const nombreAct =
        act.actividad === "FUNCIONAL"
          ? "Funcional"
          : act.actividad === "BOXEO"
          ? "Boxeo"
          : "Rutinas online";
      const detalle = act.pase_libre ? "Pase libre" : `${act.veces_por_semana}x por semana`;
      lineas.push(`• ${nombreAct}: ${detalle}`);
    });
  }

  if (clasesFijas.length > 0) {
    lineas.push("");
    lineas.push("Tus clases fijas semanales:");
    clasesFijas.forEach((c) => {
      const nombreAct = c.actividad === "FUNCIONAL" ? "Funcional" : "Boxeo";
      lineas.push(`• ${c.dia_nombre} ${c.hora_inicio} hs (${nombreAct})`);
    });
  }

  lineas.push("");
  lineas.push(`Entrá en ${loginUrl} y al ingresar vas a elegir tu contraseña definitiva.`);
  return lineas.join("\n");
}

export function InviteStudentModal({
  isOpen,
  onClose,
  onInvited,
  horariosDisponibles = HORARIOS_PREDETERMINADOS,
}: InviteStudentModalProps) {
  const [nombreCompleto, setNombreCompleto] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [sexo, setSexo] = React.useState<"F" | "M">("F");
  const [pesoCorporalKg, setPesoCorporalKg] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [alta, setAlta] = React.useState<AltaExitosa | null>(null);
  const [copiado, setCopiado] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Estado de actividades y frecuencias (GOZS-224 / GOZS-246)
  const [actividades, setActividades] = React.useState<
    Record<ActividadTipo, { habilitada: boolean; veces_por_semana: number; pase_libre: boolean }>
  >({
    FUNCIONAL: { habilitada: true, veces_por_semana: 2, pase_libre: false },
    BOXEO: { habilitada: false, veces_por_semana: 2, pase_libre: false },
    RUTINAS: { habilitada: false, veces_por_semana: 3, pase_libre: false },
  });

  // Estado de clases fijas vinculadas (GOZS-225 / GOZS-246)
  const [clasesFijasSeleccionadas, setClasesFijasSeleccionadas] = React.useState<string[]>([]);

  const reset = React.useCallback(() => {
    setNombreCompleto("");
    setEmail("");
    setTelefono("");
    setSexo("F");
    setPesoCorporalKg("");
    setError(null);
    setAlta(null);
    setCopiado(false);
    setLoading(false);
    setActividades({
      FUNCIONAL: { habilitada: true, veces_por_semana: 2, pase_libre: false },
      BOXEO: { habilitada: false, veces_por_semana: 2, pase_libre: false },
      RUTINAS: { habilitada: false, veces_por_semana: 3, pase_libre: false },
    });
    setClasesFijasSeleccionadas([]);
  }, []);

  const handleClose = React.useCallback(() => {
    if (loading) return;
    reset();
    onClose();
  }, [loading, reset, onClose]);

  const toggleActividad = (act: ActividadTipo) => {
    setActividades((prev) => {
      const actual = prev[act];
      const nuevaHabilitada = !actual.habilitada;
      // Si se deshabilita una actividad presencial, quitar sus clases fijas
      if (!nuevaHabilitada && (act === "FUNCIONAL" || act === "BOXEO")) {
        setClasesFijasSeleccionadas((prevFijas) =>
          prevFijas.filter((id) => {
            const h = horariosDisponibles.find((item) => item.id === id);
            return h?.actividad !== act;
          }),
        );
      }
      return {
        ...prev,
        [act]: { ...actual, habilitada: nuevaHabilitada },
      };
    });
  };

  const setFrecuenciaPaseLibre = (act: ActividadTipo, paseLibre: boolean) => {
    setActividades((prev) => ({
      ...prev,
      [act]: { ...prev[act], pase_libre: paseLibre },
    }));
  };

  const setFrecuenciaVeces = (act: ActividadTipo, veces: number) => {
    setActividades((prev) => ({
      ...prev,
      [act]: { ...prev[act], veces_por_semana: veces, pase_libre: false },
    }));
  };

  const toggleClaseFija = (horarioId: string) => {
    setClasesFijasSeleccionadas((prev) =>
      prev.includes(horarioId) ? prev.filter((id) => id !== horarioId) : [...prev, horarioId],
    );
  };

  if (!isOpen) return null;

  const emailLimpio = email.trim().toLowerCase();
  const nombreLimpio = nombreCompleto.trim();
  // El nombre es opcional: basta un email válido para dar de alta.
  const esValido = EMAIL_RE.test(emailLimpio);

  // Filtrar horarios según las actividades presenciales habilitadas
  const horariosFiltrados = horariosDisponibles.filter(
    (h) => actividades[h.actividad]?.habilitada,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!esValido) {
      setError("Ingresá un email válido.");
      return;
    }

    setLoading(true);
    try {
      const pesoNum = pesoCorporalKg.trim() ? parseFloat(pesoCorporalKg.trim()) : undefined;
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke<AltaExitosa>(
        "alta-alumno-directa",
        {
          body: {
            email: emailLimpio,
            nombre_completo: nombreLimpio || undefined,
            telefono: telefono.trim() || undefined,
            sexo: sexo || undefined,
            peso_corporal_kg: pesoNum && !isNaN(pesoNum) ? pesoNum : undefined,
          },
        },
      );

      if (fnError) {
        if (fnError instanceof FunctionsHttpError) {
          const status = fnError.context?.status ?? 0;
          let serverMsg: string | undefined;
          try {
            const body = await fnError.context.json();
            serverMsg = body?.error;
          } catch {
            // Respuesta sin JSON legible; usamos el mensaje por status.
          }
          setError(mensajePorStatus(status, serverMsg));
        } else {
          setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez.");
        }
        setLoading(false);
        return;
      }

      if (!data?.password_temporal) {
        setError("El alta se procesó pero no recibimos las credenciales. Recargá la lista de alumnos.");
        setLoading(false);
        return;
      }

      // Preparar actividades seleccionadas
      const actividadesConfiguradas: ActividadConfiguracion[] = (
        Object.entries(actividades) as [ActividadTipo, { habilitada: boolean; veces_por_semana: number; pase_libre: boolean }][]
      )
        .filter(([_, cfg]) => cfg.habilitada)
        .map(([act, cfg]) => ({
          actividad: act,
          veces_por_semana: cfg.pase_libre ? null : cfg.veces_por_semana,
          pase_libre: cfg.pase_libre,
        }));

      // Preparar clases fijas asignadas
      const clasesFijasAsignadas = horariosDisponibles.filter((h) =>
        clasesFijasSeleccionadas.includes(h.id),
      );

      // Persistir actividades, clases fijas, sexo y peso si hay alumno_id
      if (data.alumno_id) {
        try {
          // Persistir sexo y peso corporal en perfiles
          const perfilUpdate: { sexo?: "F" | "M"; peso_corporal_kg?: number } = {};
          if (sexo === "F" || sexo === "M") {
            perfilUpdate.sexo = sexo;
          }
          if (pesoNum && !isNaN(pesoNum) && pesoNum > 0) {
            perfilUpdate.peso_corporal_kg = pesoNum;
          }
          if (Object.keys(perfilUpdate).length > 0) {
            await supabase.from("perfiles" as any).update(perfilUpdate as any).eq("id", data.alumno_id);
          }

          if (actividadesConfiguradas.length > 0) {
            await supabase.from("alumno_actividades" as any).upsert(
              actividadesConfiguradas.map((a) => ({
                alumno_id: data.alumno_id,
                actividad: a.actividad,
                veces_por_semana: a.veces_por_semana,
                pase_libre: a.pase_libre,
              })),
              { onConflict: "alumno_id,actividad" },
            );
          }

          // Asignar clases fijas en el store / RPC
          for (const cf of clasesFijasAsignadas) {
            await useClasesStore.getState().asignarClaseFija(cf.id, data.alumno_id);
          }
        } catch (persErr) {
          console.warn("Aviso al vincular perfil, actividades o clases fijas:", persErr);
        }
      }

      setAlta({
        ...data,
        actividades: actividadesConfiguradas,
        clases_fijas: clasesFijasAsignadas,
        sexo: sexo,
        peso_corporal_kg: pesoNum && !isNaN(pesoNum) ? pesoNum : null,
      });
      setLoading(false);
      await onInvited();
    } catch {
      setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez.");
      setLoading(false);
    }
  };

  const handleCopiar = async () => {
    if (!alta) return;
    const texto = `Email: ${alta.email}\nContraseña temporal: ${alta.password_temporal}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        window.setTimeout(() => setCopiado(false), 2500);
      }
    } catch {
      setError("No pudimos copiar al portapapeles. Copiá las credenciales manualmente.");
    }
  };

  const whatsappHref = alta
    ? (() => {
        const digits = telefono.replace(/\D/g, "");
        const text = encodeURIComponent(
          mensajeWhatsApp(alta, nombreLimpio, alta.actividades || [], alta.clases_fijas || []),
        );
        return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
      })()
    : "#";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alta-alumno-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-xl max-h-[90vh] flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-4 sm:p-5 shrink-0">
          <div>
            <h2
              id="alta-alumno-modal-title"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground"
            >
              <span aria-hidden="true">🏋️</span> Alta de alumno
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {alta
                ? "Cuenta creada con acceso inmediato. Compartí las credenciales."
                : "Creá la cuenta al instante, configurá actividades y vinculá sus clases fijas."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            aria-label="Cerrar alta de alumno"
            className="min-h-11 min-w-11 text-xs"
          >
            ✕
          </Button>
        </div>

        {alta ? (
          /* Tarjeta de contingencia y resumen */
          <div className="flex-1 overflow-y-auto space-y-4 p-4 sm:p-5" data-testid="alta-alumno-success">
            <div
              role="status"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              {alta.mensaje}
            </div>

            {/* Credenciales temporales */}
            <div className="space-y-2 rounded-xl border border-border bg-background p-3.5">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </p>
                <p className="select-all break-all text-sm font-semibold text-foreground">
                  {alta.email}
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Contraseña temporal
                </p>
                <p className="select-all break-all font-mono text-sm font-semibold text-foreground">
                  {alta.password_temporal}
                </p>
              </div>
            </div>

            {/* Resumen de Actividades Configuradas */}
            {alta.actividades && alta.actividades.length > 0 && (
              <div className="rounded-xl border border-border bg-background p-3.5 space-y-2" data-testid="alta-success-actividades">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Actividades habilitadas
                </p>
                <div className="flex flex-wrap gap-2">
                  {alta.actividades.map((a) => (
                    <span
                      key={a.actividad}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      <span>
                        {a.actividad === "FUNCIONAL" ? "🏋️" : a.actividad === "BOXEO" ? "🥊" : "📱"}
                      </span>
                      <span>
                        {a.actividad === "FUNCIONAL"
                          ? "Funcional"
                          : a.actividad === "BOXEO"
                          ? "Boxeo"
                          : "Rutinas online"}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-semibold text-primary">
                        {a.pase_libre ? "Pase libre" : `${a.veces_por_semana}x/sem`}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Resumen de Clases Fijas Asignadas */}
            {alta.clases_fijas && alta.clases_fijas.length > 0 && (
              <div className="rounded-xl border border-border bg-background p-3.5 space-y-2" data-testid="alta-success-clases-fijas">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Clases fijas vinculadas
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {alta.clases_fijas.map((cf) => (
                    <div
                      key={cf.id}
                      className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-foreground"
                    >
                      <span className="font-semibold text-primary">
                        {cf.dia_nombre} {cf.hora_inicio} hs
                      </span>
                      <span className="text-[11px] text-muted-foreground uppercase">
                        {cf.actividad === "FUNCIONAL" ? "Funcional" : "Boxeo"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={handleCopiar}
                className="min-h-12 text-xs"
                data-testid="alta-alumno-copiar"
              >
                {copiado ? "✓ Credenciales copiadas" : "📋 Copiar credenciales"}
              </Button>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="alta-alumno-whatsapp"
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-4 text-xs font-bold text-white transition-all hover:bg-[#1da851] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                💬 Enviar por WhatsApp
              </a>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={reset} className="min-h-11 text-xs">
                Dar de alta a otro
              </Button>
              <Button type="button" size="sm" onClick={handleClose} className="min-h-11 text-xs">
                Listo
              </Button>
            </div>
          </div>
        ) : (
          /* Formulario de alta completa con actividades, frecuencia y clases fijas */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 p-4 sm:p-5" noValidate>
            {/* 1. Datos personales */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="alta-email" className="block text-xs font-semibold text-foreground">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  id="alta-email"
                  name="email"
                  data-testid="alta-email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="alumno@email.com"
                  className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="alta-nombre" className="block text-xs font-semibold text-foreground">
                    Nombre completo <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <input
                    id="alta-nombre"
                    name="nombre_completo"
                    data-testid="alta-nombre"
                    type="text"
                    value={nombreCompleto}
                    onChange={(ev) => setNombreCompleto(ev.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="alta-telefono" className="block text-xs font-semibold text-foreground">
                    Teléfono <span className="font-normal text-muted-foreground">(opcional, para WhatsApp)</span>
                  </label>
                  <input
                    id="alta-telefono"
                    name="telefono"
                    data-testid="alta-telefono"
                    type="tel"
                    value={telefono}
                    onChange={(ev) => setTelefono(ev.target.value)}
                    placeholder="+54 9 11 ..."
                    className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Sexo Biológico y Peso Corporal Aproximado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="alta-sexo" className="block text-xs font-semibold text-foreground">
                    Sexo Biológico <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="alta-sexo"
                    name="sexo"
                    data-testid="alta-sexo"
                    required
                    value={sexo}
                    onChange={(ev) => setSexo(ev.target.value as "F" | "M")}
                    className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="F">Femenino</option>
                    <option value="M">Masculino</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="alta-peso" className="block text-xs font-semibold text-foreground">
                    Peso Corporal Aproximado (kg)
                  </label>
                  <input
                    id="alta-peso"
                    name="peso_corporal_kg"
                    data-testid="alta-peso"
                    type="number"
                    step="0.1"
                    min="20"
                    max="300"
                    value={pesoCorporalKg}
                    onChange={(ev) => setPesoCorporalKg(ev.target.value)}
                    placeholder="Ej. 65"
                    className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* 2. Actividades y frecuencia semanal */}
            <div className="space-y-2.5 pt-2 border-t border-border">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <span>🎯</span> Actividades y Frecuencia Semanal
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Elegí las disciplinas que realizará el alumno y definí su frecuencia o pase libre.
                </p>
              </div>

              <div className="space-y-2">
                {/* Funcional */}
                <div
                  className={`rounded-xl border p-3 transition-colors ${
                    actividades.FUNCIONAL.habilitada
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-background opacity-75"
                  }`}
                  data-testid="card-actividad-FUNCIONAL"
                >
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="actividad-funcional"
                      className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer"
                    >
                      <input
                        id="actividad-funcional"
                        type="checkbox"
                        checked={actividades.FUNCIONAL.habilitada}
                        onChange={() => toggleActividad("FUNCIONAL")}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        data-testid="alta-actividad-FUNCIONAL"
                      />
                      <span>🏋️ Funcional</span>
                    </label>
                    {actividades.FUNCIONAL.habilitada && (
                      <span className="text-[11px] font-semibold text-primary">
                        {actividades.FUNCIONAL.pase_libre
                          ? "Pase libre"
                          : `${actividades.FUNCIONAL.veces_por_semana}x/semana`}
                      </span>
                    )}
                  </div>

                  {actividades.FUNCIONAL.habilitada && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
                      <Button
                        type="button"
                        size="sm"
                        variant={actividades.FUNCIONAL.pase_libre ? "default" : "outline"}
                        onClick={() => setFrecuenciaPaseLibre("FUNCIONAL", !actividades.FUNCIONAL.pase_libre)}
                        className="min-h-10 text-xs px-2.5"
                        data-testid="alta-frecuencia-paselibre-FUNCIONAL"
                      >
                        {actividades.FUNCIONAL.pase_libre ? "✓ Pase libre" : "Pase libre"}
                      </Button>
                      <span className="text-[11px] text-muted-foreground px-1">o</span>
                      {[1, 2, 3, 4, 5, 6].map((veces) => (
                        <Button
                          key={veces}
                          type="button"
                          size="sm"
                          variant={
                            !actividades.FUNCIONAL.pase_libre &&
                            actividades.FUNCIONAL.veces_por_semana === veces
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setFrecuenciaVeces("FUNCIONAL", veces)}
                          className="min-h-10 min-w-9 text-xs px-2"
                          data-testid={`alta-frecuencia-veces-FUNCIONAL-${veces}`}
                        >
                          {veces}x
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Boxeo */}
                <div
                  className={`rounded-xl border p-3 transition-colors ${
                    actividades.BOXEO.habilitada
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-background opacity-75"
                  }`}
                  data-testid="card-actividad-BOXEO"
                >
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="actividad-boxeo"
                      className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer"
                    >
                      <input
                        id="actividad-boxeo"
                        type="checkbox"
                        checked={actividades.BOXEO.habilitada}
                        onChange={() => toggleActividad("BOXEO")}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        data-testid="alta-actividad-BOXEO"
                      />
                      <span>🥊 Boxeo</span>
                    </label>
                    {actividades.BOXEO.habilitada && (
                      <span className="text-[11px] font-semibold text-primary">
                        {actividades.BOXEO.pase_libre
                          ? "Pase libre"
                          : `${actividades.BOXEO.veces_por_semana}x/semana`}
                      </span>
                    )}
                  </div>

                  {actividades.BOXEO.habilitada && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
                      <Button
                        type="button"
                        size="sm"
                        variant={actividades.BOXEO.pase_libre ? "default" : "outline"}
                        onClick={() => setFrecuenciaPaseLibre("BOXEO", !actividades.BOXEO.pase_libre)}
                        className="min-h-10 text-xs px-2.5"
                        data-testid="alta-frecuencia-paselibre-BOXEO"
                      >
                        {actividades.BOXEO.pase_libre ? "✓ Pase libre" : "Pase libre"}
                      </Button>
                      <span className="text-[11px] text-muted-foreground px-1">o</span>
                      {[1, 2, 3, 4, 5].map((veces) => (
                        <Button
                          key={veces}
                          type="button"
                          size="sm"
                          variant={
                            !actividades.BOXEO.pase_libre &&
                            actividades.BOXEO.veces_por_semana === veces
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setFrecuenciaVeces("BOXEO", veces)}
                          className="min-h-10 min-w-9 text-xs px-2"
                          data-testid={`alta-frecuencia-veces-BOXEO-${veces}`}
                        >
                          {veces}x
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rutinas Online */}
                <div
                  className={`rounded-xl border p-3 transition-colors ${
                    actividades.RUTINAS.habilitada
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-background opacity-75"
                  }`}
                  data-testid="card-actividad-RUTINAS"
                >
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="actividad-rutinas"
                      className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer"
                    >
                      <input
                        id="actividad-rutinas"
                        type="checkbox"
                        checked={actividades.RUTINAS.habilitada}
                        onChange={() => toggleActividad("RUTINAS")}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        data-testid="alta-actividad-RUTINAS"
                      />
                      <span>📱 Rutinas Online</span>
                    </label>
                    {actividades.RUTINAS.habilitada && (
                      <span className="text-[11px] font-semibold text-primary">
                        {actividades.RUTINAS.pase_libre
                          ? "Pase libre"
                          : `${actividades.RUTINAS.veces_por_semana}x/semana`}
                      </span>
                    )}
                  </div>

                  {actividades.RUTINAS.habilitada && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
                      <Button
                        type="button"
                        size="sm"
                        variant={actividades.RUTINAS.pase_libre ? "default" : "outline"}
                        onClick={() => setFrecuenciaPaseLibre("RUTINAS", !actividades.RUTINAS.pase_libre)}
                        className="min-h-10 text-xs px-2.5"
                        data-testid="alta-frecuencia-paselibre-RUTINAS"
                      >
                        {actividades.RUTINAS.pase_libre ? "✓ Pase libre" : "Pase libre"}
                      </Button>
                      <span className="text-[11px] text-muted-foreground px-1">o</span>
                      {[1, 2, 3, 4, 5, 6, 7].map((veces) => (
                        <Button
                          key={veces}
                          type="button"
                          size="sm"
                          variant={
                            !actividades.RUTINAS.pase_libre &&
                            actividades.RUTINAS.veces_por_semana === veces
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setFrecuenciaVeces("RUTINAS", veces)}
                          className="min-h-10 min-w-9 text-xs px-2"
                          data-testid={`alta-frecuencia-veces-RUTINAS-${veces}`}
                        >
                          {veces}x
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Clases Fijas Semanales */}
            {horariosFiltrados.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <span>📅</span> Clases Fijas Semanales
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Vinculá las clases recurrentes que el alumno tendrá fijas con acceso inmediato.
                    </p>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground">
                    {clasesFijasSeleccionadas.length} seleccionada(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {horariosFiltrados.map((h) => {
                    const isSelected = clasesFijasSeleccionadas.includes(h.id);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => toggleClaseFija(h.id)}
                        className={`flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-all active:scale-[0.98] ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                            : "border-border bg-background text-foreground hover:bg-secondary/40"
                        }`}
                        data-testid={`alta-clase-fija-${h.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {isSelected ? "☑️" : "⬜"}
                          </span>
                          <div>
                            <p className="font-semibold leading-tight">
                              {h.dia_nombre} {h.hora_inicio} hs
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase">
                              {h.actividad === "FUNCIONAL" ? "Funcional" : "Boxeo"}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-bold text-primary uppercase">
                            Fija
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={handleClose} className="min-h-11 text-xs">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || !esValido}
                className="min-h-12 text-xs"
                data-testid="invite-student-submit"
              >
                {loading ? "Dando de alta..." : "Dar de alta"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
