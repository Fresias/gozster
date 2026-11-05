# Multica Guardrails

## Invariants
- **Daemon protection:** Never terminate `multica` by process name. Check `multica daemon status --output json` and terminate only specific child PIDs (`multica.daemon-protect`).
- **Foreground blocking:** Never exit turn "standing by"; run work synchronously in foreground tool calls.
- **Windows comment encoding:** Write comments to UTF-8 file in workdir, submit via `--content-file`, delete on success.
