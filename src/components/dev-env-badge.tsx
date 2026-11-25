import * as React from "react";

/** Etiqueta del entorno; `null` en producción o sin valor (fail-closed). */
export function resolverEtiquetaEntorno(appEnv?: string): string | null {
  if (!appEnv || appEnv === "production") return null;
  return appEnv === "preview" ? "DEV · PREVIEW" : "DEV";
}

export function DevEnvBadge({
  appEnv = process.env.NEXT_PUBLIC_APP_ENV,
}: {
  appEnv?: string;
}) {
  const etiqueta = resolverEtiquetaEntorno(appEnv);
  if (!etiqueta) return null;
  return (
    <div
      data-testid="dev-env-badge"
      aria-label="Entorno de desarrollo"
      className="pointer-events-none fixed left-1/2 top-1 z-50 -translate-x-1/2 select-none rounded-full border border-amber-600/40 bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-900"
    >
      {etiqueta}
    </div>
  );
}
