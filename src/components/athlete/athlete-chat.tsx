"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ATHLETE_SENDER,
  useChatStore,
} from "@/store/use-chat-store";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

export interface AthleteChatProps {
  athleteId?: string;
  athleteName?: string;
}

const QUICK_GYM_REPLIES = [
  "¿Puedo subir 5kg en esta serie?",
  "¿Cuánto descanso mantengo acá?",
  "¡Terminé el bloque de fuerza!",
  "¿Revisás mi técnica en sentadilla?",
];

export function AthleteChat({
  athleteId = DEFAULT_ATHLETE_SENDER.id,
  athleteName = DEFAULT_ATHLETE_SENDER.nombre,
}: AthleteChatProps) {
  const [message, setMessage] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const { restTimer } = useAthleteStore();
  const { isOnline } = useOfflineQueueStore();
  const {
    getConversation,
    sendMessage,
    markAsRead,
    isAthleteChatOpen: isOpen,
    setAthleteChatOpen,
  } = useChatStore();

  const conversation = getConversation(athleteId, athleteName);
  const messages = conversation.mensajes;

  // Auto-scroll al final al abrir o enviar
  React.useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      markAsRead(athleteId);
    }
  }, [isOpen, messages.length, athleteId, markAsRead]);

  const handleSend = (textToSend?: string) => {
    const text = (textToSend ?? message).trim();
    if (!text) return;

    sendMessage({
      alumnoId: athleteId,
      remitente: {
        id: athleteId,
        nombre: athleteName,
        rol: "ALUMNO",
        esStaff: false,
      },
      contenido: text,
    });

    setMessage("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  // Posicionamiento dinámico seguro para no colisionar con el banner de RestTimer
  const fabBottomClass = restTimer.isActive
    ? "bottom-28 right-4 sm:bottom-32 sm:right-6"
    : "bottom-5 right-4 sm:bottom-6 sm:right-6";

  const staffMessagesCount = messages.filter((m) => m.es_staff).length;

  return (
    <>
      {/* Botón flotante táctil (FAB) de Chat para el Atleta */}
      <aside
        aria-label="Acceso a mensajería con el equipo GOZS"
        className={`fixed ${fabBottomClass} z-40 transition-all duration-300`}
      >
        <button
          type="button"
          onClick={() => setAthleteChatOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls="athlete-chat-drawer"
          aria-label="Abrir chat con el equipo GOZS"
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 select-none touch-manipulation min-h-11 min-w-11"
        >
          <svg
            className="h-6 w-6 fill-none stroke-current stroke-2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>

          {/* Badge de mensajes de entrenadores */}
          {staffMessagesCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white ring-2 ring-background"
              aria-label={`${staffMessagesCount} respuestas del equipo GOZS`}
            >
              {staffMessagesCount}
            </span>
          )}
        </button>
      </aside>

      {/* Drawer / Modal Táctil de Chat para el Atleta */}
      {isOpen && (
        <div
          id="athlete-chat-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="athlete-chat-title"
          className="fixed inset-x-3 bottom-4 top-16 sm:inset-x-auto sm:right-6 sm:bottom-20 sm:top-auto sm:h-[540px] sm:w-96 z-50 flex flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl backdrop-blur transition-all animate-in fade-in-50 zoom-in-95"
        >
          {/* Header del Chat */}
          <div className="flex items-center justify-between border-b border-border p-3.5 bg-card/95">
            <div>
              <h3
                id="athlete-chat-title"
                className="text-sm font-bold text-foreground flex items-center gap-2"
              >
                <span>GOZS</span>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Equipo
                </span>
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Tu equipo de entrenadores GOZS
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAthleteChatOpen(false)}
              aria-label="Cerrar chat"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground touch-manipulation min-h-11 min-w-11"
            >
              ✕
            </button>
          </div>

          {/* Advertencia Offline si está en modo avión */}
          {!isOnline && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-300 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>Modo Avión: Tu mensaje se enviará al retomar conexión.</span>
            </div>
          )}

          {/* Listado ergonómico de mensajes */}
          <div
            className="flex-1 space-y-3.5 overflow-y-auto p-3.5 text-xs"
            data-testid="athlete-chat-messages-container"
          >
            {messages.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Comunícate directamente con el equipo GOZS.
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id}>
                  {msg.es_staff ? (
                    /* Mensaje emitido por el equipo GOZS (Identidad institucional unificada "Somos un equipo") */
                    <div
                      className="flex flex-col items-start"
                      data-testid={`staff-message-bubble-${msg.id}`}
                    >
                      {/* Identidad institucional GOZS hacia el alumno (sin firmas individuales ni nombres de profesores) */}
                      <div className="flex items-center gap-1.5 mb-1 ml-9">
                        <span
                          className="text-[11px] font-bold text-primary"
                          data-testid={`staff-author-${msg.id}`}
                        >
                          GOZS
                        </span>
                        <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[9px] font-extrabold text-primary uppercase">
                          Equipo
                        </span>
                      </div>

                      <div className="flex items-start gap-2 max-w-[90%]">
                        {/* Avatar institucional unificado GOZS */}
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary ring-2 ring-primary/40 select-none"
                          title="GOZS"
                          aria-label="Avatar del equipo GOZS"
                        >
                          G
                        </div>

                        <div className="rounded-2xl rounded-tl-none px-3.5 py-2.5 bg-secondary text-secondary-foreground border border-border shadow-sm">
                          <p className="text-xs leading-relaxed">{msg.contenido}</p>
                        </div>
                      </div>

                      <span className="mt-1 text-[10px] text-muted-foreground ml-9">
                        {msg.hora}
                      </span>
                    </div>
                  ) : (
                    /* Mensaje emitido por el propio atleta */
                    <div
                      className="flex flex-col items-end"
                      data-testid={`athlete-own-bubble-${msg.id}`}
                    >
                      <div className="flex items-end gap-2 max-w-[90%]">
                        <div className="rounded-2xl rounded-tr-none px-3.5 py-2.5 bg-primary text-primary-foreground shadow-sm">
                          <p className="text-xs leading-relaxed">{msg.contenido}</p>
                        </div>
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/30 text-[10px] font-bold text-primary-foreground ring-1 ring-primary-foreground/30 select-none"
                          aria-label="Tu avatar"
                        >
                          Tú
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground mr-9">
                        <span>{msg.hora}</span>
                        {msg.estado_envio === "pendiente" && (
                          <span className="text-amber-400 font-semibold">
                            ⏳ Pendiente
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Respuestas rápidas táctiles para el gimnasio (chips ergonómicos) */}
          <div className="border-t border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-[10px] text-muted-foreground font-medium mb-1.5">
              Respuestas rápidas para el gimnasio:
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {QUICK_GYM_REPLIES.map((quickText, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(quickText)}
                  className="shrink-0 min-h-7 rounded-full bg-secondary/80 hover:bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground transition-colors border border-border/50 touch-manipulation"
                >
                  {quickText}
                </button>
              ))}
            </div>
          </div>

          {/* Formulario táctil de envío */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-border p-3 bg-card"
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe al equipo GOZS..."
              className="min-h-11 flex-1 rounded-lg border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              type="submit"
              size="default"
              variant="default"
              className="min-h-11 px-4 text-xs font-semibold"
            >
              Enviar
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
