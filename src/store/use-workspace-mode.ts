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
  mode:
    typeof window !== "undefined" &&
    window.localStorage.getItem(STORAGE_KEY) === "TESTEO"
      ? "TESTEO"
      : "PRODUCCION",
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
