"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAthleteStore } from "@/store/use-athlete-store";

export function MembershipPaywall() {
  const { setMembershipStatus } = useAthleteStore();
  const [copied, setCopied] = React.useState(false);

  const transferAlias = "GOZSTER.FIT";
  const whatsappNumber = "+5491155550199";
  const whatsappMessage = encodeURIComponent(
    "¡Hola! Te envío el comprobante de transferencia para renovar mi cuota en GOZSter y habilitar mi plan de entrenamiento.",
  );

  const handleCopyAlias = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(transferAlias);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-4 py-2" data-testid="athlete-paywall">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            Estado de Cuenta: Pago Pendiente
          </span>
        </div>
        <p className="mt-1 text-xs text-amber-200/90 font-mono">
          [EXPIRED_PAYMENT_PENDING]
        </p>
      </div>

      <Card className="border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/20 text-destructive text-2xl font-bold">
            🔒
          </div>
          <CardTitle className="text-xl sm:text-2xl font-bold">
            Cuota Vencida / Pendiente de Renovación
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-2">
            Tu acceso a la sesión del día y al registro en vivo está pausado hasta
            que confirmes la renovación de tu membresía.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-lg bg-secondary/50 p-4 space-y-2 border border-border">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Beneficios pausados temporalmente:
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>Plan de entrenamiento y rutinas del día guiadas</li>
              <li>Modo "Entrenamiento en Vivo" con cronómetro de descanso</li>
              <li>Estimación de 1RM y métricas de fuerza personalizadas</li>
              <li>Sincronización de sobrecarga progresiva con tu entrenador</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              Instrucciones de Renovación:
            </h4>

            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div>
                <p className="text-xs text-muted-foreground">Alias de Transferencia</p>
                <p className="text-sm font-mono font-bold tracking-wider text-primary">
                  {transferAlias}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAlias}
                className="text-xs"
              >
                {copied ? "¡Copiado! ✓" : "Copiar Alias"}
              </Button>
            </div>

            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside pl-1">
              <li>
                Transfiere el valor de tu cuota mensual al alias bancario.
              </li>
              <li>
                Envía el comprobante digital al WhatsApp de tu entrenador.
              </li>
              <li>
                Tu entrenador reactivará tu cuenta al instante para entrenar.
              </li>
            </ol>
          </div>

          <div className="space-y-2 pt-2">
            <a
              href={`https://wa.me/${whatsappNumber.replace("+", "")}?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white shadow hover:bg-emerald-500 active:scale-[0.99] touch-manipulation"
            >
              <span>📲</span>
              <span>Enviar Comprobante por WhatsApp</span>
            </a>

            <div className="pt-4 border-t border-border">
              <p className="text-center text-xs text-muted-foreground mb-2">
                Entorno de Pruebas &amp; Auditoría QA:
              </p>
              <Button
                variant="secondary"
                size="default"
                className="w-full text-xs"
                onClick={() => setMembershipStatus("ACTIVE")}
                data-testid="simulate-active-btn"
              >
                Simular Pago Confirmado (Cambiar a ACTIVE)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
