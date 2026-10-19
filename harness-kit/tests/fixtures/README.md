# Fixtures de hooks (H-00)

`<runtime>/{pre,post}-{shell,read,write}.json` = stdin **verbatim** que cada runtime entregó a un hook "echo" al ejecutar `echo h00`, leer `sample.txt` y escribir `out.txt`. Rutas de máquina reemplazadas por `<WORKSPACE>` / `<HOME>`. OpenCode no tiene hooks de shell: su fixture es el `{input, output}` que recibe el plugin.

Los fixtures con `_provenance` **no** son capturas live (ver `core/runtimes/README.md` → Pendiente).

## Recapturar

En un directorio sandbox fuera del repo (nunca en los configs versionados):

```js
// echo-hook.mjs <rt> <phase> [respuesta.json] — vuelca stdin y responde
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
const [rt, phase, outFile] = process.argv.slice(2);
let d = "";
process.stdin.on("data", c => (d += c)).on("end", () => {
  mkdirSync(`captures/${rt}`, { recursive: true });
  const n = readdirSync(`captures/${rt}`).filter(f => f.startsWith(phase)).length;
  writeFileSync(`captures/${rt}/${phase}-${n}.json`, d);
  process.stdout.write(outFile ? readFileSync(outFile, "utf8") : "{}");
});
```

| Runtime | Registro del hook | Comando |
| --- | --- | --- |
| Claude Code | `--settings` con `PreToolUse`/`PostToolUse`, matcher `*` | `claude -p "<prompt>" --settings s.json --allowedTools ...` |
| Gemini CLI | `.gemini/settings.json` con `BeforeTool`/`AfterTool`, matcher `.*` | `gemini -p "<prompt>" --yolo` |
| OpenCode | `.opencode/plugins/echo.js` con `tool.execute.before/after` | `opencode run "<prompt>"` |
| Antigravity | `.agents/hooks.json` con `PreToolUse`/`PostToolUse`, matcher `.*`; pre responde `{"decision":"allow"}` (rutas relativas a `.agents/`) | `agy -p "<prompt>" --dangerously-skip-permissions` |

Prompt: *"Do exactly these three tool calls in order: 1) shell: echo h00 2) read sample.txt 3) write out.txt with content ok."* Para verificar la inyección post, el hook post responde con el formato de `core/runtimes/<rt>.json` y un marcador, y se pide al modelo que lo repita.
