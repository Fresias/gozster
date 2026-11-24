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

/**
 * Given a header line and the character offset where `<<DELIM` starts, determine whether
 * that heredoc feeds an interpreter directly (`python3 - <<EOF`, `bash <<EOF`) or via pipe
 * (`cat <<EOF | python3`, `cat <<EOF | sh`). Returns interpreter kind or null (data heredoc).
 */
function classifyHeredocConsumer(headerLine, heredocOffset) {
  // Find which `;`/`&&`/`||` clause contains heredocOffset
  const clauses = splitClausesOnLine(headerLine);
  let pos = 0;
  let targetClause = headerLine;
  for (const c of clauses) {
    const start = headerLine.indexOf(c, pos);
    const end = start + c.length;
    if (heredocOffset >= start && heredocOffset <= end) {
      targetClause = c;
      break;
    }
    pos = end;
  }

  const pipeParts = splitPipesInClause(targetClause);
  // Find the pipe segment containing the heredoc marker
  let segIdx = 0;
  for (let i = 0; i < pipeParts.length; i++) {
    if (/<<-?\s*(?:["']?[A-Za-z_]\w*["']?|\\[A-Za-z_]\w*)/.test(pipeParts[i])) {
      segIdx = i;
      break;
    }
  }

  const directKind = classifyStdinInterpreter(pipeParts[segIdx]);
  if (directKind) return directKind;

  // Check if piped to an interpreter (`cat <<EOF | python3`, `cat <<EOF | bash`)
  if (pipeParts.length > segIdx + 1) {
    // Only if this segment does not redirect stdout to a file (ignoring stderr 2>)
    const nextKind = classifyStdinInterpreter(pipeParts[segIdx + 1]);
    if (nextKind) return nextKind;
  }

  return null;
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
        if (pipeParts.length > 1) {
          kind = classifyStdinInterpreter(pipeParts[1]);
        }
        const isInterpreter = kind !== null;
        const body = psHere.bodyLines.join("\n");
        const lineCount = psHere.bodyLines.length;
        records.push({ kind, isInterpreter, delim: `${psHere.quote}@`, body, lineCount, closed: true, isPsHereString: true });
        if (isInterpreter) {
          compactedLines.push(...psHere.bodyLines, line);
        } else {
          compactedLines.push(`‹heredoc: ${lineCount} líneas›`, line);
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
          compactedLines.push(`‹heredoc: ${lineCount} líneas›`, line);
        }
      } else {
        cur.bodyLines.push(line);
      }
      continue;
    }

    // Scan header line outside quotes for `<<[-]?['"]?WORD['"]?` (not `<<<`) or trailing `@'` / `@"`
    let quote = null;
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
      if (ch === "'" || ch === '"') {
        quote = ch;
        continue;
      }
      if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;

      if (ch === "<" && line[i + 1] === "<" && line[i + 2] !== "<") {
        const m = line.slice(i).match(/^<<-?\s*(?:(["'])([A-Za-z_]\w*)\1|\\?([A-Za-z_]\w*))/);
        if (m) {
          const delim = m[2] || m[3];
          const kind = classifyHeredocConsumer(line, i);
          pending.push({ delim, kind, isInterpreter: kind !== null, bodyLines: [] });
          i += m[0].length - 1;
        }
      }
    }

    if (!quote && pending.length === 0) {
      const psMatch = line.match(/@(['"])[ \t]*$/);
      if (psMatch) {
        psHere = { quote: psMatch[1], bodyLines: [] };
      }
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
    compactedLines.push(`‹heredoc: ${lineCount} líneas›`);
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
      compactedLines.push(`‹heredoc: ${lineCount} líneas›`);
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
