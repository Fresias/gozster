import * as React from "react";
import type { Perfil } from "@/types/database.types";
import { Button } from "@/components/ui/button";

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
  const [chatMessages, setChatMessages] = React.useState<
    Array<{ id: string; sender: "coach" | "athlete"; text: string; time: string }>
  >([
    {
      id: "msg-1",
      sender: "athlete",
      text: "¡Hola profe! ¿En la serie pesada mantengo los 3 min de pausa?",
      time: "18:20",
    },
    {
      id: "msg-2",
      sender: "coach",
      text: "Sí Lucas, respetá los 3 min para no acumular fatiga antes del fallo.",
      time: "18:25",
    },
  ]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: "coach" as const,
      text: message.trim(),
      time: new Date().toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setChatMessages((prev) => [...prev, newMsg]);
    onSendMessage?.(message.trim());
    setMessage("");
  };

  return (
    <>
      {/* Floating Action Button (FAB) */}
      {/* Placed at fixed bottom-5 right-5 with z-40 and pointer-events */}
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
            alumno
              ? `Abrir chat con ${alumno.nombre_completo}`
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
          <span
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[11px] font-bold text-destructive-foreground ring-2 ring-background"
            aria-label="1 mensaje no leído"
          >
            1
          </span>
        </button>
      </aside>

      {/* Slide-over / Modal Chat Drawer */}
      {isOpen && (
        <div
          id="coach-chat-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-drawer-title"
          className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl transition-all"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-3.5">
            <div>
              <h3
                id="chat-drawer-title"
                className="text-sm font-bold text-foreground"
              >
                Chat con {alumno ? alumno.nombre_completo : "Atleta"}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                En línea • Respuestas rápidas
              </p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Cerrar chat"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              ✕
            </button>
          </div>

          {/* Messages body */}
          <div className="max-h-64 space-y-2.5 overflow-y-auto p-3 text-xs">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "coach" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    msg.sender === "coach"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  <p>{msg.text}</p>
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {msg.time}
                </span>
              </div>
            ))}
          </div>

          {/* Send Input */}
          <form
            onSubmit={handleSend}
            className="flex gap-2 border-t border-border p-3"
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe un mensaje rápido..."
              className="min-h-11 flex-1 rounded-md border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              type="submit"
              size="sm"
              variant="default"
              className="min-h-11 px-3 text-xs font-semibold"
            >
              Enviar
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
