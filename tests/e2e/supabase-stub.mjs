// Stub de Supabase para E2E: Auth, PostgREST (tablas, filtros, joins y RPCs), Storage y registro de llamadas.
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.STUB_PORT || 54321);
const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "coach-e2e@gozster.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

// Fixtures opcionales por tabla (GOZS-297 / GOZS-580): PUT /__e2e/fixtures, DELETE /__e2e/fixtures.
let fixtures = {};
let llamadas = [];
let forceStorageErrorStatus = null;
const storageUploads = new Map();

function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function tryParseJson(buf) {
  const txt = buf.toString("utf8").trim();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

function getNestedValue(row, colPath) {
  const parts = colPath.split(".");
  let cur = row;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function matchesCondition(actual, cond) {
  if (cond === "is.null") return actual === null || actual === undefined;
  if (cond === "not.is.null") return actual !== null && actual !== undefined;
  if (cond.startsWith("eq.")) return String(actual) === cond.slice(3);
  if (cond.startsWith("neq.")) return String(actual) !== cond.slice(4);
  if (cond.startsWith("gte.")) {
    const target = cond.slice(4);
    const numA = Number(actual);
    const numT = Number(target);
    if (!Number.isNaN(numA) && !Number.isNaN(numT) && target !== "") return numA >= numT;
    return String(actual ?? "") >= target;
  }
  if (cond.startsWith("lte.")) {
    const target = cond.slice(4);
    const numA = Number(actual);
    const numT = Number(target);
    if (!Number.isNaN(numA) && !Number.isNaN(numT) && target !== "") return numA <= numT;
    return String(actual ?? "") <= target;
  }
  if (cond.startsWith("lt.")) {
    const target = cond.slice(3);
    const tsA = Date.parse(String(actual ?? ""));
    const tsT = Date.parse(target);
    if (!Number.isNaN(tsA) && !Number.isNaN(tsT)) return tsA < tsT;
    const numA = Number(actual);
    const numT = Number(target);
    if (!Number.isNaN(numA) && !Number.isNaN(numT)) return numA < numT;
    return String(actual ?? "") < target;
  }
  if (cond.startsWith("gt.")) {
    const target = cond.slice(3);
    const tsA = Date.parse(String(actual ?? ""));
    const tsT = Date.parse(target);
    if (!Number.isNaN(tsA) && !Number.isNaN(tsT)) return tsA > tsT;
    return String(actual ?? "") > target;
  }
  if (cond.startsWith("in.(") && cond.endsWith(")")) {
    const list = cond
      .slice(4, -1)
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    return list.includes(String(actual));
  }
  return true;
}

function applyPostgrestQuery(tabla, rawRows, searchParams) {
  let rows = rawRows.map((r) => ({ ...r }));
  const select = searchParams.get("select") || "*";

  // Joins usados por la app del alumno
  if (tabla === "registro_series") {
    const sesiones = Array.isArray(fixtures.registro_sesiones) ? fixtures.registro_sesiones : [];
    const ejercicios = Array.isArray(fixtures.ejercicios) ? fixtures.ejercicios : [];
    const innerSesiones = select.includes("registro_sesiones!inner");
    const joinSesiones = innerSesiones || select.includes("registro_sesiones(");
    const joinEjercicios = select.includes("ejercicios(");

    if (joinSesiones) {
      rows = rows
        .map((r) => {
          const ses = sesiones.find((s) => s.id === r.sesion_id) || null;
          return { ...r, registro_sesiones: ses ? { fecha: ses.fecha, alumno_id: ses.alumno_id } : null };
        })
        .filter((r) => !innerSesiones || r.registro_sesiones !== null);
    }
    if (joinEjercicios) {
      rows = rows.map((r) => {
        const ej = ejercicios.find((e) => e.id === r.ejercicio_id) || null;
        return { ...r, ejercicios: ej ? { id: ej.id, nombre: ej.nombre } : null };
      });
    }
  } else if (tabla === "conversaciones" && select.includes("mensajes")) {
    const mensajes = Array.isArray(fixtures.mensajes) ? fixtures.mensajes : [];
    rows = rows.map((c) => ({
      ...c,
      mensajes: mensajes.filter((m) => m.conversacion_id === c.id),
    }));
  }

  // Filtros
  for (const [key, value] of searchParams.entries()) {
    if (key === "select" || key === "order" || key === "limit" || key === "offset" || key === "on_conflict") {
      continue;
    }
    if (key === "or" && value.startsWith("(") && value.endsWith(")")) {
      const clauses = value.slice(1, -1).split(",");
      rows = rows.filter((row) =>
        clauses.some((clause) => {
          const dotIdx = clause.indexOf(".");
          if (dotIdx < 0) return true;
          const col = clause.slice(0, dotIdx);
          const cond = clause.slice(dotIdx + 1);
          return matchesCondition(getNestedValue(row, col), cond);
        }),
      );
      continue;
    }
    rows = rows.filter((row) => matchesCondition(getNestedValue(row, key), value));
  }

  // Ordenamiento
  const orderParam = searchParams.get("order");
  if (orderParam) {
    const first = orderParam.split(",")[0] || "";
    const parts = first.split(".");
    const dir = parts[parts.length - 1] === "desc" ? -1 : 1;
    const colRaw = parts.slice(0, -1).join(".");
    const col = colRaw.replace(/^(\w+)\((\w+)\)$/, "$1.$2");
    rows.sort((a, b) => {
      const va = getNestedValue(a, col);
      const vb = getNestedValue(b, col);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  const limitParam = Number(searchParams.get("limit"));
  if (!Number.isNaN(limitParam) && limitParam > 0) {
    rows = rows.slice(0, limitParam);
  }

  return rows;
}

http
  .createServer(async (req, res) => {
    const reqUrl = req.url || "/";
    const parsedUrl = new URL(reqUrl, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    const send = (code, body) => {
      res.writeHead(code, {
        "content-type": "application/json",
        "access-control-allow-origin": req.headers.origin || "*",
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      });
      res.end(JSON.stringify(body));
    };

    if (req.method === "OPTIONS") return send(204, {});
    if (pathname === "/health") return send(200, { ok: true });

    if (pathname === "/__e2e/fixtures") {
      if (req.method === "DELETE") {
        fixtures = {};
        llamadas = [];
        forceStorageErrorStatus = null;
        storageUploads.clear();
        return send(200, {});
      }
      const rawBuf = await readRawBody(req);
      fixtures = JSON.parse(rawBuf.toString("utf8") || "{}");
      llamadas = [];
      forceStorageErrorStatus = fixtures.forceStorageErrorStatus ?? null;
      storageUploads.clear();
      return send(200, {});
    }

    if (pathname === "/__e2e/storage-error") {
      const rawBuf = await readRawBody(req);
      const body = tryParseJson(rawBuf) || {};
      forceStorageErrorStatus = body.status ?? null;
      return send(200, { forceStorageErrorStatus });
    }

    if (pathname === "/__llamadas") {
      if (req.method === "DELETE") {
        llamadas = [];
        return send(200, { llamadas: [] });
      }
      return send(200, { llamadas });
    }

    const activeUser = { ...USER, ...(fixtures.user || {}) };

    if (pathname.startsWith("/auth/v1/user")) {
      return send(200, activeUser);
    }

    if (pathname.startsWith("/auth/v1/token")) {
      // Login (GOZS-206): solo la clave "e2e-ok" entra; cualquier otra devuelve invalid_grant como GoTrue.
      const rawBuf = await readRawBody(req);
      let ok = false;
      try {
        ok = JSON.parse(rawBuf.toString("utf8")).password === "e2e-ok";
      } catch {}
      if (!ok) return send(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: activeUser.id, exp: 4102444800, role: "authenticated" })}.sig`;
      return send(200, {
        access_token,
        refresh_token: "e2e-refresh",
        expires_in: 3600,
        expires_at: 4102444800,
        token_type: "bearer",
        user: activeUser,
      });
    }

    // Storage: POST / PUT /storage/v1/object/videos-series/*
    if (pathname.startsWith("/storage/v1/object/")) {
      const buf = await readRawBody(req);
      const objectPath = pathname.replace(/^\/storage\/v1\/object\//, "");
      llamadas.push({
        method: req.method,
        path: pathname,
        query: parsedUrl.search,
        body: { bytes: buf.length, contentType: req.headers["content-type"] || null },
        ts: new Date().toISOString(),
      });
      if (forceStorageErrorStatus) {
        return send(forceStorageErrorStatus, {
          statusCode: String(forceStorageErrorStatus),
          error: "StorageError",
          message: "Forced stub storage error",
        });
      }
      storageUploads.set(objectPath, { bytes: buf.length, contentType: req.headers["content-type"] || "video/mp4" });
      return send(200, { Key: objectPath, Id: crypto.randomUUID() });
    }

    // RPCs
    if (pathname.startsWith("/rest/v1/rpc/")) {
      const rpcName = pathname.replace(/^\/rest\/v1\/rpc\//, "");
      const rawBuf = await readRawBody(req);
      const body = tryParseJson(rawBuf) || {};
      llamadas.push({
        method: req.method,
        path: pathname,
        query: parsedUrl.search,
        body,
        ts: new Date().toISOString(),
      });

      if (rpcName === "obtener_kpis_negocio" && fixtures.kpis_negocio) {
        return send(200, fixtures.kpis_negocio);
      }
      if (rpcName === "actualizar_estado_dolor") {
        return send(200, fixtures.actualizar_estado_dolor ?? { ok: true });
      }
      if (rpcName === "actualizar_nombre_preferido") {
        const rawNombre = typeof body?.p_nombre === "string" ? body.p_nombre.trim() : "";
        if (rawNombre.length > 30) {
          return send(400, { code: "22001", message: "El nombre tiene más de 30 caracteres" });
        }
        const normalized = rawNombre.length > 0 ? rawNombre : null;
        if (fixtures.perfil) fixtures.perfil.nombre_preferido = normalized;
        if (Array.isArray(fixtures.alumnos) && fixtures.alumnos[0]) {
          fixtures.alumnos[0].nombre_preferido = normalized;
        }
        return send(200, normalized);
      }
      if (rpcName === "registrar_molestia") {
        const id = body?.p_id || crypto.randomUUID();
        const sesionId = body?.p_sesion_id;
        if (!Array.isArray(fixtures.registro_sesiones)) fixtures.registro_sesiones = [];
        if (sesionId && !fixtures.registro_sesiones.some((s) => s.id === sesionId)) {
          fixtures.registro_sesiones.unshift({
            id: sesionId,
            alumno_id: activeUser.id,
            dia_id: body?.p_dia_id ?? null,
            fecha: new Date().toISOString(),
            duracion_minutos: null,
            volumen_total_kg: 0,
            effective_volume_kg: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        if (!Array.isArray(fixtures.alumno_historial_dolor)) fixtures.alumno_historial_dolor = [];
        if (!fixtures.alumno_historial_dolor.some((d) => d.id === id)) {
          const eva = Number(body?.p_eva ?? 5);
          const sintomas = Array.isArray(body?.p_sintomas) ? body.p_sintomas : [];
          fixtures.alumno_historial_dolor.push({
            id,
            alumno_id: activeUser.id,
            ejercicio_id: body?.p_ejercicio_id,
            zona_articular: body?.p_zona,
            eva,
            severidad: eva >= 7 ? "AGUDO" : eva >= 4 ? "MODERADO" : "LEVE",
            notas_alumno: body?.p_notas ?? null,
            notas_profesor: null,
            estado_recuperacion: "ACTIVO",
            fecha_reporte: new Date().toISOString().slice(0, 10),
            momento_aparicion: body?.p_momento ?? null,
            es_sintoma_alarma: sintomas.length > 0 || eva >= 10,
            sintomas_alarma: sintomas,
            estado: "PENDIENTE",
            sesion_id: sesionId ?? null,
            ejercicio_en_rutina_id: body?.p_ejercicio_en_rutina_id ?? null,
            numero_serie: body?.p_numero_serie ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        if (body?.p_numero_serie != null && Array.isArray(fixtures.registro_series)) {
          for (const s of fixtures.registro_series) {
            if (
              s.sesion_id === sesionId &&
              s.ejercicio_id === body.p_ejercicio_id &&
              s.numero_serie === body.p_numero_serie
            ) {
              s.pain_reported = true;
              s.pain_notes = [body.p_zona, `${body.p_eva}/10`, body.p_notas].filter(Boolean).join(" · ");
            }
          }
        }
        return send(200, id);
      }

      return send(200, {});
    }

    // Perfiles (soporta id del stub coach o del usuario fixture)
    if (pathname === "/rest/v1/perfiles") {
      if (req.method === "PATCH") {
        const rawBuf = await readRawBody(req);
        const body = tryParseJson(rawBuf) || {};
        llamadas.push({ method: req.method, path: pathname, query: parsedUrl.search, body, ts: new Date().toISOString() });
        if (fixtures.perfil) Object.assign(fixtures.perfil, body);
        if (Array.isArray(fixtures.alumnos) && fixtures.alumnos[0]) Object.assign(fixtures.alumnos[0], body);
        return send(200, fixtures.perfil ? [fixtures.perfil] : []);
      }
      const row = { id: activeUser.id, rol: fixtures.rol || "ENTRENADOR", ...(fixtures.perfil || {}) };
      if (reqUrl.includes(`id=eq.${row.id}`) || reqUrl.includes(`id=eq.${USER.id}`)) {
        return send(200, [row]);
      }
      return send(200, reqUrl.includes("rol=eq.ALUMNO") ? fixtures.alumnos ?? [] : []);
    }

    // Tablas PostgREST genéricas
    const tabla = pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
    const single = String(req.headers.accept || "").includes("pgrst.object");

    if (req.method === "GET" && tabla && Array.isArray(fixtures[tabla])) {
      const result = applyPostgrestQuery(tabla, fixtures[tabla], parsedUrl.searchParams);
      if (single) {
        if (result.length === 0) return send(406, { message: "no rows" });
        return send(200, result[0]);
      }
      return send(200, result);
    }

    if ((req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE") && pathname.startsWith("/rest/v1/")) {
      const rawBuf = await readRawBody(req);
      const body = tryParseJson(rawBuf);
      llamadas.push({
        method: req.method,
        path: pathname,
        query: parsedUrl.search,
        body,
        ts: new Date().toISOString(),
      });

      if (tabla && (req.method === "POST" || req.method === "PUT") && body != null) {
        if (!Array.isArray(fixtures[tabla])) fixtures[tabla] = [];
        const items = Array.isArray(body) ? body : [body];
        const inserted = items.map((item) => {
          const row = {
            id: item.id || crypto.randomUUID(),
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || new Date().toISOString(),
            ...item,
          };
          const idx = fixtures[tabla].findIndex((existing) => existing.id && existing.id === row.id);
          if (idx >= 0) fixtures[tabla][idx] = { ...fixtures[tabla][idx], ...row };
          else fixtures[tabla].push(row);
          return row;
        });
        return send(201, single ? inserted[0] : inserted);
      }

      if (tabla && req.method === "PATCH" && body && typeof body === "object" && Array.isArray(fixtures[tabla])) {
        const matches = applyPostgrestQuery(tabla, fixtures[tabla], parsedUrl.searchParams);
        const matchIds = new Set(matches.map((m) => m.id));
        const updated = [];
        fixtures[tabla] = fixtures[tabla].map((row) => {
          if (matchIds.has(row.id)) {
            const next = { ...row, ...body, updated_at: new Date().toISOString() };
            updated.push(next);
            return next;
          }
          return row;
        });
        return send(200, single ? updated[0] ?? {} : updated);
      }
    }

    if (pathname.startsWith("/rest/v1/")) {
      return send(single ? 406 : 200, single ? { message: "no rows" } : []);
    }

    return send(200, {});
  })
  .listen(PORT, () => console.log(`supabase-stub en :${PORT}`));
