import * as React from "react";
import type { Perfil, PlanEntrenamiento } from "@/types/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import {
  calculateStudentHealthScore,
  generateWhatsAppReactivationUrl,
} from "@/lib/strength-metrics";

export interface StudentCardProps {
  alumno: Perfil;
  rutinaActiva: PlanEntrenamiento | null;
  onSelect: (alumnoId: string) => void;
}

export function StudentCard({
  alumno,
  rutinaActiva,
  onSelect,
}: StudentCardProps) {
  const isWhatsAppEnabled = useCoachStudioStore((s) => s.isWhatsAppEnabled);
  const openChatForAlumno = useCoachStudioStore((s) => s.openChatForAlumno);
  const getPaymentBadge = (estado: Perfil["estado_membresia"]) => {
    switch (estado) {
      case "ACTIVA":
        return <Badge variant="success">Al día</Badge>;
      case "PENDIENTE":
        return <Badge variant="warning">Pago pendiente</Badge>;
      case "INACTIVA":
        return <Badge variant="secondary">Inactivo</Badge>;
      case "BAJA":
        return <Badge variant="destructive">Baja</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getInitials = (nombre: string) => {
    return nombre
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Cálculo del Semáforo de Salud del Alumno (SH in [0, 100])
  const cuotaScore =
    alumno.estado_membresia === "ACTIVA"
      ? 100
      : alumno.estado_membresia === "PENDIENTE"
      ? 50
      : 15;
  const planScore = rutinaActiva ? 90 : 35;
  const healthScore = calculateStudentHealthScore({
    adherencia: planScore,
    frecuencia: rutinaActiva ? 85 : 40,
    interaccionChat: 75,
    estadoCuota: cuotaScore,
  });

  const whatsappUrl = generateWhatsAppReactivationUrl({
    phone: alumno.telefono,
    studentName: alumno.nombre_completo,
    daysInactive: rutinaActiva ? 4 : 8,
    routineName: rutinaActiva?.nombre,
  });

  return (
    <Card className="w-full max-w-full overflow-hidden rounded-2xl border border-border/80 bg-card shadow-m3-1 hover:border-primary/50 hover:shadow-m3-2 transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary/80 border border-border/60 text-sm font-black text-foreground shadow-sm"
              aria-hidden="true"
            >
              {getInitials(alumno.nombre_completo)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="truncate text-base font-bold text-foreground">
                  {alumno.nombre_completo}
                </h3>
                {/* Semáforo de Salud (SH) */}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${healthScore.colorClass}`}
                  title={`Semáforo de Salud: ${healthScore.score} / 100`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  SH: {healthScore.score}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground mt-0.5">
                {alumno.email ?? "Sin email registrado"}
              </p>
            </div>
          </div>
          <div className="shrink-0">{getPaymentBadge(alumno.estado_membresia)}</div>
        </div>

        <div className="mt-4 rounded-xl bg-secondary/40 border border-border/60 p-3 text-xs flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <span className="font-medium text-muted-foreground">Plan Activo: </span>
            <span className="font-bold text-foreground truncate inline-block max-w-[180px] align-bottom">
              {rutinaActiva ? rutinaActiva.nombre : "Sin rutina asignada"}
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-muted-foreground shrink-0">
            {healthScore.badgeLabel}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {/* Botón Chat por la App (Enviar mensaje) */}
          <Button
            type="button"
            variant="outline"
            className="w-full min-h-12 text-xs font-bold rounded-xl border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
            onClick={() => openChatForAlumno(alumno.id)}
            data-testid={`btn-enviar-mensaje-${alumno.id}`}
            aria-label={`Enviar mensaje a ${alumno.nombre_completo}`}
            title="Enviar mensaje"
          >
            <span>💬 Enviar mensaje</span>
          </Button>

          {/* Botón WhatsApp 1-Clic (solo si está habilitado en config) */}
          {isWhatsAppEnabled && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Contactar a ${alumno.nombre_completo} por WhatsApp`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 active:scale-[0.98] cursor-pointer"
              data-testid={`whatsapp-btn-${alumno.id}`}
            >
              <svg
                className="h-4 w-4 shrink-0 fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.086-.177.18-.076.353.101.173.45 0.742.964 1.201.662.591 1.221.774 1.394.86.173.086.275.072.376-.043.101-.116.433-.506.549-.679.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.072.043.419-.101.824z" />
              </svg>
              <span>WhatsApp 1-Clic</span>
            </a>
          )}

          <Button
            variant="default"
            size="default"
            className="w-full min-h-12 text-xs font-bold rounded-xl"
            onClick={() => onSelect(alumno.id)}
          >
            Ver Alumno →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

