"use client";

import * as React from "react";
import { useChatStore } from "@/store/use-chat-store";
import { Copy, Hourglass, TriangleAlert } from "@/components/athlete/icons";

/**
 * Aviso de suscripción vencida — NO bloquea la app (ADR-001, Athlete v7 · FE-03 / 02-pantallas.md §1).
 *
 * El alumno con contratación `VENCIDA` conserva acceso completo a la app
 * (entrenamiento en vivo, historial y Chat GOZS). Al iniciar la app recibe la
 * hoja centrada informando el vencimiento, y mientras la cuota siga vencida
 * un banner persistente ofrece acceso rápido al Chat GOZS y al detalle.
 */
export function MembershipExpiredNotice() {
  const setAthleteChatOpen = useChatStore((s) => s.setAthleteChatOpen);

  const [sheetOpen, setSheetOpen] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  const detailsBtnRef = React.useRef<HTMLButtonElement>(null);
  const titleRef = React.useRef<HTMLHeadingElement>(null);

  const transferAlias = "GOZSTER.FIT";
  const whatsappNumber = "+5491155550199";
  const whatsappMessage = encodeURIComponent(
    "¡Hola equipo GOZS! Quiero renovar mi cuota y te envío el comprobante de transferencia.",
  );

  const closeDialog = React.useCallback(() => {
    setSheetOpen(false);
    requestAnimationFrame(() => detailsBtnRef.current?.focus());
  }, []);

  React.useEffect(() => {
    if (!sheetOpen) return;
    titleRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen, closeDialog]);

  const openGozsChat = () => {
    setSheetOpen(false);
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
      <section
        role="status"
        aria-live="polite"
        className="a-banner"
        data-testid="athlete-expired-banner"
      >
        <b className="a-t-bs">
          <TriangleAlert width={18} height={18} className="a-i" />
          Tu suscripción venció
        </b>
        <span className="a-t-sec">
          Seguís con acceso completo. Hablá con el equipo para regularizar tu cuota.
        </span>
        <div className="a-two">
          <button
            type="button"
            className="a-mini"
            onClick={openGozsChat}
            data-testid="expired-open-chat-banner"
          >
            Hablar con GOZS
          </button>
          <button
            ref={detailsBtnRef}
            type="button"
            className="a-mini a-ghost"
            onClick={() => setSheetOpen(true)}
            data-testid="expired-open-details"
          >
            Ver detalle
          </button>
        </div>
      </section>

      {sheetOpen && (
        <div
          className="a-sheet-wrap a-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
          data-testid="athlete-expired-dialog-backdrop"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="expired-dialog-title"
            className="a-sheet"
            data-testid="athlete-expired-dialog"
          >
            <div className="grid justify-items-center gap-2 text-center">
              <Hourglass width={30} height={30} className="a-i" />
              <h2
                id="expired-dialog-title"
                ref={titleRef}
                className="a-t-h"
                tabIndex={-1}
              >
                Tu suscripción venció
              </h2>
              <p className="a-t-body a-muted">
                Seguís entrando a la app con normalidad: entrenamiento, historial y chat. Para mantener tu plan al día, hablá con el equipo.
              </p>
            </div>

            <div className="a-alias">
              <span className="a-t-label a-muted">Alias de transferencia</span>
              <b className="a-t-bs">{transferAlias}</b>
              <button
                type="button"
                className="a-mini"
                onClick={handleCopyAlias}
                data-testid="expired-copy-alias-btn"
              >
                <Copy width={14} height={14} className="a-i" />
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>

            <ol className="a-steps a-t-sec">
              <li>Transferí la cuota mensual al alias.</li>
              <li>Mandá el comprobante por el chat o por WhatsApp.</li>
              <li>El equipo confirma el pago y tu cuota queda al día.</li>
            </ol>

            <button
              type="button"
              className="a-btn"
              onClick={openGozsChat}
              data-testid="expired-open-chat-dialog"
            >
              Hablar con el equipo GOZS
            </button>
            <a
              href={`https://wa.me/${whatsappNumber.replace("+", "")}?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="a-btn a-ghost"
            >
              Enviar comprobante por WhatsApp
            </a>
            <button
              type="button"
              className="a-link"
              onClick={closeDialog}
              data-testid="expired-dismiss"
            >
              Entendido, seguir usando la app
            </button>
          </div>
        </div>
      )}
    </>
  );
}
