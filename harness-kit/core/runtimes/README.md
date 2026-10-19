# Contratos de runtime (H-00)

Contratos **reales** de hooks, herramientas, skills y subagentes de los 4 runtimes, capturados el 2026-10-19. Cada `<rt>.json` lleva `verified.method` (`live` = fixture capturado; `doc` = documentación del propio binario) y un bloque `sources` con la evidencia de cada dato.

| Runtime | Versión | Método | Config de hooks | Pre | Post (flecha result) |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 2.1.286 | live | `.claude/settings.json` | `PreToolUse` · deny = exit 2 + stderr | `PostToolUse` · `hookSpecificOutput.additionalContext` ✅ verificado |
| Gemini CLI | 0.63.0 | live | `.gemini/settings.json` | `BeforeTool` · deny = exit 2 + stderr | `AfterTool` · `hookSpecificOutput.additionalContext` ✅ verificado |
| OpenCode | 1.18.28 | live | `.opencode/plugins/*.{js,ts}` | `tool.execute.before` · deny = `throw` | `tool.execute.after` · mutar `output.output` ✅ verificado |
| Antigravity | agy 1.4.2 | doc | `.agents/hooks.json` | `PreToolUse` · `{"decision":"deny","reason"}` exit 0 | `"unsupported"` (stdout debe ser `{}`) |

## Herramientas (nombre real → args)

| Tipo | Claude Code | Gemini CLI | OpenCode | Antigravity |
| --- | --- | --- | --- | --- |
| shell | `Bash.command` | `run_shell_command.command` | `bash.command` | `run_command.CommandLine` |
| read | `Read.file_path` (+`offset`,`limit`) | `read_file.file_path` (+`start_line`,`end_line`) | `read.filePath` (+`offset`,`limit`) | `view_file.AbsolutePath` (+`StartLine`,`EndLine`) |
| write | `Write`, `Edit`, `NotebookEdit` | `write_file`, `replace` | `write`, `edit`, `apply_patch` | `write_to_file`, `replace_file_content`, `multi_replace_file_content` |

## Skills y subagentes

| Runtime | Skills | Subagentes | Frontmatter subagente |
| --- | --- | --- | --- |
| Claude Code | `.claude/skills/<n>/SKILL.md` (no lee `.agents/skills`) | `.claude/agents/<n>.md` | `name`, `description` (+`tools`, `model`, …) |
| Gemini CLI | `.gemini/skills/` **y** `.agents/skills/` | `.gemini/agents/<n>.md` | `name`, `description` + lista cerrada (**strict**: clave desconocida = error) |
| OpenCode | `.opencode/skills/`, `.agents/skills/`, `.claude/skills/` | `.opencode/agents/<n>.md` | `description` (+`mode: subagent`, …); nombre = archivo |
| Antigravity | `.agents/skills/` | `.agents/agents/<n>.md` | `name`, `description` (+`tools`, `skills`, `hooks`, …) |

`SKILL.md` exige `name` + `description` en los 4 runtimes → un único formato de skill sirve para todos.

## Implicaciones para el kit

1. **Skills:** `.agents/skills/` lo leen Gemini CLI, OpenCode y Antigravity; Claude Code necesita `.claude/skills/` → el render debe emitir ambos (o enlazar).
2. **Subagentes:** el frontmatter **no** es portable: Gemini rechaza claves extra y OpenCode toma el nombre del archivo → un archivo por runtime, generado.
3. **Antigravity — cwd del hook:** el comando corre en el directorio que contiene `hooks.json` (`.agents/`), no en la raíz; rutas relativas tipo `bash .claude/hooks/x.sh` se resuelven contra `.agents/`. Usar `bash ../.claude/hooks/x.sh` o ruta absoluta. En Windows corre vía `cmd /c`.
4. **Gemini — lectura acotada:** `read_file` acota con `start_line`/`end_line` (no `limit`) y `read_many_files` usa `include` (no `paths`). Un guard que lea `limit`/`paths` tratará toda lectura de Gemini como no acotada.
5. **Gemini — paralelismo:** emite tool calls en paralelo; no asumir orden entre hooks.
6. **Post en Antigravity:** `"post":"unsupported"` (§ flecha result). `injectSteps` en `PreInvocation` existe pero es otra flecha; no se usa como workaround.

## Pendiente

- Antigravity sin captura live (cuota 429 al 2026-10-19). Los fixtures `tests/fixtures/antigravity/*` llevan `_provenance` y deben reemplazarse por una captura real con el procedimiento de `tests/fixtures/README.md`. El mapeo arg→tool de `replace_file_content`/`multi_replace_file_content` sale de strings del binario.
