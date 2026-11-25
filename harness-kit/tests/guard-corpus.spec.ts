import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// @ts-expect-error - mjs module
import { checkGuard, classifyNativeRead, detectGhPrCommands, evaluateRules } from "../core/guard/guard-core.mjs";
// @ts-expect-error - mjs module
import { compactDataHeredocs, extractStdinInterpreterInvocations, parseHeredocs } from "../core/guard/heredoc.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const antigravityPreShellFixture = JSON.parse(
  readFileSync(path.join(here, "fixtures", "antigravity", "pre-shell.json"), "utf8"),
);
const claudePreShellFixture = JSON.parse(
  readFileSync(path.join(here, "fixtures", "claude-code", "pre-shell.json"), "utf8"),
);

type RuntimeKind = "cc-bash" | "cc-pwsh" | "antigravity";

interface CorpusCase {
  label: string;
  cmd: string;
  runtime: RuntimeKind;
  expectAllowed: boolean;
  expectRule?: string;
  useNonAuthRepo?: boolean;
}

function makePayload(cmd: string, runtime: RuntimeKind) {
  if (runtime === "antigravity") {
    return {
      ...antigravityPreShellFixture,
      toolCall: {
        ...antigravityPreShellFixture.toolCall,
        args: {
          ...antigravityPreShellFixture.toolCall.args,
          CommandLine: cmd,
        },
      },
    };
  }
  return {
    ...claudePreShellFixture,
    tool_name: runtime === "cc-pwsh" ? "PowerShell" : "Bash",
    tool_input: {
      ...claudePreShellFixture.tool_input,
      command: cmd,
    },
  };
}

let nonAuthRepo = "";
let bigFile = "";
let smallFile = "";

beforeAll(() => {
  nonAuthRepo = realpathSync(mkdtempSync(path.join(tmpdir(), "guard-corpus-")));
  execFileSync("git", ["init", "-q", "-b", "feature/123-demo"], { cwd: nonAuthRepo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: nonAuthRepo });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: nonAuthRepo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/Fresias/gozster.git"], { cwd: nonAuthRepo });

  bigFile = path.join(nonAuthRepo, "big-2067.ts");
  writeFileSync(bigFile, `${Array.from({ length: 2067 }, (_, i) => `export const line${i} = ${i};`).join("\n")}\n`, "utf8");
  smallFile = path.join(nonAuthRepo, "small.ts");
  writeFileSync(smallFile, "export const ok = 1;\n", "utf8");
});

afterAll(() => {
  if (nonAuthRepo) rmSync(nonAuthRepo, { recursive: true, force: true });
});

const TOOL_RESULTS = "~/.claude/projects/gozster/tool-results/toolu_01abc.txt";

// ───────────────────────────── A1: Detector de PR ─────────────────────────────

const A1_BLOCK_CASES: CorpusCase[] = [
  // Regresiones de #653
  { label: "timeout 60 gh pr create", cmd: "timeout 60 gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "timeout -k 5 60 gh pr create", cmd: "timeout -k 5 60 gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "timeout -s TERM 60 gh pr create", cmd: "timeout -s TERM 60 gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "npx gh pr create", cmd: "npx gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "npx -y gh pr create", cmd: "npx -y gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "npm exec -- gh pr create", cmd: "npm exec -- gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "xargs gh pr create", cmd: "echo x | xargs gh pr create --title", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "xargs -I{} gh pr create", cmd: "echo x | xargs -I{} gh pr create --title {}", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "nice -n 5 gh pr create", cmd: "nice -n 5 gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "stdbuf -oL gh pr create", cmd: "stdbuf -oL gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "cmd /c gh pr create (unquoted)", cmd: "cmd /c gh pr create --fill", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "timeout 60 gh pr merge", cmd: "timeout 60 gh pr merge 12 --squash", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.merge-check" },
  { label: "npx gh pr merge", cmd: "npx gh pr merge 12", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.merge-check" },
  { label: "bash heredoc gh pr create", cmd: "bash <<'EOF'\ngh pr create --fill\nEOF", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },

  // Huecos preexistentes
  { label: 'eval "gh pr create"', cmd: 'eval "gh pr create --fill"', runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'echo "gh pr create" | bash', cmd: 'echo "gh pr create --fill" | bash', runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "cat heredoc | sh gh pr create", cmd: "cat <<'EOF' | sh\ngh pr create --fill\nEOF", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'cmd.exe /c "gh pr create" (quoted)', cmd: 'cmd.exe /c "gh pr create --fill"', runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'Invoke-Expression "gh pr create"', cmd: 'Invoke-Expression "gh pr create --fill"', runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'iex "gh pr create"', cmd: 'iex "gh pr create --fill"', runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "Start-Process gh -ArgumentList", cmd: "Start-Process gh -ArgumentList 'pr','create','--fill' -Wait", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "gh api -X POST pulls", cmd: "gh api -X POST repos/Fresias/gozster/pulls -f title=x -f head=b -f base=main", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "gh api implicit POST pulls", cmd: "gh api repos/{owner}/{repo}/pulls -f title=x -f head=b -f base=main", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "safety net unknown wrapper create", cmd: "setsid gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "safety net unknown wrapper merge", cmd: "setsid gh pr merge 12 --squash", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.merge-check" },

  // Casos ya cubiertos (no-regresión)
  { label: "gh pr create --body-file", cmd: "gh pr create --title x --body-file ../pr.md", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'URL="$(gh pr create)"', cmd: 'URL="$(gh pr create --fill)"', runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "URL=$(gh pr create)", cmd: "URL=$(gh pr create --fill)", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "URL=`gh pr create`", cmd: "URL=`gh pr create --fill`", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'bash -c "gh pr create"', cmd: 'bash -c "gh pr create --fill"', runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "sh -c 'gh pr create'", cmd: "sh -c 'gh pr create --fill'", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'bash -lc "gh pr create"', cmd: 'bash -lc "gh pr create --fill"', runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'bash -e -c "gh pr create"', cmd: 'bash -e -c "gh pr create --fill"', runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "/usr/bin/gh pr create", cmd: "/usr/bin/gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "gh -R Fresias/gozster pr create", cmd: "gh -R Fresias/gozster pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'pwsh -Command "gh pr create"', cmd: 'pwsh -Command "gh pr create --fill"', runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'powershell -NoProfile -Command "gh pr create"', cmd: 'powershell -NoProfile -Command "gh pr create --fill"', runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "& gh pr create", cmd: "& gh pr create --fill", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: '& "gh" pr create', cmd: '& "gh" pr create --fill', runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "& 'C:\\Program Files\\GitHub CLI\\gh.exe' pr create", cmd: "& 'C:\\Program Files\\GitHub CLI\\gh.exe' pr create --fill", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "$url = gh pr create", cmd: "$url = gh pr create --fill", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "Antigravity gh pr create", cmd: "gh pr create --fill", runtime: "antigravity", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "Antigravity Set-Location; gh pr create", cmd: "Set-Location gozster; gh pr create --fill", runtime: "antigravity", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "git push && gh pr create", cmd: "git push -u origin x && gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "GH_TOKEN=x gh pr create", cmd: "GH_TOKEN=x gh pr create --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "(gh pr create)", cmd: "(gh pr create --fill)", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "gh pr merge 12 --squash", cmd: "gh pr merge 12 --squash", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.merge-check" },
  { label: "gh pr merge 12 --auto --squash", cmd: "gh pr merge 12 --auto --squash", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.merge-check" },
  { label: 'R="$(gh pr merge 12)"', cmd: 'R="$(gh pr merge 12 --squash)"', runtime: "cc-bash", expectAllowed: false, expectRule: "pr.merge-check" },
  { label: "gh api -X PUT pulls/12/merge", cmd: "gh api -X PUT repos/Fresias/gozster/pulls/12/merge", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.merge-check" },
  // Ronda 2 — R1: heredoc dentro de `$(…)` usado como programa
  { label: 'R1 bash -c "$(cat <<EOF gh pr create)"', cmd: "bash -c \"$(cat <<'EOF'\ngh pr create --fill\nEOF\n)\"", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'R1 sh -c "$(cat <<EOF gh pr merge)"', cmd: "sh -c \"$(cat <<'EOF'\ngh pr merge 12 --squash\nEOF\n)\"", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.merge-check" },
  { label: 'R1 eval "$(cat <<EOF gh pr create)"', cmd: "eval \"$(cat <<'EOF'\ngh pr create --fill\nEOF\n)\"", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "R1 $(cat <<EOF gh pr create) suelto", cmd: "$(cat <<'EOF'\ngh pr create --fill\nEOF\n)", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'R1 bash -c "$(cat <<-EOF con tabs)"', cmd: "bash -c \"$(cat <<-EOF\n\tgh pr create --fill\n\tEOF\n)\"", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  // Ronda 2 — R2: `<<` aritmético no abre heredoc
  { label: "R2 x=$((1<<EOF)) + gh pr create", cmd: "x=$((1<<EOF))\ngh pr create --fill\nEOF", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "R2 echo $((1<<EOF)) + gh pr create", cmd: "echo $((1<<EOF))\ngh pr create --fill\nEOF", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "R2 (( y = 1<<EOF )) + gh pr create", cmd: "(( y = 1<<EOF ))\ngh pr create --fill\nEOF", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "R2 aritmética antes de un heredoc real a bash", cmd: "echo $((1<<2)); cat <<'EOF' | bash\ngh pr create --fill\nEOF", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  // Ronda 2 — R3: here-strings y literales de PowerShell canalizados a un intérprete
  { label: "R3 @'…'@ | pwsh -Command -", cmd: "@'\ngh pr create --fill\n'@ | pwsh -Command -", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "R3 @'…'@ | pwsh -Command - (Antigravity)", cmd: "@'\ngh pr create --fill\n'@ | pwsh -Command -", runtime: "antigravity", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'R3 @"…"@ | iex', cmd: "@\"\ngh pr create --fill\n\"@ | iex", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "R3 iex @'…'@", cmd: "iex @'\ngh pr create --fill\n'@", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "R3 pwsh -Command @'…'@", cmd: "pwsh -Command @'\ngh pr create --fill\n'@", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: 'R3 "gh pr create" | pwsh -Command -', cmd: '"gh pr create --fill" | pwsh -Command -', runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  // Ronda 2 — recomendados de QA
  { label: "gh pr new (alias de create)", cmd: "gh pr new --fill", runtime: "cc-bash", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "start gh -ArgumentList (alias de Start-Process)", cmd: "start gh -ArgumentList 'pr','create','--fill'", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "Start-Process gh con -ArgumentList posicional", cmd: "Start-Process gh 'pr','create','--fill'", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "Start-Process gh posicional con espacios tras comas", cmd: "Start-Process gh 'pr', 'create', '--fill' -Wait", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "start gh posicional con espacios tras comas", cmd: "start gh 'pr', 'create', '--fill'", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: "R3 @'…'@ | pwsh -Command - ; echo done", cmd: "@'\ngh pr create --fill\n'@ | pwsh -Command - ; echo done", runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
  { label: '"gh pr create" | iex', cmd: '"gh pr create --fill" | iex', runtime: "cc-pwsh", expectAllowed: false, expectRule: "pr.requires-seal" },
];

const A1_ALLOW_CASES: CorpusCase[] = [
  { label: 'echo "gh pr create"', cmd: 'echo "no uses gh pr create a mano"', runtime: "cc-bash", expectAllowed: true },
  { label: 'Write-Output "gh pr create"', cmd: 'Write-Output "no uses gh pr create a mano"', runtime: "cc-pwsh", expectAllowed: true },
  { label: 'git commit -m "...gh pr create..."', cmd: 'git commit -m "docs: usar harness-ship en lugar de gh pr create a mano"', runtime: "cc-bash", expectAllowed: true },
  { label: "cat > ../pr.md heredoc with gh pr create", cmd: "cat > ../pr.md <<'EOF'\nUsar harness-ship en lugar de gh pr create --fill\nEOF", runtime: "cc-bash", expectAllowed: true },
  { label: "PS here-string | Set-Content with gh pr create", cmd: "@'\nUsar harness-ship en lugar de gh pr create --fill\n'@ | Set-Content ../pr.md", runtime: "cc-pwsh", expectAllowed: true },
  { label: 'echo "gh pr merge 12"', cmd: 'echo "no hagas gh pr merge 12"', runtime: "cc-bash", expectAllowed: true },
  { label: "rg pattern gh pr create|edit", cmd: 'rg -n "gh pr create|gh pr edit" harness-kit', runtime: "cc-bash", expectAllowed: true },
  { label: "Select-String pattern gh pr create", cmd: 'Select-String -Path AGENTS.md -Pattern "gh pr create"', runtime: "cc-pwsh", expectAllowed: true },
  { label: 'grep -n "a\\|gh pr create |" f.md', cmd: 'grep -n "a\\|gh pr create |" f.md', runtime: "cc-bash", expectAllowed: true },
  { label: "harness-ship.mjs", cmd: 'node harness-kit/core/scripts/harness-ship.mjs --lesson "x" --title "t" --body-file ../pr.md', runtime: "cc-bash", expectAllowed: true },
  { label: "gh api -X PATCH pulls/12", cmd: "gh api -X PATCH repos/{owner}/{repo}/pulls/12 -F body=@../pr.md", runtime: "cc-bash", expectAllowed: true },
  { label: "gh pr view 12", cmd: "gh pr view 12 --json state", runtime: "cc-bash", expectAllowed: true },
  { label: "gh api GET pulls/12", cmd: "gh api repos/Fresias/gozster/pulls/12", runtime: "cc-bash", expectAllowed: true },
  { label: "gh api GET pulls list", cmd: "gh api repos/Fresias/gozster/pulls", runtime: "cc-bash", expectAllowed: true },
  // Ronda 2 — negativos que siguen permitidos
  { label: 'R1 git commit -m "$(cat <<EOF … gh pr create … EOF)"', cmd: "git commit -m \"$(cat <<'EOF'\ndocs: usar harness-ship, no gh pr create --fill\nEOF\n)\"", runtime: "cc-bash", expectAllowed: true },
  { label: "R1 x=$(cat <<EOF gh pr create) (asignación de datos)", cmd: "x=$(cat <<'EOF'\ngh pr create --fill\nEOF\n)", runtime: "cc-bash", expectAllowed: true },
  { label: "R2 echo $((1<<2))", cmd: "echo $((1<<2))", runtime: "cc-bash", expectAllowed: true },
  { label: 'R3 $body = @"…gh pr create…"@', cmd: '$body = @"\nUsar harness-ship, no gh pr create --fill\n"@', runtime: "cc-pwsh", expectAllowed: true },
  { label: "R3 @'…'@ | Out-File (Antigravity)", cmd: "@'\nUsar harness-ship, no gh pr create --fill\n'@ | Out-File ../pr.md", runtime: "antigravity", expectAllowed: true },
  { label: "R3 'gh pr create' | Out-File", cmd: "'gh pr create --fill' | Out-File ../x.txt", runtime: "cc-pwsh", expectAllowed: true },
  { label: "R3 @'…gh pr create…'@ ; echo hi | bash (here-string de datos + otra cláusula)", cmd: "@'\nUsar harness-ship, no gh pr create --fill\n'@ ; echo hi | bash", runtime: "cc-pwsh", expectAllowed: true },
  { label: 'echo "gh pr new"', cmd: 'echo "no uses gh pr new"', runtime: "cc-bash", expectAllowed: true },
  { label: "start notepad", cmd: "start notepad", runtime: "cc-pwsh", expectAllowed: true },
  { label: "Start-Process notepad posicional", cmd: "Start-Process notepad 'a.txt'", runtime: "cc-pwsh", expectAllowed: true },
];

// ───────────────────────────── A2: Intérpretes por stdin ─────────────────────────────

const A2_CASES: CorpusCase[] = [
  {
    label: "python3 - heredoc -> harness.authorized-only",
    cmd: "python3 - <<'EOF'\nopen(\"harness-kit/core/guard/rules.json\",\"w\").write(\"x\")\nEOF",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "harness.authorized-only",
    useNonAuthRepo: true,
  },
  {
    label: "python3 - heredoc -> fs.protected",
    cmd: "python3 - <<'EOF'\nopen(\".claude/settings.json\",\"w\").write(\"x\")\nEOF",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "node - heredoc -> fs.protected",
    cmd: "node - <<'EOF'\nrequire(\"fs\").writeFileSync(\".claude/settings.json\",\"x\")\nEOF",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "node heredoc -> fs.protected",
    cmd: "node <<'EOF'\nrequire(\"fs\").writeFileSync(\".claude/settings.json\",\"x\")\nEOF",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "bash -s heredoc -> fs.protected",
    cmd: "bash -s <<'EOF'\necho x > .claude/settings.json\nEOF",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "sh -s heredoc -> fs.protected",
    cmd: "sh -s <<'EOF'\necho x > .claude/settings.json\nEOF",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "pwsh -Command - heredoc -> fs.protected",
    cmd: "pwsh -Command - <<'EOF'\nSet-Content .claude/settings.json \"x\"\nEOF",
    runtime: "cc-pwsh",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "cat heredoc | python3 -> fs.protected",
    cmd: "cat <<'EOF' | python3\nopen(\".claude/settings.json\",\"w\").write(\"x\")\nEOF",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "echo ... | bash -> fs.protected",
    cmd: 'echo "echo x > .claude/settings.json" | bash',
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "python3 - heredoc reading tool-results and writing /tmp -> allow",
    cmd: `python3 - <<'EOF'\ndata = open("${TOOL_RESULTS}", encoding="utf-8").read()\nopen("/tmp/o", "w", encoding="utf-8").write(data)\nEOF`,
    runtime: "cc-bash",
    expectAllowed: true,
  },
  // Ronda 2 — R1/R2/R3 con fs.protected
  {
    label: 'R1 bash -c "$(cat <<EOF echo x > .claude)" -> fs.protected',
    cmd: "bash -c \"$(cat <<'EOF'\necho x > .claude/settings.json\nEOF\n)\"",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "R1 $(cat <<EOF echo x > .claude) suelto -> fs.protected",
    cmd: "$(cat <<'EOF'\necho x > .claude/settings.json\nEOF\n)",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "R2 x=$((1<<EOF)) + echo x > .claude -> fs.protected",
    cmd: "x=$((1<<EOF))\necho x > .claude/settings.json\nEOF",
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: 'R3 "Set-Content .claude…" | powershell -Command - -> fs.protected',
    cmd: '"Set-Content .claude/settings.json x" | powershell -NoProfile -Command -',
    runtime: "cc-pwsh",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "R3 'open(.claude, w)' | python - -> fs.protected",
    cmd: `'open(".claude/settings.json","w").write("x")' | python -`,
    runtime: "cc-pwsh",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "R3 Invoke-Expression @'Set-Content .claude'@ -> fs.protected",
    cmd: "Invoke-Expression @'\nSet-Content .claude/settings.json x\n'@",
    runtime: "antigravity",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  // GOZS-809: el opener `@'` / `@"` no puede dejar comillas abiertas que oculten el resto
  ...[
    { q: "'", open: "@'", close: "'@" },
    { q: '"', open: '@"', close: '"@' },
  ].flatMap(({ open, close }) => {
    const pre = `$body = ${open}\nhola\n${close}\n`;
    const mk = (n: string, tail: string, rule: string, cmd = pre + tail): CorpusCase => ({
      label: `GOZS-809 ${open} ${n}`,
      cmd,
      runtime: "cc-pwsh",
      expectAllowed: false,
      expectRule: rule,
    });
    return [
      mk("redirect .claude", "'x' > .claude/settings.json", "fs.protected"),
      mk("Out-File .claude", "$body | Out-File .claude/settings.json", "fs.protected"),
      mk("Set-Content rules.json", "Set-Content harness-kit/core/guard/rules.json $body", "harness.authorized-only"),
      mk("gh pr create", "gh pr create --fill", "pr.requires-seal"),
      mk("cierre + ; redirect", "", "fs.protected", `echo ${open}\nhola\n${close} ; echo x > .claude/settings.json`),
      mk("sin cerrar", "", "fs.protected", `echo ${open}\n'\necho x > .claude/settings.json`),
    ];
  }),
  {
    label: "GOZS-809 here-string de datos seguido de Write-Output -> allow",
    cmd: "$body = @'\ngh pr create --fill\n'@\nWrite-Output $body",
    runtime: "cc-pwsh",
    expectAllowed: true,
  },
  {
    label: 'R1 bash -c "$(cat <<EOF echo hola > /tmp/x)" -> allow',
    cmd: "bash -c \"$(cat <<'EOF'\necho hola > /tmp/x\nEOF\n)\"",
    runtime: "cc-bash",
    expectAllowed: true,
  },
  {
    label: 'R3 "hola" | Set-Content ../x.txt -> allow',
    cmd: '"hola" | Set-Content ../x.txt',
    runtime: "cc-pwsh",
    expectAllowed: true,
  },
  // Ronda 2 — FP de tool-results leído por argv
  {
    label: "python3 - tool-results por argv escribiendo /tmp -> allow",
    cmd: `python3 - /root/.claude/projects/p/tool-results/x.txt <<'EOF'\nimport sys\nd=open(sys.argv[1]).read()\nopen("/tmp/o","w").write(d)\nEOF`,
    runtime: "cc-bash",
    expectAllowed: true,
  },
  {
    label: "python3 - tool-results (~) por argv escribiendo /tmp -> allow",
    cmd: `python3 - ${TOOL_RESULTS} <<'EOF'\nimport sys\nopen("/tmp/o","w").write(open(sys.argv[1]).read())\nEOF`,
    runtime: "cc-bash",
    expectAllowed: true,
  },
  {
    label: "python3 - argv a .claude/settings.json -> fs.protected",
    cmd: `python3 - .claude/settings.json <<'EOF'\nimport sys\nopen(sys.argv[1],"w").write("x")\nEOF`,
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "python3 - argv tool-results + destino protegido -> fs.protected",
    cmd: `python3 - /root/.claude/projects/p/tool-results/x.txt .claude/settings.json <<'EOF'\nimport sys\nopen(sys.argv[2],"w").write(open(sys.argv[1]).read())\nEOF`,
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "python3 - argv tool-results/../.. -> fs.protected",
    cmd: `python3 - /root/.claude/projects/p/tool-results/../../../settings.json <<'EOF'\nimport sys\nopen(sys.argv[1],"w").write("x")\nEOF`,
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "python3 - argv tool-results/%2e%2e -> fs.protected",
    cmd: `python3 - /root/.claude/projects/p/tool-results/%2e%2e/x <<'EOF'\nimport sys\nopen(sys.argv[1],"w").write("x")\nEOF`,
    runtime: "cc-bash",
    expectAllowed: false,
    expectRule: "fs.protected",
  },
  {
    label: "cat > ../nota.md heredoc mentioning .claude/settings.json -> allow",
    cmd: "cat > ../nota.md <<'EOF'\nNo editar .claude/settings.json a mano.\nEOF",
    runtime: "cc-bash",
    expectAllowed: true,
  },
];

// ───────────────────────────── A2b & fs.protected ─────────────────────────────

const A2B_TARGETS: Array<{ target: string; rule: string; useNonAuthRepo: boolean; tag: string }> = [
  { target: ".claude/settings.json", rule: "fs.protected", useNonAuthRepo: false, tag: "fs.protected" },
  { target: "harness-kit/core/guard/rules.json", rule: "harness.authorized-only", useNonAuthRepo: true, tag: "harness.authorized-only" },
];

const A2B_BYPASS_TEMPLATES: Array<{ label: string; make: (p: string) => string }> = [
  { label: 'Path(p).open("w").write', make: (p) => `python3 -c 'from pathlib import Path; Path("${p}").open("w").write("x")'` },
  { label: 'os.system("echo x > p")', make: (p) => `python3 -c 'import os; os.system("echo x > ${p}")'` },
  { label: 'subprocess.run("echo x > p", shell=True)', make: (p) => `python3 -c 'import subprocess; subprocess.run("echo x > ${p}", shell=True)'` },
  { label: 'subprocess.run(["cp","/tmp/a",p])', make: (p) => `python3 -c 'import subprocess; subprocess.run(["cp","/tmp/a","${p}"])'` },
  { label: 'readFileSync(p, {flag:"w+"})', make: (p) => `node -e 'require("fs").readFileSync("${p}",{flag:"w+"})'` },
  { label: 'child_process.execSync("echo x > p")', make: (p) => `node -e 'require("child_process").execSync("echo x > ${p}")'` },
];

const A2B_NON_REGRESSION_BLOCK: CorpusCase[] = [
  { label: 'open(p,"r+")', cmd: `python3 -c 'open(".claude/settings.json","r+").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'open(p, mode="r+")', cmd: `python3 -c 'open(".claude/settings.json", mode="r+").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'open(p,"rb+")', cmd: `python3 -c 'open(".claude/settings.json","rb+").write(b"x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'open(file=p, mode="w")', cmd: `python3 -c 'open(file=".claude/settings.json", mode="w").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "nested write in encoding= kwarg", cmd: `python3 -c 'open("/tmp/a", "r", encoding=open(".claude/settings.json","w").write("x"))'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "nested write in buffering= kwarg", cmd: `python3 -c 'open("/tmp/a", "r", buffering=open(".claude/settings.json","w").write("x"))'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'io.open(p,"w")', cmd: `python3 -c 'import io; io.open(".claude/settings.json","w").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'codecs.open(p,"w")', cmd: `python3 -c 'import codecs; codecs.open(".claude/settings.json","w").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "read_text + write_text same literal", cmd: `python3 -c 'from pathlib import Path; Path(".claude/settings.json").read_text(); Path(".claude/settings.json").write_text("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'fs.openSync(p,"r+") + writeSync', cmd: `node -e 'const fs=require("fs"); const fd=fs.openSync(".claude/settings.json","r+"); fs.writeSync(fd,"x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "readFileSync + writeFileSync same literal", cmd: `node -e 'const fs=require("fs"); fs.readFileSync(".claude/settings.json"); fs.writeFileSync(".claude/settings.json","x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  // Los 5 casos de regresión de #655
  { label: "#655: Path.read_text(open(w))", cmd: `python3 -c 'from pathlib import Path; Path("a").read_text(open(".claude/settings.json","w").write("x"))'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "#655: Path.read_text(Path.write_text)", cmd: `python3 -c 'from pathlib import Path; Path("a").read_text(Path(".claude/settings.json").write_text("x"))'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "#655: Path.read_bytes(open(w))", cmd: `python3 -c 'from pathlib import Path; Path("a").read_bytes(open(".claude/settings.json","w").write("x"))'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "#655: shelve.open", cmd: `python3 -c 'import shelve; shelve.open(".claude/db")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "#655: dbm.open", cmd: `python3 -c 'import dbm; dbm.open(".claude/db","c")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  // Ronda 2 — R4: clave `flag` entre comillas
  { label: "R4 readFileSync(p, {'flag':'w'})", cmd: `node -e "require('fs').readFileSync('.claude/settings.json',{'flag':'w'})"`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'R4 readFileSync(p, {"flag":"w"})', cmd: `node -e 'require("fs").readFileSync(".claude/settings.json",{"flag":"w"})'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'R4 readFileSync(p, {"flag":"a+"})', cmd: `node -e 'require("fs").readFileSync(".claude/settings.json",{"flag":"a+"})'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'R4 readFileSync(harness-kit, {"flag":"w"})', cmd: `node -e 'require("fs").readFileSync("harness-kit/core/guard/rules.json",{"flag":"w"})'`, runtime: "cc-bash", expectAllowed: false, expectRule: "harness.authorized-only", useNonAuthRepo: true },
];

const FS_PROTECTED_READ_ALLOW: CorpusCase[] = [
  { label: 'open(p, encoding="utf-8") -> /tmp', cmd: `python3 -c 'd=open("${TOOL_RESULTS}", encoding="utf-8").read(); open("/tmp/o","w").write(d)'`, runtime: "cc-bash", expectAllowed: true },
  { label: 'open(p,"r",encoding=...) -> /tmp', cmd: `python3 -c 'd=open("${TOOL_RESULTS}","r",encoding="utf-8").read(); open("/tmp/o","w").write(d)'`, runtime: "cc-bash", expectAllowed: true },
  { label: "with open(p) as f -> /tmp", cmd: `python3 -c 'with open("${TOOL_RESULTS}") as f: open("/tmp/o","w").write(f.read())'`, runtime: "cc-bash", expectAllowed: true },
  { label: "json.load(open(p)) -> /tmp", cmd: `python3 -c 'import json; d=json.load(open("${TOOL_RESULTS}")); open("/tmp/o","w").write(str(d))'`, runtime: "cc-bash", expectAllowed: true },
  { label: "Path(p).read_text(encoding=...) -> /tmp", cmd: `python3 -c 'from pathlib import Path; d=Path("${TOOL_RESULTS}").read_text(encoding="utf-8"); Path("/tmp/o").write_text(d)'`, runtime: "cc-bash", expectAllowed: true },
  { label: 'Path(p).open("r") -> /tmp', cmd: `python3 -c 'from pathlib import Path; d=Path("${TOOL_RESULTS}").open("r").read(); Path("/tmp/o").write_text(d)'`, runtime: "cc-bash", expectAllowed: true },
  { label: "fs.promises.readFile(p) -> /tmp", cmd: `node -e '(async()=>{const fs=require("fs"); const d=await fs.promises.readFile("${TOOL_RESULTS}","utf8"); await fs.promises.writeFile("/tmp/o",d)})()'`, runtime: "cc-bash", expectAllowed: true },
  { label: "cat tool-results > /tmp/o", cmd: `cat ${TOOL_RESULTS} > /tmp/o`, runtime: "cc-bash", expectAllowed: true },
  { label: "cp tool-results /tmp/o", cmd: `cp ${TOOL_RESULTS} /tmp/o`, runtime: "cc-bash", expectAllowed: true },
  { label: "jq tool-results > /tmp/o", cmd: `jq '.items' ${TOOL_RESULTS} > /tmp/o`, runtime: "cc-bash", expectAllowed: true },
  { label: "Get-Content tool-results | Set-Content /tmp/o", cmd: `Get-Content ${TOOL_RESULTS} | Set-Content /tmp/o`, runtime: "cc-pwsh", expectAllowed: true },
  { label: "R4 readFileSync(p, {'encoding':'utf8'}) -> /tmp", cmd: `node -e "const fs=require('fs'); fs.writeFileSync('/tmp/o', fs.readFileSync('${TOOL_RESULTS}',{'encoding':'utf8'}))"`, runtime: "cc-bash", expectAllowed: true },
];

const FS_PROTECTED_WRITE_BLOCK: CorpusCase[] = [
  { label: 'python open(".claude/settings.json","w")', cmd: `python3 -c 'open(".claude/settings.json","w").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'python open(".claude/settings.json","a")', cmd: `python3 -c 'open(".claude/settings.json","a").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'python open(p, mode="w")', cmd: `python3 -c 'p=".claude/settings.json"; open(p, mode="w").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'Path(".claude/x").write_text', cmd: `python3 -c 'from pathlib import Path; Path(".claude/x").write_text("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "shutil.copy -> .claude", cmd: `python3 -c 'import shutil; shutil.copy("/tmp/a", ".claude/settings.json")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "os.replace -> .claude", cmd: `python3 -c 'import os; os.replace("/tmp/a", ".claude/settings.json")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "python ~/.claude/settings.json write", cmd: `python3 -c 'import os; open(os.path.expanduser("~/.claude/settings.json"),"w").write("x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "cat x > .claude/settings.json", cmd: "cat x > .claude/settings.json", runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: "cp x .claude/settings.json", cmd: "cp x .claude/settings.json", runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'Set-Content .claude/settings.json "x"', cmd: 'Set-Content .claude/settings.json "x"', runtime: "cc-pwsh", expectAllowed: false, expectRule: "fs.protected" },
  { label: 'Node writeFileSync(".claude/...")', cmd: `node -e 'require("fs").writeFileSync(".claude/settings.json","x")'`, runtime: "cc-bash", expectAllowed: false, expectRule: "fs.protected" },
];

// ───────────────────────────── Otras reglas (no-regresión) ─────────────────────────────

const POLLING_AND_DESTRUCTIVE_CASES: CorpusCase[] = [
  // shell.polling block
  { label: "sleep 30", cmd: "sleep 30", runtime: "cc-bash", expectAllowed: false, expectRule: "shell.polling" },
  { label: "Start-Sleep -Seconds 30 (Antigravity)", cmd: "Start-Sleep -Seconds 30", runtime: "antigravity", expectAllowed: false, expectRule: "shell.polling" },
  { label: "sleep 20 && gh pr checks 12", cmd: "sleep 20 && gh pr checks 12", runtime: "cc-bash", expectAllowed: false, expectRule: "shell.polling" },
  { label: "npm run dev & sleep 15; npx playwright test", cmd: "npm run dev & sleep 15; npx playwright test", runtime: "cc-bash", expectAllowed: false, expectRule: "shell.polling" },
  // shell.polling allow
  { label: "sleep 3 (shell.wait)", cmd: "sleep 3", runtime: "cc-bash", expectAllowed: true },
  { label: "dev & sleep 15 && curl localhost:3000", cmd: "npm run dev & sleep 15 && curl -s http://localhost:3000", runtime: "cc-bash", expectAllowed: true },
  { label: "Start-Sleep 15; Invoke-WebRequest localhost:3000 (AGY)", cmd: "Start-Sleep 15; Invoke-WebRequest http://localhost:3000", runtime: "antigravity", expectAllowed: true },
  { label: "npx wait-on localhost:3000", cmd: "npx wait-on http://localhost:3000", runtime: "cc-bash", expectAllowed: true },
  { label: "timeout 600 npm test", cmd: "timeout 600 npm test", runtime: "cc-bash", expectAllowed: true },
  { label: "for f in a b; do echo $f; done", cmd: "for f in a b; do echo $f; done", runtime: "cc-bash", expectAllowed: true },
  { label: "harness-pr-status --wait-checks", cmd: "node harness-kit/core/scripts/harness-pr-status.mjs 12 --wait-checks", runtime: "cc-bash", expectAllowed: true },
  { label: "grep Start-Sleep pattern", cmd: 'grep -n "Start-Sleep" src/a.ts', runtime: "cc-bash", expectAllowed: true },

  // Destructive rules (direct, bash -c, eval, bash <<EOF, echo | bash)
  { label: "git push --force direct", cmd: "git push --force origin feature/x", runtime: "cc-bash", expectAllowed: false, expectRule: "git.force-push" },
  { label: "git push --force bash -c", cmd: 'bash -c "git push --force origin feature/x"', runtime: "cc-bash", expectAllowed: false, expectRule: "git.force-push" },
  { label: "git push --force eval", cmd: 'eval "git push --force origin feature/x"', runtime: "cc-bash", expectAllowed: false, expectRule: "git.force-push" },
  { label: "git push --force bash heredoc", cmd: "bash <<'EOF'\ngit push --force origin feature/x\nEOF", runtime: "cc-bash", expectAllowed: false, expectRule: "git.force-push" },
  { label: "git push --force echo | bash", cmd: 'echo "git push --force origin feature/x" | bash', runtime: "cc-bash", expectAllowed: false, expectRule: "git.force-push" },
  { label: "git reset --hard direct", cmd: "git reset --hard HEAD~1", runtime: "cc-bash", expectAllowed: false, expectRule: "git.reset-hard" },
  { label: "git reset --hard bash -c", cmd: 'bash -c "git reset --hard HEAD~1"', runtime: "cc-bash", expectAllowed: false, expectRule: "git.reset-hard" },
  { label: "git reset --hard eval", cmd: 'eval "git reset --hard HEAD~1"', runtime: "cc-bash", expectAllowed: false, expectRule: "git.reset-hard" },
  { label: "git reset --hard bash heredoc", cmd: "bash <<'EOF'\ngit reset --hard HEAD~1\nEOF", runtime: "cc-bash", expectAllowed: false, expectRule: "git.reset-hard" },
  { label: "git reset --hard echo | bash", cmd: 'echo "git reset --hard HEAD~1" | bash', runtime: "cc-bash", expectAllowed: false, expectRule: "git.reset-hard" },
];

function runCase(c: CorpusCase) {
  const root = c.useNonAuthRepo ? nonAuthRepo : nonAuthRepo;
  const payload = makePayload(c.cmd, c.runtime);
  const res = checkGuard(payload, { repoRoot: root });
  expect(res.allowed, `${c.label} (${c.runtime}): ${c.cmd} -> got ${JSON.stringify(res)}`).toBe(c.expectAllowed);
  if (c.expectRule) {
    expect(res.ruleId, `${c.label}: ruleId`).toBe(c.expectRule);
  }
}

describe("GOZS-795 A4: Corpus de regresión del guard", () => {
  describe("A1 — Detector de PR (block sin sello)", () => {
    it.each(A1_BLOCK_CASES)("$label ($runtime)", (c) => {
      runCase(c);
      if (c.expectRule === "pr.requires-seal") {
        // Verificar diagnóstico de GOZS-781 (indica causa + harness-ship)
        const res = checkGuard(makePayload(c.cmd, c.runtime), { repoRoot: nonAuthRepo });
        expect(res.reason).toMatch(/harness-ship|sello/i);
      }
    });

    it("detectGhPrCommands clasifica todos los wrappers explícitos de A1 sin depender de la red de seguridad", () => {
      for (const c of A1_BLOCK_CASES) {
        const matches = detectGhPrCommands(c.cmd);
        expect(matches.length, `detectGhPrCommands(${c.label})`).toBeGreaterThan(0);
        if (c.label.startsWith("safety net")) {
          expect(matches[0].safetyNet, `${c.label} should use safety net`).toBe(true);
        } else {
          expect(matches[0].safetyNet, `${c.label} should match structurally, not only safety net`).not.toBe(true);
        }
      }
    });
  });

  describe("A1 — Menciones literales y consultas permitidas (allow)", () => {
    it.each(A1_ALLOW_CASES)("$label ($runtime)", (c) => {
      runCase(c);
      expect(detectGhPrCommands(c.cmd), `detectGhPrCommands(${c.label})`).toEqual([]);
    });
  });

  describe("A2 — Intérpretes que leen el programa por stdin", () => {
    it.each(A2_CASES)("$label ($runtime)", (c) => {
      runCase(c);
    });
  });

  describe("GOZS-804 A — heredoc fantasma en strings multilínea", () => {
    const prefix = 'git commit -m "docs\nel patrón cat <<EOF\n" ; ';
    const blocked: Array<[string, string]> = [
      ["echo x > .claude/settings.json", "fs.protected"],
      ["echo x > harness-kit/core/guard/rules.json", "harness.authorized-only"],
      ["gh pr create --fill", "pr.requires-seal"],
    ];
    it.each(blocked)("con commit multilínea delante sigue bloqueando: %s", (tail, rule) => {
      for (const cmd of [tail, prefix + tail]) {
        const res = checkGuard(makePayload(cmd, "cc-bash"), { repoRoot: nonAuthRepo });
        expect(res.allowed, cmd).toBe(false);
        expect(res.ruleId, cmd).toBe(rule);
      }
    });

    it("variante con $(cat <<'EOF') dentro del string + gh pr create bloquea", () => {
      const cmd = 'git commit -m "x\nel patrón $(cat <<\'EOF\') y\n" && gh pr create --fill';
      const res = checkGuard(makePayload(cmd, "cc-bash"), { repoRoot: nonAuthRepo });
      expect(res.ruleId).toBe("pr.requires-seal");
    });

    it.each([
      'git commit -m "docs: flujo\ngh pr create --fill sin sello se bloquea\n"',
      "git commit -m \"$(cat <<'EOF'\nx gh pr create --fill\nEOF\n)\"",
      "git commit -F - <<'EOF'\ngh pr create --fill\nEOF",
      "echo $((1<<3)) > /tmp/x",
    ])("no regresión (permitido): %s", (cmd) => {
      expect(checkGuard(makePayload(cmd, "cc-bash"), { repoRoot: nonAuthRepo }).allowed, cmd).toBe(true);
    });

    it.each([
      "cat <<EOF > /tmp/b.md\nbody\nEOF\ngh pr create --body-file /tmp/b.md",
      "git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\" && gh pr create --fill",
    ])("heredoc real cerrado seguido de gh pr create bloquea: %s", (cmd) => {
      expect(checkGuard(makePayload(cmd, "cc-bash"), { repoRoot: nonAuthRepo }).ruleId, cmd).toBe("pr.requires-seal");
    });

    it("heredoc sin cerrar: strippedAll conserva el texto y compactDataHeredocs lo sigue compactando", () => {
      const cmd = "cat <<EOF\nlinea1\ngh pr create --fill";
      expect(parseHeredocs(cmd).strippedAll).toContain("gh pr create --fill");
      expect(compactDataHeredocs(cmd)).not.toContain("gh pr create");
      expect(compactDataHeredocs(cmd)).toContain("heredoc");
    });
  });

  describe("GOZS-804 A — la comilla arrastrada coincide con bash (comentarios y $'…')", () => {
    const prefixes = ["true;# it's", "true|# it's", "true&# it's", "(# it's", "echo $'it\\'s'"];
    const tails = [
      "python3 <<EOF\nimport os; os.system('gh pr create')\nEOF",
      "node <<EOF\nrequire('child_process').execSync('gh pr create')\nEOF",
      "echo 'gh pr create --fill' | bash",
      "bash <<< 'gh pr create --fill'",
    ];
    const cases = prefixes.flatMap((p) => tails.map((t) => [p, t] as const));
    it.each(cases)("prefijo %j no oculta lo que sigue: %j", (p, t) => {
      const res = checkGuard(makePayload(`${p}\n${t}`, "cc-bash"), { repoRoot: nonAuthRepo });
      expect(res.ruleId).toBe("pr.requires-seal");
    });
  });

  describe("GOZS-804 B — intérpretes por stdin con opciones que llevan valor", () => {
    it.each([
      "python3 -W ignore - <<'EOF'\nimport os; os.system(\"gh pr create --fill\")\nEOF",
      "python3 -X utf8 - <<'EOF'\nimport os; os.system(\"gh pr create --fill\")\nEOF",
      "node -r ts-node/register <<'EOF'\nrequire(\"child_process\").execSync(\"gh pr create --fill\")\nEOF",
    ])("bloquea pr.requires-seal: %s", (cmd) => {
      expect(checkGuard(makePayload(cmd, "cc-bash"), { repoRoot: nonAuthRepo }).ruleId).toBe("pr.requires-seal");
    });

    it("echo x | python3 script.py no cuenta como intérprete por stdin", () => {
      expect(extractStdinInterpreterInvocations("echo x | python3 script.py")).toEqual([]);
    });
  });

  describe("A2b — Escrituras desde intérpretes inline (fs.protected y harness.authorized-only)", () => {
    const matrix: CorpusCase[] = [];
    for (const t of A2B_TARGETS) {
      for (const tpl of A2B_BYPASS_TEMPLATES) {
        matrix.push({
          label: `${tpl.label} [${t.tag}]`,
          cmd: tpl.make(t.target),
          runtime: "cc-bash",
          expectAllowed: false,
          expectRule: t.rule,
          useNonAuthRepo: t.useNonAuthRepo,
        });
      }
    }
    it.each(matrix)("$label", (c) => runCase(c));
    it.each(A2B_NON_REGRESSION_BLOCK)("no-regresión: $label", (c) => runCase(c));
  });

  describe("fs.protected — lecturas permitidas y escrituras bloqueadas", () => {
    it.each(FS_PROTECTED_READ_ALLOW)("allow lectura: $label", (c) => runCase(c));
    it.each(FS_PROTECTED_WRITE_BLOCK)("block escritura: $label", (c) => runCase(c));
  });

  describe("A3 — remediate.native-read con pipes a limitadores", () => {
    it.each([
      "grep -rn x src | head -20",
      "sed -n 1,80p src/x.ts | head",
      "cat src/x.ts | tail -20",
      "cat src/x.ts | wc -l",
      "rg -n foo src | sort | uniq",
      "cat src/x.ts | less",
      "cat src/x.ts | more",
      "cat src/x.ts | Select-Object -First 10",
      "cat src/x.ts | Select-Object -Last 5",
    ])("avisa (read): %s", (cmd) => {
      expect(classifyNativeRead(cmd, repoRoot, repoRoot)).toBe("read");
    });

    it.each([
      "git log --oneline | grep fix",
      "cat src/x.json | jq .",
      "cat src/x.json | python3 -c 'import sys'",
      "cat src/x.ts | head -10 > /tmp/out.txt",
    ])("no avisa: %s", (cmd) => {
      expect(classifyNativeRead(cmd, repoRoot, repoRoot)).toBeNull();
    });
  });

  describe("Ronda 2 — latencia (margen holgado para CI en Windows)", () => {
    const ids = Array.from({ length: 600 }, (_, i) => i);
    const sameSegment = `cat ${ids.map((i) => `<<E${i}`).join(" ")}\n${ids.map((i) => `x\nE${i}`).join("\n")}`;
    const manyClauses = `${ids.map((i) => `cat <<E${i}`).join("; ")}\n${ids.map((i) => `x\nE${i}`).join("\n")}`;

    it.each([
      ["600 << en un segmento", sameSegment],
      ["600 << en 600 cláusulas", manyClauses],
    ])("heredoc.mjs: %s se parsea en < 50 ms", (_label, cmd) => {
      parseHeredocs("cat <<EOF\nx\nEOF");
      const t0 = performance.now();
      const parsed = parseHeredocs(cmd);
      extractStdinInterpreterInvocations(cmd);
      const ms = performance.now() - t0;
      expect(parsed.records).toHaveLength(600);
      expect(ms).toBeLessThan(50);
    });

    const big = "x".repeat(50 * 1024);
    it.each([
      ["palabra sin espacios", `gh api repos/o/r/issues/1/comments -f body=${big}`],
      ["literal entre comillas", `gh api repos/o/r/issues/1/comments -f body='${big}'`],
      ["con menciones a .claude/projects", `gh api repos/o/r/issues/1/comments -f body=${big}.claude/projects/p/memory/a${big.slice(0, 1024)}`],
    ])("stripWritableAgentPaths: 50 KB (%s) se evalúa en < 200 ms", (_label, cmd) => {
      checkGuard(makePayload("echo warm", "cc-bash"), { repoRoot: nonAuthRepo });
      const t0 = performance.now();
      const res = checkGuard(makePayload(cmd, "cc-bash"), { repoRoot: nonAuthRepo });
      const ms = performance.now() - t0;
      expect(res.allowed).toBe(true);
      expect(ms).toBeLessThan(200);
    });
  });

  describe("Otras reglas (no-regresión: polling, destructivas, read.oversize y búsqueda nativa)", () => {
    it.each(POLLING_AND_DESTRUCTIVE_CASES)("$label ($runtime)", (c) => runCase(c));

    it("read.oversize (Claude Code Read): bloquea sin límite, limit 301 y solo offset; permite limit 300 y archivo chico", () => {
      const readCall = (toolInput: Record<string, unknown>) =>
        checkGuard(
          { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: toolInput, cwd: nonAuthRepo },
          { repoRoot: nonAuthRepo },
        );

      expect(readCall({ file_path: bigFile })).toMatchObject({ allowed: false, ruleId: "read.oversize" });
      expect(readCall({ file_path: bigFile, offset: 1, limit: 301 })).toMatchObject({ allowed: false, ruleId: "read.oversize" });
      expect(readCall({ file_path: bigFile, offset: 10 })).toMatchObject({ allowed: false, ruleId: "read.oversize" });
      expect(readCall({ file_path: bigFile, offset: 1, limit: 300 })).toMatchObject({ allowed: true });
      expect(readCall({ file_path: smallFile })).toMatchObject({ allowed: true });
    });

    it("búsqueda nativa: Grep sobre .env.local bloquea fs.env-leak; Glob .env* y Grep/Glob normales se permiten", () => {
      const grepEnv = checkGuard(
        { hook_event_name: "PreToolUse", tool_name: "Grep", tool_input: { pattern: "KEY", path: ".env.local" }, cwd: nonAuthRepo },
        { repoRoot: nonAuthRepo },
      );
      expect(grepEnv).toMatchObject({ allowed: false, ruleId: "fs.env-leak" });

      const globEnv = checkGuard(
        { hook_event_name: "PreToolUse", tool_name: "Glob", tool_input: { pattern: ".env*" }, cwd: nonAuthRepo },
        { repoRoot: nonAuthRepo },
      );
      expect(globEnv).toMatchObject({ allowed: true });

      const grepNormal = checkGuard(
        { hook_event_name: "PreToolUse", tool_name: "Grep", tool_input: { pattern: "export", path: "src" }, cwd: nonAuthRepo },
        { repoRoot: nonAuthRepo },
      );
      expect(grepNormal).toMatchObject({ allowed: true });

      const globNormal = checkGuard(
        { hook_event_name: "PreToolUse", tool_name: "Glob", tool_input: { pattern: "**/*.ts" }, cwd: nonAuthRepo },
        { repoRoot: nonAuthRepo },
      );
      expect(globNormal).toMatchObject({ allowed: true });

      // Post-hook smoke check
      const postRes = evaluateRules(
        { phase: "post", kind: "shell", runtime: "antigravity", command: "cat src/x.ts", output: "", raw: {} },
        { repoRoot: nonAuthRepo },
      );
      expect(postRes.inject).toBe(false);
    });
  });
});

describe("GOZS-804 A: comilla arrastrada sin cerrar cae al reinicio por línea", () => {
  it("GIVEN una comilla abierta que nunca cierra THEN el guard sigue viendo gh pr create en las líneas siguientes", () => {
    const cmd = "echo 'sin cerrar\npython3 <<EOF\nimport os; os.system(\"gh pr create\")\nEOF";
    const res = checkGuard(makePayload(cmd, "cc-bash"), { repoRoot: nonAuthRepo });
    expect(res.ruleId).toBe("pr.requires-seal");
  });
});
