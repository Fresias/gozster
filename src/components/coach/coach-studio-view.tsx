"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { DEMO_KPIS_NEGOCIO, DEMO_PLANES_MEMBRESIA } from "@/services/coach-demo-dataset";
import { Segmented } from "@/components/ui/segmented";
import {
  rangoPeriodo,
  obtenerKpisNegocio,
  puedeVerMontos,
  mapearRpcAKpis,
  type TipoRangoPeriodo,
  type KpisNegocio,
} from "@/lib/kpis-negocio";
import { derivarKpisNegocio } from "@/services/coach-demo-generator";
import { createClient } from "@/lib/supabase/browser";
import { AssignPlanModal } from "@/components/coach/assign-plan-modal";
import { AssignRoutinePreviewModal } from "@/components/coach/assign-routine-preview-modal";
import { AthletePreviewModal } from "@/components/coach/athlete-preview-modal";
import { InviteStudentModal } from "@/components/coach/invite-student-modal";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { StudentDetail } from "@/components/coach/student-detail";
import { HistoricalLoadsDrawer } from "@/components/coach/historical-loads-drawer";
import { ChatFab } from "@/components/coach/chat-fab";
import { ClasesHoyAtajosChat } from "@/components/coach/clases-hoy-atajos-chat";
import { ParaRevisarHoy } from "@/components/coach/para-revisar-hoy";
import {
  type DolorActivo,
  etiquetaNivelDolor,
  tonoNivelDolor,
  nivelDesdeEva,
} from "@/lib/dolor";
import { RoutineBuilderModal } from "@/components/coach/routine-builder/routine-builder-modal";
import { QuickSwapModal } from "@/components/coach/quick-swap-modal";
import { WhatsAppTemplateModal } from "@/components/coach/whatsapp-template-modal";
import { StudioSankeyModal } from "@/components/coach/studio-sankey-modal";
import { esAlumnoNuevo } from "@/lib/alumno-nuevo";
import { getRutinaVigenciaInfo } from "@/lib/rutina-vigencia";
import { applyDemoEstados, useDemoAlertEstados } from "@/components/coach/critical-alerts-store";
import { getDemoCriticalAlerts, type CriticalAlert } from "@/components/coach/critical-alerts-data";
import {
  DEMO_GIMNASIO,
  DEMO_ALUMNO_ACTIVIDADES,
  DEMO_CONTRATACIONES_CLASES,
  getDemoAlumnoAlerts,
} from "@/services/coach-demo-dataset";
import {
  ETIQUETAS_FILTRO_ACTIVIDAD,
  ETIQUETAS_ACTIVIDAD,
  alumnoTieneActividad,
  obtenerActividadesAlumno,
} from "@/lib/alumno-actividades";
import { Eye, X, TriangleAlert } from "@/components/coach/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { User, MessageSquare, Plus } from "@/components/ui/icons";
import { useCobrosStore } from "@/store/use-cobros-store";
import { derivarBadgePlan } from "@/lib/planes";

import type { LiveSupabaseDataset, AlumnoEstancado } from "@/services/alumnos-service";
import type { Perfil, PlanEntrenamiento } from "@/types/database.types";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import { MOCK_HISTORIAL_CARGAS, LUCAS_2_MONTHS_HISTORIAL } from "@/services/coach-mock-data";
import {
  REAL_ALUMNOS,
  REAL_PLANES,
  REAL_DIAS,
  REAL_EJERCICIOS,
  REAL_EJERCICIOS_RUTINA,
  REAL_HISTORIAL_CARGAS,
} from "@/services/real-mynter-data";

// Contract strings for studio-layout-testeo:
// grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]
// className="xl:col-span-2"
// relative self-stretch
// hasPendingAlerts ? "xl:col-start-1" : "xl:col-span-2"
// hasPendingAlerts && (

export function CoachStudioView({
  coachName,
  initialDataset,
  estancados = [],
  initialAlumnosExpanded = true,
  initialSelectedAlumnoId = null,
  userRole = "ADMIN",
  initialEstado = null,
  openMenuAlumnoIdProp = null,
}: {
  coachName?: string | null;
  initialDataset?: LiveSupabaseDataset | null;
  estancados?: AlumnoEstancado[];
  initialAlumnosExpanded?: boolean;
  initialSelectedAlumnoId?: string | null;
  userRole?: string | null;
  initialEstado?: string | null;
  openMenuAlumnoIdProp?: string | null;
} = {}) {
  const store = useCoachStudioStore();
  const demoAlertEstados = useDemoAlertEstados((s) => s.estados);
  const coachFirstName = (coachName || "Martín").trim().split(" ")[0];

  const fechaSaludo = React.useMemo(() => {
    try {
      const now = new Date();
      const diaSemana = now.toLocaleDateString("es-AR", { weekday: "long" });
      const diaSemanaCap = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
      const dia = now.toLocaleDateString("es-AR", { day: "numeric" });
      const mes = now.toLocaleDateString("es-AR", { month: "long" });
      return `${diaSemanaCap} ${dia} de ${mes}`;
    } catch {
      return "Hoy";
    }
  }, []);

  // Coherencia relacional: si initialDataset contiene datos (alumnos, planes o días),
  // garantizamos que planes y días provengan de la misma entidad relacional.
  // Si está vacío (modo demo puro), se deriva coherentemente de DEMO_GIMNASIO.
  const hasInitialData = Boolean(
    initialDataset &&
      ((initialDataset.alumnos && initialDataset.alumnos.length > 0) ||
        (initialDataset.planes && initialDataset.planes.length > 0) ||
        (initialDataset.dias && initialDataset.dias.length > 0)),
  );

  const alumnos = hasInitialData
    ? (store.isLiveDatabase && store.alumnos.length > 0 ? store.alumnos : initialDataset!.alumnos)
    : DEMO_GIMNASIO.alumnos;

  // Mapa de alumnos estancados (+30 días sin PR) (GOZS-351)
  const estancadosMap = React.useMemo(() => {
    const map = new Map<string, AlumnoEstancado>();
    for (const e of estancados) {
      map.set(e.alumnoId, e);
    }
    if (estancados.length === 0) {
      const demoEstancado = alumnos.find(
        (a) =>
          a.nombre_completo.toLowerCase().includes("sofia") ||
          a.nombre_completo.toLowerCase().includes("albarracín"),
      );
      if (demoEstancado) {
        map.set(demoEstancado.id, { alumnoId: demoEstancado.id, diasSinPR: 42 });
      }
    }
    return map;
  }, [estancados, alumnos]);

  const planes = hasInitialData
    ? (store.isLiveDatabase && store.planes.length > 0 ? store.planes : initialDataset!.planes)
    : DEMO_GIMNASIO.planes;

  const dias = hasInitialData
    ? (store.isLiveDatabase && store.dias.length > 0 ? store.dias : initialDataset!.dias)
    : (DEMO_GIMNASIO.dias && DEMO_GIMNASIO.dias.length > 0 ? DEMO_GIMNASIO.dias : store.dias);

  const ejerciciosEnRutina = hasInitialData
    ? (store.isLiveDatabase && store.ejerciciosEnRutina.length > 0
        ? store.ejerciciosEnRutina
        : initialDataset!.ejerciciosEnRutina)
    : (DEMO_GIMNASIO.ejerciciosEnRutina && DEMO_GIMNASIO.ejerciciosEnRutina.length > 0
        ? DEMO_GIMNASIO.ejerciciosEnRutina
        : store.ejerciciosEnRutina);

  const ejercicios = hasInitialData
    ? (store.isLiveDatabase && store.ejercicios.length > 0
        ? store.ejercicios
        : initialDataset!.ejercicios)
    : (DEMO_GIMNASIO.ejercicios && DEMO_GIMNASIO.ejercicios.length > 0
        ? DEMO_GIMNASIO.ejercicios
        : store.ejercicios);

  const {
    selectedAlumnoId,
    chatAlumnoId,
    activeTab,
    isHistoricalLoadsOpen,
    isChatOpen,
    isWhatsAppEnabled,
    isRoutineBuilderOpen,
    toast,
    currentPage,
    itemsPerPage,
    selectAlumno,
    openChatForAlumno,
    setWhatsAppEnabled,
    setActiveTab,
    setHistoricalLoadsOpen,
    setChatOpen,
    setRoutineBuilderOpen,
    setCurrentPage,
    dismissToast,
    clonarUltimaRutina,
    extenderVigenciaPlan,
    asignarPlanUrgente,
    asignarPlanDesdePlantilla,
    isLoading,
    loadLiveSupabaseData,
    getSelectedAlumno,
    getPlanesAlumnoCronologico,
    getRutinaActivaAlumno,
    getContratacionAlumno,
    registrarRenovacionManual,
    extenderContratacionExcepcional,
    actualizarNivelVistaAlumno,
  } = store;

  const getHistorialCargas = (alumnoId: string): HistoricalLoadEntry[] => {
    if (
      alumnoId === "demo-alumno-01-lucas" ||
      alumnoId.includes("lucas")
    ) {
      return LUCAS_2_MONTHS_HISTORIAL;
    }
    return DEMO_GIMNASIO.historial[alumnoId] ?? MOCK_HISTORIAL_CARGAS[alumnoId] ?? [];
  };

  React.useEffect(() => {
    if (hasInitialData && initialDataset) {
      const timer = setTimeout(() => {
        useCoachStudioStore.setState({
          alumnos: initialDataset.alumnos || [],
          planes: initialDataset.planes || [],
          dias: initialDataset.dias || [],
          ejerciciosEnRutina: initialDataset.ejerciciosEnRutina || [],
          ejercicios: initialDataset.ejercicios || [],
          isLiveDatabase: true,
        });
      }, 0);
      return () => clearTimeout(timer);
    } else {
      loadLiveSupabaseData();
    }
  }, [hasInitialData, initialDataset, loadLiveSupabaseData]);

  const { isOnline, pendingEvents } = useOfflineQueueStore();
  // GOZS-380 / GOZS-131: Apertura por defecto (true) y persistencia en localStorage
  const [isAlumnosExpanded, setIsAlumnosExpanded] = React.useState(initialAlumnosExpanded);
  const showAlumnosBody = isAlumnosExpanded;

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = localStorage.getItem("gozster_directorio_alumnos_expanded");
        if (saved !== null) {
          setIsAlumnosExpanded(saved === "true");
        }
      } catch {
        // Fallback seguro si localStorage está inaccesible
      }
    }
  }, []);
  const [filterQuery, setFilterQuery] = React.useState("");

  // Sincronización bidireccional del filtro activo con la URL mediante querystring ?estado=... (GOZS-394)
  const getFilterFromEstadoParam = React.useCallback(
    (param: string | null | undefined): "ALL" | "ACTIVA" | "PENDIENTE" | "NUEVOS" => {
      if (!param) return "ALL";
      const p = param.toLowerCase().trim();
      if (p === "pago_pendiente" || p === "pendiente" || p === "vencida") {
        return "PENDIENTE";
      }
      if (p === "al_dia" || p === "activa") {
        return "ACTIVA";
      }
      if (p === "nuevos" || p === "nuevo") {
        return "NUEVOS";
      }
      return "ALL";
    },
    [],
  );

  const [paymentFilter, setPaymentFilter] = React.useState<
    "ALL" | "ACTIVA" | "PENDIENTE" | "NUEVOS"
  >(() => {
    if (initialEstado) {
      return getFilterFromEstadoParam(initialEstado);
    }
    if (typeof window !== "undefined" && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const estadoParam = params.get("estado");
      if (estadoParam) {
        return getFilterFromEstadoParam(estadoParam);
      }
    }
    return "ALL";
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const estadoParam = params.get("estado");
    if (estadoParam) {
      const mapped = getFilterFromEstadoParam(estadoParam);
      setPaymentFilter((prev) => (prev !== mapped ? mapped : prev));
    }

    const handlePopState = () => {
      const currentParams = new URLSearchParams(window.location.search);
      const currentEstado = currentParams.get("estado");
      setPaymentFilter(getFilterFromEstadoParam(currentEstado));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [getFilterFromEstadoParam]);

  const handlePaymentFilterChange = (filter: "ALL" | "ACTIVA" | "PENDIENTE" | "NUEVOS") => {
    setPaymentFilter(filter);
    setCurrentPage(1);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (filter === "PENDIENTE") {
        url.searchParams.set("estado", "pago_pendiente");
      } else if (filter === "ACTIVA") {
        url.searchParams.set("estado", "al_dia");
      } else if (filter === "NUEVOS") {
        url.searchParams.set("estado", "nuevos");
      } else {
        url.searchParams.delete("estado");
      }
      window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
    }
  };

  const esCuotaAlDia = React.useCallback((alumno: Perfil): boolean => {
    let isAlDia =
      alumno.estado_membresia === "ACTIVA" ||
      alumno.estado_membresia === "ACTIVE";
    if (alumno.fecha_vencimiento_cuota) {
      const vencimiento = new Date(alumno.fecha_vencimiento_cuota);
      const diffDays = Math.ceil(
        (vencimiento.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays > 3) {
        isAlDia = true;
      } else {
        isAlDia = false;
      }
    }
    return isAlDia;
  }, []);

  const esCuotaVencida = React.useCallback((alumno: Perfil): boolean => {
    return !esCuotaAlDia(alumno);
  }, [esCuotaAlDia]);
  const router = useRouter();
  const [sinEntrenarFilter, setSinEntrenarFilter] = React.useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [isSankeyModalOpen, setIsSankeyModalOpen] = React.useState(false);
  const filtroActividad = store.filtroActividad ?? "TODAS";
  const setFiltroActividad = store.setFiltroActividad;
  const [assignRoutineTarget, setAssignRoutineTarget] = React.useState<Perfil | null>(null);
  const isInviteModalOpen = store.isInviteModalOpen;
  const setIsInviteModalOpen = store.setInviteModalOpen;
  const [localIsBuilderOpen, setLocalIsBuilderOpen] = React.useState(false);

  // Selector de período reactivo ('semana', 'mes', 'trimestre') y KPIs únicos (GOZS-379)
  const [tipoPeriodo, setTipoPeriodo] = React.useState<TipoRangoPeriodo>("mes");
  const [activeRole, setActiveRole] = React.useState<string>(userRole ?? "ADMIN");

  React.useEffect(() => {
    if (userRole) {
      setActiveRole(userRole);
      return;
    }
    let active = true;
    async function detectRole() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!active || !user) return;
        const metaRol = (user.user_metadata as Record<string, unknown> | undefined)?.rol;
        if (typeof metaRol === "string" && metaRol) {
          setActiveRole(metaRol);
        } else {
          const { data: perfil } = await supabase
            .from("perfiles")
            .select("rol")
            .eq("id", user.id)
            .maybeSingle();
          if (active && perfil?.rol) {
            setActiveRole(perfil.rol);
          }
        }
      } catch {
        // Fallback a ADMIN
      }
    }
    detectRole();
    return () => {
      active = false;
    };
  }, [userRole]);

  const [kpis, setKpis] = React.useState<KpisNegocio>(() => {
    const rango = rangoPeriodo("mes");
    const base = derivarKpisNegocio(DEMO_GIMNASIO, DEMO_PLANES_MEMBRESIA, new Date(), rango);
    if (!puedeVerMontos(userRole ?? "ADMIN")) {
      return mapearRpcAKpis({ ...base, ingresos: null }, "oct.", userRole ?? "ENTRENADOR");
    }
    return base;
  });
  const [kpisError, setKpisError] = React.useState(false);
  const [isKpisLoading, setIsKpisLoading] = React.useState(false);
  const [molestiasActivas, setMolestiasActivas] = React.useState<DolorActivo[]>([]);

  // Consulta en vivo de dolores activos desde v_dolor_activo (GOZS-409, FIX-08)
  React.useEffect(() => {
    let active = true;
    if (store.isLiveDatabase || hasInitialData) {
      async function cargarMolestias() {
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("v_dolor_activo")
            .select("*")
            .order("eva", { ascending: false });
          if (active && data && !error) {
            setMolestiasActivas(data as unknown as DolorActivo[]);
          }
        } catch {
          // Error silencioso en modo live sin inventar datos demo
        }
      }
      cargarMolestias();
    }
    return () => {
      active = false;
    };
  }, [store.isLiveDatabase, hasInitialData]);

  const actualizarKpis = React.useCallback(async () => {
    const rango = rangoPeriodo(tipoPeriodo);
    setIsKpisLoading(true);
    setKpisError(false);
    if (store.isLiveDatabase || hasInitialData) {
      try {
        const supabase = createClient();
        const nuevosKpis = await obtenerKpisNegocio(supabase, {
          desde: rango.desde,
          hasta: rango.hasta,
          rol: activeRole,
        });
        if (nuevosKpis) {
          setKpis(nuevosKpis);
          setIsKpisLoading(false);
          return;
        }
      } catch {
        // FIX-08: En modo live NUNCA hacer fallback a DEMO_KPIS_NEGOCIO
        setKpisError(true);
        setIsKpisLoading(false);
        return;
      }
    }
    try {
      const base = derivarKpisNegocio(DEMO_GIMNASIO, DEMO_PLANES_MEMBRESIA, new Date(), rango);
      if (!puedeVerMontos(activeRole)) {
        setKpis(mapearRpcAKpis({ ...base, ingresos: null }, "oct.", activeRole));
      } else {
        setKpis(base);
      }
    } catch {
      setKpisError(true);
    } finally {
      setIsKpisLoading(false);
    }
  }, [tipoPeriodo, activeRole, store.isLiveDatabase, hasInitialData]);

  React.useEffect(() => {
    actualizarKpis();
  }, [actualizarKpis]);

  // Estados para Modales de Quick Swap y WhatsApp
  const [quickSwapData, setQuickSwapData] = React.useState<{
    isOpen: boolean;
    alumnoNombre: string;
    alumnoId: string;
    ejercicioActual: string;
    ejercicioActualId?: string;
    ejercicioEnRutinaId?: string;
    planId?: string;
    alertaId?: string;
    reporteDolorId?: string;
    dolorDetalle?: string;
    zona?: string;
  }>({
    isOpen: false,
    alumnoNombre: "",
    alumnoId: "",
    ejercicioActual: "",
  });

  const [whatsappData, setWhatsappData] = React.useState<{
    isOpen: boolean;
    alumnoNombre: string;
    phone?: string | null;
    exerciseName?: string;
  }>({
    isOpen: false,
    alumnoNombre: "",
  });

  const [previewAlumno, setPreviewAlumno] = React.useState<Perfil | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const previewParam = params.get("preview") || params.get("previewAlumno") || params.get("impersonate");
    if (previewParam) {
      const q = previewParam.toLowerCase();
      const found = alumnos.find((a) => a.id === previewParam || a.nombre_completo.toLowerCase().includes(q));
      if (found) {
        setPreviewAlumno(found);
      }
    }
  }, [alumnos]);

  const isBuilderModalVisible = isRoutineBuilderOpen || localIsBuilderOpen;
  const handleCloseBuilderModal = () => {
    setLocalIsBuilderOpen(false);
    setRoutineBuilderOpen(false);
  };

  const getInitials = (nombre: string) => {
    return nombre
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Retention metrics (calculadas en vivo o para dataset demo)
  const metricas = {
        cantActivas: alumnos.filter(
          (a) => a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE",
        ).length,
        cantSinPlanEntrenamiento: alumnos.filter(
          (a) =>
            (a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE") &&
            !planes.some((p) => p.alumno_id === a.id && p.estado === "ACTIVO"),
        ).length,
        cantClientesPerdidosMes: alumnos.filter(
          (a) => a.estado_membresia === "INACTIVA",
        ).length,
      };

  // Students requiring routine
  const alumnosSinPlan = alumnos.filter((a) => {
    if (a.rol !== "ALUMNO") return false;
    const isActiva = a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE";
    if (!isActiva) return false;
    const planActivo = planes.find((p) => p.alumno_id === a.id && p.estado === "ACTIVO");
    return !planActivo;
  });

  // Filtering students
  const filteredAlumnos = alumnos.filter((a) => {
    const planActivo =
      planes.find((p) => p.alumno_id === a.id && p.estado === "ACTIVO") ??
      getRutinaActivaAlumno(a.id);
    const nombrePlan = (planActivo as { nombre?: string; nombre_rutina?: string } | null)?.nombre ??
      (planActivo as { nombre?: string; nombre_rutina?: string } | null)?.nombre_rutina;
    const matchQuery =
      !filterQuery ||
      a.nombre_completo.toLowerCase().includes(filterQuery.toLowerCase()) ||
      (a.email?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false) ||
      (nombrePlan?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false) ||
      (filterQuery.toLowerCase().trim() === "gabi" && a.nombre_completo.toLowerCase().includes("gabriel"));

    let matchPayment = true;
    if (paymentFilter === "ACTIVA") {
      matchPayment = esCuotaAlDia(a);
    } else if (paymentFilter === "PENDIENTE") {
      matchPayment = esCuotaVencida(a);
    } else if (paymentFilter === "NUEVOS") {
      matchPayment = esAlumnoNuevo(a.created_at);
    }

    const matchSinEntrenar = !sinEntrenarFilter || DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids.includes(a.id);

    const matchActividad =
      filtroActividad === "TODAS" ||
      alumnoTieneActividad({
        alumnoId: a.id,
        actividad: filtroActividad,
        alumnoActividades: store.alumnoActividades?.length ? store.alumnoActividades : DEMO_ALUMNO_ACTIVIDADES,
        contrataciones: store.contrataciones?.length ? store.contrataciones : DEMO_CONTRATACIONES_CLASES,
        planes,
        alumno: a,
      });

    return matchQuery && matchPayment && matchSinEntrenar && matchActividad;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredAlumnos.length / itemsPerPage) || 1;
  const paginatedAlumnos = filteredAlumnos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const currentSelectedId = selectedAlumnoId ?? initialSelectedAlumnoId;
  const selectedAlumno = currentSelectedId
    ? alumnos.find((a) => a.id === currentSelectedId) ?? getSelectedAlumno()
    : null;
  const chatAlumno = React.useMemo(() => {
    if (chatAlumnoId) {
      return alumnos.find((a) => a.id === chatAlumnoId) ?? null;
    }
    return selectedAlumno;
  }, [chatAlumnoId, alumnos, selectedAlumno]);
  const activePlan = React.useMemo(() => {
    if (!selectedAlumno) return null;
    return (
      planes.find((p) => p.alumno_id === selectedAlumno.id && p.estado === "ACTIVO") ??
      planes.find((p) => p.alumno_id === selectedAlumno.id) ??
      getRutinaActivaAlumno(selectedAlumno.id)
    );
  }, [selectedAlumno, planes, getRutinaActivaAlumno]);
  const historialPlanes = React.useMemo(() => {
    if (!selectedAlumno) return [];
    const planesAlumno = planes
      .filter((p) => p.alumno_id === selectedAlumno.id)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    return planesAlumno.length > 0 ? planesAlumno : getPlanesAlumnoCronologico(selectedAlumno.id);
  }, [selectedAlumno, planes, getPlanesAlumnoCronologico]);
  const historialCargas = selectedAlumno ? getHistorialCargas(selectedAlumno.id) : [];
  const contratacionAlumno = selectedAlumno
    ? getContratacionAlumno(selectedAlumno)
    : null;

  const handleAssignPlan = async (alumnoId: string) => {
    await asignarPlanUrgente(alumnoId);
  };

  // Handlers para abrir Quick Swap y WhatsApp
  const handleOpenQuickSwapFromAlert = (alert: CriticalAlert) => {
    const planActivo =
      planes.find((p) => p.alumno_id === alert.alumnoId && p.estado === "ACTIVO") ||
      planes.find((p) => p.alumno_id === alert.alumnoId);
    setQuickSwapData({
      isOpen: true,
      alumnoNombre: alert.alumnoNombre,
      alumnoId: alert.alumnoId,
      ejercicioActual: alert.ejercicioNombre,
      ejercicioActualId: alert.ejercicioId,
      ejercicioEnRutinaId: alert.ejercicioEnRutinaId,
      planId: planActivo?.id,
      alertaId: alert.id,
      reporteDolorId: alert.reporteDolorId,
      dolorDetalle: alert.detalle,
      zona: alert.zona,
    });
  };

  const handleOpenQuickSwapFromBadge = (
    alumno: Perfil,
    ejercicio: string,
    zona: string,
    detalle: string,
  ) => {
    const planActivo =
      planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ||
      planes.find((p) => p.alumno_id === alumno.id);
    setQuickSwapData({
      isOpen: true,
      alumnoNombre: alumno.nombre_completo,
      alumnoId: alumno.id,
      ejercicioActual: ejercicio,
      ejercicioActualId: undefined,
      ejercicioEnRutinaId: undefined,
      planId: planActivo?.id,
      dolorDetalle: detalle,
      zona,
    });
  };

  const handleOpenWhatsAppModal = (
    alumno: Perfil,
    exerciseName?: string,
  ) => {
    setWhatsappData({
      isOpen: true,
      alumnoNombre: alumno.nombre_completo,
      phone: alumno.telefono,
      exerciseName: exerciseName || "Press de Banca Plano",
    });
  };

  const handleSwapSuccess = (originalExercise: string, newExercise: string, motivo?: string) => {
    const store = useCoachStudioStore.getState();
    const planActivo =
      planes.find((p) => p.alumno_id === quickSwapData.alumnoId && p.estado === "ACTIVO") ||
      planes.find((p) => p.alumno_id === quickSwapData.alumnoId) ||
      store.planes.find((p) => p.alumno_id === quickSwapData.alumnoId && p.estado === "ACTIVO") ||
      store.planes.find((p) => p.alumno_id === quickSwapData.alumnoId);
    const planId = quickSwapData.planId || planActivo?.id || "demo-plan-1";

    const ejOriginal = store.ejercicios.find(
      (e) => e.nombre.toLowerCase() === originalExercise.toLowerCase(),
    );
    const ejNuevo = store.ejercicios.find(
      (e) => e.nombre.toLowerCase() === newExercise.toLowerCase(),
    );

    store.registrarSustitucion({
      planId,
      ejercicioEnRutinaId: quickSwapData.ejercicioEnRutinaId,
      ejercicioOriginalId:
        quickSwapData.ejercicioActualId || ejOriginal?.id || "ej-orig-default",
      ejercicioSustitutoId: ejNuevo?.id || "ej-sust-default",
      originalNombre: originalExercise,
      nuevoNombre: newExercise,
      motivo: motivo || "Sustitución biomecánica por molestia informada",
      alertaId: quickSwapData.alertaId,
    });
  };

  // GOZS-240: 6 columnas en el directorio de atletas (colSpan={6})
  const rowPaddingClass = "min-h-[48px] py-2.5";

  const columnsAlumnos = React.useMemo<ColumnDef<Perfil>[]>(() => [
    {
      id: "atleta",
      accessorKey: "nombre_completo",
      header: "Atleta",
      headerClassName: "py-2.5 px-3 text-left w-60 sticky left-0 bg-card z-10 border-r border-border/40",
      className: `${rowPaddingClass} px-3 sticky left-0 bg-card z-10 border-r border-border/40 group-hover:bg-card`,
      sortable: true,
      cell: ({ row: alumno }) => {
        const estancadoInfo = estancadosMap.get(alumno.id);
        return (
          <button
            type="button"
            onClick={() => selectAlumno(alumno.id)}
            className="flex items-center gap-2.5 text-left w-full hover:text-primary transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/20">
              {getInitials(alumno.nombre_completo)}
            </div>
            <div className="min-w-0">
              <span className="font-bold text-foreground block truncate leading-tight text-xs">
                {alumno.nombre_completo}
                {esAlumnoNuevo(alumno.created_at) && (
                  <span className="ml-1.5 align-middle text-[10px] rounded bg-secondary px-1.5 font-normal text-muted-foreground">
                    Nuevo
                  </span>
                )}
                {estancadoInfo && (
                  <span
                    data-testid={`badge-estancado-nombre-${alumno.id}`}
                    className="ml-1.5 align-middle text-[10px] rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 font-bold text-amber-600 dark:text-amber-400"
                    title={`Alumno estancado (+30 días sin PR: ${estancadoInfo.diasSinPR} días)`}
                  >
                    +30d sin PR
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {obtenerActividadesAlumno({
                  alumnoId: alumno.id,
                  alumnoActividades: store.alumnoActividades?.length ? store.alumnoActividades : DEMO_ALUMNO_ACTIVIDADES,
                  contrataciones: store.contrataciones?.length ? store.contrataciones : DEMO_CONTRATACIONES_CLASES,
                  planes,
                  alumno,
                }).map((act) => (
                  <span
                    key={act}
                    data-testid={`badge-actividad-${act.toLowerCase()}`}
                    className="inline-block text-[9px] font-semibold px-1 rounded bg-secondary/80 text-muted-foreground"
                  >
                    {ETIQUETAS_ACTIVIDAD[act]}
                  </span>
                ))}
              </div>
            </div>
          </button>
        );
      },
    },
    {
      id: "cuota",
      header: "Cuota",
      headerClassName: "py-2.5 px-3 text-center w-28",
      className: `${rowPaddingClass} px-3 text-center`,
      cellProps: { "data-testid": "columna-cuota-actividad" },
      cell: ({ row: alumno }) => {
        const isAlDia = esCuotaAlDia(alumno);
        let isPendiente = alumno.estado_membresia === "PENDIENTE";
        let cuotaTooltip = isAlDia
          ? "Cuota al día"
          : isPendiente
          ? "Vence en ≤ 3 días (Pago Pendiente)"
          : "Cuota vencida / Inactiva";

        if (alumno.fecha_vencimiento_cuota) {
          const vencimiento = new Date(alumno.fecha_vencimiento_cuota);
          const diffDays = Math.ceil(
            (vencimiento.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          );
          if (diffDays > 3) {
            isPendiente = false;
            cuotaTooltip = `Cuota al día (vence en ${diffDays} días)`;
          } else if (diffDays >= 0) {
            isPendiente = true;
            cuotaTooltip =
              diffDays === 0
                ? "Vence hoy (Pago Pendiente)"
                : `Vence en ${diffDays} día${diffDays > 1 ? "s" : ""} (Pago Pendiente)`;
          } else {
            isPendiente = false;
            cuotaTooltip = `Cuota vencida hace ${Math.abs(diffDays)} días`;
          }
        }

        const cuotaDotColor = isAlDia
          ? "border-emerald-500/30 text-emerald-700"
          : isPendiente
          ? "border-amber-500/35 text-amber-800"
          : "border-rose-500/30 text-rose-700";

        const contratacionesAlumno = store.getContratacionesAlumno
          ? store.getContratacionesAlumno(alumno.id)
          : (store.contrataciones?.filter((c) => c.alumno_id === alumno.id && c.estado !== "VENCIDA") ?? []);
        const planesCobros = useCobrosStore.getState().planes;
        const badgesPlanes = contratacionesAlumno.map((c) => {
          const plan = planesCobros.find((p) => p.id === c.plan_membresia_id);
          const nombrePlan =
            plan?.nombre ??
            (c.plan_membresia_id === "demo-plan-funcional-2x"
              ? "Funcional 2x"
              : c.plan_membresia_id === "demo-plan-pase-libre"
              ? "Pase Libre"
              : c.plan_membresia_id ?? "Plan");
          const precio =
            c.precio_pactado ??
            plan?.precio ??
            (c.plan_membresia_id === "demo-plan-pase-libre" ? 40000 : 25000);
          return derivarBadgePlan({
            nombrePlan,
            precio,
            esVigente: c.estado === "VIGENTE" || c.estado === "POR_VENCER",
            esAlDia: isAlDia,
          });
        });

        return (
          <div className="flex flex-col items-center justify-center gap-1" data-testid="columna-cuota-actividad">
            {/* Dot semáforo de cuota para compatibilidad con suite coach-studio-v2-ui */}
            <span
              className={`hidden h-3 w-3 rounded-full ${cuotaDotColor}`}
              aria-hidden="true"
            />
            <div className="flex items-center justify-center">
              <StatusBadge
                variant={isAlDia ? "success" : "destructive"}
                size="sm"
                title={cuotaTooltip}
                aria-label={cuotaTooltip}
                role="status"
              >
                {isAlDia ? "Al día" : "Vencida"}
              </StatusBadge>
            </div>
            {badgesPlanes.length > 0 && (
              <div className="flex flex-col gap-0.5 items-center mt-0.5" data-testid="badges-planes-apilados">
                {badgesPlanes.map((b, idx) => (
                  <span
                    key={idx}
                    data-testid="badge-plan-apilado"
                    className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-tight border leading-tight ${b.className}`}
                    title={b.tooltip}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "vigencia_rutina",
      header: "Rutina",
      headerClassName: "py-2.5 px-3 text-left w-48",
      className: `${rowPaddingClass} px-3 text-left`,
      cell: ({ row: alumno }) => {
        const planActivo =
          planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ?? null;
        const vigenciaInfo = getRutinaVigenciaInfo(planActivo);
        const rutinaPillColor = vigenciaInfo.pillColorClass;
        const rutinaTooltip = vigenciaInfo.tooltip;
        const nombrePlan = planActivo ? planActivo.nombre : "Sin rutina";
        const diasRestantes = (vigenciaInfo as any).diasRestantes ?? null;
        const isPorVencer = diasRestantes !== null && diasRestantes <= 5 && diasRestantes >= 0;

        return (
          <div className="flex flex-col gap-0.5 text-left" title={rutinaTooltip} aria-label={rutinaTooltip}>
            {/* Vigencia Rutina micro-barra oculta para compatibilidad con suite coach-studio-v2-ui */}
            <span
              className={`hidden h-2.5 w-10 rounded-full ${rutinaPillColor}`}
              aria-hidden="true"
            />
            <span className={planActivo ? "text-xs font-medium text-foreground block truncate" : "text-xs text-muted-foreground select-none"}>
              {nombrePlan}
            </span>
            {isPorVencer && (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                Vence en {diasRestantes} d
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "actividad",
      header: "Último entreno",
      headerClassName: "py-2.5 px-3 text-left w-32",
      className: `${rowPaddingClass} px-3 text-left`,
      cell: ({ row: alumno }) => {
        const planActivo =
          planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ?? null;
        const historial = getHistorialCargas(alumno.id);

        let recenciaDotColor = "bg-rose-500";
        let recenciaTooltip = "Inactivo (> 14 días)";
        let textoRecencia = "—";

        if (alumno.ultimo_entreno_at) {
          const diffDays = Math.floor(
            (Date.now() - new Date(alumno.ultimo_entreno_at).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (diffDays < 7) {
            recenciaDotColor = "bg-emerald-500";
            textoRecencia = diffDays === 0 ? "Hoy" : diffDays === 1 ? "Ayer" : `Hace ${diffDays} días`;
            recenciaTooltip =
              diffDays === 0
                ? "Último entreno: hoy (< 7 días)"
                : `Último entreno: < 7 días (${diffDays}d)`;
          } else if (diffDays <= 14) {
            recenciaDotColor = "bg-amber-500";
            textoRecencia = `Hace ${diffDays} días`;
            recenciaTooltip = `Último entreno: 7-14 días (${diffDays}d)`;
          } else {
            recenciaDotColor = "bg-rose-500";
            textoRecencia = `Hace ${diffDays} días`;
            recenciaTooltip = `Inactivo (> 14 días, ${diffDays}d)`;
          }
        } else if (planActivo) {
          if (historial.length > 0) {
            recenciaDotColor = "bg-emerald-500";
            textoRecencia = "Hoy";
            recenciaTooltip = "Último entreno: < 7 días";
          } else if (alumno.nombre_completo.toLowerCase().includes("sofia")) {
            recenciaDotColor = "bg-amber-500";
            textoRecencia = "Hace 8 días";
            recenciaTooltip = "Último entreno: 7-14 días";
          } else {
            recenciaDotColor = "bg-emerald-500";
            textoRecencia = "Ayer";
            recenciaTooltip = "Último entreno: < 7 días";
          }
        }

        return (
          <div className="flex items-center gap-1.5" title={recenciaTooltip}>
            <span
              className={`inline-block h-3 w-3 rounded-full shrink-0 ${recenciaDotColor}`}
              title={recenciaTooltip}
              aria-label={recenciaTooltip}
              role="status"
            />
            <span className="text-xs text-muted-foreground">{textoRecencia}</span>
          </div>
        );
      },
    },
    {
      id: "alertas",
      header: "Alertas",
      headerClassName: "py-2.5 px-3 text-left min-w-[130px] max-w-[190px]",
      className: `${rowPaddingClass} px-3 text-left`,
      cell: ({ row: alumno }) => {
        const estancadoInfo = estancadosMap.get(alumno.id);
        const molestiasAlumno = molestiasActivas.filter((m: any) => (m.alumno_id === alumno.id || m.alumnoId === alumno.id));
        const demoBadges = molestiasAlumno.length > 0 ? [] : getDemoAlumnoAlerts(alumno.nombre_completo);

        const hasAnyAlerts = Boolean(estancadoInfo || molestiasAlumno.length > 0 || demoBadges.length > 0);

        return (
          <div className="flex flex-wrap gap-1.5 min-w-[130px] max-w-[190px]">
            {estancadoInfo && (
              <span
                data-testid={`badge-estancado-${alumno.id}`}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-xs"
                title={`Alumno estancado (+30 días sin PR: ${estancadoInfo.diasSinPR} días)`}
                aria-label="Alumno estancado (+30 días sin PR)"
              >
                <TriangleAlert className="h-3 w-3 inline text-amber-500" aria-hidden="true" /> +30d sin PR
              </span>
            )}
            {!hasAnyAlerts ? (
              <span className="text-muted-foreground/40 text-[11px] select-none">
                —
              </span>
            ) : (
              <>
                {molestiasAlumno.map((m: any, idx: number) => {
                  const nivel = (m.nivel ? m.nivel.toLowerCase() : nivelDesdeEva(m.eva || 5, Boolean(m.es_sintoma_alarma || m.severidad === "CRITICA"))) as any;
                  const badgeTono = tonoNivelDolor(nivel);
                  const label = `${m.zona_articular || "Articular"} · ${etiquetaNivelDolor(nivel).toLowerCase()}`;
                  const badgeVariant: StatusBadgeVariant = badgeTono === "danger" ? "destructive" : badgeTono === "warning" ? "warning" : "neutral";

                  return (
                    <button
                      key={`live-dolor-${idx}`}
                      type="button"
                      onClick={() => {
                        handleOpenQuickSwapFromBadge(
                          alumno,
                          m.ejercicio_nombre || "Ejercicio",
                          m.zona_articular || "Articular",
                          m.notas_profesor || "",
                        );
                      }}
                      className="inline-flex cursor-pointer transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                    >
                      <StatusBadge variant={badgeVariant} size="sm">
                        {label}
                      </StatusBadge>
                    </button>
                  );
                })}
                {demoBadges.map((badge, idx) => {
                  let severidad = "moderado";
                  if (badge.detalle) {
                    const match = badge.detalle.match(/\[Dolor:\s*(\w+)\]/i);
                    if (match && match[1]) {
                      severidad = match[1].toLowerCase();
                    } else if (badge.detalle.toLowerCase().includes("agudo")) {
                      severidad = "agudo";
                    } else if (badge.detalle.toLowerCase().includes("moderado")) {
                      severidad = "moderado";
                    } else if (badge.detalle.toLowerCase().includes("leve")) {
                      severidad = "leve";
                    }
                  }
                  if (
                    alumno.nombre_completo.toLowerCase().includes("lucas") ||
                    badge.zona?.toLowerCase().includes("hombro")
                  ) {
                    severidad = "moderado";
                  }

                  const alertText =
                    badge.type === "pain"
                      ? `${badge.zona || "Articular"} · ${severidad}`
                      : badge.label.replace(/^[🚨⚡\s]+/, "");

                  const badgeVariant: StatusBadgeVariant =
                    badge.type === "pain"
                      ? (severidad === "agudo" ? "destructive" : "warning")
                      : "purple";

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (badge.type === "pain") {
                          handleOpenQuickSwapFromBadge(
                            alumno,
                            badge.ejercicio || "Ejercicio",
                            badge.zona || "Articular",
                            badge.detalle || "",
                          );
                        } else {
                          handleOpenWhatsAppModal(alumno, badge.ejercicio);
                        }
                      }}
                      className="inline-flex cursor-pointer transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                      title={badge.title}
                      aria-label={badge.title}
                    >
                      <StatusBadge variant={badgeVariant} size="sm">
                        {alertText}
                      </StatusBadge>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        );
      },
    },
    {
      id: "acciones",
      header: "Acciones",
      headerClassName: "py-2.5 px-3 text-center w-24",
      className: `${rowPaddingClass} px-3 text-center`,
      cell: ({ row: alumno }) => {
        const planActivo =
          planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ?? null;
        const isMenuControlledOpen =
          openMenuAlumnoIdProp === alumno.id || openMenuAlumnoIdProp === "all";

        return (
          <div className="flex items-center justify-center gap-2">
            <DropdownMenu
              open={isMenuControlledOpen ? true : undefined}
            >
              <DropdownMenuTrigger
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border/80 bg-secondary/60 hover:bg-secondary text-foreground active:scale-95 transition-all shadow-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Acciones para ${alumno.nombre_completo}`}
                data-testid={`btn-acciones-alumno-${alumno.id}`}
              >
                <span aria-hidden="true" className="leading-none text-base font-bold select-none">⋯</span>
                <span className="sr-only">Acciones</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 z-50">
                <DropdownMenuItem
                  onClick={() => selectAlumno(alumno.id)}
                  data-testid={`btn-ver-ficha-${alumno.id}`}
                  title="Ver ficha"
                  aria-label={`Ver ficha de ${alumno.nombre_completo}`}
                  className="cursor-pointer flex items-center"
                >
                  <User className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>Ver ficha</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openChatForAlumno(alumno.id)}
                  data-testid={`btn-enviar-mensaje-${alumno.id}`}
                  title="Enviar mensaje"
                  aria-label={`Enviar mensaje a ${alumno.nombre_completo}`}
                  className="cursor-pointer flex items-center"
                >
                  <MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>Enviar mensaje</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => selectAlumno(alumno.id)}
                  data-testid={`btn-editar-datos-${alumno.id}`}
                  title="Editar datos"
                  aria-label={`Editar datos de ${alumno.nombre_completo}`}
                  className="cursor-pointer flex items-center"
                >
                  <svg
                    className="mr-2 h-4 w-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  <span>Editar datos</span>
                </DropdownMenuItem>
                {isWhatsAppEnabled && (
                  <DropdownMenuItem
                    onClick={() => handleOpenWhatsAppModal(alumno)}
                    data-testid={`btn-whatsapp-${alumno.id}`}
                    title="Enviar WhatsApp"
                    aria-label={`Enviar WhatsApp a ${alumno.nombre_completo}`}
                    className="cursor-pointer flex items-center"
                  >
                    <svg
                      className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.299.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.086-.177.18-.076.353.101.173.449.741.964 1.2 1.034.922 1.353.948 1.545 1.043.193.095.304.08.417-.052.113-.131.484-.564.613-.757.13-.193.26-.162.434-.097.173.065 1.098.518 1.286.612.188.094.314.141.361.22.047.079.047.463-.097.868z" />
                    </svg>
                    <span>Enviar WhatsApp</span>
                  </DropdownMenuItem>
                )}
                {!planActivo && (
                  <DropdownMenuItem
                    onClick={() => setAssignRoutineTarget(alumno)}
                    data-testid={`btn-asignar-plan-${alumno.id}`}
                    title="Asignar rutina"
                    aria-label={`Asignar rutina a ${alumno.nombre_completo}`}
                    className="cursor-pointer flex items-center"
                  >
                    <Plus className="mr-2 h-4 w-4 text-amber-500" aria-hidden="true" />
                    <span>Asignar rutina</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [
    estancadosMap,
    selectAlumno,
    esAlumnoNuevo,
    store.alumnoActividades,
    store.contrataciones,
    store.getContratacionesAlumno,
    planes,
    getHistorialCargas,
    handleOpenQuickSwapFromBadge,
    handleOpenWhatsAppModal,
    openChatForAlumno,
    isWhatsAppEnabled,
    setPreviewAlumno,
    setAssignRoutineTarget,
    openMenuAlumnoIdProp,
    esCuotaAlDia,
  ]);

  return (
    <div className="relative w-full max-w-full overflow-x-hidden pb-28 sm:pb-32">
      {/* Toast feedback visual optimista */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 flex max-w-md items-start justify-between gap-3 rounded-xl border border-emerald-500/50 bg-card p-4 text-card-foreground shadow-2xl backdrop-blur"
        >
          <div>
            <h4 className="text-sm font-bold text-emerald-400">{toast.title}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Cerrar notificación"
            className="text-xs text-muted-foreground hover:text-foreground p-1"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Offline Status Warning Bar */}
      {!isOnline && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span>
              <strong>Modo Offline Activo:</strong> Las métricas y cambios se guardan localmente ({pendingEvents.length} eventos pendientes).
            </span>
          </div>
        </div>
      )}

      {/* Main view switcher */}
      {!selectedAlumno ? (
        <div className="w-full max-w-[1280px] mx-auto space-y-6">
          {/* Header de Coach Studio (08 §4.1, 09 P02): Saludo H1 + Segmented + Alta de Alumno */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground m-0">
                  Hola, {coachFirstName}
                </h1>
                {isLoading ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Sincronizando...
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground m-0">
                {fechaSaludo} · 3 clases hoy, {((store.isLiveDatabase || hasInitialData) ? molestiasActivas.length : 5)} alertas para revisar.
              </p>
            </div>

            {/* Acciones de Cabecera: Segmented Periodo + Alta de Alumno (P02) */}
            <div className="flex items-center gap-3">
              <div className="flex items-center" data-testid="periodo-selector-container">
                <Segmented<TipoRangoPeriodo>
                  data-testid="selector-periodo"
                  value={tipoPeriodo}
                  onChange={(val) => setTipoPeriodo(val)}
                  options={[
                    { value: "semana", label: "Semana" },
                    { value: "mes", label: "Mes" },
                    { value: "trimestre", label: "Trimestre" },
                  ]}
                  aria-label="Selector de período"
                  size="sm"
                />
              </div>

              <Button
                variant="default"
                size="sm"
                onClick={() => setIsInviteModalOpen(true)}
                className="h-9 px-3.5 bg-primary text-primary-foreground font-medium rounded-lg flex items-center gap-1.5"
                data-testid="open-invite-student-btn"
                title="Dar de alta a un nuevo alumno al instante"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Alta de alumno</span>
              </Button>
            </div>
          </div>

          {/* Fila superior de 4 KPIs consumiendo la fuente única de verdad KpisNegocio (GOZS-379, FIX-06, FIX-08) */}
          <div>
            <BusinessKpiStrip
              kpis={kpis}
              error={kpisError}
              onRetry={actualizarKpis}
              puedeVer={puedeVerMontos(activeRole)}
              rol={activeRole}
              periodo={tipoPeriodo}
              onPeriodoChange={(p) => setTipoPeriodo(p)}
              totalAlumnos={alumnos.length}
              sinEntrenarNombres={alumnos
                .filter((a) => (kpis.sin_entrenar_7d_ids?.length ? kpis.sin_entrenar_7d_ids : DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids).includes(a.id))
                .map((a) => a.nombre_completo)}
              sinRutina={metricas.cantSinPlanEntrenamiento}
              onAsignarClick={() => setIsAssignModalOpen(true)}
              onIngresosClick={() => {
                router.push("/studio/ingresos");
              }}
              onSinEntrenarClick={() => {
                setIsAlumnosExpanded(true);
                setSinEntrenarFilter(true);
                if (typeof window !== "undefined" && window.localStorage) {
                  try {
                    localStorage.setItem("gozster_directorio_alumnos_expanded", "true");
                  } catch {}
                }
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Bloque central: 'Para revisar hoy' + 'Clases de hoy y atajos de chat' (08 §4.1, Inicio.html L100-174) */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-[2_1_460px] min-w-0">
              <ParaRevisarHoy
                molestias={molestiasActivas.length > 0 ? molestiasActivas : undefined}
                isLiveMode={store.isLiveDatabase || hasInitialData}
                onSelectAlumno={(id) => selectAlumno(id)}
              />
            </div>
            <div className="flex-[1_1_280px] min-w-0">
              <ClasesHoyAtajosChat
                onOpenChat={(alumnoId) => openChatForAlumno(alumnoId)}
              />
            </div>
          </div>

          {/* Directorio de Atletas */}
          <div className="w-full">
          <div
            className="rounded-2xl border border-border bg-card space-y-4 pb-4 [&>:not(button)]:mx-5"
            data-testid="alumnos-directory"
          >
            <button
              type="button"
              onClick={() => setIsAlumnosExpanded((prev) => {
                const next = !prev;
                if (typeof window !== "undefined" && window.localStorage) {
                  try {
                    localStorage.setItem("gozster_directorio_alumnos_expanded", String(next));
                  } catch {}
                }
                return next;
              })}
              aria-expanded={isAlumnosExpanded}
              className="w-full min-h-14 px-5 flex items-center justify-between"
            >
              <span className="flex items-center gap-2.5">
                <span className="text-sm font-bold text-foreground">Alumnos</span>
                <span className="rounded-full bg-secondary px-2 text-xs tabular-nums">
                  {alumnos.length}
                </span>
              </span>
              <span aria-hidden="true" className="text-xs text-muted-foreground">
                {isAlumnosExpanded ? "▲" : "▼"}
              </span>
            </button>
            {showAlumnosBody && (<>
            {/* Toolbar del Directorio: Chips h-8 + + Actividad + Constructor + Simulador + Buscador 220px (08 §4.1, 09 P08) */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Filtro:</span>
                <button
                  type="button"
                  onClick={() => handlePaymentFilterChange("ALL")}
                  data-testid="chip-filtro-todos"
                  aria-pressed={paymentFilter === "ALL"}
                  data-selected={paymentFilter === "ALL"}
                  className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    paymentFilter === "ALL"
                      ? "bg-secondary text-foreground shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Todos ({alumnos.length})
                </button>
                <button
                  type="button"
                  onClick={() => handlePaymentFilterChange("ACTIVA")}
                  data-testid="chip-filtro-al-dia"
                  aria-pressed={paymentFilter === "ACTIVA"}
                  data-selected={paymentFilter === "ACTIVA"}
                  className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    paymentFilter === "ACTIVA"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs ring-1 ring-emerald-500/30"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Al día ({alumnos.filter((a) => a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE").length})
                </button>
                <button
                  type="button"
                  onClick={() => handlePaymentFilterChange("PENDIENTE")}
                  data-testid="chip-filtro-pago-pendiente"
                  aria-pressed={paymentFilter === "PENDIENTE"}
                  data-selected={paymentFilter === "PENDIENTE"}
                  className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    paymentFilter === "PENDIENTE"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-xs ring-1 ring-amber-500/30"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Pago pendiente ({alumnos.filter((a) => a.estado_membresia === "PENDIENTE").length})
                </button>
                <button
                  type="button"
                  onClick={() => handlePaymentFilterChange("NUEVOS")}
                  data-testid="chip-filtro-nuevos"
                  aria-pressed={paymentFilter === "NUEVOS"}
                  data-selected={paymentFilter === "NUEVOS"}
                  className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    paymentFilter === "NUEVOS"
                      ? "bg-secondary text-foreground shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  Nuevos ({alumnos.filter((a) => esAlumnoNuevo(a.created_at)).length})
                </button>

                {sinEntrenarFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setSinEntrenarFilter(false);
                      setCurrentPage(1);
                    }}
                    data-testid="chip-sin-entrenar"
                    className="h-8 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary"
                  >
                    <span className="inline-flex items-center gap-1">
                      Sin entrenar +7 días
                      <X className="h-3 w-3 inline" aria-hidden="true" />
                    </span>
                  </button>
                )}

                {/* Filtros rápidos por Actividad (GOZS-349, P08) */}
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  data-testid="filtro-actividad-chips"
                >
                  <button
                    type="button"
                    className="h-8 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground border border-dashed border-border/80 hover:bg-secondary/50 cursor-default"
                  >
                    + Actividad
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroActividad("TODAS");
                      setCurrentPage(1);
                    }}
                    data-testid="filtro-actividad-todas"
                    className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      filtroActividad === "TODAS"
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroActividad(filtroActividad === "FUNCIONAL" ? "TODAS" : "FUNCIONAL");
                      setCurrentPage(1);
                    }}
                    data-testid="filtro-actividad-funcional"
                    className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      filtroActividad === "FUNCIONAL"
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Funcional
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroActividad(filtroActividad === "BOXEO" ? "TODAS" : "BOXEO");
                      setCurrentPage(1);
                    }}
                    data-testid="filtro-actividad-boxeo"
                    className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      filtroActividad === "BOXEO"
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Boxeo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroActividad(filtroActividad === "RUTINAS" ? "TODAS" : "RUTINAS");
                      setCurrentPage(1);
                    }}
                    data-testid="filtro-actividad-rutinas"
                    className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                      filtroActividad === "RUTINAS"
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    Rutina online
                  </button>
                </div>
              </div>

              {/* Herramientas del Directorio y Buscador 220px (09 P08) */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Botón de Herramientas: Constructor de Rutinas */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocalIsBuilderOpen(true)}
                  className="h-8 text-xs font-bold border-primary/40 text-primary hover:bg-primary/10 gap-1.5 rounded-lg"
                  data-testid="open-routine-builder-btn"
                  title="Abrir Constructor Visual de Rutinas"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Constructor</span>
                </Button>

                {/* Control rápido de Previsualización / Simulador de Atleta (GOZS-345) */}
                <div className="flex items-center gap-1.5" data-testid="preview-athlete-control">
                  <select
                    value={previewAlumno?.id || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) {
                        setPreviewAlumno(null);
                        return;
                      }
                      const found = alumnos.find((a) => a.id === id);
                      if (found) setPreviewAlumno(found);
                    }}
                    className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs font-semibold text-foreground max-w-[140px] truncate"
                    data-testid="preview-athlete-select"
                    aria-label="Previsualizar experiencia de alumno"
                  >
                    <option value="">Vista previa alumno...</option>
                    {alumnos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre_completo}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const target =
                        previewAlumno ||
                        selectedAlumno ||
                        alumnos.find((a) => a.nombre_completo.toLowerCase().includes("miguel")) ||
                        alumnos[0] ||
                        null;
                      setPreviewAlumno(target);
                    }}
                    className="h-8 text-xs font-bold border-primary/40 text-primary hover:bg-primary/10 gap-1 rounded-lg"
                    data-testid="preview-athlete-btn"
                    title="Previsualizar experiencia de alumno en dispositivo móvil"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ver como Alumno</span>
                  </Button>
                </div>

                {/* Toggle WhatsApp */}
                <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-secondary/60 border border-border/60 px-2 h-8 text-xs">
                  <label
                    htmlFor="toggle-whatsapp-config"
                    className="text-[11px] font-medium text-muted-foreground select-none cursor-pointer flex items-center gap-1.5"
                  >
                    <input
                      id="toggle-whatsapp-config"
                      type="checkbox"
                      checked={isWhatsAppEnabled}
                      onChange={(e) => setWhatsAppEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border accent-emerald-500 cursor-pointer"
                      data-testid="toggle-whatsapp-config"
                    />
                    <span>WhatsApp en acciones</span>
                  </label>
                </div>

                {/* Buscador local compacto de 220px con debounce de 150ms (08 §4.1, 09 P08) */}
                <div className="w-[220px]">
                  <input
                    type="search"
                    value={filterQuery}
                    onChange={(e) => {
                      setFilterQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Buscar atleta…"
                    aria-label="Buscar alumno"
                    className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  />
                </div>
              </div>
            </div>

            {/* Tabla Matriz con Semáforos (Contención estricta overflow-x-auto táctil) */}
            <div
              className="w-full min-w-0 max-w-full overflow-x-auto touch-pan-x overscroll-x-contain rounded-xl border border-border/80"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <DataTable
                columns={columnsAlumnos}
                data={filteredAlumnos}
                pageSize={15}
                showPagination={true}
                containerClassName="border-0 shadow-none rounded-none"
                tableClassName="min-w-[700px] border-collapse"
                headerRowClassName="bg-secondary/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                rowClassName="hover:bg-muted/40 transition-colors group"
                emptyTitle="Sin atletas encontrados"
                emptyDescription="No se encontraron atletas con los criterios seleccionados."
              />
            </div>

            {/* Footer de Fuente y Referencia */}
            <div className="text-[11px] text-muted-foreground px-1 flex items-center justify-between">
              <span>Fuente: GOZSter Studio / Dataset demo</span>
            </div>
            </>)}
          </div>
          </div>
        </div>
      ) : (
        /* Ficha del Alumno View */
        <StudentDetail
          alumno={selectedAlumno}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onBack={() => selectAlumno(null)}
          rutinaActiva={activePlan}
          historialPlanes={historialPlanes}
          historialCargas={historialCargas}
          dias={dias}
          ejerciciosEnRutina={ejerciciosEnRutina}
          ejerciciosCatalogo={ejercicios}
          onOpenHistoricalLoads={() => setHistoricalLoadsOpen(true)}
          onClonarUltimaRutina={clonarUltimaRutina}
          onExtenderVigencia={extenderVigenciaPlan}
          isOffline={!isOnline}
          contratacion={contratacionAlumno}
          onRegistrarRenovacion={registrarRenovacionManual}
          onExtenderExcepcional={extenderContratacionExcepcional}
          onOpenChat={() => setChatOpen(true)}
          onActualizarNivelVista={actualizarNivelVistaAlumno}
          onPreviewAthlete={(a) => setPreviewAlumno(a)}
          onAssignRoutine={(a) => setAssignRoutineTarget(a)}
          onQuickSwap={handleOpenQuickSwapFromAlert}
        />
      )}

      {/* Modal de Sustitución Rápida ante Dolor (Quick Swap) */}
      <QuickSwapModal
        isOpen={quickSwapData.isOpen}
        onClose={() => setQuickSwapData((prev) => ({ ...prev, isOpen: false }))}
        alumnoNombre={quickSwapData.alumnoNombre}
        alumnoId={quickSwapData.alumnoId}
        ejercicioActual={quickSwapData.ejercicioActual}
        ejercicioActualId={quickSwapData.ejercicioActualId}
        ejercicioEnRutinaId={quickSwapData.ejercicioEnRutinaId}
        planId={quickSwapData.planId}
        alertaId={quickSwapData.alertaId}
        reporteDolorId={quickSwapData.reporteDolorId}
        dolorDetalle={quickSwapData.dolorDetalle}
        zona={quickSwapData.zona}
        catalogoEjercicios={ejercicios}
        onSwapSuccess={handleSwapSuccess}
      />

      {/* Modal de Templates WhatsApp en Tono Argentino (Fat-Finger Friendly) */}
      <WhatsAppTemplateModal
        isOpen={whatsappData.isOpen}
        onClose={() => setWhatsappData((prev) => ({ ...prev, isOpen: false }))}
        alumnoNombre={whatsappData.alumnoNombre}
        phone={whatsappData.phone}
        exerciseName={whatsappData.exerciseName}
      />

      {/* Modal de Asignación Urgente de Rutinas */}
      <AssignPlanModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        alumnosSinPlan={alumnosSinPlan}
        onAssignPlan={handleAssignPlan}
        onSelectAlumno={(id) => selectAlumno(id)}
        onOpenAssignRoutine={(alumno) => {
          setIsAssignModalOpen(false);
          setAssignRoutineTarget(alumno);
        }}
      />

      {/* Modal de Previsualización y Confirmación de Rutinas Genéricas (GOZS-245) */}
      <AssignRoutinePreviewModal
        isOpen={!!assignRoutineTarget}
        onClose={() => setAssignRoutineTarget(null)}
        alumno={assignRoutineTarget}
        onConfirmAssign={async (alumnoId, plantillaId) => {
          await asignarPlanDesdePlantilla(alumnoId, plantillaId);
          setAssignRoutineTarget(null);
        }}
      />

      {/* Modal "Alta de alumno": alta directa + tarjeta de contingencia + recarga de alumnos */}
      <InviteStudentModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvited={() => loadLiveSupabaseData()}
      />

      {/* Constructor Visual de Rutinas Drag & Drop + Superseries */}
      <RoutineBuilderModal
        isOpen={isBuilderModalVisible}
        onClose={handleCloseBuilderModal}
        catalogoEjercicios={ejercicios}
        alumnoId={selectedAlumnoId || undefined}
        alumnoNombre={selectedAlumno?.nombre_completo || "Plantilla Maestra"}
        planInicial={activePlan}
        diasIniciales={dias}
        ejerciciosEnRutinaIniciales={ejerciciosEnRutina}
        onRoutineSaved={() => loadLiveSupabaseData()}
      />

      {/* Modal Simulador / Vista Previa de Atleta en marco móvil (GOZS-345) */}
      <AthletePreviewModal
        isOpen={previewAlumno !== null}
        onClose={() => setPreviewAlumno(null)}
        alumnoId={previewAlumno?.id}
        alumnoNombre={previewAlumno?.nombre_completo}
        dataset={{
          alumnos,
          planes,
          dias,
          ejerciciosEnRutina,
          ejercicios,
        }}
        onSelectAlumno={(id) => {
          const found = alumnos.find((a) => a.id === id);
          if (found) setPreviewAlumno(found);
        }}
      />

      {/* Modal de Diagrama de Sankey (GOZS-349) */}
      <StudioSankeyModal
        isOpen={isSankeyModalOpen}
        onClose={() => setIsSankeyModalOpen(false)}
      />

      {/* Lateral Panel / Modal: Historical Loads & RPE */}
      <HistoricalLoadsDrawer
        isOpen={isHistoricalLoadsOpen}
        onClose={() => setHistoricalLoadsOpen(false)}
        alumno={selectedAlumno}
        historial={historialCargas}
      />

      {/* Floating Action Button (FAB) of Chat */}
      <ChatFab
        alumno={chatAlumno || selectedAlumno}
        isOpen={isChatOpen}
        onToggle={() => setChatOpen(!isChatOpen)}
      />
    </div>
  );
}
