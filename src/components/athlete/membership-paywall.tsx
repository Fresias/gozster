"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore } from "@/store/use-chat-store";

/**
 * Aviso de suscripción vencida — NO bloquea la app (ADR-001).
 *
 * El alumno con contratación `VENCIDA` conserva acceso completo a la app
 * (entrenamiento en vivo, historial y Chat GOZS). Al iniciar la app recibe un
 * modal prominente informando el vencimiento, y mientras la cuota siga vencida
 * un banner persistente ofrece un acceso rápido para hablar con el equipo GOZS.
 */
export function MembershipExpiredNotice() {
  const { setMembershipStatus } = useAthleteStore();
  const setAthleteChatOpen = useChatStore((s) => s.setAthleteChatOpen);

  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = React.useState(false);

  const transferAlias = "GOZSTER.FIT";
  const whatsappNumber = "+5491155550199";
  const whatsappMessage = encodeURIComponent(
    "¡Hola equipo GOZS! Quiero renovar mi cuota y te envío el comprobante de transferencia.",
  );

  // Aviso al inicio de la app: abre el modal una sola vez al montar.
  React.useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const closeDialog = () => dialogRef.current?.close();

  const openGozsChat = () => {
    closeDialog();
    setAthleteChatOpen(true);
  };

  const handleCopyAlias = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(transferAlias);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback silencioso: el alias ya está visible en pantalla.
    }
  };

  return (
    <>
      {/* Banner persistente y NO bloqueante mientras la suscripción esté vencida */}
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-2 rounded-xl border border-warning-soft-border bg-warning-soft p-3 text-warning-soft-foreground sm:flex-row sm:items-center sm:justify-between"
        data-testid="athlete-expired-banner"
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-2.5 w-2.5 shrink-0 rounded-full bg-warning animate-pulse" />
          <div className="space-y-0.5">
            <p className="text-xs font-bold uppercase tracking-wider text-warning">
              Suscripción GOZS vencida
            </p>
            <p className="text-xs text-warning-soft-foreground">
              Seguís teniendo acceso completo. Hablá con el equipo GOZS para
              regularizar tu cuota.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            className="min-h-11 bg-success text-success-foreground hover:bg-success/90 touch-manipulation"
            onClick={openGozsChat}
            data-testid="expired-open-chat-banner"
          >
            💬 Hablar con GOZS
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 touch-manipulation"
            onClick={() => dialogRef.current?.showModal()}
            data-testid="expired-open-details"
          >
            Ver detalle
          </Button>
        </div>
      </div>

      {/* Aviso al inicio de la app (modal nativo, descartable — no bloquea la app) */}
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        data-testid="athlete-expired-dialog"
        aria-labelledby="expired-dialog-title"
      >
        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-soft text-warning text-3xl">
              ⏳
            </div>
            <h2
              id="expired-dialog-title"
              className="text-xl font-bold sm:text-2xl"
            >
              Tu suscripción GOZS venció
            </h2>
            <p className="text-sm text-muted-foreground">
              No te preocupes: <strong>seguís entrando a la app con normalidad</strong>{" "}
              (entrenamiento en vivo, historial y chat). Para mantener tu plan al
              día, comunicate con el equipo de GOZS y coordiná la renovación.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
            <h3 className="text-sm font-semibold text-foreground">
              Renovar es simple:
            </h3>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Alias de Transferencia
                </p>
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
            <ol className="list-inside list-decimal space-y-1.5 pl-1 text-xs text-muted-foreground">
              <li>Transferí el valor de tu cuota mensual al alias de GOZS.</li>
              <li>Enviá el comprobante al equipo por el Chat GOZS o WhatsApp.</li>
              <li>El equipo confirma el pago y tu cuota queda al día.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Button
              className="min-h-14 w-full bg-success text-base text-success-foreground hover:bg-success/90 active:scale-[0.99] touch-manipulation"
              onClick={openGozsChat}
              data-testid="expired-open-chat-dialog"
            >
              💬 Hablar con el equipo GOZS
            </Button>
            <a
              href={`https://wa.me/${whatsappNumber.replace("+", "")}?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-secondary/60 touch-manipulation"
            >
              📲 Enviar comprobante por WhatsApp
            </a>
            <Button
              variant="ghost"
              className="min-h-11 w-full text-sm"
              onClick={closeDialog}
              data-testid="expired-dismiss"
            >
              Entendido, seguir usando la app
            </Button>
          </div>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-center text-xs text-muted-foreground">
              Entorno de Pruebas &amp; Auditoría QA:
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                setMembershipStatus("ACTIVE");
                closeDialog();
              }}
              data-testid="simulate-active-btn"
            >
              Simular Pago Confirmado (Cambiar a ACTIVE)
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
