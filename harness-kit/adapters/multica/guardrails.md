# Multica Guardrails

## Invariants
- **Daemon protection:** Never kill `multica` by name. Check `multica daemon status --output json`; kill child PID only (`multica.daemon-protect`).
- **Foreground blocking:** Never exit turn "standing by"; run work synchronously in blocking calls.
- **Windows comment encoding:** Comments go to UTF-8 file in workdir, post via `--content-file`, delete on success.
