"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { calcularEjemplosDocumentacion } from "@/lib/documentacion-ejemplos";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import {
  FAQ,
  FICHAS,
  GLOSARIO,
  MAPA,
  QUIEN_VE_QUE,
  RECORRIDOS,
  SECCIONES,
  metricasDocumentacion,
} from "./documentacion-contenido";

function Titulo({ id, n, children }: { id: string; n: number; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 flex items-center gap-2.5 text-xl font-black tracking-tight text-foreground">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm text-primary">{n}</span>
      {children}
    </h2>
  );
}

function Ejemplo({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
      <span className="font-bold">Ejemplo: </span>
      {children}
    </p>
  );
}

export function DocumentacionView() {
  const mode = useWorkspaceModeStore((s) => s.mode);

  if (mode !== "TESTEO") {
    return (
      <div role="status" data-testid="documentacion-aviso-produccion" className="mx-auto max-w-xl rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center">
        <h1 className="text-lg font-black text-foreground">Esta guía está en Modo Testeo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Para leerla, activá el <strong>Modo Testeo</strong> con el interruptor de arriba y volvé a esta página.
        </p>
      </div>
    );
  }

  return <DocumentacionPagina />;
}

export function DocumentacionPagina() {
  const ejemplos = React.useMemo(() => calcularEjemplosDocumentacion(), []);
  const metricas = metricasDocumentacion(ejemplos);

  return (
    <article data-testid="documentacion-pagina" className="mx-auto max-w-5xl space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Documentación de GOZSter</h1>
        <p className="text-sm text-muted-foreground">Cómo se guarda la información y cómo se calcula cada número, explicado sin vueltas.</p>
      </header>

      <nav aria-label="Índice de la guía" data-testid="documentacion-indice" className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-border/70 bg-background/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-14">
        <ol className="flex min-w-max gap-2">
          {SECCIONES.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground">
                {i + 1}. {s.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section className="space-y-3">
        <Titulo id="para-que-sirve" n={1}>Para qué sirve esta guía</Titulo>
        <p className="text-sm text-foreground">Acá ves qué información guarda GOZSter, cómo se conecta entre sí y cómo se calculan los números del Studio.</p>
        <p className="text-sm text-muted-foreground">Los ejemplos usan alumnos y planes de la demo. Los números de la sección Métricas se calculan en vivo con las mismas cuentas que usa el sistema.</p>
      </section>

      <section className="space-y-4">
        <Titulo id="glosario" n={2}>Glosario rápido</Titulo>
        <dl className="grid gap-3 sm:grid-cols-2">
          {GLOSARIO.map(([t, d]) => (
            <Card key={t} className="p-4">
              <dt className="text-sm font-bold text-foreground">{t}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{d}</dd>
            </Card>
          ))}
        </dl>
      </section>

      <section className="space-y-4">
        <Titulo id="mapa" n={3}>El mapa de la información</Titulo>
        <p className="text-sm text-muted-foreground">Cada recuadro es un grupo de datos. Las flechas dicen cómo se conectan.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {MAPA.map((g) => (
            <Card key={g.tema} className="space-y-3 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-primary">{g.tema}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {g.cajas.map((c, i) => (
                  <React.Fragment key={c}>
                    {i > 0 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
                    <span className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-foreground">{c}</span>
                  </React.Fragment>
                ))}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {g.frases.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Titulo id="fichas" n={4}>Fichas</Titulo>
        <div className="grid gap-4 md:grid-cols-2">
          {FICHAS.map((f) => (
            <Card key={f.nombre} className="space-y-2 p-4">
              <h3 className="text-base font-black text-foreground">{f.nombre}</h3>
              <p className="text-sm text-muted-foreground"><strong className="text-foreground">Guarda:</strong> {f.guarda}</p>
              <Ejemplo>{f.ejemplo}</Ejemplo>
              <p className="text-sm text-muted-foreground"><strong className="text-foreground">Quién lo ve y lo modifica:</strong> {f.quien}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Titulo id="recorridos" n={5}>Recorridos paso a paso</Titulo>
        {RECORRIDOS(ejemplos).map((r) => (
          <Card key={r.titulo} className="space-y-3 p-4">
            <h3 className="text-base font-black text-foreground">{r.titulo}</h3>
            <ol className="space-y-2 border-l-2 border-primary/30 pl-4">
              {r.pasos.map((p) => <li key={p} className="text-sm text-muted-foreground">{p}</li>)}
            </ol>
            <Ejemplo>{r.ejemplo}</Ejemplo>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <Titulo id="metricas" n={6}>Métricas</Titulo>
        <div className="grid gap-4 md:grid-cols-2">
          {metricas.map((m) => (
            <Card key={m.nombre} className="space-y-2 p-4" data-testid="documentacion-metrica">
              <h3 className="text-base font-black text-foreground">{m.nombre}</h3>
              <p className="text-sm text-muted-foreground"><strong className="text-foreground">Qué significa:</strong> {m.significa}</p>
              <p className="text-sm text-muted-foreground"><strong className="text-foreground">Cómo se calcula:</strong> {m.calculo}</p>
              <Ejemplo>{m.ejemplo}</Ejemplo>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Titulo id="quien-ve-que" n={7}>Quién ve qué</Titulo>
        <div className="overflow-x-auto rounded-2xl border border-border/80">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Información</th><th className="p-3">Alumno</th><th className="p-3">Entrenador</th><th className="p-3">Dueño</th></tr>
            </thead>
            <tbody>
              {QUIEN_VE_QUE.map(([dato, a, e, d]) => (
                <tr key={dato} className="border-t border-border/60">
                  <th scope="row" className="p-3 font-semibold text-foreground">{dato}</th>
                  <td className="p-3 text-muted-foreground">{a}</td>
                  <td className="p-3 text-muted-foreground">{e}</td>
                  <td className="p-3 text-muted-foreground">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <Titulo id="preguntas" n={8}>Preguntas frecuentes</Titulo>
        <div className="space-y-2">
          {FAQ.map(([p, r]) => (
            <details key={p} className="group rounded-xl border border-border/80 bg-card p-4">
              <summary className="min-h-6 cursor-pointer text-sm font-bold text-foreground">{p}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{r}</p>
            </details>
          ))}
        </div>
      </section>
    </article>
  );
}
