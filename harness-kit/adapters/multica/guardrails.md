# Multica Guardrails

Invariants specific to the Multica agent runtime and workspace daemon.

## Invariants
- **Daemon protection:** Never terminate `multica` or `multica.exe` by process name. Only terminate specific child PIDs after checking `multica daemon status --output json` (rule: `multica.daemon-protect`).
- **Foreground blocking:** Never detach long-running work or exit a turn "standing by". Execute work synchronously within foreground tool calls.
- **Windows comment encoding:** Write comment bodies to a UTF-8 file inside the task workdir first, then submit via `--content-file <path>`. Delete the temporary file only after the post succeeds.
