import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DevEnvBadge, resolverEtiquetaEntorno } from "@/components/dev-env-badge";

describe("DevEnvBadge (GOZS-836)", () => {
  it("production, undefined y vacío => null (fail-closed)", () => {
    expect(resolverEtiquetaEntorno("production")).toBeNull();
    expect(resolverEtiquetaEntorno(undefined)).toBeNull();
    expect(resolverEtiquetaEntorno("")).toBeNull();
    expect(renderToStaticMarkup(<DevEnvBadge appEnv="production" />)).toBe("");
    expect(renderToStaticMarkup(<DevEnvBadge appEnv="" />)).toBe("");
  });

  it("preview => DEV · PREVIEW con pointer-events-none", () => {
    expect(resolverEtiquetaEntorno("preview")).toBe("DEV · PREVIEW");
    const html = renderToStaticMarkup(<DevEnvBadge appEnv="preview" />);
    expect(html).toContain('data-testid="dev-env-badge"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("DEV · PREVIEW");
  });

  it("development => DEV", () => {
    expect(resolverEtiquetaEntorno("development")).toBe("DEV");
  });
});
