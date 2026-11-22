import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-storage";
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
  requiere_lectura_inicio?: boolean;
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

const formatHora = (isoDate: string): string => {
  const parsedDate = new Date(isoDate);
  if (Number.isNaN(parsedDate.getTime())) return "12:00";
  return parsedDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface ChatStoreState {
  conversations: Record<string, ChatConversation>;
  selectedAlumnoId: string | null;
  activeCoachSender: ChatSender;
  staffCoaches: ChatSender[];
  isAthleteChatOpen: boolean;

  // Actions
  setAthleteChatOpen: (open: boolean) => void;
  setActiveCoachSender: (sender: ChatSender) => void;
  setSelectedAlumnoId: (alumnoId: string | null) => void;
  loadStaffCoaches: () => Promise<void>;
  getConversation: (alumnoId: string, alumnoNombre?: string) => ChatConversation;
  sendMessage: (params: {
    alumnoId: string;
    remitente: ChatSender;
    contenido: string;
    requiereLecturaInicio?: boolean;
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
  subscribeToRealtime: (alumnoId?: string) => () => void;
  markAsRead: (alumnoId: string, readerRole?: "ALUMNO" | "STAFF") => void;
  getUnreadStaffCount: (alumnoId?: string) => number;
  getLatestUnreadStaffMessage: (alumnoId?: string) => ChatMessage | null;
  getLatestUnreadPushStaffMessage: (alumnoId?: string) => ChatMessage | null;
  resetToDefaults: () => void;
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set, get) => ({
      conversations: {},
      selectedAlumnoId: null,
      activeCoachSender: STAFF_COACH_PRINCIPAL,
      staffCoaches: [],
      isAthleteChatOpen: false,

      setAthleteChatOpen: (isAthleteChatOpen) => set({ isAthleteChatOpen }),

      setActiveCoachSender: (activeCoachSender) => set({ activeCoachSender }),

      setSelectedAlumnoId: (selectedAlumnoId) => set({ selectedAlumnoId }),

      loadStaffCoaches: async () => {
        if (typeof supabase?.from !== "function") return;
        try {
          const authRes = await supabase.auth.getUser();
          if (!authRes.data?.user) return;
          const { data, error } = await supabase
            .from("perfiles")
            .select("id, nombre_completo, rol")
            .in("rol", ["ENTRENADOR", "ADMIN"]);
          if (!error && Array.isArray(data)) {
            const coaches: ChatSender[] = data.map((p: any) => ({
              id: p.id,
              nombre: p.nombre_completo || "Entrenador",
              rol: p.rol === "ADMIN" ? "ADMIN" : "ENTRENADOR",
              esStaff: true,
            }));
            const current = coaches.find((c) => c.id === authRes.data.user!.id);
            set({
              staffCoaches: coaches,
              ...(current ? { activeCoachSender: current } : {}),
            });
          }
        } catch {
          // Tolerar fallos de red/RLS sin inyectar coaches demo
        }
      },

      getConversation: (alumnoId: string, alumnoNombre?: string) => {
        const { conversations } = get();
        if (conversations[alumnoId]) {
          return conversations[alumnoId];
        }

        const esMockAlumno = MOCK_ALUMNOS.some((a) => a.id === alumnoId);
        const esReal = !esMockAlumno && isUuid(alumnoId);
        const alumno = !esReal ? MOCK_ALUMNOS.find((a) => a.id === alumnoId) : undefined;
        const resolvedNombre = alumnoNombre || alumno?.nombre_completo || "Atleta";

        const newConv: ChatConversation = {
          id: esReal ? `conv-${alumnoId.slice(0, 8)}` : `conv-${alumnoId}`,
          alumno_id: alumnoId,
          alumno_nombre: resolvedNombre,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          mensajes: [],
          unreadCount: 0,
          responsable_id: esReal ? null : MOCK_COACH_PRINCIPAL_ID,
          responsable_nombre: esReal ? null : "Coach Principal",
          estado: "ABIERTA",
        };

        return newConv;
      },

      sendMessage: ({ alumnoId, remitente, contenido, requiereLecturaInicio = false }) => {
        const trimmed = contenido.trim();
        if (!trimmed) {
          throw new Error("El mensaje no puede estar vacío");
        }

        const now = new Date();
        const isoTime = now.toISOString();
        const formattedHour = formatHora(isoTime);
        const requiereInicio = Boolean(requiereLecturaInicio);

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
          leido: remitente.esStaff ? false : true,
          requiere_lectura_inicio: requiereInicio,
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
              alumno_id: alumnoId,
              conversacion_id: isUuid(conv.id) ? conv.id : undefined,
              remitente_id: remitente.id,
              contenido: trimmed,
              requiere_lectura_inicio: requiereInicio,
              created_at: isoTime,
            },
          });
        } else if (isUuid(alumnoId)) {
          // Persistencia real en Supabase: asegura UUID de conversación vía RPC y guarda requiere_lectura_inicio
          void (async () => {
            try {
              let convId = isUuid(conv.id) ? conv.id : null;
              if (!convId) {
                const { data: rpcConvId, error: rpcErr } = await supabase.rpc(
                  "obtener_o_crear_conversacion",
                  { p_alumno_id: alumnoId },
                );
                if (!rpcErr && typeof rpcConvId === "string" && isUuid(rpcConvId)) {
                  convId = rpcConvId;
                  set((state) => {
                    const current = state.conversations[alumnoId];
                    if (!current || current.id === convId) return state;
                    return {
                      conversations: {
                        ...state.conversations,
                        [alumnoId]: {
                          ...current,
                          id: convId!,
                          mensajes: current.mensajes.map((m) =>
                            m.conversacion_id === current.id
                              ? { ...m, conversacion_id: convId! }
                              : m,
                          ),
                        },
                      },
                    };
                  });
                }
              }
              if (!convId) return;

              let remitenteId = isUuid(remitente.id) ? remitente.id : null;
              try {
                const { data: authData } = await supabase.auth.getUser();
                if (authData?.user?.id && isUuid(authData.user.id)) {
                  remitenteId = authData.user.id;
                }
              } catch {
                // Mantener remitente.id en entornos sin auth
              }
              if (!remitenteId) return;

              const insertRes = await supabase
                .from("mensajes")
                .insert({
                  conversacion_id: convId,
                  remitente_id: remitenteId,
                  contenido: trimmed,
                  leido: false,
                  requiere_lectura_inicio: requiereInicio,
                })
                .select("id, conversacion_id, remitente_id, contenido, leido, requiere_lectura_inicio, created_at")
                .single();

              if (insertRes.error) {
                console.warn(
                  "Aviso insertando mensaje en Supabase:",
                  insertRes.error.message,
                );
                return;
              }

              const inserted = insertRes.data;
              if (inserted?.id) {
                set((state) => {
                  const current = state.conversations[alumnoId];
                  if (!current) return state;
                  const alreadyExists = current.mensajes.some((m) => m.id === inserted.id);
                  const nextMensajes = alreadyExists
                    ? current.mensajes.filter((m) => m.id !== newMsg.id)
                    : current.mensajes.map((m) =>
                        m.id === newMsg.id
                          ? {
                              ...m,
                              id: inserted.id,
                              conversacion_id: inserted.conversacion_id,
                              created_at: inserted.created_at,
                              hora: formatHora(inserted.created_at),
                              requiere_lectura_inicio: Boolean(inserted.requiere_lectura_inicio),
                            }
                          : m,
                      );
                  return {
                    conversations: {
                      ...state.conversations,
                      [alumnoId]: {
                        ...current,
                        mensajes: nextMensajes,
                      },
                    },
                  };
                });
              }
            } catch {
              // Mantener estado local resiliente
            }
          })();
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
          get().staffCoaches.find((c) => c.id === nuevoResponsableId) ||
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
          if (foundKey) {
            const current = updated[foundKey] || get().getConversation(foundKey);
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
          const conv = state.conversations[alumnoId] || get().getConversation(alumnoId);
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
                requiere_lectura_inicio,
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
              const msgs: ChatMessage[] = (c.mensajes || [])
                .map((m: any) => {
                  const senderCoach =
                    AVAILABLE_COACH_SENDERS.find(
                      (coach) => coach.id === m.remitente_id,
                    ) ||
                    MOCK_STAFF_COACHES.find((coach) => coach.id === m.remitente_id);
                  const esStaff = m.remitente_id !== c.alumno_id;
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
                    remitente_rol: (esStaff ? "ENTRENADOR" : "ALUMNO") as "ENTRENADOR" | "ALUMNO",
                    contenido: m.contenido,
                    leido: Boolean(m.leido),
                    requiere_lectura_inicio: Boolean(m.requiere_lectura_inicio),
                    created_at: m.created_at,
                    hora: formatHora(m.created_at),
                    es_staff: esStaff,
                    estado_envio: "enviado" as const,
                  };
                })
                .sort((a: ChatMessage, b: ChatMessage) =>
                  a.created_at.localeCompare(b.created_at),
                );

              const pendingLocal = (existing?.mensajes || []).filter(
                (m) => m.estado_envio === "pendiente" && !msgs.some((s) => s.id === m.id),
              );
              const mergedMsgs = [...msgs, ...pendingLocal];

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
                mensajes: mergedMsgs.length > 0 ? mergedMsgs : existing?.mensajes || [],
                unreadCount: mergedMsgs.filter((m) => !m.leido && !m.es_staff).length,
              };
            }
            return { conversations: nextConversations };
          });
        } catch {
          // Mantener estado offline resiliente
        }
      },

      subscribeToRealtime: (alumnoId?: string) => {
        if (typeof supabase?.channel !== "function") return () => {};
        const channelName = alumnoId ? `chat-mensajes-${alumnoId}` : "chat-mensajes-studio";
        const channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "mensajes" },
            (payload: any) => {
              const row = payload?.new as
                | {
                    id: string;
                    conversacion_id: string;
                    remitente_id: string;
                    contenido: string;
                    leido: boolean;
                    requiere_lectura_inicio?: boolean;
                    created_at: string;
                  }
                | undefined;
              if (!row?.id || !row?.conversacion_id) return;

              const currentEntry = Object.entries(get().conversations).find(
                ([, conv]) => conv.id === row.conversacion_id,
              );
              if (!currentEntry) {
                void get().syncWithSupabase(alumnoId);
                return;
              }

              const [keyAlumnoId, conv] = currentEntry;
              const esStaff = row.remitente_id !== conv.alumno_id;
              const senderCoach =
                AVAILABLE_COACH_SENDERS.find((c) => c.id === row.remitente_id) ||
                MOCK_STAFF_COACHES.find((c) => c.id === row.remitente_id);

              const realtimeMsg: ChatMessage = {
                id: row.id,
                conversacion_id: row.conversacion_id,
                remitente_id: row.remitente_id,
                remitente_nombre: senderCoach
                  ? (senderCoach as any).nombre_completo || (senderCoach as any).nombre
                  : esStaff
                    ? "Coach"
                    : conv.alumno_nombre || "Atleta",
                remitente_rol: esStaff ? "ENTRENADOR" : "ALUMNO",
                contenido: row.contenido,
                leido: Boolean(row.leido),
                requiere_lectura_inicio: Boolean(row.requiere_lectura_inicio),
                created_at: row.created_at,
                hora: formatHora(row.created_at),
                es_staff: esStaff,
                estado_envio: "enviado",
              };

              set((state) => {
                const targetConv = state.conversations[keyAlumnoId];
                if (!targetConv) return state;
                if (targetConv.mensajes.some((m) => m.id === row.id)) return state;

                // Reconciliar mensaje optimista pendiente de reemplazo por UUID
                const optimisticIdx = targetConv.mensajes.findIndex(
                  (m) =>
                    !isUuid(m.id) &&
                    m.contenido === row.contenido &&
                    m.es_staff === esStaff,
                );
                const nextMsgs =
                  optimisticIdx >= 0
                    ? targetConv.mensajes.map((m, idx) =>
                        idx === optimisticIdx ? realtimeMsg : m,
                      )
                    : [...targetConv.mensajes, realtimeMsg];

                return {
                  conversations: {
                    ...state.conversations,
                    [keyAlumnoId]: {
                      ...targetConv,
                      updated_at: row.created_at || targetConv.updated_at,
                      mensajes: nextMsgs,
                      unreadCount: nextMsgs.filter((m) => !m.leido && !m.es_staff).length,
                    },
                  },
                };
              });
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "mensajes" },
            (payload: any) => {
              const row = payload?.new as
                | {
                    id: string;
                    conversacion_id: string;
                    contenido?: string;
                    leido?: boolean;
                    requiere_lectura_inicio?: boolean;
                  }
                | undefined;
              if (!row?.id) return;

              set((state) => {
                const matchEntry = Object.entries(state.conversations).find(
                  ([, conv]) =>
                    conv.id === row.conversacion_id ||
                    conv.mensajes.some((m) => m.id === row.id),
                );
                if (!matchEntry) return state;

                const [keyAlumnoId, conv] = matchEntry;
                const nextMsgs = conv.mensajes.map((m) =>
                  m.id === row.id
                    ? {
                        ...m,
                        leido: row.leido !== undefined ? Boolean(row.leido) : m.leido,
                        contenido: row.contenido ?? m.contenido,
                        requiere_lectura_inicio:
                          row.requiere_lectura_inicio !== undefined
                            ? Boolean(row.requiere_lectura_inicio)
                            : m.requiere_lectura_inicio,
                      }
                    : m,
                );

                return {
                  conversations: {
                    ...state.conversations,
                    [keyAlumnoId]: {
                      ...conv,
                      mensajes: nextMsgs,
                      unreadCount: nextMsgs.filter((m) => !m.leido && !m.es_staff).length,
                    },
                  },
                };
              });
            },
          )
          .subscribe();

        return () => {
          if (typeof supabase?.removeChannel === "function") {
            void supabase.removeChannel(channel);
          }
        };
      },

      markAsRead: (alumnoId: string, readerRole?: "ALUMNO" | "STAFF") => {
        if (!alumnoId) return;
        const convBefore = get().conversations[alumnoId];
        if (!convBefore) return;

        const shouldMark = (m: ChatMessage) => {
          if (readerRole === "STAFF") return !m.es_staff;
          if (readerRole === "ALUMNO") return m.es_staff;
          return true;
        };

        const hadUnreadTarget = convBefore.mensajes.some(
          (m) => shouldMark(m) && !m.leido,
        );

        set((state) => {
          const currentConv = state.conversations[alumnoId];
          if (!currentConv) return state;

          const updatedMessages = currentConv.mensajes.map((m) =>
            shouldMark(m) ? { ...m, leido: true } : m,
          );

          return {
            conversations: {
              ...state.conversations,
              [alumnoId]: {
                ...currentConv,
                unreadCount: updatedMessages.filter((m) => !m.leido && !m.es_staff).length,
                mensajes: updatedMessages,
              },
            },
          };
        });

        if (
          hadUnreadTarget &&
          isUuid(convBefore.id) &&
          useOfflineQueueStore.getState().isOnline &&
          typeof supabase?.rpc === "function"
        ) {
          Promise.resolve(
            supabase.rpc("marcar_mensajes_leidos", {
              p_conversacion_id: convBefore.id,
            }),
          ).catch(() => {});
        }
      },

      getUnreadStaffCount: (alumnoId?: string) => {
        if (!alumnoId) return 0;
        const conv = get().conversations[alumnoId];
        if (!conv) return 0;
        return conv.mensajes.filter((m) => m.es_staff && !m.leido).length;
      },

      getLatestUnreadStaffMessage: (alumnoId?: string) => {
        if (!alumnoId) return null;
        const conv = get().conversations[alumnoId];
        if (!conv) return null;
        const unreadStaffMsgs = conv.mensajes.filter((m) => m.es_staff && !m.leido);
        return unreadStaffMsgs[unreadStaffMsgs.length - 1] || null;
      },

      getLatestUnreadPushStaffMessage: (alumnoId?: string) => {
        if (!alumnoId) return null;
        const conv = get().conversations[alumnoId];
        if (!conv) return null;
        const unreadPushMsgs = conv.mensajes.filter(
          (m) => m.es_staff && !m.leido && m.requiere_lectura_inicio === true,
        );
        return unreadPushMsgs[unreadPushMsgs.length - 1] || null;
      },

      resetToDefaults: () => {
        set({
          conversations: {},
          selectedAlumnoId: null,
          activeCoachSender: STAFF_COACH_PRINCIPAL,
          isAthleteChatOpen: false,
        });
      },
    }),
    {
      name: "gozster-chat-store",
      storage: createJSONStorage(() => userScopedStorage),
    },
  ),
);
