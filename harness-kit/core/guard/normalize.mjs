/**
 * normalize.mjs
 * Normalizes tool call payloads from Claude Code, Gemini CLI, OpenCode, and Antigravity
 * into a canonical shape. Single source of truth: harness-kit/core/runtimes/*.json.
 */

function parseOptionalInt(val) {
  if (val === undefined || val === null || val === "") return undefined;
  const n = Number(val);
  return Number.isInteger(n) ? n : undefined;
}

export function detectRuntime(payload, hint) {
  if (hint) return hint;
  if (!payload || typeof payload !== "object") return "claude-code";
  if (payload.toolCall && typeof payload.toolCall === "object") return "antigravity";
  if (payload.input && typeof payload.input === "object" && payload.input.tool) return "opencode";
  if (typeof payload.tool_name === "string") {
    const geminiTools = ["run_shell_command", "read_file", "read_many_files", "write_file", "replace"];
    if (geminiTools.includes(payload.tool_name)) return "gemini-cli";
    return "claude-code";
  }
  return "claude-code";
}

export function normalize(payload, options = {}) {
  const runtime = detectRuntime(payload, options.runtime);
  let kind = "other";
  let tool = "";
  let command = "";
  let filePath = "";
  let startLine;
  let endLine;
  let limit;
  let paths = [];
  let targetPath = "";
  let isEdit = false;

  if (runtime === "antigravity") {
    const tc = payload?.toolCall || {};
    tool = String(tc.name || "");
    const args = tc.args || {};

    if (tool === "run_command") {
      kind = "shell";
      command = String(args.CommandLine || args.command || "");
    } else if (tool === "view_file" || tool === "read_file") {
      kind = "read";
      filePath = String(args.AbsolutePath || args.Path || args.file_path || "");
      startLine = parseOptionalInt(args.StartLine ?? args.start_line);
      endLine = parseOptionalInt(args.EndLine ?? args.end_line);
      if (endLine !== undefined) {
        limit = startLine !== undefined ? endLine - startLine + 1 : endLine;
      }
    } else if (
      [
        "write_to_file",
        "replace_file_content",
        "multi_replace_file_content",
        "write_file",
        "edit_file",
      ].includes(tool)
    ) {
      kind = "write";
      targetPath = String(args.TargetFile || args.Path || args.file_path || "");
      isEdit = tool !== "write_to_file" && tool !== "write_file";
    }
  } else if (runtime === "opencode") {
    tool = String(payload?.input?.tool || "");
    const args = payload?.output?.args || payload?.input?.args || {};

    if (tool === "bash") {
      kind = "shell";
      command = String(args.command || "");
    } else if (tool === "read") {
      kind = "read";
      filePath = String(args.filePath || args.file_path || "");
      limit = parseOptionalInt(args.limit);
    } else if (["write", "edit", "apply_patch"].includes(tool)) {
      kind = "write";
      targetPath = String(args.filePath || args.file_path || "");
      isEdit = tool === "edit" || tool === "apply_patch";
    }
  } else if (runtime === "gemini-cli") {
    tool = String(payload?.tool_name || "");
    const args = payload?.tool_input || {};

    if (tool === "run_shell_command") {
      kind = "shell";
      command = String(args.command || "");
    } else if (tool === "read_file") {
      kind = "read";
      filePath = String(args.file_path || args.absolute_path || "");
      startLine = parseOptionalInt(args.start_line);
      endLine = parseOptionalInt(args.end_line);
      limit = parseOptionalInt(args.limit);
      if (endLine !== undefined && limit === undefined) {
        limit = startLine !== undefined ? endLine - startLine + 1 : endLine;
      }
    } else if (tool === "read_many_files") {
      kind = "read_many";
      if (Array.isArray(args.include)) {
        paths = args.include.map(String);
      } else if (Array.isArray(args.paths)) {
        paths = args.paths.map(String);
      } else if (typeof args.paths === "string") {
        paths = args.paths.split("\n").filter(Boolean);
      }
    } else if (tool === "write_file" || tool === "replace") {
      kind = "write";
      targetPath = String(args.file_path || args.absolute_path || "");
      isEdit = tool === "replace";
    }
  } else {
    // Claude Code default
    tool = String(payload?.tool_name || "");
    const args = payload?.tool_input || {};

    if (tool === "Bash") {
      kind = "shell";
      command = String(args.command || "");
    } else if (tool === "Read") {
      kind = "read";
      filePath = String(args.file_path || args.absolute_path || "");
      limit = parseOptionalInt(args.limit);
    } else if (["Write", "Edit", "NotebookEdit"].includes(tool)) {
      kind = "write";
      targetPath = String(args.file_path || args.notebook_path || "");
      isEdit = tool === "Edit" || tool === "NotebookEdit";
    }
  }

  const isBounded = typeof limit === "number" && limit > 0 && limit <= 300;

  let phase = options.phase || "pre";
  if (!options.phase) {
    const event = payload?.hook_event_name;
    if (event === "PostToolUse" || event === "AfterTool") {
      phase = "post";
    } else if (payload?.output && payload?.input?.tool) {
      phase = "post";
    } else if (payload?.tool_response || payload?.toolResponse) {
      phase = "post";
    }
  }

  let output = "";
  if (payload?.tool_response) {
    if (typeof payload.tool_response === "string") {
      output = payload.tool_response;
    } else if (typeof payload.tool_response === "object") {
      const parts = [];
      if (payload.tool_response.stdout) parts.push(String(payload.tool_response.stdout));
      if (payload.tool_response.stderr) parts.push(String(payload.tool_response.stderr));
      if (payload.tool_response.llmContent) parts.push(String(payload.tool_response.llmContent));
      if (payload.tool_response.returnDisplay && typeof payload.tool_response.returnDisplay === "string") {
        parts.push(payload.tool_response.returnDisplay);
      }
      output = parts.join("\n");
    }
  } else if (payload?.output) {
    if (typeof payload.output === "string") {
      output = payload.output;
    } else if (payload.output.output) {
      output = String(payload.output.output);
    }
  }

  return {
    runtime,
    kind,
    tool,
    command,
    filePath,
    startLine,
    endLine,
    limit,
    isBounded,
    paths,
    targetPath,
    isEdit,
    phase,
    output,
    raw: payload,
  };
}
