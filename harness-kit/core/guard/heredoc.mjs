/**
 * heredoc.mjs
 * Pure, dependency-free parser for shell heredocs, PowerShell here-strings, and
 * stdin-fed interpreter pipelines (`python3 - <<EOF`, `node <<EOF`, `bash -s <<EOF`,
 * `cat <<EOF | python3`, `echo "..." | bash`, `pwsh -Command -`, etc.).
 * Shared by guard-core.mjs (A1/A2) and telemetry.mjs (B2) without circular imports.
 */

const SIMPLE_WRAPPERS = new Set([
  "env",
  "sudo",
  "command",
  "builtin",
  "nohup",
  "time",
  "exec",
  "&",
  "if",
  "then",
  "elif",
  "else",
  "do",
  "while",
  "until",
  "!",
]);

const TIMEOUT_VALUE_FLAGS = new Set(["-k", "--kill-after", "-s", "--signal"]);
const XARGS_VALUE_FLAGS = new Set([
  "-i",
  "-l",
  "-n",
  "-p",
  "-s",
  "-d",
  "-e",
  "-a",
  "--replace",
  "--max-lines",
  "--max-args",
  "--max-procs",
  "--max-chars",
  "--delimiter",
  "--eof",
  "--arg-file",
]);
const STDBUF_VALUE_FLAGS = new Set(["-i", "-o", "-e", "--input", "--output", "--error"]);

/** Tokenize a single shell segment respecting single/double quotes and escapes. */
export function tokenizeSegment(seg) {
  const tokens = [];
  let cur = "";
  let inToken = false;
  let quote = null;
  const s = String(seg || "").trim().replace(/^\(+/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < s.length && (s[i + 1] === '"' || s[i + 1] === "\\" || s[i + 1] === "$" || s[i + 1] === "`")) {
        cur += s[++i];
        continue;
      }
      if (ch === '"') quote = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inToken = true;
      continue;
    }
    if (ch === "\\" && i + 1 < s.length && /[\s"'\\;|&<>()$`]/.test(s[i + 1])) {
      cur += s[++i];
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(cur);
        cur = "";
        inToken = false;
      }
      continue;
    }
    cur += ch;
    inToken = true;
  }
  if (inToken) tokens.push(cur);
  return tokens;
}

/**
 * Strip common command wrappers (`env`, `timeout`, `xargs`, `nice`, `stdbuf`, `npx`, `npm exec`,
 * `sudo`, `command`, `nohup`, `time`, `exec`, `&`, `KEY=val`, `$var =`, redirections)
 * and return the index of the wrapped command token.
 */
export function skipCommandWrappers(tokens) {
  let idx = 0;
  let guard = 0;
  while (idx < tokens.length && guard++ < 32) {
    const t = tokens[idx];
    const lower = t.toLowerCase();
    const base = lower.split(/[/\\]/).pop().replace(/\.exe$/i, "");

    if (SIMPLE_WRAPPERS.has(base)) {
      idx++;
      if (base === "env" || base === "sudo" || base === "command") {
        while (idx < tokens.length && tokens[idx].startsWith("-")) {
          if (base === "env" && (tokens[idx] === "-u" || tokens[idx] === "--unset" || tokens[idx] === "-C" || tokens[idx] === "--chdir")) {
            idx += 2;
          } else if (base === "sudo" && (tokens[idx] === "-u" || tokens[idx] === "-g" || tokens[idx] === "-C")) {
            idx += 2;
          } else {
            idx++;
          }
        }
      }
      continue;
    }

    if (base === "timeout") {
      idx++;
      while (idx < tokens.length && tokens[idx].startsWith("-")) {
        const flag = tokens[idx].toLowerCase();
        if (flag === "--") {
          idx++;
          break;
        }
        if (TIMEOUT_VALUE_FLAGS.has(flag)) idx += 2;
        else idx++;
      }
      // Skip duration positional argument (e.g., 60, 30s, 2m, 1.5h)
      if (idx < tokens.length && /^\d+(?:\.\d+)?[smhd]?$/i.test(tokens[idx])) idx++;
      continue;
    }

    if (base === "nice") {
      idx++;
      while (idx < tokens.length && tokens[idx].startsWith("-")) {
        const flag = tokens[idx].toLowerCase();
        if (flag === "--") {
          idx++;
          break;
        }
        if (flag === "-n" || flag === "--adjustment") idx += 2;
        else idx++;
      }
      continue;
    }

    if (base === "stdbuf") {
      idx++;
      while (idx < tokens.length && tokens[idx].startsWith("-")) {
        const flag = tokens[idx].toLowerCase();
        if (flag === "--") {
          idx++;
          break;
        }
        if (STDBUF_VALUE_FLAGS.has(flag)) idx += 2;
        else idx++;
      }
      continue;
    }

    if (base === "xargs") {
      idx++;
      while (idx < tokens.length && tokens[idx].startsWith("-")) {
        const flag = tokens[idx].toLowerCase();
        if (flag === "--") {
          idx++;
          break;
        }
        if (XARGS_VALUE_FLAGS.has(flag)) idx += 2;
        else idx++;
      }
      continue;
    }

    if (base === "npx" || base === "bunx" || base === "pnpx") {
      idx++;
      while (idx < tokens.length && tokens[idx].startsWith("-")) {
        const flag = tokens[idx].toLowerCase();
        if (flag === "--") {
          idx++;
          break;
        }
        if (flag === "-p" || flag === "--package" || flag === "--cache" || flag === "--userconfig") idx += 2;
        else idx++;
      }
      continue;
    }

    if (base === "npm" && idx + 1 < tokens.length) {
      let j = idx + 1;
      while (j < tokens.length && tokens[j].startsWith("-")) j++;
      const sub = (tokens[j] || "").toLowerCase();
      if (sub === "exec" || sub === "x") {
        idx = j + 1;
        while (idx < tokens.length && tokens[idx].startsWith("-")) {
          const flag = tokens[idx].toLowerCase();
          if (flag === "--") {
            idx++;
            break;
          }
          if (flag === "-p" || flag === "--package" || flag === "-w" || flag === "--workspace") idx += 2;
          else idx++;
        }
        continue;
      }
    }

    if (/^[A-Za-z_]\w*=/.test(t)) {
      idx++;
      continue;
    }
    if (/^\$[A-Za-z_][\w:]*$/.test(t) && tokens[idx + 1] === "=") {
      idx += 2;
      continue;
    }
    if (/^\d*[<>]/.test(t)) {
      idx += /^\d*[<>]+$/.test(t) ? 2 : 1;
      continue;
    }
    break;
  }
  return idx;
}

/**
 * Determine whether a shell segment is an interpreter that reads code from stdin
 * (e.g. `python3`, `python3 -`, `node`, `node -`, `bash`, `bash -s`, `sh -s`,
 * `pwsh -Command -`, `iex`, `Invoke-Expression`). Returns interpreter kind or null.
 */
export function classifyStdinInterpreter(seg) {
  const cleaned = String(seg || "").replace(/<<-?\s*(?:["']?[A-Za-z_]\w*["']?|\\[A-Za-z_]\w*)/g, " ");
  const tokens = tokenizeSegment(cleaned);
  const idx = skipCommandWrappers(tokens);
  if (idx >= tokens.length) return null;

  const bin = tokens[idx].split(/[/\\]/).pop().replace(/\.exe$/i, "").toLowerCase();
  const rest = tokens.slice(idx + 1);

  if (bin === "iex" || bin === "invoke-expression") return "pwsh";

  let kind = null;
  if (/^(ba|z|da)?sh$/.test(bin)) kind = "shell";
  else if (/^python(\d+(\.\d+)*)?$/.test(bin) || bin === "py") kind = "python";
  else if (/^(node(js)?|bun)$/.test(bin)) kind = "node";
  else if (bin === "perl") kind = "perl";
  else if (bin === "ruby") kind = "ruby";
  else if (bin === "pwsh" || bin === "powershell") kind = "pwsh";
  if (!kind) return null;

  if (kind === "pwsh") {
    // `pwsh -Command -`, `pwsh -c -`, `pwsh -`, or bare `pwsh` with no -File/-Command script
    for (let j = 0; j < rest.length; j++) {
      const t = rest[j];
      if (/^-(?:c|command)$/i.test(t)) {
        return rest[j + 1] === "-" ? "pwsh" : null;
      }
      if (/^-(?:f|file|e|ec|encodedcommand)$/i.test(t)) return null;
      if (t === "-") return "pwsh";
    }
    const positionals = rest.filter((t) => !t.startsWith("-") && !/^\d*[<>]/.test(t));
    return positionals.length === 0 ? "pwsh" : null;
  }

  // If inline `-c`/`-e` code is already provided, stdin is data, not the script.
  for (let j = 0; j < rest.length; j++) {
    const t = rest[j];
    if (t === "--") break;
    if (kind === "shell") {
      if (/^-[a-zA-Z]*c$/.test(t)) return null;
      if (/^-[a-zA-Z]*s[a-zA-Z]*$/.test(t)) return "shell";
    } else if (kind === "python") {
      if (/^-[a-zA-Z]*c/.test(t) || t === "-m") return null;
    } else if (kind === "node") {
      if (/^-(?:e|p|pe|ep)$/.test(t) || t === "--eval" || t === "--print" || t.startsWith("--eval=") || t.startsWith("--print=")) {
        return null;
      }
    } else if (kind === "perl" || kind === "ruby") {
      if (/^-[a-zA-Z]*[eE]/.test(t)) return null;
    }
  }

  // Filter out flags and redirections to find the first script operand (if any).
  const positionals = [];
  for (let j = 0; j < rest.length; j++) {
    const t = rest[j];
    if (/^\d*[<>]+$/.test(t)) {
      j++;
      continue;
    }
    if (/^\d*[<>]/.test(t)) continue;
    if (t === "-") {
      positionals.push("-");
      break;
    }
    if (t.startsWith("-")) continue;
    positionals.push(t);
    break;
  }

  if (positionals.length === 0 || positionals[0] === "-") return kind;
  return null;
}

/** Split a single line/command into pipeline segments (`|` outside quotes, ignoring `||`). */
function splitPipesInClause(clause) {
  const parts = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < clause.length; i++) {
    const ch = clause[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < clause.length) {
        cur += ch + clause[++i];
        continue;
      }
      if (ch === '"') quote = null;
      cur += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < clause.length) {
      cur += ch + clause[++i];
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "|") {
      if (clause[i + 1] === "|") {
        cur += "||";
        i++;
        continue;
      }
      parts.push(cur);
      cur = "";
      if (clause[i + 1] === "&") i++;
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** Split a line into top-level `;` / `&&` / `||` clauses (keeping pipes inside each clause). */
function splitClausesOnLine(line) {
  const clauses = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < line.length) {
        cur += ch + line[++i];
        continue;
      }
      if (ch === '"') quote = null;
      cur += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < line.length) {
      cur += ch + line[++i];
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === ";" || (ch === "&" && line[i + 1] === "&") || (ch === "|" && line[i + 1] === "|")) {
      clauses.push(cur);
      cur = "";
      if (ch !== ";") i++;
      continue;
    }
    cur += ch;
  }
  clauses.push(cur);
  return clauses;
}

const HEREDOC_OPEN_RE = /<<-?\s*(?:(["'])([A-Za-z_]\w*)\1|\\?([A-Za-z_]\w*))/y;

/** `‹heredoc: N líneas›` placeholder (singular for one line). */
export function heredocLabel(n) {
  return `‹heredoc: ${n} ${n === 1 ? "línea" : "líneas"}›`;
}

/**
 * Split a header line once into clauses and pipe segments with their offsets, so every `<<` on the
 * line is classified without re-tokenizing the line (linear in the number of `<<`).
 */
function buildHeaderLineIndex(headerLine) {
  const clauses = [];
  let pos = 0;
  for (const c of splitClausesOnLine(headerLine)) {
    const start = headerLine.indexOf(c, pos);
    const end = start + c.length;
    const parts = [];
    let ppos = 0;
    for (const p of splitPipesInClause(c)) {
      const ps = c.indexOf(p, ppos);
      parts.push({ text: p, start: start + ps, end: start + ps + p.length, kind: undefined });
      ppos = ps + p.length;
    }
    clauses.push({ start, end, parts });
    pos = end;
  }
  return clauses;
}

function cachedStdinKind(part) {
  if (part.kind === undefined) part.kind = classifyStdinInterpreter(part.text);
  return part.kind;
}

/**
 * Given a header line index and the character offset where `<<DELIM` starts, determine whether
 * that heredoc feeds an interpreter directly (`python3 - <<EOF`, `bash <<EOF`) or via pipe
 * (`cat <<EOF | python3`, `cat <<EOF | sh`). Returns interpreter kind or null (data heredoc).
 */
function classifyHeredocConsumer(lineIndex, heredocOffset) {
  const clause = lineIndex.find((c) => heredocOffset >= c.start && heredocOffset <= c.end) || lineIndex[0];
  if (!clause || clause.parts.length === 0) return null;
  let segIdx = clause.parts.findIndex((p) => heredocOffset >= p.start && heredocOffset < p.end);
  if (segIdx < 0) segIdx = 0;

  const directKind = cachedStdinKind(clause.parts[segIdx]);
  if (directKind) return directKind;

  // Piped to an interpreter (`cat <<EOF | python3`, `cat <<EOF | bash`)
  if (clause.parts.length > segIdx + 1) {
    const nextKind = cachedStdinKind(clause.parts[segIdx + 1]);
    if (nextKind) return nextKind;
  }

  return null;
}

/**
 * Index just past an arithmetic expansion/command (`$((…))` or `((…))`) starting at `i`, or -1 when
 * `line[i]` does not open one. `<<` inside it is a shift operator, never a heredoc (R2).
 */
function skipArithmetic(line, i) {
  let j;
  if (line[i] === "$" && line[i + 1] === "(" && line[i + 2] === "(") j = i + 3;
  else if (line[i] === "(" && line[i + 1] === "(" && (i === 0 || /[\s;&|(!]/.test(line[i - 1]))) j = i + 2;
  else return -1;
  let depth = 2;
  for (; j < line.length; j++) {
    if (line[j] === "(") depth++;
    else if (line[j] === ")" && --depth === 0) return j + 1;
  }
  return line.length;
}

/**
 * Kind of interpreter that receives a PowerShell here-string opened at the end of `prefix` as its
 * code argument (`iex @'`, `Invoke-Expression @'`, `pwsh -Command @'`, `bash -c @'`, `python -c @'`,
 * `node -e @'`, `cmd /c @'`), or null when the here-string is data.
 */
function classifyHereStringArgConsumer(prefix) {
  const clauses = splitClausesOnLine(prefix);
  const parts = splitPipesInClause(clauses[clauses.length - 1] || "");
  const tokens = tokenizeSegment(parts[parts.length - 1] || "");
  const idx = skipCommandWrappers(tokens);
  if (idx >= tokens.length) return null;
  const bin = tokens[idx].split(/[/\\]/).pop().replace(/\.exe$/i, "").toLowerCase();
  const last = tokens[tokens.length - 1];
  if (bin === "iex" || bin === "invoke-expression") return "pwsh";
  if (tokens.length - 1 === idx) return null;
  if (bin === "cmd" && /^\/[ck]$/i.test(last)) return "shell";
  if ((bin === "pwsh" || bin === "powershell") && /^-(?:c|command)$/i.test(last)) return "pwsh";
  if (/^(ba|z|da)?sh$/.test(bin) && /^-[a-zA-Z]*c$/.test(last)) return "shell";
  if ((/^python(\d+(\.\d+)*)?$/.test(bin) || bin === "py") && /^-[a-zA-Z]*c$/.test(last)) return "python";
  if (/^(node(js)?|bun)$/.test(bin) && /^(?:-e|-p|--eval|--print)$/.test(last)) return "node";
  if (bin === "perl" && /^-[a-zA-Z]*[eE]$/.test(last)) return "perl";
  if (bin === "ruby" && /^-[a-zA-Z]*e$/.test(last)) return "ruby";
  return null;
}

function escapeForDoubleQuotes(s) {
  return s.replace(/[\\"$`]/g, (c) => `\\${c}`);
}

/**
 * R1: inline `$(cat <<DELIM … DELIM)` command substitutions with their heredoc body, so the body is
 * evaluated where the substitution is used: as the program of `bash -c "$(…)"` / `sh -c` / `eval`,
 * or as a command when the substitution stands in command position. Inside double quotes the body
 * stays a double-quoted literal (e.g. `git commit -m "$(cat <<'EOF' … EOF)"` is still data).
 */
export function inlineHeredocSubstitutions(cmd) {
  const s = String(cmd || "");
  if (!s.includes("$(") || !s.includes("<<")) return s;
  const headRe = /^\s*cat\s*<<(-?)\s*(?:(["'])([A-Za-z_]\w*)\2|\\?([A-Za-z_]\w*))[ \t]*\r?\n/;
  let out = "";
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      out += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < s.length) {
      out += ch + s[++i];
      continue;
    }
    if (quote === '"' && ch === '"') {
      quote = null;
      out += ch;
      continue;
    }
    if (!quote && (ch === "'" || ch === '"')) {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "$" && s[i + 1] === "(" && s[i + 2] !== "(") {
      const rest = s.slice(i + 2);
      const m = rest.match(headRe);
      if (m) {
        const delim = m[3] || m[4];
        const lines = rest.slice(m[0].length).split("\n");
        const body = [];
        let consumed = m[0].length;
        let closed = false;
        for (const raw of lines) {
          consumed += raw.length + 1;
          const line = raw.replace(/\r$/, "");
          if ((m[1] ? line.replace(/^\t+/, "") : line).trim() === delim) {
            closed = true;
            break;
          }
          body.push(line);
        }
        const after = closed ? rest.slice(consumed - 1).match(/^\n?\s*\)/) : null;
        if (after) {
          const escaped = escapeForDoubleQuotes(body.join("\n"));
          if (quote === '"') out += escaped;
          else if (/(^|[;&|(\n{]|\b(?:then|do|else))\s*$/.test(out)) out += `eval "${escaped}"`;
          else out += `"${escaped}"`;
          i = i + 2 + consumed - 1 + after[0].length - 1;
          continue;
        }
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Parse shell heredocs and PowerShell here-strings line by line.
 * Returns:
 * - `records`: array of `{ kind, isInterpreter, delim, body, lineCount, closed, isPsHereString }`
 * - `strippedAll`: command with ALL heredoc/here-string bodies removed
 * - `compactedData`: command with DATA heredoc/here-string bodies replaced by `‹heredoc: N líneas›`
 *   and INTERPRETER heredoc bodies preserved
 */
export function parseHeredocs(cmd) {
  const lines = String(cmd || "").split(/\r?\n/);
  const records = [];
  const strippedAllLines = [];
  const compactedLines = [];

  const pending = []; // { delim, kind, isInterpreter, bodyLines }
  let psHere = null; // { quote, bodyLines }

  for (const line of lines) {
    if (psHere !== null) {
      const closeRe = new RegExp(`^${psHere.quote}@(.*)$`);
      const cm = line.match(closeRe);
      if (cm) {
        const trailing = cm[1] || "";
        let kind = null;
        const pipeParts = splitPipesInClause(trailing);
        if (psHere.argKind) {
          kind = psHere.argKind;
        } else if (pipeParts.length > 1) {
          kind = classifyStdinInterpreter(pipeParts[1]);
        }
        const isInterpreter = kind !== null;
        const body = psHere.bodyLines.join("\n");
        const lineCount = psHere.bodyLines.length;
        records.push({ kind, isInterpreter, delim: `${psHere.quote}@`, body, lineCount, closed: true, isPsHereString: true });
        if (isInterpreter) {
          compactedLines.push(...psHere.bodyLines, line);
        } else {
          compactedLines.push(heredocLabel(lineCount), line);
        }
        if (trailing.trim()) strippedAllLines.push(trailing.trim());
        psHere = null;
      } else {
        psHere.bodyLines.push(line);
      }
      continue;
    }

    if (pending.length > 0) {
      const cur = pending[0];
      if (line.trim() === cur.delim) {
        pending.shift();
        const body = cur.bodyLines.join("\n");
        const lineCount = cur.bodyLines.length;
        records.push({
          kind: cur.kind,
          isInterpreter: cur.isInterpreter,
          delim: cur.delim,
          body,
          lineCount,
          closed: true,
          isPsHereString: false,
        });
        if (cur.isInterpreter) {
          compactedLines.push(...cur.bodyLines, line);
        } else {
          compactedLines.push(heredocLabel(lineCount), line);
        }
      } else {
        cur.bodyLines.push(line);
      }
      continue;
    }

    // Scan header line outside quotes for `<<[-]?['"]?WORD['"]?` (not `<<<`) or trailing `@'` / `@"`
    let quote = null;
    let lineIndex = null;
    let psOpen = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote === "'") {
        if (ch === "'") quote = null;
        continue;
      }
      if (quote === '"') {
        if (ch === "\\" && i + 1 < line.length) {
          i++;
          continue;
        }
        if (ch === '"') quote = null;
        continue;
      }
      if (ch === "\\" && i + 1 < line.length) {
        i++;
        continue;
      }
      // PowerShell here-string opener `@'` / `@"` at the end of the line (B2/R3)
      if (ch === "@" && (line[i + 1] === "'" || line[i + 1] === '"') && /^[ \t]*$/.test(line.slice(i + 2))) {
        psOpen = { quote: line[i + 1], at: i };
        break;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        continue;
      }
      if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;

      // R2: `<<` inside `$((…))` / `((…))` is a shift operator, not a heredoc.
      if (ch === "$" || ch === "(") {
        const end = skipArithmetic(line, i);
        if (end >= 0) {
          i = end - 1;
          continue;
        }
      }

      if (ch === "<" && line[i + 1] === "<" && line[i + 2] !== "<") {
        HEREDOC_OPEN_RE.lastIndex = i;
        const m = HEREDOC_OPEN_RE.exec(line);
        if (m) {
          const delim = m[2] || m[3];
          if (!lineIndex) lineIndex = buildHeaderLineIndex(line);
          const kind = classifyHeredocConsumer(lineIndex, i);
          pending.push({ delim, kind, isInterpreter: kind !== null, bodyLines: [] });
          i += m[0].length - 1;
        }
      }
    }

    if (psOpen && pending.length === 0) {
      psHere = { quote: psOpen.quote, bodyLines: [], argKind: classifyHereStringArgConsumer(line.slice(0, psOpen.at)) };
    }

    strippedAllLines.push(line);
    compactedLines.push(line);
  }

  // Handle unclosed (e.g. truncated) heredocs or here-strings
  if (psHere !== null) {
    const lineCount = psHere.bodyLines.length;
    records.push({
      kind: null,
      isInterpreter: false,
      delim: `${psHere.quote}@`,
      body: psHere.bodyLines.join("\n"),
      lineCount,
      closed: false,
      isPsHereString: true,
    });
    compactedLines.push(heredocLabel(lineCount));
  }
  for (const cur of pending) {
    const lineCount = cur.bodyLines.length;
    records.push({
      kind: cur.kind,
      isInterpreter: cur.isInterpreter,
      delim: cur.delim,
      body: cur.bodyLines.join("\n"),
      lineCount,
      closed: false,
      isPsHereString: false,
    });
    if (cur.isInterpreter) {
      compactedLines.push(...cur.bodyLines);
    } else {
      compactedLines.push(heredocLabel(lineCount));
    }
  }

  return {
    records,
    strippedAll: strippedAllLines.join("\n"),
    compactedData: compactedLines.join("\n"),
  };
}

/**
 * Compact DATA heredoc/here-string bodies to `‹heredoc: N líneas›` while keeping
 * interpreter heredoc bodies intact (B2).
 */
export function compactDataHeredocs(cmd) {
  return parseHeredocs(cmd).compactedData;
}

/**
 * Extract all stdin-fed interpreter code bodies from a shell command:
 * 1. Heredocs / PowerShell here-strings feeding an interpreter (`python3 - <<EOF`, `node <<EOF`, `bash -s <<EOF`, `cat <<EOF | python3`).
 * 2. Pipes from `echo`/`printf`/`Write-Output` into an interpreter (`echo "gh pr create --fill" | bash`, `printf '...' | python3`, `Write-Output '...' | iex`).
 * 3. Bash here-strings (`bash <<< "gh pr create --fill"`).
 * 4. Bare string literals piped into an interpreter (`"gh pr create" | pwsh -Command -`, `'…' | python -`, `"…" | iex`).
 * @returns {Array<{ kind: string, code: string }>}
 */
export function extractStdinInterpreterInvocations(cmd) {
  const parsed = parseHeredocs(cmd);
  const invocations = [];

  for (const r of parsed.records) {
    if (r.isInterpreter && r.body.trim()) {
      invocations.push({ kind: r.kind, code: r.body });
    }
  }

  // Scan top-level clauses (after stripping heredoc bodies) for `echo/printf/Write-Output ... | <interp>` and `<interp> <<< "..."`
  for (const rawLine of parsed.strippedAll.split(/\r?\n/)) {
    for (const clause of splitClausesOnLine(rawLine)) {
      const pipeParts = splitPipesInClause(clause);
      for (let i = 0; i < pipeParts.length; i++) {
        const part = pipeParts[i];
        // Here-string: `bash <<< "cmd"` or `python3 - <<< 'code'`
        const hsIdx = findUnquotedHereString(part);
        if (hsIdx >= 0) {
          const left = part.slice(0, hsIdx);
          const right = part.slice(hsIdx + 3).trim();
          const kind = classifyStdinInterpreter(left);
          if (kind && right) {
            const rhsTokens = tokenizeSegment(right);
            if (rhsTokens.length > 0) invocations.push({ kind, code: rhsTokens[0] });
          }
        }

        // Pipe into interpreter: `echo "..." | bash`, `printf '...' | python3`, `Write-Output "..." | iex`
        if (i + 1 < pipeParts.length) {
          const nextKind = classifyStdinInterpreter(pipeParts[i + 1]);
          if (nextKind) {
            const producerTokens = tokenizeSegment(part);
            // R3: a bare string literal is a PowerShell producer (`"gh pr create" | pwsh -Command -`, `'…' | python -`, `"…" | iex`)
            if (producerTokens.length === 1 && /^\s*(["'])[\s\S]*\1\s*$/.test(part)) {
              if (producerTokens[0].trim()) invocations.push({ kind: nextKind, code: producerTokens[0] });
              continue;
            }
            const pIdx = skipCommandWrappers(producerTokens);
            const pBin = (producerTokens[pIdx] || "").split(/[/\\]/).pop().replace(/\.exe$/i, "").toLowerCase();
            if (pBin === "echo" || pBin === "printf" || pBin === "write-output") {
              const args = [];
              for (let j = pIdx + 1; j < producerTokens.length; j++) {
                const t = producerTokens[j];
                if (pBin === "echo" && /^-[neE]+$/.test(t) && args.length === 0) continue;
                if (pBin === "write-output" && /^-inputobject$/i.test(t) && args.length === 0) continue;
                args.push(t);
              }
              const payload = args.join(" ").trim();
              if (payload) invocations.push({ kind: nextKind, code: payload });
            }
          }
        }
      }
    }
  }

  return invocations;
}

function findUnquotedHereString(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < s.length) {
        i++;
        continue;
      }
      if (ch === '"') quote = null;
      continue;
    }
    if (ch === "\\" && i + 1 < s.length) {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "<" && s[i + 1] === "<" && s[i + 2] === "<") return i;
  }
  return -1;
}
