import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// H-10 — skills C6: autotriggers en AGENTS.md, gozster-domain sin copiar
// fuentes, y harness-bootstrap genera un overlay que el render acepta.

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const bootstrapPath = path.resolve(here, "..", "core", "skills", "harness-bootstrap", "bootstrap.mjs");
const renderPath = path.resolve(here, "..", "core", "scripts", "harness-render.mjs");

let tmp: string | undefined;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function run(script: string, args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

describe("autotriggers en AGENTS.md", () => {
  const agents = readFileSync(path.join(repo, "AGENTS.md"), "utf8");

  it("declara el autotrigger de gozster-domain", () => {
    expect(agents).toMatch(/^- When .+, load the gozster-domain skill\.$/m);
  });

  it("declara el autotrigger de harness-bootstrap", () => {
    expect(agents).toMatch(/^- When .+, load the harness-bootstrap skill\.$/m);
  });
});

describe("gozster-domain (overlay)", () => {
  const skill = readFileSync(path.join(repo, "harness", "skills", "gozster-domain", "SKILL.md"), "utf8");

  it("no menciona Mynter", () => {
    expect(skill.toLowerCase()).not.toContain("mynter");
  });

  it("referencia GLOSSARY y los ADR en vez de copiarlos", () => {
    expect(skill).toContain("docs/GLOSSARY.md");
    for (const n of ["001", "002", "003", "004", "005"]) expect(skill).toContain(`docs/adr/ADR-${n}-`);
    expect(skill).not.toContain("| :--- | :--- | :--- | :--- |"); // tablas del glosario no copiadas
  });
});

describe("harness-bootstrap (core)", () => {
  it("en un repo vacío con package.json genera un overlay válido y el render da exit 0", () => {
    tmp = mkdtempSync(path.join(tmpdir(), "harness-bootstrap-"));
    writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "vitest run" } }));

    run(bootstrapPath, [tmp, "--domain", "demo-domain", "--domain-description", "Demo", "--autotrigger", "demo terms appear"]);

    const project = JSON.parse(readFileSync(path.join(tmp, "harness", "project.json"), "utf8"));
    expect(project).toMatchObject({ name: "demo", gate: "npm test" });

    const overlay = path.join(tmp, "harness");
    expect(() => run(renderPath, [overlay])).not.toThrow();
    expect(() => run(renderPath, ["--check", overlay])).not.toThrow();
    expect(readFileSync(path.join(tmp, "AGENTS.md"), "utf8")).toContain(
      "- When demo terms appear, load the demo-domain skill.",
    );
    expect(readFileSync(path.join(tmp, ".claude", "skills", "demo-domain", "SKILL.md"), "utf8")).toContain(
      "name: demo-domain",
    );
  });

  it("no pisa un overlay existente", () => {
    const dir = (tmp = mkdtempSync(path.join(tmpdir(), "harness-bootstrap-")));
    writeFileSync(path.join(dir, "package.json"), "{}");
    run(bootstrapPath, [dir]);
    expect(() => run(bootstrapPath, [dir])).toThrow(/overlay already exists/);
  });

  it("genera un subagente con --subagent y --description y el render lo distribuye", () => {
    tmp = mkdtempSync(path.join(tmpdir(), "harness-bootstrap-subagent-"));
    writeFileSync(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "demo-subagent", scripts: { test: "vitest run" } }),
    );

    run(bootstrapPath, [tmp, "--subagent", "custom-analyst", "--description", "Analista de rendimiento"]);

    const subagentFile = path.join(tmp, "harness", "subagents", "custom-analyst.md");
    expect(existsSync(subagentFile)).toBe(true);
    const subagentContent = readFileSync(subagentFile, "utf8");
    expect(subagentContent).toMatch(/^---\r?\nname:\s*custom-analyst\r?\ndescription:\s*Analista de rendimiento/m);

    const overlay = path.join(tmp, "harness");
    expect(() => run(renderPath, [overlay])).not.toThrow();
    expect(() => run(renderPath, ["--check", overlay])).not.toThrow();

    expect(existsSync(path.join(tmp, ".claude", "agents", "custom-analyst.md"))).toBe(true);
    expect(existsSync(path.join(tmp, ".agents", "agents", "custom-analyst.md"))).toBe(true);
    expect(existsSync(path.join(tmp, ".gemini", "agents", "custom-analyst.md"))).toBe(true);
    expect(existsSync(path.join(tmp, ".opencode", "agents", "custom-analyst.md"))).toBe(true);
  });
});

describe("sub-issue.md.tmpl (PM GOZSter template)", () => {
  const templatePath = path.resolve(here, "..", "core", "templates", "sub-issue.md.tmpl");

  it("contiene todas las secciones del formato obligatorio del PM y nota de pr-auto-complete off", () => {
    const content = readFileSync(templatePath, "utf8");
    expect(content).toContain("Contexto");
    expect(content).toContain("Alcance Quirúrgico");
    expect(content).toContain("Criterios de Aceptación (Gherkin)");
    expect(content).toContain("Asignado a");
    expect(content).toContain("Restricciones");
    expect(content).toContain("Aplicar Ponytail y Karpathy");
    expect(content).toContain("Contrato Harness");
    expect(content).toContain("--pr-auto-complete off");
  });

  it("tool_guidance en AGENTS.md referencia la plantilla y respeta el presupuesto", () => {
    const agents = readFileSync(path.join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("sub-issue.md.tmpl");
    expect(agents).toContain("--pr-auto-complete off");
    expect(agents.replace(/\r\n/g, "\n").length).toBeLessThanOrEqual(8000);
    expect(agents.replace(/\r\n/g, "\n").split("\n").length).toBeLessThan(150);
  });
});
