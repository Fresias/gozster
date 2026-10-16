import * as React from "react";
import type { Perfil, PlanEntrenamiento } from "@/types/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  const whatsappMessage = encodeURIComponent(
    `Hola ${alumno.nombre_completo}, te escribo desde GOZSter Coach Studio sobre tu plan de entrenamiento.`,
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`;

  return (
    <Card className="w-full max-w-full overflow-hidden transition-all hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground"
              aria-hidden="true"
            >
              {getInitials(alumno.nombre_completo)}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-foreground">
                {alumno.nombre_completo}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {alumno.email ?? "Sin email registrado"}
              </p>
            </div>
          </div>
          <div className="shrink-0">{getPaymentBadge(alumno.estado_membresia)}</div>
        </div>

        <div className="mt-3 rounded-md bg-secondary/50 p-2.5 text-xs">
          <span className="font-medium text-muted-foreground">Plan Activo: </span>
          <span className="font-semibold text-foreground">
            {rutinaActiva ? rutinaActiva.nombre : "Sin rutina asignada"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Contactar a ${alumno.nombre_completo} por WhatsApp`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 active:scale-[0.99]"
          >
            <svg
              className="h-4 w-4 shrink-0 fill-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.086-.177.18-.076.353.101.173.45 0.742.964 1.201.662.591 1.221.774 1.394.86.173.086.275.072.376-.043.101-.116.433-.506.549-.679.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.072.043.419-.101.824z" />
            </svg>
            <span>WhatsApp</span>
          </a>

          <Button
            variant="default"
            size="default"
            className="w-full text-xs font-semibold"
            onClick={() => onSelect(alumno.id)}
          >
            Ver / Editar Rutina
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
