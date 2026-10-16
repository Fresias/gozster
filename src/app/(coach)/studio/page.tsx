import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function CoachStudioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Coach Studio</h1>
        <p className="text-sm text-muted-foreground">
          Panel de gestión de atletas, catálogo de ejercicios y constructor de
          rutinas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Atletas Activos</CardDescription>
            <CardTitle className="text-2xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Listo para conectar con Supabase RLS
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Sin Rutina Asignada</CardDescription>
            <CardTitle className="text-2xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Alertas de planificación pendientes
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Riesgo de Churn</CardDescription>
            <CardTitle className="text-2xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Inactividad &gt; 7 días
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
