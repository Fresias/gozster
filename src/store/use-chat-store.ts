import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { supabase } from "@/lib/supabase/client";
import type { EstadoConversacion } from "@/types/database.types";
import {
  MOCK_ALUMNOS,
  MOCK_COACH_FELIX_ID,
  MOCK_COACH_PRINCIPAL_ID,
  MOCK_STAFF_COACHES,
} from "@/services/coach-mock-data";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

export interface ChatSender {
  id: string;
  nombre: string;
  rol: "ENTRENADOR" | "ALUMNO" | "ADMIN";
  avatarUrl?: string | null;
  esStaff: boolean;
}

export interface ChatMessage {
  id: string;
  conversacion_id: string;
  remitente_id: string;
  remitente_nombre: string;
  remitente_rol: "ENTRENADOR" | "ALUMNO" | "ADMIN";
  remitente_avatar?: string | null;
  contenido: string;
  leido: boolean;
  created_at: string;
  hora: string;
  es_staff: boolean;
  estado_envio?: "enviado" | "pendiente" | "error";
}

export interface ChatConversation {
  id: string;
  alumno_id: string;
  alumno_nombre: string;
  created_at: string;
  updated_at: string;
  mensajes: ChatMessage[];
  unreadCount: number;
  responsable_id?: string | null;
  responsable_nombre?: string | null;
  estado?: EstadoConversacion;
}

export const STAFF_COACH_PRINCIPAL: ChatSender = {
  id: MOCK_COACH_PRINCIPAL_ID,
  nombre: "Coach Principal",
  rol: "ENTRENADOR",
  esStaff: true,
};

export const STAFF_COACH_FELIX: ChatSender = {
  id: MOCK_COACH_FELIX_ID,
  nombre: "Félix",
  rol: "ENTRENADOR",
  esStaff: true,
};

export const AVAILABLE_COACH_SENDERS: ChatSender[] = [
  STAFF_COACH_PRINCIPAL,
  STAFF_COACH_FELIX,
];

export const DEFAULT_ATHLETE_SENDER: ChatSender = {
  id: "a1111111-1111-4111-8111-111111111101",
  nombre: "Lucas Giménez",
  rol: "ALUMNO",
  esStaff: false,
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val?: string | null): boolean =>
  typeof val === "string" && UUID_REGEX.test(val);

const INITIAL_CONVERSATIONS: Record<string, ChatConversation> = {
  // Conversación para Lucas Giménez (con respuestas de Félix y Coach Principal)
  "a1111111-1111-4111-8111-111111111101": {
    id: "conv-lucas-001",
    alumno_id: "a1111111-1111-4111-8111-111111111101",
    alumno_nombre: "Lucas Giménez",
    created_at: "2026-10-16T18:00:00Z",
    updated_at: "2026-10-16T18:28:00Z",
    unreadCount: 0,
    responsable_id: MOCK_COACH_PRINCIPAL_ID,
    responsable_nombre: "Coach Principal",
    estado: "ABIERTA",
    mensajes: [
      {
        id: "msg-lucas-1",
        conversacion_id: "conv-lucas-001",
        remitente_id: "a1111111-1111-4111-8111-111111111101",
        remitente_nombre: "Lucas Giménez",
        remitente_rol: "ALUMNO",
        contenido: "¡Hola profes! ¿En la serie pesada mantengo los 3 min de pausa?",
        leido: true,
        created_at: "2026-10-16T18:20:00Z",
        hora: "18:20",
        es_staff: false,
        estado_envio: "enviado",
      },
      {
        id: "msg-lucas-2",
        conversacion_id: "conv-lucas-001",
        remitente_id: MOCK_COACH_FELIX_ID,
        remitente_nombre: "Félix",
        remitente_rol: "ENTRENADOR",
        contenido: "Sí Lucas, respetá los 3 min para no acumular fatiga antes del fallo.",
        leido: true,
        created_at: "2026-10-16T18:25:00Z",
        hora: "18:25",
        es_staff: true,
        estado_envio: "enviado",
      },
      {
        id: "msg-lucas-3",
        conversacion_id: "conv-lucas-001",
        remitente_id: MOCK_COACH_PRINCIPAL_ID,
        remitente_nombre: "Coach Principal",
        remitente_rol: "ENTRENADOR",
        contenido:
          "Totalmente de acuerdo con Félix. Si sentís molestia en el lumbar avísanos antes de subir kilos.",
        leido: true,
        created_at: "2026-10-16T18:28:00Z",
        hora: "18:28",
        es_staff: true,
        estado_envio: "enviado",
      },
    ],
  },
  // Conversación para Sofía Rossi
  "a2222222-2222-4222-8222-222222222202": {
    id: "conv-sofia-002",
    alumno_id: "a2222222-2222-4222-8222-222222222202",
    alumno_nombre: "Sofía Rossi",
    created_at: "2026-10-16T17:00:00Z",
    updated_at: "2026-10-16T17:40:00Z",
    unreadCount: 1,
    responsable_id: MOCK_COACH_FELIX_ID,
    responsable_nombre: "Félix",
    estado: "PENDIENTE",
    mensajes: [
      {
        id: "msg-sofia-1",
        conversacion_id: "conv-sofia-002",
        remitente_id: "a2222222-2222-4222-8222-222222222202",
        remitente_nombre: "Sofía Rossi",
        remitente_rol: "ALUMNO",
        contenido: "Hola equipo, hoy sentí muy pesado el press militar.",
        leido: true,
        created_at: "2026-10-16T17:10:00Z",
        hora: "17:10",
        es_staff: false,
        estado_envio: "enviado",
      },
      {
        id: "msg-sofia-2",
        conversacion_id: "conv-sofia-002",
        remitente_id: MOCK_COACH_PRINCIPAL_ID,
        remitente_nombre: "Coach Principal",
        remitente_rol: "ENTRENADOR",
        contenido: "Hola Sofi, podemos bajar 2.5kg y trabajar a RPE 7 la próxima.",
        leido: true,
        created_at: "2026-10-16T17:25:00Z",
        hora: "17:25",
        es_staff: true,
        estado_envio: "enviado",
      },
      {
        id: "msg-sofia-3",
        conversacion_id: "conv-sofia-002",
        remitente_id: MOCK_COACH_FELIX_ID,
        remitente_nombre: "Félix",
        remitente_rol: "ENTRENADOR",
        contenido: "Revisá también el ancho de agarre que vimos la semana pasada.",
        leido: false,
        created_at: "2026-10-16T17:40:00Z",
        hora: "17:40",
        es_staff: true,
        estado_envio: "enviado",
      },
    ],
  },
};

interface ChatStoreState {
  conversations: Record<string, ChatConversation>;
  selectedAlumnoId: string | null;
  activeCoachSender: ChatSender;
  isAthleteChatOpen: boolean;

  // Actions
  setAthleteChatOpen: (open: boolean) => void;
  setActiveCoachSender: (sender: ChatSender) => void;
  setSelectedAlumnoId: (alumnoId: string | null) => void;
  getConversation: (alumnoId: string, alumnoNombre?: string) => ChatConversation;
  sendMessage: (params: {
    alumnoId: string;
    remitente: ChatSender;
    contenido: string;
  }) => ChatMessage;
  transferirConversacion: (params: {
    conversacionId: string;
    nuevoResponsableId: string;
    motivo?: string;
    alumnoId?: string;
  }) => Promise<{ success: boolean; data?: unknown; error?: string; offline?: boolean }>;
  cambiarEstadoConversacion: (
    alumnoId: string,
    nuevoEstado: EstadoConversacion,
  ) => Promise<void>;
  syncWithSupabase: (alumnoId?: string) => Promise<void>;
  markAsRead: (alumnoId: string) => void;
  resetToDefaults: () => void;
}

const memoryFallback: Record<string, string> = {};

const safeStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(name);
    }
    return memoryFallback[name] ?? null;
  },
  setItem: (name: string, value: string): void => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(name, value);
      return;
    }
    memoryFallback[name] = value;
  },
  removeItem: (name: string): void => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(name);
      return;
    }
    delete memoryFallback[name];
  },
};

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set, get) => ({
      conversations: INITIAL_CONVERSATIONS,
      selectedAlumnoId: "a1111111-1111-4111-8111-111111111101",
      activeCoachSender: STAFF_COACH_PRINCIPAL,
      isAthleteChatOpen: false,

      setAthleteChatOpen: (isAthleteChatOpen) => set({ isAthleteChatOpen }),

      setActiveCoachSender: (activeCoachSender) => set({ activeCoachSender }),

      setSelectedAlumnoId: (selectedAlumnoId) => set({ selectedAlumnoId }),

      getConversation: (alumnoId: string, alumnoNombre?: string) => {
        const { conversations } = get();
        if (conversations[alumnoId]) {
          return conversations[alumnoId];
        }

        const alumno = MOCK_ALUMNOS.find((a) => a.id === alumnoId);
        const resolvedNombre = alumnoNombre || alumno?.nombre_completo || "Atleta";

        const newConv: ChatConversation = {
          id: isUuid(alumnoId) ? `conv-${alumnoId.slice(0, 8)}` : `conv-${alumnoId}`,
          alumno_id: alumnoId,
          alumno_nombre: resolvedNombre,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          mensajes: [],
          unreadCount: 0,
          responsable_id: MOCK_COACH_PRINCIPAL_ID,
          responsable_nombre: "Coach Principal",
          estado: "ABIERTA",
        };

        set((state) => ({
          conversations: {
            ...state.conversations,
            [alumnoId]: newConv,
          },
        }));

        return newConv;
      },

      sendMessage: ({ alumnoId, remitente, contenido }) => {
        const trimmed = contenido.trim();
        if (!trimmed) {
          throw new Error("El mensaje no puede estar vacío");
        }

        const now = new Date();
        const isoTime = now.toISOString();
        const formattedHour = now.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        const conv = get().getConversation(alumnoId);
        const isOnline = useOfflineQueueStore.getState().isOnline;

        const newMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          conversacion_id: conv.id,
          remitente_id: remitente.id,
          remitente_nombre: remitente.nombre,
          remitente_rol: remitente.rol,
          remitente_avatar: remitente.avatarUrl,
          contenido: trimmed,
          leido: true,
          created_at: isoTime,
          hora: formattedHour,
          es_staff: remitente.esStaff,
          estado_envio: isOnline ? "enviado" : "pendiente",
        };

        // Si no hay conexión a internet, se encola en la cola offline
        if (!isOnline) {
          useOfflineQueueStore.getState().enqueueEvent({
            id: `chat-${newMsg.id}`,
            action: "ENVIAR_MENSAJE_CHAT",
            payload: {
              conversacion_id: conv.id,
              remitente_id: remitente.id,
              contenido: trimmed,
              created_at: isoTime,
            },
          });
        } else if (isUuid(conv.id) && isUuid(remitente.id)) {
          // Persistencia en Supabase cuando online y con UUIDs válidos
          Promise.resolve(
            supabase.from("mensajes").insert({
              conversacion_id: conv.id,
              remitente_id: remitente.id,
              contenido: trimmed,
              leido: false,
            }),
          )
            .then((res) => {
              if (res.error) {
                console.warn(
                  "Aviso insertando mensaje en Supabase:",
                  res.error.message,
                );
              }
            })
            .catch(() => {});
        }

        set((state) => {
          const currentConv = state.conversations[alumnoId] || conv;
          const updatedConv: ChatConversation = {
            ...currentConv,
            updated_at: isoTime,
            mensajes: [...currentConv.mensajes, newMsg],
          };

          return {
            conversations: {
              ...state.conversations,
              [alumnoId]: updatedConv,
            },
          };
        });

        return newMsg;
      },

      transferirConversacion: async ({
        conversacionId,
        nuevoResponsableId,
        motivo,
        alumnoId,
      }) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;

        const targetCoach =
          AVAILABLE_COACH_SENDERS.find((c) => c.id === nuevoResponsableId) ||
          MOCK_STAFF_COACHES.find((c) => c.id === nuevoResponsableId);
        const nuevoNombre = targetCoach
          ? (targetCoach as any).nombre_completo ||
            (targetCoach as any).nombre ||
            "Entrenador"
          : "Entrenador Asignado";

        // Actualización optimista local en Zustand
        set((state) => {
          const updated = { ...state.conversations };
          let foundKey = alumnoId;
          if (!foundKey) {
            foundKey = Object.keys(updated).find(
              (k) => updated[k]?.id === conversacionId,
            );
          }
          if (foundKey && updated[foundKey]) {
            const current = updated[foundKey]!;
            updated[foundKey] = {
              ...current,
              responsable_id: nuevoResponsableId,
              responsable_nombre: nuevoNombre,
              updated_at: new Date().toISOString(),
            };
          }
          return { conversations: updated };
        });

        if (!isOnline) {
          useOfflineQueueStore.getState().enqueueEvent({
            id: `transfer-${Date.now()}`,
            action: "TRANSFERIR_CONVERSACION_GOZS",
            payload: {
              conversacion_id: conversacionId,
              nuevo_responsable_id: nuevoResponsableId,
              motivo: motivo || null,
            },
          });
          return { success: true, offline: true };
        }

        // Si es UUID válido y está online, invocamos RPC transferir_conversacion_gozs
        if (isUuid(conversacionId) && isUuid(nuevoResponsableId)) {
          try {
            const { data, error } = await supabase.rpc(
              "transferir_conversacion_gozs",
              {
                p_conversacion_id: conversacionId,
                p_nuevo_responsable_id: nuevoResponsableId,
                p_motivo: motivo || null,
              },
            );

            if (error) {
              console.warn("RPC transferir_conversacion_gozs error:", error.message);
              return { success: false, error: error.message };
            }

            return { success: true, data };
          } catch (err: any) {
            console.warn("Exception in transferir_conversacion_gozs:", err);
            return {
              success: false,
              error: err?.message || "Error al transferir conversación",
            };
          }
        }

        return { success: true };
      },

      cambiarEstadoConversacion: async (alumnoId, nuevoEstado) => {
        set((state) => {
          const conv = state.conversations[alumnoId];
          if (!conv) return state;
          return {
            conversations: {
              ...state.conversations,
              [alumnoId]: {
                ...conv,
                estado: nuevoEstado,
                updated_at: new Date().toISOString(),
              },
            },
          };
        });

        const conv = get().conversations[alumnoId];
        const isOnline = useOfflineQueueStore.getState().isOnline;

        if (!isOnline) {
          useOfflineQueueStore.getState().enqueueEvent({
            id: `estado-conv-${Date.now()}`,
            action: "CAMBIAR_ESTADO_CONVERSACION",
            payload: {
              conversacion_id: conv?.id,
              alumno_id: alumnoId,
              estado: nuevoEstado,
            },
          });
          return;
        }

        if (conv?.id && isUuid(conv.id)) {
          try {
            await supabase
              .from("conversaciones")
              .update({
                estado: nuevoEstado,
                updated_at: new Date().toISOString(),
              })
              .eq("id", conv.id);
          } catch {
            // Ignorar errores de red
          }
        }
      },

      syncWithSupabase: async (alumnoId?: string) => {
        try {
          let query = supabase.from("conversaciones").select(`
              id,
              alumno_id,
              responsable_id,
              estado,
              created_at,
              updated_at,
              mensajes (
                id,
                conversacion_id,
                remitente_id,
                contenido,
                leido,
                created_at
              )
            `);

          if (alumnoId && isUuid(alumnoId)) {
            query = query.eq("alumno_id", alumnoId);
          }

          const { data, error } = await query;
          if (error || !data || data.length === 0) return;

          set((state) => {
            const nextConversations = { ...state.conversations };
            for (const c of data) {
              const existing = nextConversations[c.alumno_id];
              const responsable =
                AVAILABLE_COACH_SENDERS.find((coach) => coach.id === c.responsable_id) ||
                MOCK_STAFF_COACHES.find((coach) => coach.id === c.responsable_id);
              const msgs: ChatMessage[] = (c.mensajes || []).map((m: any) => {
                const senderCoach =
                  AVAILABLE_COACH_SENDERS.find(
                    (coach) => coach.id === m.remitente_id,
                  ) ||
                  MOCK_STAFF_COACHES.find((coach) => coach.id === m.remitente_id);
                const esStaff =
                  !!senderCoach ||
                  m.remitente_id === MOCK_COACH_PRINCIPAL_ID ||
                  m.remitente_id === MOCK_COACH_FELIX_ID;
                const parsedDate = new Date(m.created_at);
                const hora = !Number.isNaN(parsedDate.getTime())
                  ? parsedDate.toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "12:00";
                return {
                  id: m.id,
                  conversacion_id: m.conversacion_id,
                  remitente_id: m.remitente_id,
                  remitente_nombre: senderCoach
                    ? (senderCoach as any).nombre_completo ||
                      (senderCoach as any).nombre
                    : existing?.mensajes.find((x) => x.id === m.id)
                        ?.remitente_nombre ||
                      (esStaff ? "Coach" : existing?.alumno_nombre || "Atleta"),
                  remitente_rol: esStaff ? "ENTRENADOR" : "ALUMNO",
                  contenido: m.contenido,
                  leido: m.leido,
                  created_at: m.created_at,
                  hora,
                  es_staff: esStaff,
                  estado_envio: "enviado",
                };
              });

              nextConversations[c.alumno_id] = {
                id: c.id,
                alumno_id: c.alumno_id,
                alumno_nombre: existing?.alumno_nombre || "Atleta",
                created_at: c.created_at,
                updated_at: c.updated_at,
                responsable_id: c.responsable_id,
                responsable_nombre: responsable
                  ? (responsable as any).nombre_completo ||
                    (responsable as any).nombre
                  : null,
                estado: (c.estado as EstadoConversacion) || "ABIERTA",
                mensajes: msgs.length > 0 ? msgs : existing?.mensajes || [],
                unreadCount: msgs.filter((m) => !m.leido && !m.es_staff).length,
              };
            }
            return { conversations: nextConversations };
          });
        } catch {
          // Mantener estado offline resiliente
        }
      },

      markAsRead: (alumnoId: string) => {
        set((state) => {
          const currentConv = state.conversations[alumnoId];
          if (!currentConv) return state;

          const updatedMessages = currentConv.mensajes.map((m) => ({
            ...m,
            leido: true,
          }));

          return {
            conversations: {
              ...state.conversations,
              [alumnoId]: {
                ...currentConv,
                unreadCount: 0,
                mensajes: updatedMessages,
              },
            },
          };
        });
      },

      resetToDefaults: () => {
        set({
          conversations: INITIAL_CONVERSATIONS,
          selectedAlumnoId: "a1111111-1111-4111-8111-111111111101",
          activeCoachSender: STAFF_COACH_PRINCIPAL,
          isAthleteChatOpen: false,
        });
      },
    }),
    {
      name: "gozster-chat-store",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
