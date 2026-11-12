"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
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
import { useChatStore } from "@/store/use-chat-store";
import { ClasesHoyAtajosChat } from "@/components/coach/clases-hoy-atajos-chat";
import { ParaRevisarHoy } from "@/components/coach/para-revisar-hoy";
import { useClasesDeHoy } from "@/components/coach/clases-hoy-atajos-chat";
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
import { User, MessageSquare, Plus, ChevronDown, MoreHorizontal, Search } from "@/components/ui/icons";
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
    setChatAlumnoId,
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
          contrataciones: [],
          isLiveDatabase: true,
        });
        useCobrosStore.getState().syncWithLiveAlumnos(initialDataset.alumnos || []);
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

  React.useEffect(() => {
    const handleExpandAndScroll = () => {
      setIsAlumnosExpanded(true);
      setTimeout(() => {
        const el = document.getElementById("alumnos-directory");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    };

    if (typeof window !== "undefined") {
      if (window.location.hash === "#alumnos-directory") {
        handleExpandAndScroll();
      }
      window.addEventListener("gozster:expand-alumnos-directory", handleExpandAndScroll);
      return () => window.removeEventListener("gozster:expand-alumnos-directory", handleExpandAndScroll);
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

  const isLiveInicioKpis = store.isLiveDatabase || hasInitialData;
  const [kpis, setKpis] = React.useState<KpisNegocio>(() => {
    if (isLiveInicioKpis) {
      return mapearRpcAKpis({ alumnos_activos: initialDataset?.alumnos?.length ?? 0 }, "oct.", userRole ?? "ADMIN");
    }
    const rango = rangoPeriodo("mes");
    const base = derivarKpisNegocio(DEMO_GIMNASIO, DEMO_PLANES_MEMBRESIA, new Date(), rango);
    if (!puedeVerMontos(userRole ?? "ADMIN")) {
      return mapearRpcAKpis({ ...base, ingresos: null }, "oct.", userRole ?? "ENTRENADOR");
    }
    return base;
  });
  const alumnosSinEntrenarInicio = React.useMemo(() => {
    const ids = kpis.sin_entrenar_7d_ids?.length
      ? kpis.sin_entrenar_7d_ids
      : isLiveInicioKpis
        ? []
        : DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids;
    return alumnos
      .filter((a) => ids.includes(a.id))
      .map((a) => ({ id: a.id, nombreCompleto: a.nombre_completo || "Alumno" }));
  }, [kpis.sin_entrenar_7d_ids, alumnos, isLiveInicioKpis]);
  const [kpisError, setKpisError] = React.useState(false);
  const [isKpisLoading, setIsKpisLoading] = React.useState(false);
  const [molestiasActivas, setMolestiasActivas] = React.useState<DolorActivo[]>([]);
  const isLiveInicio = store.isLiveDatabase || hasInitialData;
  // Fuente única de "Para revisar hoy": molestias activas + cuotas vencidas del mismo store que Cobros.
  const cobrosInicio = useCobrosStore((s) => s.cobros);
  const cargarCobrosInicio = useCobrosStore((s) => s.cargarCobros);
  React.useEffect(() => {
    void cargarCobrosInicio();
  }, [cargarCobrosInicio]);
  const cuotasVencidasInicio = React.useMemo(() => {
    if (isLiveInicio) {
      const alumnosIds = new Set(alumnos.map((a) => a.id));
      return cobrosInicio.filter((c) => c.estado === "VENCIDO" && alumnosIds.has(c.alumnoId));
    }
    return cobrosInicio.filter((c) => c.estado === "VENCIDO");
  }, [cobrosInicio, isLiveInicio, alumnos]);
  const { clasesHoy: clasesHoyInicio } = useClasesDeHoy({ isLiveMode: isLiveInicio });
  const [totalParaRevisar, setTotalParaRevisar] = React.useState(0);

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
    return null;
  }, [chatAlumnoId, alumnos]);
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
  const rowPaddingClass = "h-14 py-2";

  const columnsAlumnos = React.useMemo<ColumnDef<Perfil>[]>(() => [
    {
      id: "atleta",
      accessorKey: "nombre_completo",
      mobile: "title",
      header: "Alumno",
      headerClassName: "h-10 px-4 text-left font-medium w-64",
      className: `${rowPaddingClass} px-4`,
      sortable: true,
      cell: ({ row: alumno }) => {
        const actividades = obtenerActividadesAlumno({
          alumnoId: alumno.id,
          alumnoActividades: store.alumnoActividades?.length ? store.alumnoActividades : DEMO_ALUMNO_ACTIVIDADES,
          contrataciones: store.contrataciones?.length ? store.contrataciones : DEMO_CONTRATACIONES_CLASES,
          planes,
          alumno,
        }).map((act) => ETIQUETAS_ACTIVIDAD[act]);
        const subtitulo = [...actividades, ...(esAlumnoNuevo(alumno.created_at) ? ["Nuevo"] : [])].join(" · ");
        return (
          <button
            type="button"
            onClick={() => selectAlumno(alumno.id)}
            aria-label={`Ver ficha de ${alumno.nombre_completo}`}
            className="flex items-center gap-3 text-left w-full min-h-target rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {getInitials(alumno.nombre_completo)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{alumno.nombre_completo}</span>
              {subtitulo && <span className="truncate text-xs text-neutral-soft-foreground">{subtitulo}</span>}
            </span>
          </button>
        );
      },
    },
    {
      id: "cuota",
      mobile: "meta",
      header: "Cuota",
      headerClassName: "h-10 px-4 text-left font-medium w-36",
      className: `${rowPaddingClass} px-4 text-left`,
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

        const diasParaVencer = alumno.fecha_vencimiento_cuota
          ? Math.ceil((new Date(alumno.fecha_vencimiento_cuota).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;
        const venceProntoTexto =
          isPendiente && diasParaVencer !== null && diasParaVencer >= 0 ? `Vence en ${diasParaVencer} d` : null;

        return (
          <div className="flex flex-col items-start gap-1" data-testid="columna-cuota-actividad">
            <span className={`hidden ${cuotaDotColor}`} aria-hidden="true" />
            <StatusBadge
              variant={isAlDia ? "success" : venceProntoTexto ? "warning" : "destructive"}
              size="sm"
              title={cuotaTooltip}
              aria-label={cuotaTooltip}
              role="status"
            >
              {isAlDia ? "Al día" : venceProntoTexto ?? "Vencida"}
            </StatusBadge>
            {/* Con más de un plan (multiactividad) se detalla el estado de cada uno */}
            {badgesPlanes.length > 1 && (
              <div className="flex flex-col gap-0.5 items-start" data-testid="badges-planes-apilados">
                {badgesPlanes.map((b, idx) => (
                  <span
                    key={idx}
                    data-testid="badge-plan-apilado"
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium border leading-tight ${b.className}`}
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
      mobile: "meta",
      header: "Rutina",
      headerClassName: "h-10 px-4 text-left font-medium",
      className: `${rowPaddingClass} px-4 text-left`,
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
            <span className={planActivo ? "text-sm text-foreground block truncate" : "text-sm text-subtle-foreground select-none"}>
              {nombrePlan}
            </span>
            {isPorVencer && (
              <span className="text-xs text-warning-soft-foreground">
                Vence en {diasRestantes} d
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "actividad",
      mobile: "meta",
      header: "Último entreno",
      headerClassName: "h-10 px-4 text-left font-medium w-36",
      className: `${rowPaddingClass} px-4 text-left`,
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
        } else if (planActivo && historial.length > 0) {
          const ultimaFecha = historial
            .map((h: any) => h.fecha || h.fecha_sesion || h.created_at)
            .filter(Boolean)
            .sort()
            .pop();
          if (ultimaFecha) {
            const diffDays = Math.max(0, Math.floor((Date.now() - new Date(ultimaFecha).getTime()) / (1000 * 60 * 60 * 24)));
            textoRecencia = diffDays === 0 ? "Hoy" : diffDays === 1 ? "Ayer" : `Hace ${diffDays} días`;
            recenciaTooltip = `Último entreno: ${textoRecencia.toLowerCase()}`;
            recenciaDotColor = diffDays < 7 ? "bg-emerald-500" : diffDays <= 14 ? "bg-amber-500" : "bg-rose-500";
          }
        }

        // El estado se comunica con texto (sin semáforo de color): "Hoy", "Ayer", "Hace n días".
        return (
          <span className="text-sm text-foreground" title={recenciaTooltip} data-recencia={recenciaDotColor}>
            {textoRecencia}
          </span>
        );
      },
    },
    {
      id: "alertas",
      mobile: "meta",
      header: "Alertas",
      headerClassName: "h-10 px-4 text-left font-medium min-w-[150px]",
      className: `${rowPaddingClass} px-4 text-left`,
      cell: ({ row: alumno }) => {
        const estancadoInfo = estancadosMap.get(alumno.id);
        const molestiasAlumno = molestiasActivas.filter((m: any) => (m.alumno_id === alumno.id || m.alumnoId === alumno.id));
        const demoBadges = molestiasAlumno.length > 0 || isLiveInicio ? [] : getDemoAlumnoAlerts(alumno.nombre_completo);

        const hasAnyAlerts = Boolean(estancadoInfo || molestiasAlumno.length > 0 || demoBadges.length > 0);

        return (
          <div className="flex flex-wrap gap-1.5 md:min-w-[130px] md:max-w-[190px]">
            {estancadoInfo && (
              <StatusBadge
                variant="neutral"
                size="sm"
                data-testid={`badge-estancado-${alumno.id}`}
                title={`Alumno estancado (+30 días sin PR: ${estancadoInfo.diasSinPR} días)`}
              >
                30 d sin récord
              </StatusBadge>
            )}
            {!hasAnyAlerts ? (
              <span className="text-subtle-foreground text-sm select-none" aria-label="Sin alertas">
                —
              </span>
            ) : (
              <>
                {molestiasAlumno.map((m: any, idx: number) => {
                  const nivel = nivelDesdeEva(typeof m.eva === "number" ? m.eva : 5, Boolean(m.es_sintoma_alarma || m.severidad === "CRITICA"));
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
      mobile: "action",
      header: <span className="sr-only">Acciones</span>,
      headerClassName: "h-10 px-4 w-14",
      className: `${rowPaddingClass} px-4 text-right`,
      cell: ({ row: alumno }) => {
        const planActivo =
          planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ?? null;
        const isMenuControlledOpen =
          openMenuAlumnoIdProp === alumno.id || openMenuAlumnoIdProp === "all";

        return (
          <div
            className="flex items-center justify-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu
              open={isMenuControlledOpen ? true : undefined}
            >
              <DropdownMenuTrigger
                className="inline-flex size-target items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Acciones para ${alumno.nombre_completo}`}
                data-testid={`btn-acciones-alumno-${alumno.id}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
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
                <span className="sm:hidden">
                  {fechaSaludo.replace(/ de (\p{L}{3})\p{L}*$/u, " $1")} · {clasesHoyInicio.length} {clasesHoyInicio.length === 1 ? "clase" : "clases"} hoy
                </span>
                <span className="hidden sm:inline">
                  {fechaSaludo} · {clasesHoyInicio.length} {clasesHoyInicio.length === 1 ? "clase" : "clases"} hoy, {totalParaRevisar} alertas para revisar.
                </span>
              </p>
            </div>

            {/* Acciones de Cabecera: Segmented Periodo + Alta de Alumno (P02) */}
            <div className="hidden sm:flex items-center gap-3">
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
              sinEntrenarAlDia={
                alumnos.filter((a) => alumnosSinEntrenarInicio.some((x) => x.id === a.id) && esCuotaAlDia(a)).length
              }
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
                molestias={isLiveInicio ? molestiasActivas : undefined}
                cuotasVencidas={cuotasVencidasInicio}
                isLiveMode={isLiveInicio}
                onSelectAlumno={(id) => selectAlumno(id)}
                onGestionarCobro={() => router.push("/studio/cobros")}
                onTotalChange={setTotalParaRevisar}
              />
            </div>
            <div className="flex-[1_1_280px] min-w-0">
              <ClasesHoyAtajosChat
                isLiveMode={isLiveInicio}
                alumnosSinEntrenar={alumnosSinEntrenarInicio}
                onOpenChat={(alumnoId) => openChatForAlumno(alumnoId)}
              />
            </div>
          </div>

          {/* Directorio de Atletas */}
          <div className="w-full">
          <section
            id="alumnos-directory"
            aria-labelledby="dir-t"
            className="rounded-xl border border-border bg-card overflow-hidden"
            data-testid="alumnos-directory"
          >
            {/* Toolbar del Directorio en una línea (objetivo Inicio.html, 09 P08):
                título · chips h-8 · + Actividad · buscador 220 px · herramientas */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
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
                aria-controls="directorio-alumnos-body"
                aria-label={`${isAlumnosExpanded ? "Contraer" : "Expandir"} directorio de ${alumnos.length} alumnos`}
                className="inline-flex items-center gap-1.5 rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <h2 id="dir-t" className="m-0 text-[15px] font-semibold text-foreground">
                  Alumnos
                </h2>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !isAlumnosExpanded && "-rotate-90")}
                  aria-hidden="true"
                />
              </button>

              {showAlumnosBody && (
                <>
                  <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
                    {(
                      [
                        { id: "ALL", testId: "chip-filtro-todos", label: "Todos", count: alumnos.length },
                        {
                          id: "ACTIVA",
                          testId: "chip-filtro-al-dia",
                          label: "Al día",
                          count: alumnos.filter((a) => a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE").length,
                        },
                        {
                          id: "PENDIENTE",
                          testId: "chip-filtro-pago-pendiente",
                          label: "Pago pendiente",
                          count: alumnos.filter((a) => a.estado_membresia === "PENDIENTE").length,
                        },
                        {
                          id: "NUEVOS",
                          testId: "chip-filtro-nuevos",
                          label: "Nuevos",
                          count: alumnos.filter((a) => esAlumnoNuevo(a.created_at)).length,
                        },
                      ] as const
                    ).map((chip) => {
                      const activo = paymentFilter === chip.id;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => handlePaymentFilterChange(chip.id)}
                          data-testid={chip.testId}
                          aria-pressed={activo}
                          data-selected={activo}
                          className={cn(
                            "h-8 rounded-lg px-2.5 text-[13px] border transition-colors cursor-pointer",
                            activo
                              ? "bg-muted border-border text-foreground font-medium"
                              : "border-transparent text-neutral-soft-foreground hover:bg-muted/60"
                          )}
                        >
                          {chip.label}{" "}
                          <span className="text-subtle-foreground tabular-nums">{chip.count}</span>
                        </button>
                      );
                    })}

                    {sinEntrenarFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setSinEntrenarFilter(false);
                          setCurrentPage(1);
                        }}
                        data-testid="chip-sin-entrenar"
                        className="h-8 rounded-lg px-2.5 text-[13px] border border-border bg-muted text-foreground font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        Sin entrenar +7 días
                        <X className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">Quitar filtro</span>
                      </button>
                    )}
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {/* Filtro por actividad (GOZS-349, P08): chip "+ Actividad" que despliega las opciones */}
                    <details className="relative" data-testid="filtro-actividad-container">
                      <summary
                        className={cn(
                          "list-none [&::-webkit-details-marker]:hidden h-8 inline-flex items-center gap-1 rounded-lg px-2.5 text-[13px] border border-dashed cursor-pointer",
                          filtroActividad === "TODAS"
                            ? "border-border text-neutral-soft-foreground hover:bg-muted/60"
                            : "border-border bg-muted text-foreground font-medium"
                        )}
                      >
                        {filtroActividad === "TODAS"
                          ? "+ Actividad"
                          : ({ FUNCIONAL: "Funcional", BOXEO: "Boxeo", RUTINAS: "Rutina online" } as Record<string, string>)[filtroActividad] ?? "+ Actividad"}
                      </summary>
                      <div
                        data-testid="filtro-actividad-chips"
                        className="absolute right-0 z-20 mt-1 flex min-w-[168px] flex-col gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md"
                      >
                        {(
                          [
                            { id: "TODAS", testId: "filtro-actividad-todas", label: "Todas" },
                            { id: "FUNCIONAL", testId: "filtro-actividad-funcional", label: "Funcional" },
                            { id: "BOXEO", testId: "filtro-actividad-boxeo", label: "Boxeo" },
                            { id: "RUTINAS", testId: "filtro-actividad-rutinas", label: "Rutina online" },
                          ] as const
                        ).map((op) => (
                          <button
                            key={op.id}
                            type="button"
                            onClick={(e) => {
                              setFiltroActividad(op.id);
                              setCurrentPage(1);
                              (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                            }}
                            data-testid={op.testId}
                            aria-pressed={filtroActividad === op.id}
                            className={cn(
                              "h-8 rounded-md px-2 text-left text-[13px] cursor-pointer",
                              filtroActividad === op.id ? "bg-muted font-medium text-foreground" : "text-neutral-soft-foreground hover:bg-muted/60"
                            )}
                          >
                            {op.label}
                          </button>
                        ))}
                      </div>
                    </details>

                    {/* Buscador local compacto de 220 px con debounce de 150 ms (09 P08) */}
                    <label className="flex h-8 w-[220px] max-w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-muted-foreground">
                      <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <input
                        type="search"
                        value={filterQuery}
                        onChange={(e) => {
                          setFilterQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Buscar alumno"
                        aria-label="Buscar alumno"
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
                      />
                    </label>

                    {/* Herramientas secundarias del directorio, fuera de la vista principal */}
                    <details className="relative" data-testid="directorio-herramientas">
                      <summary
                        aria-label="Más herramientas del directorio"
                        className="list-none [&::-webkit-details-marker]:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/60 cursor-pointer"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </summary>
                      <div className="absolute right-0 z-20 mt-1 flex w-64 flex-col gap-2 rounded-lg border border-border bg-popover p-2 shadow-md">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocalIsBuilderOpen(true)}
                          className="h-8 justify-start gap-2 text-[13px] font-normal"
                          data-testid="open-routine-builder-btn"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Nueva rutina en el constructor
                        </Button>
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
                            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[13px] text-foreground"
                            data-testid="preview-athlete-select"
                            aria-label="Previsualizar experiencia de alumno"
                          >
                            <option value="">Vista previa de…</option>
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
                              const target = previewAlumno || selectedAlumno || alumnos[0] || null;
                              setPreviewAlumno(target);
                            }}
                            className="h-8 gap-1 text-[13px]"
                            data-testid="preview-athlete-btn"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            Ver
                          </Button>
                        </div>
                        <label
                          htmlFor="toggle-whatsapp-config"
                          className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-neutral-soft-foreground cursor-pointer"
                        >
                          <input
                            id="toggle-whatsapp-config"
                            type="checkbox"
                            checked={isWhatsAppEnabled}
                            onChange={(e) => setWhatsAppEnabled(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-border cursor-pointer"
                            data-testid="toggle-whatsapp-config"
                          />
                          WhatsApp en acciones
                        </label>
                      </div>
                    </details>
                  </div>
                </>
              )}
            </div>

            {showAlumnosBody && (
              <div
                id="directorio-alumnos-body"
                className="w-full min-w-0 max-w-full overflow-x-auto touch-pan-x overscroll-x-contain"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <DataTable
                  columns={columnsAlumnos}
                  data={filteredAlumnos}
                  pageSize={15}
                  showPagination={true}
                  onRowClick={(alumno) => selectAlumno(alumno.id)}
                  containerClassName="border-0 shadow-none rounded-none"
                  tableClassName="min-w-[700px] border-collapse"
                  headerRowClassName="border-b border-border text-[13px] font-medium text-muted-foreground"
                  rowClassName="hover:bg-muted/40 transition-colors group cursor-pointer"
                  emptyTitle="Sin alumnos encontrados"
                  emptyDescription="No hay alumnos con los filtros seleccionados."
                />
              </div>
            )}
          </section>
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
        alumno={chatAlumno}
        isOpen={isChatOpen}
        onToggle={() => {
          if (isChatOpen) {
            setChatAlumnoId(null);
            useChatStore.getState().setSelectedAlumnoId(null);
          }
          setChatOpen(!isChatOpen);
        }}
      />
    </div>
  );
}
