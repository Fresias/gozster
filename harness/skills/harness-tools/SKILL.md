---
name: harness-tools
description: Catálogo de scripts del arnés y guía operativa de herramientas (el listado de scripts se inyecta automáticamente al renderizar).
autotrigger: you need harness helper scripts or CLI tool guides
---

# harness-tools

Catálogo auto-generado de scripts del arnés (`harness-kit/core/scripts/` y `harness/scripts/`). Ejecutar vía `bash` o `node`.

## Lectura y búsqueda

- **Rango obligatorio (> 300 líneas):** máximo duro **300 líneas** (rango inclusivo); valor recomendado **200**.
  - **Antigravity:** usá `read_file` con `StartLine` y `EndLine` (rango inclusivo, `EndLine - StartLine + 1 <= 300`; opcional `ByteOffset`).
  - **Claude Code:** usá `Read` con `offset` y `limit` (`<= 300`; recomendado `200`) o buscá primero con `Grep`.
- **Evitar idas y vueltas (`rg ↔ lectura`):** para ubicar y editar sin leer archivos grandes enteros, buscá directamente con contexto: `rg -n -C 20 <patrón> <ruta>`.

<!-- BEGIN GENERATED:HELPER_SCRIPTS -->
<!-- Auto-populated by harness-render.mjs into .claude/skills/harness-tools/SKILL.md and .agents/skills/harness-tools/SKILL.md -->
<!-- END GENERATED:HELPER_SCRIPTS -->
