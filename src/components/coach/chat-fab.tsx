"use client";

import * as React from "react";
import type { Perfil } from "@/types/database.types";
import { Button } from "@/components/ui/button";
import {
  AVAILABLE_COACH_SENDERS,
  STAFF_COACH_FELIX,
  STAFF_COACH_PRINCIPAL,
  useChatStore,
} from "@/store/use-chat-store";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

export interface ChatFabProps {
  alumno: Perfil | null;
  isOpen: boolean;
  onToggle: () => void;
  onSendMessage?: (text: string) => void;
}

export function ChatFab({
  alumno,
  isOpen,
  onToggle,
  onSendMessage,
}: ChatFabProps) {
  const [message, setMessage] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const {
    conversations,
    activeCoachSender,
    setActiveCoachSender,
    getConversation,
    sendMessage,
    markAsRead,
  } = useChatStore();

  const { isOnline } = useOfflineQueueStore();

  // Si no se pasó alumno por props, permitimos seleccionar uno localmente o usamos el primero
  const [localAlumnoId, setLocalAlumnoId] = React.useState<string>(
    alumno?.id || MOCK_ALUMNOS[0]?.id || "a1111111-1111-4111-8111-111111111101",
  );

  React.useEffect(() => {
    if (alumno?.id) {
      setLocalAlumnoId(alumno.id);
    }
  }, [alumno?.id]);

  const currentAlumnoId = alumno?.id || localAlumnoId;
  const currentAlumno =
    alumno || MOCK_ALUMNOS.find((a) => a.id === currentAlumnoId) || MOCK_ALUMNOS[0];

  const conversation = getConversation(
    currentAlumnoId,
    currentAlumno?.nombre_completo,
  );
  const chatMessages = conversation.mensajes;

  // Auto-scroll al final cuando llegan mensajes nuevos
  React.useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      markAsRead(currentAlumnoId);
    }
  }, [isOpen, chatMessages.length, currentAlumnoId, markAsRead]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    sendMessage({
      alumnoId: currentAlumnoId,
      remitente: activeCoachSender,
      contenido: message.trim(),
    });

    onSendMessage?.(message.trim());
    setMessage("");
  };

  const unreadTotal = Object.values(conversations).reduce(
    (sum, c) => sum + (c.unreadCount || 0),
    0,
  );

  return (
    <>
      {/* Floating Action Button (FAB) */}
      {/* Posicionado en bottom-5 right-5 sm:bottom-6 sm:right-6 con z-40 desacoplado */}
      <aside
        aria-label="Acceso flotante a mensajería"
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls="coach-chat-drawer"
          aria-label={
            currentAlumno
              ? `Abrir chat con ${currentAlumno.nombre_completo}`
              : "Abrir mensajería de Coach Studio"
          }
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 select-none touch-manipulation"
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

          {/* Unread badge */}
          {unreadTotal > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[11px] font-bold text-destructive-foreground ring-2 ring-background"
              aria-label={`${unreadTotal} mensajes no leídos`}
            >
              {unreadTotal}
            </span>
          )}
        </button>
      </aside>

      {/* Slide-over / Modal Chat Drawer */}
      {isOpen && (
        <div
          id="coach-chat-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-drawer-title"
          className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-50 flex w-[calc(100vw-2rem)] max-w-md flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl transition-all animate-in fade-in-50 zoom-in-95"
        >
          {/* Header */}
          <div className="flex flex-col border-b border-border p-3.5 gap-2 bg-card/90">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  id="chat-drawer-title"
                  className="text-sm font-bold text-foreground flex items-center gap-2"
                >
                  <span>Chat con {currentAlumno?.nombre_completo || "Atleta"}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    Staff Compartido
                  </span>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Hilo sincronizado entre Coach Principal, Félix y el alumno
                </p>
              </div>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Cerrar chat"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground touch-manipulation min-h-8 min-w-8"
              >
                ✕
              </button>
            </div>

            {/* Selector de alumno si no hay ninguno seleccionado por props */}
            {!alumno && (
              <div className="flex items-center gap-2 text-xs">
                <label
                  htmlFor="coach-chat-student-select"
                  className="text-[11px] font-medium text-muted-foreground shrink-0"
                >
                  Atleta:
                </label>
                <select
                  id="coach-chat-student-select"
                  value={currentAlumnoId}
                  onChange={(e) => setLocalAlumnoId(e.target.value)}
                  className="min-h-9 flex-1 rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {MOCK_ALUMNOS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre_completo} ({a.estado_membresia})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Selector de identidad del coach que responde */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50 text-[11px]">
              <span className="text-muted-foreground font-medium">
                Responder como:
              </span>
              <div className="flex gap-1.5">
                {AVAILABLE_COACH_SENDERS.map((coach) => {
                  const isSelected = activeCoachSender.id === coach.id;
                  return (
                    <button
                      key={coach.id}
                      type="button"
                      onClick={() => setActiveCoachSender(coach)}
                      className={`min-h-7 px-2.5 py-0.5 rounded-full font-medium transition-all text-[11px] ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {coach.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Banner de estado offline */}
          {!isOnline && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-300 flex items-center justify-between">
              <span>⚠️ Modo Offline: los mensajes se enviarán al reconectar</span>
              <span className="font-semibold text-[10px]">Cola activa</span>
            </div>
          )}

          {/* Messages body */}
          <div
            className="max-h-80 min-h-52 space-y-3 overflow-y-auto p-3 text-xs"
            data-testid="coach-chat-messages-container"
          >
            {chatMessages.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No hay mensajes previos en este hilo. ¡Sé el primero en escribir!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id}>
                  {msg.es_staff ? (
                    /* Mensaje emitido por un miembro del staff de entrenadores */
                    <div
                      className="flex flex-col items-end"
                      data-testid={`staff-message-${msg.id}`}
                    >
                      {/* Cabecera con autoría explícita (ej. "Félix contestó..." o "Coach Principal contestó...") */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-semibold text-primary">
                          {msg.remitente_nombre} contestó...
                        </span>
                        <span className="rounded bg-primary/20 px-1 py-0.2 text-[9px] font-bold text-primary uppercase">
                          Staff
                        </span>
                      </div>

                      <div className="flex items-end gap-1.5 max-w-[90%]">
                        <div className="rounded-2xl rounded-tr-none px-3.5 py-2.5 bg-primary text-primary-foreground shadow-sm">
                          <p className="text-xs leading-relaxed">{msg.contenido}</p>
                        </div>
                        {/* Avatar identificatorio del profesor */}
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[11px] font-bold text-primary ring-2 ring-primary/40 select-none"
                          title={msg.remitente_nombre}
                          aria-label={`Avatar de ${msg.remitente_nombre}`}
                        >
                          {msg.remitente_nombre.charAt(0)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground mr-9">
                        <span>{msg.hora}</span>
                        {msg.estado_envio === "pendiente" && (
                          <span className="text-amber-400 font-semibold">
                            ⏳ Pendiente
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Mensaje emitido por el alumno */
                    <div
                      className="flex flex-col items-start"
                      data-testid={`athlete-message-${msg.id}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {msg.remitente_nombre}
                        </span>
                        <span className="rounded bg-secondary px-1 py-0.2 text-[9px] font-medium text-muted-foreground">
                          Atleta
                        </span>
                      </div>

                      <div className="flex items-start gap-1.5 max-w-[90%]">
                        {/* Avatar del atleta */}
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground ring-1 ring-border select-none"
                          title={msg.remitente_nombre}
                          aria-label={`Avatar de ${msg.remitente_nombre}`}
                        >
                          {msg.remitente_nombre.charAt(0)}
                        </div>
                        <div className="rounded-2xl rounded-tl-none px-3.5 py-2.5 bg-secondary text-secondary-foreground border border-border/40 shadow-sm">
                          <p className="text-xs leading-relaxed">{msg.contenido}</p>
                        </div>
                      </div>

                      <span className="mt-0.5 text-[10px] text-muted-foreground ml-9">
                        {msg.hora}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Formulario de envío ergonómico */}
          <form
            onSubmit={handleSend}
            className="flex gap-2 border-t border-border p-3 bg-card/60"
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Responder como ${activeCoachSender.nombre}...`}
              className="min-h-11 flex-1 rounded-md border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              type="submit"
              size="sm"
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
