import * as React from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertCircle, History } from "@/components/ui/icons";
import {
  ACCIONES_AUDITADAS,
  ENTIDADES_AUDITADAS,
  LIMITE_AUDITORIA,
  resumirCambio,
  type FiltroAuditoria,
  type RegistroAuditoria,
} from "@/services/auditoria-service";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

const SELECT_CLASS =
  "h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Historial de solo lectura de `auditoria_cambios` (GOZS-723). Componente de
 * servidor: el filtro es un `<form method="get">` nativo, sin estado en cliente.
 */
export function AuditoriaCambiosPanel({
  registros,
  filtro = {},
  error = null,
}: {
  registros: RegistroAuditoria[];
  filtro?: FiltroAuditoria;
  error?: string | null;
}) {
  const hayFiltro = Boolean(filtro.entidad || filtro.accion);

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6" data-testid="auditoria-cambios-panel">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Historial de cambios</h1>
        <p className="text-sm text-muted-foreground">
          Registro de solo lectura de cambios en contrataciones, conversaciones y rutinas. Muestra los últimos{" "}
          {LIMITE_AUDITORIA} cambios que tu rol puede ver.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3" data-testid="auditoria-filtros">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Entidad
          <select name="entidad" defaultValue={filtro.entidad ?? ""} className={SELECT_CLASS}>
            <option value="">Todas</option>
            {Object.entries(ENTIDADES_AUDITADAS).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Acción
          <select name="accion" defaultValue={filtro.accion ?? ""} className={SELECT_CLASS}>
            <option value="">Todas</option>
            {Object.entries(ACCIONES_AUDITADAS).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filtrar
        </button>
        {hayFiltro && (
          <a href="?" className="h-11 px-2 text-sm leading-[2.75rem] text-muted-foreground underline-offset-4 hover:underline">
            Limpiar
          </a>
        )}
      </form>

      {error ? (
        <div
          role="alert"
          data-testid="auditoria-error"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : registros.length === 0 ? (
        <EmptyState
          data-testid="auditoria-vacia"
          icon={<History className="h-6 w-6" />}
          title={hayFiltro ? "Sin cambios para este filtro" : "Todavía no hay cambios registrados"}
          description="Cuando se modifiquen contrataciones, conversaciones o rutinas, vas a ver el detalle acá."
        />
      ) : (
        <ol className="space-y-3" data-testid="auditoria-lista">
          {registros.map((r) => {
            const campos = resumirCambio(r.valores_anteriores, r.valores_nuevos);
            return (
              <li
                key={r.id}
                data-testid="auditoria-registro"
                className="rounded-xl border border-border bg-card p-4 text-sm text-card-foreground"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {ACCIONES_AUDITADAS[r.accion] ?? r.accion}
                    <span className="text-muted-foreground"> · {ENTIDADES_AUDITADAS[r.entidad] ?? r.entidad}</span>
                  </p>
                  <time dateTime={r.created_at} className="text-xs text-muted-foreground">
                    {FORMATO_FECHA.format(new Date(r.created_at))}
                  </time>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Por {r.autor_nombre ?? "Sistema"}</p>
                {r.motivo && <p className="mt-2">Motivo: {r.motivo}</p>}
                {campos.length > 0 && (
                  <dl className="mt-2 grid gap-1 text-xs">
                    {campos.map((c) => (
                      <div key={c.campo} className="flex flex-wrap gap-1">
                        <dt className="font-medium">{c.campo}:</dt>
                        <dd className="break-all text-muted-foreground">
                          {c.antes} → {c.despues}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
