# Multica Guardrails

## Invariants
- **Daemon protection:** Never terminate `multica` or `multica.exe` by process name. Only terminate specific child PIDs after checking `multica daemon status --output json` (rule: `multica.daemon-protect`).
- **Foreground blocking:** Never detach long-running work or exit a turn "standing by"; run work synchronously in foreground tool calls.
- **Windows comment encoding:** Write comment bodies to a UTF-8 file in the task workdir, submit via `--content-file`, then delete it only after the post succeeds.
