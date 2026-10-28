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
    if (url.startsWith("/auth/v1/user")) return send(200, USER);
    if (url.startsWith("/rest/v1/perfiles")) {
      // Solo la consulta del propio perfil (id=eq.<uid>) devuelve fila; el listado de alumnos queda vacío.
      const row = { id: USER.id, rol: "ENTRENADOR" };
      return send(200, url.includes(`id=eq.${USER.id}`) ? [row] : []);
    }
    if (url.startsWith("/rest/v1/")) {
      const single = String(req.headers.accept || "").includes("pgrst.object");
      return send(single ? 406 : 200, single ? { message: "no rows" } : []);
    }
    return send(200, {});
  })
  .listen(PORT, () => console.log(`supabase-stub en :${PORT}`));
