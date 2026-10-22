---
name: harness-bootstrap
description: Crea el overlay `harness/` de un repo que aún no lo tiene (harness.json, project.json y, opcional, una skill de dominio) y valida el render.
autotrigger: the repository has no harness/project.json or the user asks to set up the harness
---

# harness-bootstrap

Skill conversacional: pregunta, confirma y recién entonces escribe.

## Pasos

1. Verifica que existe `package.json` y que **no** existe `harness/project.json`. Si ya existe, detente: el overlay se edita a mano, no se re-genera.
2. Pregunta al usuario, una cosa por mensaje, proponiendo el default entre paréntesis:
   - Nombre del proyecto (`name` de `package.json`).
   - Comando de gate (los scripts `test`, `typecheck`, `lint`, `build` que existan, unidos con `&&`).
   - ¿Quiere una skill de dominio? Si sí: nombre, descripción de una línea y autotrigger (frase que completa "When …, load the X skill.").
3. Muestra el resumen y pide confirmación.
4. Ejecuta, con solo los flags respondidos:

   ```bash
   node harness-kit/core/skills/harness-bootstrap/bootstrap.mjs \
     --name "<name>" --gate "<gate>" \
     --domain "<skill>" --domain-description "<desc>" --autotrigger "<trigger>"
   ```

5. Renderiza y verifica: `node harness-kit/core/scripts/harness-render.mjs && node harness-kit/core/scripts/harness-render.mjs --check`. Ambos deben salir con exit 0.
6. Reporta los archivos creados y, si hubo skill de dominio, recuerda completar sus fuentes de verdad (rutas, no copias).
