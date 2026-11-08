"use client";

import * as React from "react";
import type { EstadoConversacion, Perfil } from "@/types/database.types";
import { Button } from "@/components/ui/button";
import {
  AVAILABLE_COACH_SENDERS,
  STAFF_COACH_FELIX,
  STAFF_COACH_PRINCIPAL,
  useChatStore,
  type ChatMessage,
} from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { X, Check, CloudOff, Timer, Search } from "@/components/coach/icons";

export interface ChatFabProps {
  alumno: Perfil | null;
  isOpen: boolean;
  onToggle: () => void;
  onSendMessage?: (text: string) => void;
}

export type ChatFilterType = "TODOS" | "NUEVOS" | "PENDIENTES";

export function ChatFab({
  alumno,
  isOpen,
  onToggle,
  onSendMessage,
}: ChatFabProps) {
  const [message, setMessage] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const {
    conversations,
    activeCoachSender,
    setActiveCoachSender,
    getConversation,
    sendMessage,
    transferirConversacion,
    markAsRead,
  } = useChatStore();

  const { isOnline } = useOfflineQueueStore();
  const studioAlumnos = useCoachStudioStore((s) => s.alumnos);

  // Filtros del Inbox
  const [activeFilter, setActiveFilter] = React.useState<ChatFilterType>("TODOS");

  // Modo directo: si se invocó con alumno explícito (ej. openChatForAlumno o ficha)
  const isDirectMode = Boolean(alumno);

  // Vista activa: "inbox" o "chat"
  const [viewMode, setViewMode] = React.useState<"inbox" | "chat">(
    alumno ? "chat" : "inbox",
  );
  const [selectedInboxAlumno, setSelectedInboxAlumno] = React.useState<Perfil | null>(
    alumno,
  );

  // Sincronizar vista y selección ante cambios en props
  React.useEffect(() => {
    if (alumno) {
      setViewMode("chat");
      setSelectedInboxAlumno(alumno);
    } else {
      setViewMode("inbox");
      setSelectedInboxAlumno(null);
    }
  }, [alumno, isOpen]);

  // Alumno activo en la vista de conversación
  const currentAlumno = alumno || selectedInboxAlumno;
  const currentAlumnoId = currentAlumno?.id || "";

  // Estados de transferencia de responsable (disponible en modo no simplificado si se requiere)
  const [isTransferOpen, setIsTransferOpen] = React.useState(false);
  const [transferTargetCoachId, setTransferTargetCoachId] = React.useState<string>(
    AVAILABLE_COACH_SENDERS[1]?.id || STAFF_COACH_FELIX.id,
  );
  const [transferMotivo, setTransferMotivo] = React.useState("");
  const [isTransferring, setIsTransferring] = React.useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = React.useState<string | null>(null);
  const [transferErrorMsg, setTransferErrorMsg] = React.useState<string | null>(null);

  // Conversación activa
  const conversation = currentAlumnoId
    ? getConversation(currentAlumnoId, currentAlumno?.nombre_completo)
    : null;
  const chatMessages = conversation?.mensajes || [];

  // Auto-scroll al final y marcar como leído
  React.useEffect(() => {
    if (isOpen && viewMode === "chat" && currentAlumnoId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      markAsRead(currentAlumnoId);
    }
  }, [isOpen, viewMode, chatMessages.length, currentAlumnoId, markAsRead]);

  // Totales de no leídos y pendientes para los filtros
  const unreadTotal = React.useMemo(() => {
    return Object.values(conversations).reduce(
      (sum, c) => sum + (c.unreadCount || 0),
      0,
    );
  }, [conversations]);

  const pendientesTotal = React.useMemo(() => {
    return Object.values(conversations).filter(
      (c) =>
        c.estado === "PENDIENTE" ||
        (c.unreadCount || 0) > 0 ||
        c.mensajes.some((m) => m.estado_envio === "pendiente"),
    ).length;
  }, [conversations]);

  // Lista unificada de alumnos para el Inbox (datos reales de Supabase o fallback MOCK)
  const allAlumnos = React.useMemo(() => {
    if (studioAlumnos && studioAlumnos.length > 0) return studioAlumnos;
    return MOCK_ALUMNOS;
  }, [studioAlumnos]);

  // Conversaciones procesadas para el Inbox
  const inboxItems = React.useMemo(() => {
    const map = new Map<
      string,
      {
        alumno: Perfil;
        lastMsg?: ChatMessage;
        unread: number;
        estado: EstadoConversacion;
        lastTime: number;
      }
    >();

    for (const a of allAlumnos) {
      const conv = conversations[a.id];
      const msgs = conv?.mensajes || [];
      const lastMsg = msgs[msgs.length - 1];
      const unread = conv?.unreadCount || 0;
      const estado = conv?.estado || "ABIERTA";
      const lastTime = lastMsg ? new Date(lastMsg.created_at).getTime() : 0;
      map.set(a.id, { alumno: a, lastMsg, unread, estado, lastTime });
    }

    for (const [id, conv] of Object.entries(conversations)) {
      if (!map.has(id)) {
        const msgs = conv.mensajes || [];
        const lastMsg = msgs[msgs.length - 1];
        const unread = conv.unreadCount || 0;
        const estado = conv.estado || "ABIERTA";
        const lastTime = lastMsg ? new Date(lastMsg.created_at).getTime() : 0;
        const fallbackAlumno: Perfil = {
          id,
          nombre_completo: conv.alumno_nombre || "Atleta",
          rol: "ALUMNO",
          estado_membresia: "ACTIVA",
          email: `${id.slice(0, 8)}@gym.test`,
          profesor_asignado_id: null,
          fecha_baja: null,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
        };
        map.set(id, { alumno: fallbackAlumno, lastMsg, unread, estado, lastTime });
      }
    }

    let list = Array.from(map.values());

    // Filtro por buscador
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.alumno.nombre_completo.toLowerCase().includes(q) ||
          (item.lastMsg?.contenido &&
            item.lastMsg.contenido.toLowerCase().includes(q)),
      );
    }

    // Filtro por pestaña
    if (activeFilter === "NUEVOS") {
      list = list.filter((item) => item.unread > 0);
    } else if (activeFilter === "PENDIENTES") {
      list = list.filter(
        (item) =>
          item.estado === "PENDIENTE" ||
          item.unread > 0 ||
          (conversations[item.alumno.id]?.mensajes || []).some(
            (m) => m.estado_envio === "pendiente",
          ),
      );
    }

    // Ordenar: conversaciones con no leídos primero, luego por fecha más reciente
    list.sort((a, b) => {
      if (a.unread > 0 && b.unread === 0) return -1;
      if (a.unread === 0 && b.unread > 0) return 1;
      return b.lastTime - a.lastTime;
    });

    return list;
  }, [allAlumnos, conversations, searchQuery, activeFilter]);

  const handleSelectConversation = (targetAlumno: Perfil) => {
    setSelectedInboxAlumno(targetAlumno);
    setViewMode("chat");
    useChatStore.getState().setSelectedAlumnoId(targetAlumno.id);
    markAsRead(targetAlumno.id);
  };

  const handleBackToInbox = () => {
    setViewMode("inbox");
    setSelectedInboxAlumno(null);
    useCoachStudioStore.getState().setChatAlumnoId(null);
    useChatStore.getState().setSelectedAlumnoId(null);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !currentAlumnoId) return;

    sendMessage({
      alumnoId: currentAlumnoId,
      remitente: activeCoachSender,
      contenido: message.trim(),
    });

    onSendMessage?.(message.trim());
    setMessage("");
  };

  const handleTransferir = async () => {
    if (!conversation) return;
    setIsTransferring(true);
    setTransferSuccessMsg(null);
    setTransferErrorMsg(null);

    const targetCoach = AVAILABLE_COACH_SENDERS.find(
      (c) => c.id === transferTargetCoachId,
    );
    const targetNombre = targetCoach?.nombre || "Coach Asignado";

    try {
      const res = await transferirConversacion({
        conversacionId: conversation.id,
        nuevoResponsableId: transferTargetCoachId,
        motivo: transferMotivo.trim() || undefined,
        alumnoId: currentAlumnoId,
      });

      if (!res.success && res.error) {
        setTransferErrorMsg(res.error);
      } else {
        setTransferSuccessMsg(`Conversación transferida a ${targetNombre}`);
        setTransferMotivo("");
        setTimeout(() => {
          setIsTransferOpen(false);
          setTransferSuccessMsg(null);
        }, 1800);
      }
    } catch (err: any) {
      setTransferErrorMsg(err?.message || "Error al transferir");
    } finally {
      setIsTransferring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="coach-chat-drawer"
      data-testid="coach-chat-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-drawer-title"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l border-border bg-card text-card-foreground shadow-[-8px_0_24px_rgb(0_0_0_/_0.08)] transition-all"
    >
      {viewMode === "inbox" || !currentAlumno ? (
        /* ========================================================================= */
        /* VISTA 1: INBOX GENERAL DE CHATS (Master)                                  */
        /* ========================================================================= */
        <div className="flex h-full flex-col">
          {/* Header del Inbox */}
          <div className="flex flex-col border-b border-border p-3.5 gap-2.5 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  id="chat-drawer-title"
                  data-testid="chat-inbox-title"
                  className="text-sm font-semibold text-foreground flex items-center gap-2"
                >
                  <span>Inbox de Chats</span>
                  {unreadTotal > 0 && (
                    <span
                      data-testid="chat-inbox-unread-count-badge"
                      className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive border border-destructive/20"
                    >
                      {unreadTotal} sin leer
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Bandeja unificada de conversaciones activas
                </p>
              </div>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Cerrar chat"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Buscador de conversaciones */}
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar conversación..."
                data-testid="chat-inbox-search"
                className="min-h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Barra de Filtros: Todos / Nuevos / Pendientes (sin Molestias) */}
            <div
              className="flex items-center gap-1.5 overflow-x-auto pt-1 text-[11px]"
              data-testid="coach-chat-filter-bar"
            >
              {(["TODOS", "NUEVOS", "PENDIENTES"] as const).map((filter) => {
                const isActive = activeFilter === filter;
                let count = 0;
                if (filter === "NUEVOS") count = unreadTotal;
                if (filter === "PENDIENTES") count = pendientesTotal;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`min-h-7 px-3 py-1 rounded-full text-[11px] font-semibold transition-all touch-manipulation cursor-pointer ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary/70 text-secondary-foreground hover:bg-secondary"
                    }`}
                    data-testid={`chat-filter-${filter.toLowerCase()}`}
                  >
                    {filter === "TODOS" && "Todos"}
                    {filter === "NUEVOS" && `Nuevos (${count})`}
                    {filter === "PENDIENTES" && `Pendientes (${count})`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Banner offline */}
          {!isOnline && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-300 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5">
                <CloudOff className="h-3.5 w-3.5 text-amber-300 inline" aria-hidden="true" />{" "}
                Modo Offline: los mensajes se enviarán al reconectar
              </span>
              <span className="font-semibold text-[10px]">Cola activa</span>
            </div>
          )}

          {/* Lista de conversaciones activas */}
          <div
            data-testid="chat-inbox-list"
            className="flex-1 overflow-y-auto divide-y divide-border/40"
          >
            {inboxItems.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No se encontraron conversaciones
              </div>
            ) : (
              inboxItems.map(({ alumno: a, lastMsg, unread, estado }) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelectConversation(a)}
                  data-testid={`chat-inbox-item-${a.id}`}
                  className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                >
                  {/* Avatar con iniciales */}
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/20 select-none"
                    aria-hidden="true"
                  >
                    {a.nombre_completo.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Detalles */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {a.nombre_completo}
                      </span>
                      {lastMsg?.hora && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {lastMsg.hora}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate line-clamp-1">
                      {lastMsg?.contenido || "Sin mensajes previos"}
                    </p>
                  </div>

                  {/* Badges de no leído y estado */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {unread > 0 && (
                      <span
                        data-testid={`unread-badge-${a.id}`}
                        className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground"
                      >
                        {unread}
                      </span>
                    )}
                    {estado === "PENDIENTE" && (
                      <span className="rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold uppercase">
                        Pendiente
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* VISTA 2: CONVERSACIÓN CON EL ALUMNO (Detail)                              */
        /* (Modo simplificado si fue directo, enfocado en mensajería)                */
        /* ========================================================================= */
        <div className="flex h-full flex-col">
          {/* Header de conversación */}
          <div className="flex flex-col border-b border-border p-3.5 gap-2 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <button
                  type="button"
                  onClick={handleBackToInbox}
                  data-testid="chat-back-to-conversations"
                  data-test-back="chat-back-to-inbox"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground mb-1 inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  ← Volver a chats
                </button>
                <h3
                  id="chat-drawer-title"
                  className="text-sm font-semibold text-foreground flex items-center gap-2"
                >
                  <span>Chat con {currentAlumno.nombre_completo}</span>
                  <span className="rounded-full bg-neutral-soft px-2 py-0.5 text-[10px] font-medium text-neutral-soft-foreground border border-neutral-soft-border">
                    Staff Compartido
                  </span>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Hilo de equipo sincronizado en tiempo real
                </p>
              </div>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Cerrar chat"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* En modo NO simplificado (si entra desde Inbox), permite gestionar responsable */}
            {!isDirectMode && (
              <>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50 text-[11px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-muted-foreground font-medium">
                      Responsable:
                    </span>
                    <span
                      className="rounded bg-primary/10 px-2 py-0.5 font-bold text-primary"
                      data-testid="chat-responsable-badge"
                    >
                      {conversation?.responsable_nombre || "Coach Principal"}
                    </span>
                    <span
                      className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase"
                      data-testid="chat-estado-badge"
                    >
                      {conversation?.estado || "ABIERTA"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTransferOpen(!isTransferOpen)}
                    className="text-[11px] font-semibold text-primary hover:underline hover:text-primary/80 touch-manipulation min-h-7 cursor-pointer"
                    data-testid="toggle-transfer-btn"
                  >
                    {isTransferOpen ? "Cerrar" : "Transferir"}
                  </button>
                </div>

                {isTransferOpen && (
                  <div
                    className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs animate-in fade-in-50"
                    data-testid="transfer-panel"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-foreground">
                        Transferir conversación (RPC)
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Actualiza RLS y auditoría
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-medium text-muted-foreground">
                        Nuevo Responsable:
                        <select
                          value={transferTargetCoachId}
                          onChange={(e) => setTransferTargetCoachId(e.target.value)}
                          className="mt-1 min-h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          data-testid="transfer-target-select"
                        >
                          {AVAILABLE_COACH_SENDERS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre} ({c.rol})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] font-medium text-muted-foreground">
                        Motivo de transferencia:
                        <input
                          type="text"
                          value={transferMotivo}
                          onChange={(e) => setTransferMotivo(e.target.value)}
                          placeholder="Ej.: Reasignación por especialidad técnica / guardia"
                          className="mt-1 min-h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          data-testid="transfer-motivo-input"
                        />
                      </label>
                      <div className="flex items-center justify-between pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="min-h-8 px-3 text-xs font-semibold"
                          onClick={handleTransferir}
                          disabled={isTransferring}
                          data-testid="confirm-transfer-btn"
                        >
                          {isTransferring
                            ? "Transfiriendo..."
                            : "Confirmar transferencia"}
                        </Button>
                      </div>
                      {transferSuccessMsg && (
                        <p
                          className="text-[10px] text-emerald-400 font-semibold inline-flex items-center gap-1"
                          data-testid="transfer-success-msg"
                        >
                          <Check className="h-3 w-3 inline" aria-hidden="true" />{" "}
                          {transferSuccessMsg}
                        </p>
                      )}
                      {transferErrorMsg && (
                        <p
                          className="text-[10px] text-destructive font-semibold inline-flex items-center gap-1"
                          data-testid="transfer-error-msg"
                        >
                          <X className="h-3 w-3 inline" aria-hidden="true" />{" "}
                          {transferErrorMsg}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Banner offline */}
          {!isOnline && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-300 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5">
                <CloudOff className="h-3.5 w-3.5 text-amber-300 inline" aria-hidden="true" />{" "}
                Modo Offline: los mensajes se enviarán al reconectar
              </span>
              <span className="font-semibold text-[10px]">Cola activa</span>
            </div>
          )}

          {/* Messages body */}
          <div
            className="flex-1 space-y-3 overflow-y-auto p-3 text-xs"
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
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="text-[11px] font-semibold text-primary"
                          data-testid={`staff-author-${msg.id}`}
                        >
                          {msg.remitente_nombre}
                        </span>
                        <span className="rounded bg-primary/20 px-1 py-0.2 text-[9px] font-bold text-primary uppercase">
                          Staff
                        </span>
                        <span
                          className="text-[9px] text-muted-foreground"
                          title="Rol: Staff Coach"
                        >
                          (Coach)
                        </span>
                      </div>

                      <div className="flex items-end gap-1.5 max-w-[90%]">
                        <div className="rounded-2xl rounded-tr-none px-3.5 py-2.5 bg-primary text-primary-foreground shadow-sm">
                          <p className="text-xs leading-relaxed">{msg.contenido}</p>
                        </div>
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[11px] font-bold text-primary ring-2 ring-primary/40 select-none"
                          title={msg.remitente_nombre}
                          aria-label={`Avatar de ${msg.remitente_nombre}`}
                        >
                          {msg.remitente_nombre.charAt(0)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground mr-9">
                        <span data-testid={`msg-timestamp-${msg.id}`}>
                          {msg.hora}
                        </span>
                        {msg.estado_envio === "pendiente" && (
                          <span className="text-amber-400 font-semibold inline-flex items-center gap-1">
                            <Timer className="h-3 w-3 inline" aria-hidden="true" />{" "}
                            Pendiente
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
              data-testid="coach-chat-input"
            />
            <Button
              type="submit"
              size="sm"
              variant="default"
              className="min-h-11 px-4 text-xs font-semibold cursor-pointer"
              data-testid="coach-chat-send-btn"
            >
              Enviar
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
