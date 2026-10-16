"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

export default function AthleteAppPage() {
  const { enqueueEvent, clearQueue, pendingEvents } = useOfflineQueueStore();

  const handleLogSetOffline = () => {
    enqueueEvent({
      id: `set-${Date.now()}`,
      action: "WORKOUT_SET_COMPLETED",
      payload: {
        weightKg: 100,
        reps: 5,
        rpe: 8,
      },
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Entrenamiento en Vivo</CardTitle>
          <CardDescription>
            Interfaz táctil Mobile-First con soporte Offline-First (Zustand
            persist).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            size="touch"
            className="w-full"
            onClick={handleLogSetOffline}
          >
            Registrar Serie de Prueba (+1 Cola Offline)
          </Button>
          {pendingEvents.length > 0 && (
            <Button
              variant="outline"
              size="default"
              className="w-full"
              onClick={clearQueue}
            >
              Limpiar Cola ({pendingEvents.length} eventos pendientes)
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
