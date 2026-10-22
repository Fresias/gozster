"use client";

import { useWorkspaceModeStore } from "@/store/use-workspace-mode";

export function RosterPillLabel() {
  const mode = useWorkspaceModeStore((s) => s.mode);
  return <>{mode === "TESTEO" ? "Roster de atletas" : "Roster de Atletas INDEC"}</>;
}
