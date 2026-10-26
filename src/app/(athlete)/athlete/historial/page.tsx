"use client";

import * as React from "react";
import { HistorialSesiones } from "@/components/athlete/historial-sesiones";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

export default function AthleteHistorialPage() {
  const isOnline = useOfflineQueueStore((s) => s.isOnline);
  return <HistorialSesiones offline={!isOnline} />;
}
