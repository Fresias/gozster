// Stub mínimo de Supabase para E2E: Auth devuelve un ENTRENADOR y PostgREST devuelve vacío.
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
// Fixtures opcionales por tabla (GOZS-297): un test las fija con PUT /__e2e/fixtures y las borra con DELETE.
let fixtures = {};

http
  .createServer((req, res) => {
    const url = req.url || "";
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
    if (url === "/health") return send(200, { ok: true });
    if (url === "/__e2e/fixtures") {
      if (req.method === "DELETE") return (fixtures = {}), send(200, {});
      let raw = "";
      req.on("data", (c) => (raw += c));
      return req.on("end", () => ((fixtures = JSON.parse(raw || "{}")), send(200, {})));
    }
    if (url.startsWith("/auth/v1/user")) return send(200, USER);
    if (url.startsWith("/auth/v1/token")) {
      // Login (GOZS-206): solo la clave "e2e-ok" entra; cualquier otra devuelve invalid_grant como GoTrue.
      let raw = "";
      req.on("data", (c) => (raw += c));
      return req.on("end", () => {
        let ok = false;
        try {
          ok = JSON.parse(raw).password === "e2e-ok";
        } catch {}
        if (!ok) return send(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
        const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, exp: 4102444800, role: "authenticated" })}.sig`;
        send(200, { access_token, refresh_token: "e2e-refresh", expires_in: 3600, expires_at: 4102444800, token_type: "bearer", user: USER });
      });
    }
    if (url.startsWith("/rest/v1/perfiles")) {
      // La consulta del propio perfil (id=eq.<uid>) devuelve fila; el listado de alumnos queda vacío salvo fixture.
      const row = { id: USER.id, rol: "ENTRENADOR" };
      if (url.includes(`id=eq.${USER.id}`)) return send(200, [row]);
      return send(200, url.includes("rol=eq.ALUMNO") ? fixtures.alumnos ?? [] : []);
    }
    const tabla = url.match(/^\/rest\/v1\/(\w+)\?/)?.[1];
    if (req.method === "GET" && tabla && fixtures[tabla]) return send(200, fixtures[tabla]);
    if (url.startsWith("/rest/v1/")) {
      const single = String(req.headers.accept || "").includes("pgrst.object");
      return send(single ? 406 : 200, single ? { message: "no rows" } : []);
    }
    return send(200, {});
  })
  .listen(PORT, () => console.log(`supabase-stub en :${PORT}`));
