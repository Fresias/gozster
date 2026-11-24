import { describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { ghShellCommand, main, parseArgs, upsertSealBlock } from "../core/scripts/harness-ship.mjs";
// @ts-expect-error - mjs module
import { gitBashWin, resolveBash } from "../core/guard/guard-core.mjs";

type Res = { status: number; stdout: string; stderr: string };
const ok = (stdout = ""): Res => ({ status: 0, stdout, stderr: "" });
const BRANCH = "chore/781-harness-ship";
const LESSON = "harness/experience/GOZS-781.jsonl";
const BODY = "/work/pr-body.md";

/** Simulated repo: git, gh, harness-learn.sh and harness-gate.sh share one state. */
function fakeEnv(over: Partial<{ behind: number; gateFails: boolean; prs: { number: number; url: string }[]; dirty: string[] }> = {}) {
  const st = {
    head: "aaaaaaa1",
    commits: [] as string[],
    lessons: [] as string[],
    lessonDirty: false,
    sealHead: "",
    pushed: [] as string[],
    prs: over.prs ? [...over.prs] : [],
    behind: over.behind || 0,
    gateFails: Boolean(over.gateFails),
    dirty: over.dirty || [],
    calls: [] as string[],
    files: new Map<string, string>([[BODY, "## Resumen\n\nCambio."]]),
  };
  const fp = () => `${st.head}0000000000000000`.slice(0, 16);
  const run = (cmd: string, args: string[]): Res => {
    const script = (args[0] || "").split("/").pop() || "";
    const line = cmd === "git" || cmd === "gh" ? `${cmd} ${args.join(" ")}` : `${cmd} ${script} ${args.slice(1).join(" ")}`;
    st.calls.push(line.trim());
    if (cmd === "git") {
      const [sub, ...rest] = args;
      if (sub === "rev-parse") return ok(`${BRANCH}\n`);
      if (sub === "status") {
        const lesson = st.lessonDirty ? [` M ${LESSON}`] : [];
        if (rest.includes("--")) return ok(lesson.join("\n"));
        return ok([...st.dirty, ...lesson].join("\n"));
      }
      if (sub === "fetch") return ok();
      if (sub === "rev-list") return ok(`${st.behind}\n`);
      if (sub === "add") return ok();
      if (sub === "commit") {
        st.commits.push(rest[1] ?? "");
        st.lessonDirty = false;
        st.head = `bbbbbb${st.commits.length}`;
        return ok();
      }
      if (sub === "push") {
        st.pushed.push(rest.join(" "));
        return ok();
      }
    }
    if (script === "harness-learn.sh") {
      const text = args[args.indexOf("--lesson") + 1] ?? "";
      if (!st.lessons.includes(text)) {
        st.lessons.push(text);
        st.lessonDirty = true;
      }
      return ok("[harness-learn OK]");
    }
    if (script === "harness-gate.sh") {
      if (args.includes("--verify")) return st.sealHead === st.head && !st.lessonDirty ? ok() : { status: 1, stdout: "", stderr: "" };
      if (args.includes("--pr-block")) {
        return ok(`<!-- harness-seal: {"head":"${st.sealHead}","fingerprint":"${fp()}"} -->\nHarness seal: \`${fp()}\` on \`${st.sealHead.slice(0, 7)}\` (gate)\n`);
      }
      if (st.gateFails) {
        const noise = Array.from({ length: 60 }, (_, i) => `linea ${i}`).join("\n");
        return { status: 1, stdout: `${noise}\nFAIL harness-kit/tests/x.spec.ts`, stderr: "" };
      }
      st.sealHead = st.head;
      st.files.set("/repo/.harness/complete.json", JSON.stringify({ head: st.head, fingerprint: fp() }));
      return ok("[harness-gate] Sello generado");
    }
    if (cmd === "gh") {
      if (args[1] === "list") return ok(JSON.stringify(st.prs));
      if (args[0] === "api" && args[2] === "PATCH") return ok();
      if (args[1] === "create") {
        st.prs.push({ number: 900, url: "https://github.com/Fresias/gozster/pull/900" });
        return ok("https://github.com/Fresias/gozster/pull/900\n");
      }
    }
    throw new Error(`comando no simulado: ${line}`);
  };
  const out: string[] = [];
  const deps = {
    run,
    repoRoot: "/repo",
    project: { issue_prefix: "GOZS" },
    bash: "BASH",
    scriptsDir: "/kit/scripts",
    readFile: (f: string) => {
      const key = f.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
      if (!st.files.has(key)) throw new Error(`ENOENT ${key}`);
      return st.files.get(key)!;
    },
    writeFile: (f: string, s: string) => st.files.set(f.replace(/\\/g, "/").replace(/^[A-Za-z]:/, ""), s),
    exists: (f: string) => st.files.has(f.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "")),
    log: (s: string) => out.push(s),
    err: (s: string) => out.push(s),
  };
  return { st, deps, out };
}

const ARGS = ["--lesson", "Usar harness-ship.mjs", "--title", "chore: ship", "--body-file", BODY];

describe("GOZS-781: harness-ship.mjs", () => {
  it("GIVEN una rama sin lección WHEN corre con --lesson THEN commitea la lección ANTES del gate, sella el último commit y crea la PR con el bloque", async () => {
    const { st, deps, out } = fakeEnv();
    const res = await main(ARGS, deps);
    expect(res.exitCode).toBe(0);
    expect(st.commits).toEqual(["docs(learn): lección GOZS-781"]);
    const iCommit = st.calls.findIndex((c) => c.startsWith("git commit"));
    const iGate = st.calls.findIndex((c) => c === "BASH harness-gate.sh --base origin/main");
    expect(iCommit).toBeGreaterThan(-1);
    expect(iGate).toBeGreaterThan(iCommit);
    expect(st.sealHead).toBe(st.head);
    expect(st.calls.some((c) => c.includes("--no-verify"))).toBe(false);
    expect(st.pushed).toEqual([`-u origin ${BRANCH}`]);
    const iPush = st.calls.findIndex((c) => c.startsWith("git push"));
    const iVerify = st.calls.lastIndexOf("BASH harness-gate.sh --verify");
    const iCreate = st.calls.findIndex((c) => c.startsWith("gh pr create"));
    expect(iVerify).toBeGreaterThan(iPush);
    expect(iCreate).toBeGreaterThan(iVerify);
    expect(st.calls[iCreate]).toContain("--base main");
    expect(st.files.get(BODY)).toMatch(/^## Resumen\n\nCambio\.\n\n<!-- harness-seal: .*"head":"bbbbbb1".* -->\n/);
    expect(res.url).toBe("https://github.com/Fresias/gozster/pull/900");
    expect(out.join("\n")).toContain(`Sello: ${res.fingerprint}`);
  });

  it("GIVEN una PR existente para la rama WHEN corre THEN actualiza el cuerpo (PATCH REST, sin read:org) y no crea otra", async () => {
    const { st, deps } = fakeEnv({ prs: [{ number: 812, url: "https://github.com/Fresias/gozster/pull/812" }] });
    const res = await main(ARGS, deps);
    expect(res.exitCode).toBe(0);
    expect(st.calls.some((c) => c.startsWith("gh pr create"))).toBe(false);
    expect(st.calls.some((c) => c.startsWith("gh api -X PATCH repos/{owner}/{repo}/pulls/812 -F body=@") && c.includes("pr-body.md"))).toBe(true);
    expect(st.calls.some((c) => c.startsWith("gh pr edit"))).toBe(false);
    expect(res.url).toBe("https://github.com/Fresias/gozster/pull/812");
  });

  it("GIVEN un gate que falla WHEN corre THEN sale con código ≠ 0, no hace push ni crea la PR y muestra las últimas 40 líneas", async () => {
    const { st, deps, out } = fakeEnv({ gateFails: true });
    const res = await main(ARGS, deps);
    expect(res.exitCode).not.toBe(0);
    expect(st.pushed).toEqual([]);
    expect(st.calls.some((c) => c.startsWith("gh "))).toBe(false);
    const text = out.join("\n");
    expect(text).toContain("FAIL harness-kit/tests/x.spec.ts");
    expect(text).toContain("linea 59");
    expect(text).not.toContain("linea 20\n");
  });

  it("GIVEN una rama atrasada respecto de main WHEN corre THEN se detiene antes de la lección y del gate con la instrucción", async () => {
    const { st, deps, out } = fakeEnv({ behind: 3 });
    const res = await main(ARGS, deps);
    expect(res.exitCode).not.toBe(0);
    expect(out.join("\n")).toContain("3 commit(s) atrás de origin/main");
    expect(out.join("\n")).toContain("git merge origin/main");
    expect(st.calls.some((c) => c.includes("harness-learn.sh") || c.includes("harness-gate.sh"))).toBe(false);
    expect(st.commits).toEqual([]);
  });

  it("GIVEN harness-ship corrido dos veces seguidas THEN no duplica la lección ni el bloque y el gate corre una sola vez", async () => {
    const { st, deps } = fakeEnv();
    expect((await main(ARGS, deps)).exitCode).toBe(0);
    expect((await main(ARGS, deps)).exitCode).toBe(0);
    expect(st.lessons).toHaveLength(1);
    expect(st.commits).toHaveLength(1);
    expect(st.calls.filter((c) => c === "BASH harness-gate.sh --base origin/main")).toHaveLength(1);
    expect(st.files.get(BODY)!.match(/harness-seal:/g)).toHaveLength(1);
    expect(st.files.get(BODY)!.match(/^Harness seal:/gm)).toHaveLength(1);
    expect(st.calls.filter((c) => c.startsWith("gh pr create"))).toHaveLength(1);
    expect(st.calls.filter((c) => c.startsWith("gh api -X PATCH"))).toHaveLength(1);
  });

  it("GIVEN cambios sin commitear fuera de la lección WHEN corre THEN se detiene sin tocar nada", async () => {
    const { st, deps, out } = fakeEnv({ dirty: [" M src/app.ts"] });
    const res = await main(ARGS, deps);
    expect(res.exitCode).not.toBe(0);
    expect(out.join("\n")).toContain("src/app.ts");
    expect(st.calls.some((c) => c.startsWith("git fetch"))).toBe(false);
  });

  it("GIVEN Windows con Git Bash WHEN resuelve bash THEN usa Git Bash (igual que sealValid) y nunca el bash de WSL", () => {
    expect(resolveBash("win32", () => true)).toBe(gitBashWin);
    expect(gitBashWin).toBe("C:\\Program Files\\Git\\bin\\bash.exe");
    expect(resolveBash("linux", () => true)).toBe("bash");
    expect(resolveBash("win32", () => false)).toBe("bash");
  });

  it("GIVEN Windows con gh como shim .cmd THEN arma el comando de shell con cada argumento entre comillas", () => {
    expect(ghShellCommand(["pr", "create", "--title", 'chore: "x" y', "--body-file", "C:\\w\\pr body.md"])).toBe(
      'gh "pr" "create" "--title" "chore: \\"x\\" y" "--body-file" "C:\\w\\pr body.md"',
    );
  });

  it("parseArgs exige --title y --body-file y acepta --flag=valor", () => {
    expect(parseArgs(["--body-file", "b.md"]).error).toContain("--title");
    expect(parseArgs(["--title", "t"]).error).toContain("--body-file");
    const o = parseArgs(["--title=t", "--body-file=b.md", "--base", "dev", "--draft", "--issue", "GOZS-9"]);
    expect(o).toMatchObject({ title: "t", bodyFile: "b.md", base: "dev", draft: true, issue: "GOZS-9", error: "" });
  });

  it("upsertSealBlock reemplaza el bloque previo en lugar de duplicarlo", () => {
    const b1 = '<!-- harness-seal: {"fingerprint":"1111111111111111"} -->\nHarness seal: `1111111111111111` on `aaaaaaa` (g)\n';
    const b2 = '<!-- harness-seal: {"fingerprint":"2222222222222222"} -->\nHarness seal: `2222222222222222` on `bbbbbbb` (g)\n';
    const once = upsertSealBlock("## Resumen\r\n\r\nx\r\n", b1);
    const twice = upsertSealBlock(once, b2);
    expect(twice).toBe(`## Resumen\n\nx\n\n${b2}`);
  });
});
