"use client";

import { create } from "zustand";
import {
  withAlertEstado,
  getReactiveCriticalAlerts,
  setCachedDbAlerts,
  type AlertaEstado,
  type CriticalAlert,
} from "@/components/coach/critical-alerts-data";

interface DemoAlertEstadosState {
  estados: Record<string, AlertaEstado>;
  setEstado: (alertId: string, estado: AlertaEstado) => void;
}

/** Estado de las alertas demo, compartido entre la bandeja y la ficha del alumno. */
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

export interface CriticalAlertsStoreState {
  alerts: CriticalAlert[];
  isLoading: boolean;
  setAlerts: (alerts: CriticalAlert[]) => void;
  addAlert: (alert: CriticalAlert) => void;
  updateAlertEstado: (alertId: string, estado: AlertaEstado) => void;
  clearAlerts: () => void;
  getAlertsForAlumno: (alumnoIdOrName: string) => CriticalAlert[];
}

/** Store reactivo de alertas críticas conectado al pipeline de dolor de GOZSter */
export const useCriticalAlertsStore = create<CriticalAlertsStoreState>((set, get) => ({
  alerts: [],
  isLoading: false,
  setAlerts: (alerts) => {
    setCachedDbAlerts(alerts);
    set({ alerts });
  },
  addAlert: (alert) => {
    const current = get().alerts;
    const next = [alert, ...current.filter((a) => a.id !== alert.id)];
    setCachedDbAlerts(next);
    set({ alerts: next });
  },
  updateAlertEstado: (alertId, estado) => {
    const next = get().alerts.map((a) =>
      a.id === alertId || a.reporteDolorId === alertId ? withAlertEstado(a, estado) : a
    );
    setCachedDbAlerts(next);
    set({ alerts: next });
    useDemoAlertEstados.getState().setEstado(alertId, estado);
  },
  clearAlerts: () => {
    setCachedDbAlerts([]);
    set({ alerts: [] });
  },
  getAlertsForAlumno: (alumnoIdOrName: string) => {
    const q = (alumnoIdOrName || "").toLowerCase();
    return get().alerts.filter((a) => {
      const matchId = a.alumnoId === alumnoIdOrName;
      const matchName =
        a.alumnoNombre.toLowerCase().includes(q) || q.includes(a.alumnoNombre.toLowerCase());
      const isFernando =
        (q.includes("fernando") || alumnoIdOrName === "66b92b9a-1ce7-4e2e-a47c-7c5600000000") &&
        (a.alumnoNombre.toLowerCase().includes("fernando") ||
          a.alumnoId === "66b92b9a-1ce7-4e2e-a47c-7c5600000000");
      return matchId || matchName || isFernando;
    });
  },
}));

export interface AlumnoPainBadge {
  type: "pain";
  label: string;
  title: string;
  zona: string;
  ejercicio: string;
  detalle: string;
  reporteDolorId: string;
  alertaId: string;
  severidad?: string;
  esSintomaAlarma?: boolean;
  sintomasAlarma?: string[];
}

/** Retorna badges reactivos de dolor para un atleta determinado si tiene alertas PENDIENTES */
export function getReactiveAlertsForStudent(alumnoIdOrName: string): AlumnoPainBadge[] {
  const q = (alumnoIdOrName || "").toLowerCase();
  const allReactive = getReactiveCriticalAlerts();
  const demoEstados = useDemoAlertEstados.getState().estados;

  // Filtrar las alertas que correspondan a este alumno y sigan PENDIENTES
  const matching = allReactive.filter((a) => {
    const estado = demoEstados[a.id] || a.estado || "PENDIENTE";
    const isPending = estado === "PENDIENTE" && !a.resolved;
    if (!isPending) return false;

    const matchName =
      a.alumnoNombre.toLowerCase().includes(q) || q.includes(a.alumnoNombre.toLowerCase());
    const matchId = a.alumnoId === alumnoIdOrName;
    const isFernando =
      (q.includes("fernando") || alumnoIdOrName === "66b92b9a-1ce7-4e2e-a47c-7c5600000000") &&
      (a.alumnoNombre.toLowerCase().includes("fernando") ||
        a.alumnoId === "66b92b9a-1ce7-4e2e-a47c-7c5600000000");

    return matchName || matchId || isFernando;
  });

  return matching.map((a) => ({
    type: "pain" as const,
    label: `🚨 ${a.zona || "Articular"}`,
    title: `Molestia articular en ${a.zona || "Articular"} - Tocar para Sustituir Ejercicio`,
    zona: a.zona || "Articular",
    ejercicio: a.ejercicioNombre || "Ejercicio",
    detalle: a.detalle || "Molestia articular informada",
    reporteDolorId: a.reporteDolorId || a.id,
    alertaId: a.id,
    severidad: a.severidad,
    esSintomaAlarma: a.esSintomaAlarma,
    sintomasAlarma: a.sintomasAlarma,
  }));
}
