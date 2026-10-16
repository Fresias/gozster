import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-2">
        <span className="inline-block rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          GOZSter v0.1 • Offline-First Ready
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Strength &amp; Performance Platform
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Selecciona tu entorno de trabajo: estudio de planificación para
          entrenadores o modo de entrenamiento en vivo para atletas.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Coach Studio (Desktop / Tablet)</CardTitle>
            <CardDescription>
              Dashboard de métricas de atletas, catálogo de ejercicios y
              constructor visual de rutinas de fuerza.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/studio"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Abrir Coach Studio
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Athlete App (Mobile-First PWA)</CardTitle>
            <CardDescription>
              Modo entrenamiento en vivo con controles táctiles de alta
              ergonomía, cronómetro de descanso y cola de sincronización
              Offline-First.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/athlete"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-opacity hover:opacity-90"
            >
              Abrir Athlete App
            </Link>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
