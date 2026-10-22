"use client";

import { create } from "zustand";
import { withAlertEstado, type AlertaEstado, type CriticalAlert } from "@/components/coach/critical-alerts-data";

interface DemoAlertEstadosState {
  estados: Record<string, AlertaEstado>;
  setEstado: (alertId: string, estado: AlertaEstado) => void;
}

/** Estado de las alertas demo (Modo Testeo), compartido entre la bandeja y la ficha del alumno. */
export const useDemoAlertEstados = create<DemoAlertEstadosState>((set) => ({
  estados: {},
  setEstado: (alertId, estado) => set((s) => ({ estados: { ...s.estados, [alertId]: estado } })),
}));

/** Aplica los estados compartidos a una lista de alertas demo. */
export function applyDemoEstados(alerts: CriticalAlert[], estados: Record<string, AlertaEstado>): CriticalAlert[] {
  return alerts.map((a) => {
    const estado = estados[a.id];
    return estado ? withAlertEstado(a, estado) : a;
  });
}
