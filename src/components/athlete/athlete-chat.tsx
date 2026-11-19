"use client";

import * as React from "react";
import { Check, X } from "@/components/athlete/icons";
import {
  DEFAULT_ATHLETE_SENDER,
  useChatStore,
} from "@/store/use-chat-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  getPushSubscriptionStatus,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-notifications";

export interface AthleteChatProps {
  athleteId?: string;
  athleteName?: string;
}

const QUICK_GYM_REPLIES = [
  "¿Puedo subir 5 kg en esta serie?",
  "¿Cuánto descanso mantengo?",
  "Me molesta la rodilla",
];

export function AthleteChat({
  athleteId = DEFAULT_ATHLETE_SENDER.id,
  athleteName = DEFAULT_ATHLETE_SENDER.nombre,
}: AthleteChatProps) {
  const [message, setMessage] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

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

  const [pushStatus, setPushStatus] = React.useState<{
    isSubscribed: boolean;
    loading: boolean;
    message?: string;
  }>({
    isSubscribed: false,
    loading: false,
  });

  React.useEffect(() => {
    getPushSubscriptionStatus(athleteId).then((st) => {
      setPushStatus((prev) => ({ ...prev, isSubscribed: st.isSubscribed }));
    });
  }, [athleteId]);

  const handleTogglePush = async () => {
    setPushStatus((prev) => ({ ...prev, loading: true, message: undefined }));
    if (pushStatus.isSubscribed) {
      await unsubscribeFromPush(athleteId);
      setPushStatus({ isSubscribed: false, loading: false });
    } else {
      const res = await subscribeToPush(athleteId);
      if (res.success) {
        setPushStatus({
          isSubscribed: true,
          loading: false,
          message: "Te avisamos cuando responda tu coach.",
        });
      } else {
        setPushStatus({
          isSubscribed: false,
          loading: false,
          message: res.error || "No se pudo activar push",
        });
      }
    }
  };

  // Foco al título al abrir, Escape cierra y el foco vuelve al disparador (a11y de hojas).
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!isOpen) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAthleteChatOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [isOpen, setAthleteChatOpen]);

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

  if (!isOpen) return null;

  return (
    <div
      className="a-sheet-wrap justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) setAthleteChatOpen(false);
      }}
    >
      <div
        id="athlete-chat-drawer"
        className="a-sheet max-w-[28rem]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="athlete-chat-title"
      >
        <div className="a-sh-h">
          <div>
            <h2 id="athlete-chat-title" ref={titleRef} className="a-t-h" tabIndex={-1}>
              <span>GOZS</span> · Equipo
            </h2>
            <span className="a-t-sec a-muted">Tu equipo de entrenadores GOZS</span>
          </div>
          <button
            type="button"
            className="a-icon-btn"
            onClick={() => setAthleteChatOpen(false)}
            aria-label="Cerrar chat"
          >
            <X width={18} height={18} className="a-i" />
          </button>
        </div>

        {/* Avisos push (PWA) */}
        <div
          data-testid="push-subscription-container"
          className="a-card"
          style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}
        >
          <span className="a-t-sec" style={{ flex: 1 }} role="status">
            {pushStatus.message ||
              (pushStatus.isSubscribed
                ? "Te avisamos cuando responda tu coach."
                : "¿Querés que te avisemos cuando responda tu coach?")}
          </span>
          <button
            type="button"
            onClick={handleTogglePush}
            data-testid="toggle-push-btn"
            disabled={pushStatus.loading}
            aria-pressed={pushStatus.isSubscribed}
            className={`a-mini ${pushStatus.isSubscribed ? "a-done" : ""}`}
          >
            {pushStatus.loading ? (
              "..."
            ) : pushStatus.isSubscribed ? (
              <>
                <Check width={14} height={14} className="a-i" /> Avisos activos
              </>
            ) : (
              "Activar avisos"
            )}
          </button>
        </div>

        {!isOnline && (
          <p className="a-eb a-t-label a-offnote" role="status">
            Sin conexión · tu mensaje se envía al volver la señal
          </p>
        )}

        <div className="a-msgs" data-testid="athlete-chat-messages-container" aria-live="polite">
          {messages.length === 0 ? (
            <p className="a-t-sec a-muted" style={{ textAlign: "center" }}>
              Comunícate directamente con el equipo GOZS.
            </p>
          ) : (
            messages.map((msg) =>
              msg.es_staff ? (
                <div
                  key={msg.id}
                  className="a-msg a-t-body"
                  data-testid={`staff-message-bubble-${msg.id}`}
                >
                  {msg.contenido}
                  <small>
                    <span data-testid={`staff-author-${msg.id}`}>Coach</span> · {msg.hora}
                    {!msg.leido && (
                      <span data-testid={`unread-tag-${msg.id}`}> · No leído</span>
                    )}
                  </small>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className="a-msg a-me a-t-body"
                  data-testid={`athlete-own-bubble-${msg.id}`}
                >
                  {msg.contenido}
                  <small>
                    Vos · {msg.hora}
                    {msg.estado_envio === "pendiente" && " · Pendiente"}
                  </small>
                </div>
              ),
            )
          )}
          <div ref={messagesEndRef} />
        </div>

        <span className="a-t-label a-muted">Respuestas rápidas</span>
        <div className="a-quick">
          {QUICK_GYM_REPLIES.map((quickText) => (
            <button key={quickText} type="button" onClick={() => handleSend(quickText)}>
              {quickText}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="a-chatf">
          <label htmlFor="chatIn" className="sr-only">Mensaje</label>
          <input
            id="chatIn"
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoComplete="off"
            placeholder="Escribile al equipo GOZS"
            className="a-fin a-t-body"
          />
          <button type="submit">Enviar</button>
        </form>
      </div>
    </div>
  );
}
