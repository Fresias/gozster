import esbuild from "esbuild";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(AQUI, "../../../../../src");
export const BUNDLE = path.join(os.tmpdir(), "gozster-athlete-cliente.js");
await esbuild.build({
  entryPoints: [path.join(AQUI, "entry.tsx")], bundle: true, outfile: BUNDLE, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
  plugins: [{ name: "alias", setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase\/(client|browser)$/ }, () => ({ path: path.join(AQUI, "supabase-stub.ts") }));
    b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: SRC, kind: a.kind }));
  } }],
});
console.log(BUNDLE);
