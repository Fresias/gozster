import * as React from "react";
import {
  agruparRankingPorEjercicio,
  etiquetaMarca,
  type RankingFuncionalFila,
} from "@/lib/mi-progreso";

export interface RankingFuncionalAlumnoProps {
  filas: RankingFuncionalFila[];
  nombres: Record<string, string>; // ejercicio_id → nombre del catálogo
}

// Ranking de Funcional (GOZS-849). Solo "Nombre + inicial", categoría, marca y ratio:
// la RPC no devuelve peso corporal crudo ni datos de contacto de otros alumnos.
export function RankingFuncionalAlumno({ filas, nombres }: RankingFuncionalAlumnoProps) {
  const ejercicios = React.useMemo(() => agruparRankingPorEjercicio(filas), [filas]);
  if (ejercicios.length === 0) return null;

  return (
    <section className="grid gap-3" aria-labelledby="ranking-funcional-titulo" data-testid="ranking-funcional-alumno">
      <h2 id="ranking-funcional-titulo" className="a-eb a-t-label">
        Ranking Funcional
      </h2>
      {ejercicios.map((ej) => (
        <div key={ej.ejercicio_id} className="a-card a-ccard" data-testid="ranking-funcional-ejercicio">
          <div className="a-top">
            <h3 className="a-t-bs">{nombres[ej.ejercicio_id] ?? "Ejercicio"}</h3>
            {ej.categoria && <span className="a-chip a-t-label">Categoría {ej.categoria}</span>}
          </div>
          <ol className="a-days" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {ej.filas.map((f) => (
              <li
                key={`${f.nombre_corto}-${f.fecha}-${f.peso_kg}`}
                className="a-row"
                data-testid={f.es_usuario_actual ? "ranking-funcional-propia" : "ranking-funcional-fila"}
                aria-current={f.es_usuario_actual ? "true" : undefined}
              >
                <span className="a-t-label" style={{ minWidth: 28 }}>
                  {f.posicion !== null ? `#${f.posicion}` : "—"}
                </span>
                <span className="a-rt">
                  <b className="a-t-bs">{f.es_usuario_actual ? `${f.nombre_corto} (vos)` : f.nombre_corto}</b>
                  <small className="a-t-sec">{etiquetaMarca(f)}</small>
                </span>
                {f.ratio !== null && <span className="a-chip a-t-label">{`${f.ratio} x peso`}</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
