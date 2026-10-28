"use client";

import { create } from "zustand";

export type WorkspaceMode = "PRODUCCION" | "TESTEO";

interface WorkspaceModeState {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = "gozster-workspace-mode";

export const useWorkspaceModeStore = create<WorkspaceModeState>((set) => ({
  mode: "PRODUCCION",
  setMode: (mode: WorkspaceMode) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Ignorar si localStorage no está disponible
      }
    }
    set({ mode });
  },
  toggleMode: () => {
    set((state) => {
      const nextMode: WorkspaceMode =
        state.mode === "PRODUCCION" ? "TESTEO" : "PRODUCCION";
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, nextMode);
        } catch {
          // Ignorar si localStorage no está disponible
        }
      }
      return { mode: nextMode };
    });
  },
}));

// En el navegador, sincronizar el modo desde localStorage después de la primera
// hidratación para no romper el match SSR inicial.
if (typeof window !== "undefined") {
  setTimeout(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "TESTEO" || stored === "PRODUCCION") {
        useWorkspaceModeStore.setState({ mode: stored });
      }
    } catch {
      // Ignorar
    }
  }, 0);
}
