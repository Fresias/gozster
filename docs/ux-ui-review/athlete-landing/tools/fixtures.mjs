// Datos de ejemplo genéricos para las capturas (ADR-005: sin nombres reales).
// Se sirven interceptando las lecturas GET de Supabase en el navegador de captura:
// el servidor no recibe ninguna escritura y sus datos no cambian.

const PLAN_ID = "0f0f0f0f-0000-4000-8000-000000000001";
const DIA = ["0f0f0f0f-0000-4000-8000-0000000000d1", "0f0f0f0f-0000-4000-8000-0000000000d2", "0f0f0f0f-0000-4000-8000-0000000000d3"];
const ts = "2026-11-02T12:00:00.000000+00:00";

const EJ = {
  sentadilla: ["0f0f0f0f-0000-4000-8000-0000000000e1", "Sentadilla con barra", ["Cuádriceps", "Glúteos"], null],
  banca: ["0f0f0f0f-0000-4000-8000-0000000000e2", "Press banca plano", ["Pectoral"], "00000000000"],
  remo: ["0f0f0f0f-0000-4000-8000-0000000000e3", "Remo con mancuerna", ["Dorsal ancho"], null],
  plancha: ["0f0f0f0f-0000-4000-8000-0000000000e4", "Plancha frontal", ["Core"], null],
  rumano: ["0f0f0f0f-0000-4000-8000-0000000000e5", "Peso muerto rumano", ["Isquiotibiales"], null],
  jalon: ["0f0f0f0f-0000-4000-8000-0000000000e6", "Jalón al pecho", ["Dorsal ancho"], null],
  bulgara: ["0f0f0f0f-0000-4000-8000-0000000000e7", "Zancada búlgara", ["Cuádriceps"], null],
  militar: ["0f0f0f0f-0000-4000-8000-0000000000e8", "Press militar", ["Deltoides"], null],
  laterales: ["0f0f0f0f-0000-4000-8000-0000000000e9", "Elevaciones laterales", ["Deltoides"], null],
  facepull: ["0f0f0f0f-0000-4000-8000-0000000000ea", "Face pull en polea", ["Deltoides posterior"], null],
};

export const ejercicios = Object.values(EJ).map(([id, nombre, musculos, video]) => ({
  id, nombre, comentario: null, url_video: video, musculos_principales: musculos, musculos_secundarios: [],
  creado_por: null, created_at: ts, updated_at: ts,
}));

let n = 0;
const er = (dia, ej, o, extra = {}) => ({
  id: `0f0f0f0f-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  dia_id: dia, ejercicio_id: EJ[ej][0], orden: o, series: 3, repeticiones: "10", descanso_segundos: 90,
  rpe_objetivo: 8, notas: null, es_superserie: false, grupo_superserie: null, created_at: ts, updated_at: ts,
  tempo: "0", force_rpe_required: false, tempo_activo: false, tipo_serie: "NORMAL", tipo_medicion: "REPS",
  tiempo_objetivo_segundos: null, es_unilateral: false, ...extra,
});

/** Composiciones de día: A = aproximación + superserie + tiempo, B = drop set + unilateral, C = superserie de hombros. */
const COMPOSICION = {
  A: (d) => [
    er(d, "sentadilla", 1, { series: 4, repeticiones: "6-8", tipo_serie: "WARMUP", descanso_segundos: 150, notas: "Bajá controlado 3 segundos y subí explosivo. Profundidad: cadera por debajo de la rodilla." }),
    er(d, "banca", 2, { es_superserie: true, grupo_superserie: 1, repeticiones: "8-10" }),
    er(d, "remo", 3, { es_superserie: true, grupo_superserie: 1, repeticiones: "10-12" }),
    er(d, "plancha", 4, { tipo_medicion: "TIEMPO", tiempo_objetivo_segundos: 45, repeticiones: "45", rpe_objetivo: 7 }),
  ],
  B: (d) => [
    er(d, "jalon", 1, { tipo_serie: "DROPSET", repeticiones: "10-12" }),
    er(d, "rumano", 2, { repeticiones: "8" }),
    er(d, "bulgara", 3, { es_unilateral: true, repeticiones: "10" }),
  ],
  C: (d) => [
    er(d, "militar", 1, { repeticiones: "6-8", tipo_serie: "WARMUP" }),
    er(d, "laterales", 2, { es_superserie: true, grupo_superserie: 1, repeticiones: "12-15" }),
    er(d, "facepull", 3, { es_superserie: true, grupo_superserie: 1, repeticiones: "15" }),
  ],
};

/** orden = qué composición recibe cada día (el día sugerido es el primero sin sesión esta semana). */
export function plan({ orden = ["A", "B", "C"] } = {}) {
  n = 0;
  const dias = DIA.map((id, i) => ({ id, plan_id: PLAN_ID, nombre: `DÍA ${i + 1}`, orden: i + 1, created_at: ts, updated_at: ts }));
  const ejerciciosEnRutina = DIA.flatMap((d, i) => COMPOSICION[orden[i]](d));
  return { dias, ejerciciosEnRutina };
}

export const NOMBRE_ALUMNO = "Lucía Fernández";
export const perfil = (id) => ({
  id, email: "alumno@ejemplo.com", nombre_completo: NOMBRE_ALUMNO, rol: "ALUMNO", estado_membresia: "ACTIVA",
  profesor_asignado_id: null, fecha_baja: null, created_at: ts, updated_at: ts, telefono: null,
  fecha_vencimiento_cuota: null, ultimo_entreno_at: "2026-11-14T19:10:00+00:00", debe_cambiar_password: false,
  estado_cuenta: "ACTIVO", nivel_vista_alumno: "SIMPLE", whatsapp_habilitado: false, peso_corporal_kg: 64, sexo: null,
});
export const planRow = (alumnoId) => ({
  id: PLAN_ID, profesor_id: null, alumno_id: alumnoId, nombre: "PLAN GENERAL", estado: "ACTIVO", comentarios: "",
  created_at: ts, updated_at: ts, fecha_inicio: "2026-11-02T12:00:00+00:00", fecha_fin: null, tipo: "DE_ALUMNO",
  etiqueta: null, plan_origen_id: null, tags: [],
});

/** Historial genérico: 6 sesiones en dos semanas (Lunes/Miércoles/Viernes). */
export function sesiones(alumnoId) {
  const fechas = [["2026-11-03", 0], ["2026-11-05", 1], ["2026-11-07", 2], ["2026-11-10", 0], ["2026-11-12", 1], ["2026-11-14", 2]];
  const rows = [];
  const series = [];
  const p = plan();
  fechas.forEach(([fecha, d], i) => {
    const id = `0f0f0f0f-0000-4000-9000-${String(i + 1).padStart(12, "0")}`;
    const ejs = p.ejerciciosEnRutina.filter((x) => x.dia_id === DIA[d]);
    let vol = 0;
    ejs.forEach((e, k) => {
      const base = { [EJ.sentadilla[0]]: 60, [EJ.banca[0]]: 42.5, [EJ.remo[0]]: 20, [EJ.plancha[0]]: 0, [EJ.jalon[0]]: 45, [EJ.rumano[0]]: 55, [EJ.bulgara[0]]: 12, [EJ.militar[0]]: 27.5, [EJ.laterales[0]]: 7, [EJ.facepull[0]]: 17.5 }[e.ejercicio_id] ?? 20;
      const prog = i >= 3 ? 2.5 : 0;
      for (let s = 1; s <= e.series; s++) {
        const peso = e.tipo_medicion === "TIEMPO" ? 0 : base + prog;
        const reps = e.tipo_medicion === "TIEMPO" ? 45 : Math.max(6, 10 - (s - 1));
        vol += peso * reps;
        series.push({
          id: `0f0f0f0f-0000-4000-a000-${String(series.length + 1).padStart(12, "0")}`,
          sesion_id: id, ejercicio_id: e.ejercicio_id, numero_serie: s, peso_kg: peso, reps_hechas: reps,
          rpe_real: s === e.series ? 8.5 : 7.5, completada: true, set_type: e.tipo_serie === "DROPSET" && s === e.series ? "DROPSET" : "NORMAL",
          pain_reported: false, pain_notes: null, video_url: null, created_at: `${fecha}T19:00:00+00:00`, updated_at: `${fecha}T19:00:00+00:00`,
          _fecha: fecha, _k: k,
        });
      }
    });
    rows.push({
      id, alumno_id: alumnoId, dia_id: DIA[d], fecha, duracion_minutos: 52 + i, volumen_total_kg: Math.round(vol),
      effective_volume_kg: Math.round(vol), athlete_feedback: null, motivo_cambio_dia: null, dia_sugerido_id: null,
      created_at: `${fecha}T19:00:00+00:00`, updated_at: `${fecha}T19:00:00+00:00`,
    });
  });
  return { rows, series };
}

// ---------- servidor simulado de PostgREST (solo lectura) ----------

function filtrar(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const m = /^(eq|in|neq|gte|lte|is)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, op, raw] = m;
    if (k === "alumno_id" || k === "profesor_asignado_id") continue; // las filas de ejemplo son siempre del alumno
    if (!rows.length || !(k in rows[0])) continue;
    if (op === "eq") out = out.filter((r) => String(r[k]) === raw);
    if (op === "neq") out = out.filter((r) => String(r[k]) !== raw);
    if (op === "in") { const set = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")); out = out.filter((r) => set.includes(String(r[k]))); }
    if (op === "gte") out = out.filter((r) => String(r[k]) >= raw);
    if (op === "lte") out = out.filter((r) => String(r[k]) <= raw);
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === "desc" ? -1 : 1));
  }
  const limit = Number(params.get("limit"));
  if (limit) out = out.slice(0, limit);
  return out;
}

/**
 * Devuelve un handler para context.route. `opts`:
 *  sinPlan, sinSesiones, colgar (array de tablas cuya respuesta no llega), fallar (array de tablas con 500),
 *  orden (composición por día), cuestionario (fila o null), membresia ("ACTIVA" | "VENCIDA").
 */
export function servidorEjemplo(SB, userId, opts = {}) {
  const p = plan({ orden: opts.orden });
  const hist = sesiones(userId);
  const tablas = {
    perfiles: [perfil(userId)],
    planes_entrenamiento: opts.sinPlan ? [] : [planRow(userId)],
    dias_rutina: opts.sinPlan ? [] : p.dias,
    ejercicios_en_rutina: opts.sinPlan ? [] : p.ejerciciosEnRutina,
    ejercicios,
    registro_sesiones: opts.sinSesiones ? [] : hist.rows,
    registro_series: opts.sinSesiones ? [] : hist.series,
    alumno_cuestionario_inicial: opts.cuestionario ? [opts.cuestionario] : [],
    alumno_historial_dolor: [],
  };
  const sinDatos = new Set(); // tablas no simuladas → se dejan pasar y se registran
  const handler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const m = req.method();
    if (!req.url().startsWith(SB)) return route.continue();
    if (url.pathname === "/auth/v1/user" && m === "GET") {
      const res = await route.fetch();
      const j = await res.json().catch(() => null);
      if (j && j.email) j.email = "alumno@ejemplo.com";
      if (j && j.user_metadata) j.user_metadata = {};
      return route.fulfill({ response: res, json: j });
    }
    const t = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
    if (!t || !["GET", "HEAD"].includes(m)) return route.fallback();
    if (opts.colgar?.includes(t)) return; // la petición queda pendiente: estado "cargando"
    if (opts.fallar?.includes(t)) return route.fulfill({ status: 500, json: { message: "Error de ejemplo", code: "500" } });
    if (!(t in tablas)) { sinDatos.add(t); return route.fallback(); }
    const select = url.searchParams.get("select") || "*";
    let rows = filtrar(tablas[t], url.searchParams);
    if (t === "perfiles" && select !== "*" && !select.includes("nombre")) rows = rows.map((r) => Object.fromEntries(select.split(",").map((c) => [c, r[c]])));
    if (t === "registro_series") {
      if (url.searchParams.get("completada") === "eq.true") rows = rows.filter((r) => r.completada);
      rows = rows.map((r) => {
        const x = { ...r };
        if (select.includes("ejercicios(")) x.ejercicios = { id: r.ejercicio_id, nombre: ejercicios.find((e) => e.id === r.ejercicio_id)?.nombre };
        if (select.includes("registro_sesiones")) x.registro_sesiones = { fecha: r._fecha, alumno_id: userId };
        delete x._fecha; delete x._k;
        return x;
      });
    }
    const headers = { "content-type": "application/json", "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` };
    const objeto = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    if (m === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
    if (objeto) return rows[0] ? route.fulfill({ status: 200, headers, json: rows[0] }) : route.fulfill({ status: 406, json: { code: "PGRST116", message: "0 rows" } });
    return route.fulfill({ status: 200, headers, json: rows });
  };
  return { handler, sinDatos };
}
