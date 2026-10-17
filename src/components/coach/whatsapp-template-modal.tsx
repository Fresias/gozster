"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  generateWhatsAppArgentinoUrl,
  type WhatsAppTemplateType,
} from "@/lib/strength-metrics";

export interface WhatsAppTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  alumnoNombre: string;
  phone?: string | null;
  exerciseName?: string;
  defaultTemplate?: WhatsAppTemplateType;
}

/**
 * Modal de Mensajes de WhatsApp con Templates de Profesor Argentino (Fat-Finger Friendly).
 * Permite enviar en 1 toque el mensaje adecuado para:
 * - Aviso de vencimiento de cuota
 * - Reactivación por inactividad
 * - Felicitación por nuevo récord personal (PR)
 */
export function WhatsAppTemplateModal({
  isOpen,
  onClose,
  alumnoNombre,
  phone,
  exerciseName = "Press de Banca Plano",
  defaultTemplate: _defaultTemplate,
}: WhatsAppTemplateModalProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const templates: {
    type: WhatsAppTemplateType;
    label: string;
    icon: string;
    badge: string;
    tagColor: string;
  }[] = [
    {
      type: "cuota",
      label: "Aviso de Cuota por Vencer",
      icon: "💳",
      badge: "Cuota",
      tagColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    },
    {
      type: "inactividad",
      label: "Reactivación por Inactividad",
      icon: "⏱",
      badge: "Inactividad",
      tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    },
    {
      type: "record",
      label: "Felicitación por Récord de Fuerza (PR)",
      icon: "⚡",
      badge: "Récord",
      tagColor: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
    },
  ];

  const handleSend = (type: WhatsAppTemplateType) => {
    const { url } = generateWhatsAppArgentinoUrl({
      phone,
      studentName: alumnoNombre,
      type,
      exerciseName,
    });
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    onClose();
  };

  const handleCopy = (type: WhatsAppTemplateType) => {
    const { message } = generateWhatsAppArgentinoUrl({
      phone,
      studentName: alumnoNombre,
      type,
      exerciseName,
    });
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(message);
      setCopiedId(type);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-template-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0"
    >
      <div className="relative w-full max-w-xl rounded-2xl border border-emerald-500/40 bg-card p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header con botón de cierre */}
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xl font-bold border border-emerald-500/30 shadow-xs">
              💬
            </span>
            <div>
              <h3
                id="whatsapp-template-title"
                className="text-base sm:text-lg font-black tracking-tight text-foreground"
              >
                Templates WhatsApp (Coach Argentino)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Para: <strong className="text-foreground">{alumnoNombre}</strong>
                {phone ? ` (${phone})` : " (sin teléfono cargado)"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Lista de Templates Táctiles ≥ 48px */}
        <div className="space-y-3">
          {templates.map((tmpl) => {
            const { message, url } = generateWhatsAppArgentinoUrl({
              phone,
              studentName: alumnoNombre,
              type: tmpl.type,
              exerciseName,
            });

            return (
              <div
                key={tmpl.type}
                className="rounded-xl border border-border/80 bg-secondary/20 p-4 space-y-3 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{tmpl.icon}</span>
                    <span className="text-xs font-bold text-foreground">
                      {tmpl.label}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${tmpl.tagColor}`}
                  >
                    {tmpl.badge}
                  </span>
                </div>

                {/* Burbuja del mensaje */}
                <div className="rounded-xl border border-border/60 bg-card p-3 text-xs text-foreground font-medium leading-relaxed shadow-2xs">
                  &ldquo;{message}&rdquo;
                </div>

                {/* Acciones Táctiles: Enviar wa.me directo + Copiar */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    onClick={() => handleSend(tmpl.type)}
                    className="flex-1 min-h-12 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xs gap-2 active:scale-95 transition-transform"
                    data-testid={
                      tmpl.type === "cuota"
                        ? "btn-send-whatsapp-cuota"
                        : tmpl.type === "inactividad"
                        ? "btn-send-whatsapp-inactividad"
                        : "btn-send-whatsapp-record"
                    }
                  >
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.299.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.086-.177.18-.076.353.101.173.449.741.964 1.2 1.034.922 1.353.948 1.545 1.043.193.095.304.08.417-.052.113-.131.484-.564.613-.757.13-.193.26-.162.434-.097.173.065 1.098.518 1.286.612.188.094.314.141.361.22.047.079.047.463-.097.868z" />
                    </svg>
                    <span>Enviar por WhatsApp</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCopy(tmpl.type)}
                    className="min-h-12 min-w-12 px-3 text-xs font-semibold rounded-xl border-border/80"
                    title="Copiar texto al portapapeles"
                    aria-label="Copiar texto"
                  >
                    {copiedId === tmpl.type ? "✓" : "📋"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-11 px-5 text-xs font-semibold"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
