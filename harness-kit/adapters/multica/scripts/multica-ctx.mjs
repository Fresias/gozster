#!/usr/bin/env node
// Fetch bounded Multica issue context, cached agents list, or bounded issue lists/searches in one call.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_MAX_LINES = 120;
export const MAX_DESC_LINES = 40;
export const MAX_ROOTS = 10;
export const MAX_THREAD_ENTRIES = 10;
export const MAX_LIST_LIMIT = 15;
export const AGENTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_CLI_ATTEMPTS = 2;

export function printHelp() {
  return [
    "multica-ctx — Bounded Multica context, cached agents list, and bounded issue queries",
    "",
    "Usage:",
    "  node harness-kit/adapters/multica/scripts/multica-ctx.mjs <ISSUE> [--thread <id>] [--json] [--max-lines 120]",
    "  node harness-kit/adapters/multica/scripts/multica-ctx.mjs --agents [--refresh] [--json] [--max-lines 120]",
    "  node harness-kit/adapters/multica/scripts/multica-ctx.mjs --list [--status <s>] [--assignee <a>] [--project <id>] [--priority <p>] [--limit 15] [--json] [--max-lines 120]",
    "  node harness-kit/adapters/multica/scripts/multica-ctx.mjs --search <query> --project <id> [--limit 15] [--json] [--max-lines 120]",
    "",
    "Options:",
    "  --thread <id>       Expand a specific comment thread (default: most recently active root, last 10 entries)",
    "  --agents            Return compact agents list (id, name, role) cached 24h in <git-common-dir>/harness/cache/multica-agents.json",
    "  --refresh           Force refreshing the agents cache from the Multica CLI",
    "  --list              List issues with --limit strictly bounded to <= 15",
    "  --search <query>    Search issues (requires --project <id>; --limit strictly bounded to <= 15)",
    "  --project <id>      Project filter for --list or --search",
    "  --status <status>   Status filter for --list",
    "  --assignee <name>   Assignee filter for --list",
    "  --priority <prio>   Priority filter for --list",
    "  --limit <N>         Maximum items for --list/--search (1..15, default 15)",
    "  --max-lines <N>     Hard cap on output lines (default 120)",
    "  --json              Output bounded JSON instead of compact text",
    "  -h, --help          Show this help message",
  ].join("\n");
}

export function resolveMulticaCli(env = process.env) {
  const configured = typeof env.MULTICA_CLI_PATH === "string" ? env.MULTICA_CLI_PATH.trim() : "";
  return configured || "multica";
}

export function clampLimit(value, fallback = MAX_LIST_LIMIT) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(MAX_LIST_LIMIT, parsed);
}

function clampPositiveInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function parseArgs(argv) {
  const opts = {
    help: false,
    issue: null,
    thread: null,
    agents: false,
    refresh: false,
    list: false,
    search: null,
    project: null,
    status: null,
    assignee: null,
    priority: null,
    limit: MAX_LIST_LIMIT,
    maxLines: DEFAULT_MAX_LINES,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg === "--agents") {
      opts.agents = true;
    } else if (arg === "--refresh") {
      opts.refresh = true;
    } else if (arg === "--list") {
      opts.list = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--thread") {
      opts.thread = argv[++i] ?? null;
    } else if (arg.startsWith("--thread=")) {
      opts.thread = arg.slice("--thread=".length);
    } else if (arg === "--search") {
      opts.search = argv[++i] ?? null;
    } else if (arg.startsWith("--search=")) {
      opts.search = arg.slice("--search=".length);
    } else if (arg === "--project") {
      opts.project = argv[++i] ?? null;
    } else if (arg.startsWith("--project=")) {
      opts.project = arg.slice("--project=".length);
    } else if (arg === "--status") {
      opts.status = argv[++i] ?? null;
    } else if (arg.startsWith("--status=")) {
      opts.status = arg.slice("--status=".length);
    } else if (arg === "--assignee") {
      opts.assignee = argv[++i] ?? null;
    } else if (arg.startsWith("--assignee=")) {
      opts.assignee = arg.slice("--assignee=".length);
    } else if (arg === "--priority") {
      opts.priority = argv[++i] ?? null;
    } else if (arg.startsWith("--priority=")) {
      opts.priority = arg.slice("--priority=".length);
    } else if (arg === "--limit") {
      opts.limit = clampLimit(argv[++i], MAX_LIST_LIMIT);
    } else if (arg.startsWith("--limit=")) {
      opts.limit = clampLimit(arg.slice("--limit=".length), MAX_LIST_LIMIT);
    } else if (arg === "--max-lines") {
      opts.maxLines = clampPositiveInt(argv[++i], DEFAULT_MAX_LINES);
    } else if (arg.startsWith("--max-lines=")) {
      opts.maxLines = clampPositiveInt(arg.slice("--max-lines=".length), DEFAULT_MAX_LINES);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!opts.issue) {
      opts.issue = arg;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  return opts;
}

function summarizeError(err) {
  const stderr = typeof err?.stderr === "string"
    ? err.stderr
    : Buffer.isBuffer(err?.stderr)
      ? err.stderr.toString("utf8")
      : "";
  const raw = stderr.trim() || (typeof err?.message === "string" ? err.message.trim() : String(err));
  const firstLines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 4).join(" | ");
  return firstLines.slice(0, 320) || "unknown CLI error";
}

function invokeBinary(execFileSyncFn, cliPath, args, cwd, env) {
  const lower = cliPath.toLowerCase();
  const baseOpts = {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  };
  if (lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".js")) {
    return execFileSyncFn(process.execPath, [cliPath, ...args], baseOpts);
  }
  if (process.platform === "win32" && (lower.endsWith(".cmd") || lower.endsWith(".bat"))) {
    return execFileSyncFn(cliPath, args, { ...baseOpts, shell: true });
  }
  return execFileSyncFn(cliPath, args, baseOpts);
}

export function runCli(args, deps = {}) {
  const env = deps.env ?? process.env;
  const cwd = deps.cwd ?? process.cwd();
  const execFileSyncFn = deps.execFileSyncFn ?? execFileSync;
  const cliPath = deps.cliPath ?? resolveMulticaCli(env);
  const maxAttempts = Math.min(MAX_CLI_ATTEMPTS, clampPositiveInt(deps.maxAttempts, MAX_CLI_ATTEMPTS));

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stdout = invokeBinary(execFileSyncFn, cliPath, args, cwd, env);
      return typeof stdout === "string" ? stdout : String(stdout ?? "");
    } catch (err) {
      lastErr = err;
    }
  }

  const exitCode = typeof lastErr?.status === "number" && lastErr.status !== 0 ? lastErr.status : 1;
  const wrapped = new Error(`multica ${args.slice(0, 3).join(" ")} failed after ${maxAttempts} attempts: ${summarizeError(lastErr)}`);
  wrapped.exitCode = exitCode;
  throw wrapped;
}

export function runCliJson(args, deps = {}) {
  const raw = runCli(args, deps).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    const wrapped = new Error(`Invalid JSON from multica ${args.slice(0, 3).join(" ")}: ${err.message}`);
    wrapped.exitCode = 1;
    throw wrapped;
  }
}

export function getGitCommonDir(deps = {}) {
  if (typeof deps.gitCommonDirFn === "function") {
    return deps.gitCommonDirFn();
  }
  const cwd = deps.cwd ?? process.cwd();
  const execFileSyncFn = deps.execFileSyncFn ?? execFileSync;
  try {
    const out = execFileSyncFn("git", ["rev-parse", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (out) return path.resolve(cwd, out);
  } catch {
    // Fallback when invoked outside a git repository.
  }
  return path.resolve(cwd, ".harness");
}

export function getAgentsCachePath(deps = {}) {
  return path.join(getGitCommonDir(deps), "harness", "cache", "multica-agents.json");
}

function oneLine(text, maxChars = 120) {
  const collapsed = String(text ?? "").replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, Math.max(1, maxChars - 1))}…`;
}

function summarizeAgentRole(agent) {
  if (typeof agent?.role === "string" && agent.role.trim()) {
    return oneLine(agent.role, 120);
  }
  if (typeof agent?.description === "string" && agent.description.trim()) {
    const firstSentence = agent.description.trim().split(/(?<=[.!?])\s+/)[0] || agent.description.trim();
    return oneLine(firstSentence, 120);
  }
  return oneLine(agent?.status || agent?.runtime_mode || "agent", 60);
}

function normalizeAgents(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.agents) ? raw.agents : [];
  return list.map((a) => ({
    id: String(a?.id ?? ""),
    name: String(a?.name ?? ""),
    role: summarizeAgentRole(a),
    ...(a?.status ? { status: String(a.status) } : {}),
  }));
}

function readValidAgentsCache(cachePath, nowMs) {
  if (!existsSync(cachePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
    const cachedAtMs = Date.parse(parsed?.cached_at ?? "");
    if (!Number.isFinite(cachedAtMs) || !Array.isArray(parsed?.agents)) return null;
    const ageMs = nowMs - cachedAtMs;
    if (ageMs >= 0 && ageMs < AGENTS_CACHE_TTL_MS) {
      return {
        cached: true,
        cached_at: parsed.cached_at,
        agents: parsed.agents,
      };
    }
  } catch {
    // Corrupt cache is refreshed cleanly.
  }
  return null;
}

export function loadAgents(opts, deps = {}) {
  const nowMs = typeof deps.nowFn === "function" ? deps.nowFn() : Date.now();
  const cachePath = getAgentsCachePath(deps);

  if (!opts.refresh) {
    const hit = readValidAgentsCache(cachePath, nowMs);
    if (hit) return { ...hit, cache_path: cachePath };
  }

  const raw = runCliJson(["agent", "list", "--output", "json"], deps);
  const agents = normalizeAgents(raw);
  const cachedAt = new Date(nowMs).toISOString();

  mkdirSync(path.dirname(cachePath), { recursive: true });
  writeFileSync(
    cachePath,
    JSON.stringify({ cached_at: cachedAt, ttl_ms: AGENTS_CACHE_TTL_MS, agents }, null, 2) + "\n",
    "utf8",
  );

  return { cached: false, cached_at: cachedAt, cache_path: cachePath, agents };
}

function loadCachedAgentMap(deps = {}) {
  const nowMs = typeof deps.nowFn === "function" ? deps.nowFn() : Date.now();
  const hit = readValidAgentsCache(getAgentsCachePath(deps), nowMs);
  const map = new Map();
  if (hit) {
    for (const a of hit.agents) {
      if (a?.id && a?.name) map.set(a.id, a.name);
    }
  }
  return map;
}

function formatActor(id, type, agentMap) {
  if (!id) return "unassigned";
  if (agentMap.has(id)) return `@${agentMap.get(id)}`;
  const short = String(id).length > 12 ? String(id).slice(0, 8) : String(id);
  return type ? `${type}:${short}` : short;
}

function normalizeChildren(raw) {
  const out = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      out.push({
        id: String(item?.id ?? ""),
        identifier: String(item?.identifier ?? item?.id ?? ""),
        title: oneLine(item?.title ?? "", 90),
        status: String(item?.status ?? "unknown"),
        ...(item?.stage !== undefined && item?.stage !== null ? { stage: item.stage } : {}),
      });
    }
    return out;
  }

  if (Array.isArray(raw?.stages)) {
    for (const stageObj of raw.stages) {
      const stageNum = stageObj?.stage;
      for (const item of stageObj?.issues ?? []) {
        out.push({
          id: String(item?.id ?? ""),
          identifier: String(item?.identifier ?? item?.id ?? ""),
          title: oneLine(item?.title ?? "", 90),
          status: String(item?.status ?? "unknown"),
          ...(stageNum !== undefined && stageNum !== null ? { stage: stageNum } : {}),
        });
      }
    }
  }
  if (Array.isArray(raw?.unstaged)) {
    for (const item of raw.unstaged) {
      out.push({
        id: String(item?.id ?? ""),
        identifier: String(item?.identifier ?? item?.id ?? ""),
        title: oneLine(item?.title ?? "", 90),
        status: String(item?.status ?? "unknown"),
      });
    }
  }
  return out;
}

function normalizePullRequests(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.pull_requests) ? raw.pull_requests : [];
  return list.map((pr) => ({
    id: String(pr?.id ?? pr?.number ?? ""),
    number: pr?.number ?? pr?.pr_number ?? null,
    state: String(pr?.state ?? pr?.status ?? "unknown"),
    title: oneLine(pr?.title ?? "", 80),
    url: String(pr?.url ?? pr?.html_url ?? ""),
  }));
}

function boundTextLines(text, maxLines) {
  const all = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  if (all.length <= maxLines) {
    return { lines: all, total: all.length, truncated: false };
  }
  return { lines: all.slice(0, maxLines), total: all.length, truncated: true };
}

function sortByTimestampAsc(items, primaryField, fallbackField = "created_at") {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a?.[primaryField] ?? a?.[fallbackField] ?? "") || 0;
    const tb = Date.parse(b?.[primaryField] ?? b?.[fallbackField] ?? "") || 0;
    return ta - tb;
  });
}

function capOutputLines(lines, maxLines, hint) {
  if (lines.length <= maxLines) return lines.join("\n");
  if (maxLines <= 1) return lines.slice(0, 1).join("\n");
  return [...lines.slice(0, maxLines - 1), `... [truncated to ${maxLines} lines; ${hint}]`].join("\n");
}

function serializeBoundedJson(payload, maxLines) {
  const pretty = JSON.stringify(payload, null, 2);
  if (pretty.split("\n").length <= maxLines) return pretty;
  return JSON.stringify(payload);
}

export function fetchIssueContext(opts, deps = {}) {
  const agentMap = loadCachedAgentMap(deps);
  const issue = runCliJson(["issue", "get", opts.issue, "--output", "json"], deps) ?? {};
  const issueKey = String(issue.identifier || opts.issue);

  const rootsRaw = runCliJson(
    ["issue", "comment", "list", opts.issue, "--roots-only", "--summary", "--compact", "--output", "json"],
    deps,
  );
  const allRoots = Array.isArray(rootsRaw) ? rootsRaw : [];
  const sortedRoots = sortByTimestampAsc(allRoots, "last_activity_at", "created_at");
  const visibleRoots = sortedRoots.slice(-MAX_ROOTS).map((r) => ({
    id: String(r?.id ?? ""),
    author: formatActor(r?.author_id, r?.author_type, agentMap),
    created_at: String(r?.created_at ?? ""),
    last_activity_at: String(r?.last_activity_at ?? r?.created_at ?? ""),
    reply_count: Number(r?.reply_count ?? 0),
    snippet: oneLine(r?.content ?? "", 100),
  }));

  const targetThreadId = opts.thread || (visibleRoots.length > 0 ? visibleRoots[visibleRoots.length - 1].id : null);
  let thread = null;
  if (targetThreadId) {
    const threadRaw = runCliJson(
      ["issue", "comment", "list", opts.issue, "--thread", targetThreadId, "--tail", String(MAX_THREAD_ENTRIES), "--compact", "--output", "json"],
      deps,
    );
    const allEntries = Array.isArray(threadRaw) ? threadRaw : [];
    const visibleEntries = allEntries.slice(-MAX_THREAD_ENTRIES).map((e) => ({
      id: String(e?.id ?? ""),
      parent_id: e?.parent_id ? String(e.parent_id) : null,
      author: formatActor(e?.author_id, e?.author_type, agentMap),
      created_at: String(e?.created_at ?? ""),
      content: oneLine(e?.content ?? "", 220),
    }));
    thread = {
      id: targetThreadId,
      total: allEntries.length,
      showing: visibleEntries.length,
      items: visibleEntries,
    };
  }

  const childrenRaw = runCliJson(["issue", "children", opts.issue, "--output", "json"], deps);
  const children = normalizeChildren(childrenRaw);

  const prsRaw = runCliJson(["issue", "pull-requests", opts.issue, "--output", "json"], deps);
  const pullRequests = normalizePullRequests(prsRaw);

  const desc = boundTextLines(issue.description ?? "", MAX_DESC_LINES);

  return {
    issue: {
      id: String(issue.id ?? opts.issue),
      identifier: issueKey,
      title: String(issue.title ?? ""),
      status: String(issue.status ?? "unknown"),
      assignee: formatActor(issue.assignee_id, issue.assignee_type, agentMap),
      priority: issue.priority ?? null,
      parent_issue_id: issue.parent_issue_id ?? null,
      description_lines_total: desc.total,
      description_truncated: desc.truncated,
      description: desc.lines.join("\n"),
    },
    roots: {
      total: allRoots.length,
      showing: visibleRoots.length,
      items: visibleRoots,
    },
    thread,
    children: {
      total: children.length,
      items: children,
    },
    pull_requests: pullRequests,
  };
}

function formatIssueContextText(ctx, maxLines) {
  const lines = [];
  const iss = ctx.issue;
  lines.push(`ISSUE: ${iss.identifier} [${iss.status}] ${iss.title}`);
  const meta = [`id=${iss.id}`, `assignee=${iss.assignee}`];
  if (iss.priority) meta.push(`priority=${iss.priority}`);
  if (iss.parent_issue_id) meta.push(`parent=${iss.parent_issue_id}`);
  lines.push(`META: ${meta.join(" | ")}`);

  lines.push("");
  const descLabel = iss.description_truncated
    ? `DESCRIPTION (first ${MAX_DESC_LINES} of ${iss.description_lines_total} lines):`
    : `DESCRIPTION (${iss.description_lines_total} lines):`;
  lines.push(descLabel);
  if (iss.description) {
    lines.push(...iss.description.split("\n"));
  } else {
    lines.push("(empty)");
  }

  lines.push("");
  lines.push(`ROOTS (${ctx.roots.showing}/${ctx.roots.total}):`);
  if (ctx.roots.items.length === 0) {
    lines.push("- (none)");
  } else {
    for (const r of ctx.roots.items) {
      lines.push(`- [${r.id}] ${r.author} (${r.reply_count} replies, ${r.last_activity_at}): ${r.snippet}`);
    }
  }

  lines.push("");
  if (ctx.thread) {
    lines.push(`THREAD ${ctx.thread.id} (${ctx.thread.showing}/${ctx.thread.total}):`);
    for (const e of ctx.thread.items) {
      const kind = e.parent_id ? "reply" : "root";
      lines.push(`- [${e.id}] (${kind}) ${e.author} ${e.created_at}: ${e.content}`);
    }
  } else {
    lines.push("THREAD: (none)");
  }

  lines.push("");
  lines.push(`CHILDREN (${ctx.children.total}):`);
  if (ctx.children.items.length === 0) {
    lines.push("- (none)");
  } else {
    for (const c of ctx.children.items) {
      const stg = c.stage !== undefined ? ` stage:${c.stage}` : "";
      lines.push(`- ${c.identifier} [${c.status}${stg}] ${c.title}`);
    }
  }

  lines.push("");
  lines.push(`PULL REQUESTS (${ctx.pull_requests.length}):`);
  if (ctx.pull_requests.length === 0) {
    lines.push("- (none)");
  } else {
    for (const pr of ctx.pull_requests) {
      const ref = pr.number ? `#${pr.number}` : pr.id;
      lines.push(`- ${ref} [${pr.state}] ${pr.title}${pr.url ? ` (${pr.url})` : ""}`);
    }
  }

  return capOutputLines(lines, maxLines, "use --thread <id> or --max-lines <N>");
}

function formatAgentsText(result, maxLines) {
  const lines = [
    `AGENTS (${result.agents.length}) [${result.cached ? "cached" : "refreshed"} ${result.cached_at}]:`,
  ];
  for (const a of result.agents) {
    lines.push(`- ${a.id} | ${a.name} | ${a.role}`);
  }
  return capOutputLines(lines, maxLines, "use --max-lines <N>");
}

export function fetchIssueList(opts, deps = {}) {
  const limit = clampLimit(opts.limit, MAX_LIST_LIMIT);
  const args = ["issue", "list", "--limit", String(limit)];
  if (opts.status) args.push("--status", opts.status);
  if (opts.assignee) args.push("--assignee", opts.assignee);
  if (opts.project) args.push("--project", opts.project);
  if (opts.priority) args.push("--priority", opts.priority);
  args.push("--output", "json");

  const raw = runCliJson(args, deps);
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.issues) ? raw.issues : [];
  const items = arr.slice(0, limit).map((i) => ({
    id: String(i?.id ?? ""),
    identifier: String(i?.identifier ?? i?.id ?? ""),
    status: String(i?.status ?? "unknown"),
    priority: i?.priority ?? null,
    title: oneLine(i?.title ?? "", 90),
  }));
  return { limit, total: items.length, items };
}

export function fetchIssueSearch(opts, deps = {}) {
  if (!opts.project) {
    const err = new Error("--search requires --project <id> (enforces multica.search-bounded).");
    err.exitCode = 1;
    throw err;
  }
  const limit = clampLimit(opts.limit, MAX_LIST_LIMIT);
  const args = [
    "issue",
    "search",
    opts.search,
    "--project",
    opts.project,
    "--limit",
    String(limit),
    "--output",
    "json",
  ];
  const raw = runCliJson(args, deps);
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.issues) ? raw.issues : [];
  const items = arr.slice(0, limit).map((i) => ({
    id: String(i?.id ?? ""),
    identifier: String(i?.identifier ?? i?.id ?? ""),
    status: String(i?.status ?? "unknown"),
    match_source: i?.match_source ?? null,
    title: oneLine(i?.title ?? "", 90),
  }));
  return { query: opts.search, project: opts.project, limit, total: items.length, items };
}

function formatIssueListText(result, header, maxLines) {
  const lines = [`${header} (${result.total}, limit=${result.limit}):`];
  if (result.items.length === 0) {
    lines.push("- (none)");
  } else {
    for (const i of result.items) {
      const extra = i.priority ? ` ${i.priority}` : i.match_source ? ` match:${i.match_source}` : "";
      lines.push(`- ${i.identifier} [${i.status}${extra}] ${i.title}`);
    }
  }
  return capOutputLines(lines, maxLines, "use --max-lines <N>");
}

export function main(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);
  if (opts.help) {
    return { code: 0, stdout: printHelp(), stderr: "" };
  }

  if (opts.agents) {
    const result = loadAgents(opts, deps);
    const out = opts.json
      ? serializeBoundedJson({ cached: result.cached, cached_at: result.cached_at, agents: result.agents }, opts.maxLines)
      : formatAgentsText(result, opts.maxLines);
    return { code: 0, stdout: out, stderr: "" };
  }

  if (opts.list) {
    const result = fetchIssueList(opts, deps);
    const out = opts.json
      ? serializeBoundedJson(result, opts.maxLines)
      : formatIssueListText(result, "ISSUES", opts.maxLines);
    return { code: 0, stdout: out, stderr: "" };
  }

  if (opts.search !== null) {
    const result = fetchIssueSearch(opts, deps);
    const out = opts.json
      ? serializeBoundedJson(result, opts.maxLines)
      : formatIssueListText(result, `SEARCH "${result.query}"`, opts.maxLines);
    return { code: 0, stdout: out, stderr: "" };
  }

  if (!opts.issue) {
    return {
      code: 1,
      stdout: "",
      stderr: "Error: missing <ISSUE> argument or mode (--agents, --list, --search). Run with --help.",
    };
  }

  const ctx = fetchIssueContext(opts, deps);
  const out = opts.json
    ? serializeBoundedJson(ctx, opts.maxLines)
    : formatIssueContextText(ctx, opts.maxLines);
  return { code: 0, stdout: out, stderr: "" };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    const res = main(process.argv.slice(2));
    if (res.stdout) process.stdout.write(res.stdout + "\n");
    if (res.stderr) process.stderr.write(res.stderr + "\n");
    process.exit(res.code);
  } catch (err) {
    const code = typeof err?.exitCode === "number" && err.exitCode !== 0 ? err.exitCode : 1;
    process.stderr.write(`Error: ${err?.message ?? String(err)}\n`);
    process.exit(code);
  }
}
