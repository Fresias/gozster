## Resumen

Closes #

## Protocolo Selection (6 niveles)

Completar cada nivel con ✅ / ❌ y su evidencia. Definición: `harness-kit/core/templates/review-selection.md`. Si un nivel falla, el PR se devuelve citando el número de nivel.

| # | Nivel | Check | Evidencia | Resultado (✅/❌) | Evidencia aportada |
|---|---|---|---|---|---|
| 1 | Delivery | El PR existe, está vinculado al issue y la rama cumple `feature\|fix/<#>-slug` | Link | | |
| 2 | Conformance | Cada GIVEN/WHEN/THEN del issue tiene un test o una evidencia | Tabla AC → test | | |
| 3 | Fidelity | `git diff --stat` solo toca archivos del alcance (Karpathy); sin dependencias nuevas no aprobadas (Ponytail) | Salida de `--stat` | | |
| 4 | Internal Consistency | `render --check` limpio; types regenerados si cambió el schema; docs y ADR actualizados si cambió un contrato | Salida | | |
| 5 | Operational Fitness | Gate local verde y CI verde | Link de CI | | |
| 6 | Finish | Sin `.skip`/`.todo`/aserciones relajadas; sello válido; comentario de cierre en el issue | `rg -n "\.skip\|\.todo"` vacío | | |
