"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  asignarClaseFijaRpc,
  listarClasesFijasAlumno,
  listarHorariosActivos,
  quitarClaseFijaRpc,
  type ClaseFijaAlumno,
  type HorarioFijo,
} from "@/services/clases-fijas-service";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const etiqueta = (h: { actividad: string; dia_semana: number; hora_inicio: string }) =>
  `${DIAS[h.dia_semana] ?? "?"} ${h.hora_inicio.slice(0, 5)} · ${h.actividad}`;

/** Clases fijas del alumno: lista, alta (RPC asignar_clase_fija) y baja (RPC quitar_clase_fija). */
export function ClasesFijasPanel({ alumnoId }: { alumnoId: string }) {
  const [fijas, setFijas] = React.useState<ClaseFijaAlumno[]>([]);
  const [horarios, setHorarios] = React.useState<HorarioFijo[]>([]);
  const [elegido, setElegido] = React.useState("");
  const [cargando, setCargando] = React.useState(true);
  const [ocupado, setOcupado] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const recargar = React.useCallback(async () => {
    try {
      const [f, h] = await Promise.all([listarClasesFijasAlumno(alumnoId), listarHorariosActivos()]);
      setFijas(f);
      setHorarios(h);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar las clases fijas.");
    } finally {
      setCargando(false);
    }
  }, [alumnoId]);

  React.useEffect(() => {
    void recargar();
  }, [recargar]);

  const ejecutar = async (accion: () => Promise<unknown>) => {
    setOcupado(true);
    try {
      await accion();
      setElegido("");
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar la acción.");
    } finally {
      setOcupado(false);
    }
  };

  const disponibles = horarios.filter((h) => !fijas.some((f) => f.horario_id === h.id));

  return (
    <Card data-testid="clases-fijas-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold">Clases fijas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : fijas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin clases fijas asignadas.</p>
        ) : (
          <ul className="space-y-2">
            {fijas.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span>{etiqueta(f)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado}
                  aria-label={`Quitar clase fija ${etiqueta(f)}`}
                  onClick={() => ejecutar(() => quitarClaseFijaRpc(f.id))}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <select
            aria-label="Horario a fijar"
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">Elegí un horario…</option>
            {disponibles.map((h) => (
              <option key={h.id} value={h.id}>
                {etiqueta(h)}
              </option>
            ))}
          </select>
          <Button
            disabled={!elegido || ocupado}
            className="h-11"
            onClick={() => ejecutar(() => asignarClaseFijaRpc(elegido, alumnoId))}
          >
            Fijar
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-soft-foreground">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
