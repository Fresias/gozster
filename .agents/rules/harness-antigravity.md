# Antigravity Runtime Execution Rules

- **Comandos largos y WaitMsBeforeAsync:**
  - Para comandos pesados (`npm test`, `npm run build`, `npm ci`, `harness-gate.sh`), usa siempre `WaitMsBeforeAsync: 10000` (el valor máximo soportado por agy).
  - Si el comando supera los 10 s y pasa a segundo plano, **PROHIBIDO hacer polling en bucle** con `manage_task status` cada pocos segundos.
  - Antigravity tiene **Reactive Wakeup**: al terminar una tarea en segundo plano, el sistema despierta al agente automáticamente mediante un mensaje del sistema. Finaliza el turno sin llamar herramientas para esperar la notificación.
  - Si por alguna razón excepcional debes consultar el estado, hazlo como máximo cada 60 s y nunca más de 3 consultas por comando.
- **Higiene de salida y tokens:**
  - Redirige la salida extensa de comandos pesados a un archivo en el workdir (ej. `npm test > test.log 2>&1`) y lee únicamente el resumen final (cola del log).
  - **Lectura quirúrgica:** Nunca leas más de una vez el mismo rango de un archivo en la misma sesión; acota siempre con `StartLine` y `EndLine` (≤ 200 líneas).
- No termines (`manage_task kill`) tareas que no iniciaste en esta conversación.
