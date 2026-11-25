// Invocación de `gh` con argumentos literales en Windows (GOZS-804). Sin dependencias.
//
// `cmd.exe` no entiende `\"` como escape: un título con comillas y `&` o `|` cortaba el comando.
// Estrategia: resolver el `gh.exe` real y lanzarlo sin shell; solo si `gh` es un shim `.cmd`/`.bat`
// se usa `cmd.exe /d /s /c` con cada argumento escapado para el CRT y para cmd (caret en metacaracteres).
import { spawnSync } from "node:child_process";

const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Escapa un argumento para `cmd.exe /c <shim>`: reglas del CRT (`\"`) y luego caret en los metacaracteres.
 * Con `double` el caret se aplica dos veces: el shim `.cmd` vuelve a parsear `%*` y, si no, un `&` o `|` escapa.
 */
export function escapeCmdArg(arg, double = false) {
  let s = String(arg).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  s = `"${s}"`;
  s = s.replace(CMD_META, "^$1");
  return double ? s.replace(CMD_META, "^$1") : s;
}

/** Línea de comando para `cmd.exe /d /s /c "<línea>"`, con cada argumento literal (doble escape por el shim). */
export function ghShellCommand(args, bin = "gh") {
  return [bin, ...args.map((a) => escapeCmdArg(a, true))].join(" ");
}

/**
 * Resuelve cómo lanzar `gh`. Devuelve `{ command, args, shell }` listo para spawn/execFile.
 * - No Windows, o `gh.exe` real: `{ command: <gh>, args, shell: false }`.
 * - Shim `.cmd`/`.bat`: `{ command: "cmd.exe", args: ["/d","/s","/c", "\"<línea>\""], shell: false, verbatim: true }`.
 * `where` es inyectable para tests: `(name) => string[]`.
 */
export function resolveGhInvocation(args, { platform = process.platform, where = defaultWhere } = {}) {
  if (platform !== "win32") return { command: "gh", args, shell: false };
  const found = where("gh");
  const exe = found.find((p) => /\.exe$/i.test(p));
  if (exe) return { command: exe, args, shell: false };
  const shim = found.find((p) => /\.(cmd|bat)$/i.test(p));
  if (shim) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `"${ghShellCommand(args, escapeCmdArg(shim))}"`],
      shell: false,
      verbatim: true,
    };
  }
  return { command: "gh", args, shell: false };
}

function defaultWhere(name) {
  const res = spawnSync("where", [name], { encoding: "utf8" });
  if (res.status !== 0) return [];
  return String(res.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Opciones de spawn/execFile coherentes con `resolveGhInvocation`. */
export function ghSpawnOptions(inv, base = {}) {
  return inv.verbatim ? { ...base, windowsVerbatimArguments: true } : base;
}
