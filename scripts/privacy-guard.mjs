// GOZS-802: guard de privacidad. Compara HASHES SHA-256 (nunca texto plano) de tokens
// e identificadores bloqueados contra el contenido de un directorio (p. ej. .next/static).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** SHA-256 de tokens normalizados (minúsculas, sin acentos) bloqueados. */
export const TOKENS_BLOQUEADOS = new Set([
  "b183ed6189874c1965686f120194bf2f0eec8292871b7d6ee614ffe54297b3c1",
]);
/** SHA-256 de UUIDs (minúsculas) bloqueados. */
export const UUIDS_BLOQUEADOS = new Set([
  "e3565071292c3f5db9fc96e5eded8fe898e4ac1600949351881e55b9e7ac829b",
  "d135b4db632d64ff941bbf3d6b309c14c30a3ec1946097ed31a2fb7127060704",
]);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /@(gmail|hotmail)\.com/i;

/** Devuelve la lista de motivos (sin exponer el dato) por los que `texto` viola la política. */
export function escanearTexto(texto) {
  const motivos = [];
  const normal = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const t of normal.match(/[a-z0-9]+/g) ?? []) {
    if (TOKENS_BLOQUEADOS.has(sha256(t))) {
      motivos.push("token-bloqueado");
      break;
    }
  }
  for (const u of normal.match(UUID_RE) ?? []) {
    if (UUIDS_BLOQUEADOS.has(sha256(u))) {
      motivos.push("uuid-bloqueado");
      break;
    }
  }
  if (EMAIL_RE.test(texto)) motivos.push("email-personal");
  return motivos;
}

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p) : [p];
  });
}

/** Escanea recursivamente `dir`; retorna [{ file, motivos }] (vacío si está limpio). */
export function escanearDirectorio(dir) {
  const out = [];
  for (const f of archivos(dir)) {
    if (!/\.(js|css|html|json|txt|map|mjs)$/.test(f)) continue;
    const motivos = escanearTexto(fs.readFileSync(f, "utf8"));
    if (motivos.length) out.push({ file: f, motivos });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? ".next/static");
  if (!fs.existsSync(dir)) {
    console.error(`privacy-guard: no existe ${dir} (ejecutar npm run build antes)`);
    process.exit(2);
  }
  const hits = escanearDirectorio(dir);
  for (const h of hits) console.error(`privacy-guard: ${h.file} -> ${h.motivos.join(", ")}`);
  console.log(`privacy-guard: ${hits.length === 0 ? "OK" : "FALLA"} (${dir})`);
  process.exit(hits.length === 0 ? 0 : 1);
}
