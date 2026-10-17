"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { NutricionRegistro } from "@/types/database.types";

interface NutritionTrackerProps {
  athleteId?: string;
  athleteName?: string;
}

export function NutritionTracker({
  athleteId = "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7",
  athleteName = "Atleta",
}: NutritionTrackerProps) {
  const [nutrition, setNutrition] = React.useState<NutricionRegistro | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const todayStr = new Date().toISOString().split("T")[0]!;

  const loadNutrition = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("nutricion_registros")
        .select("*")
        .eq("alumno_id", athleteId)
        .eq("fecha", todayStr)
        .maybeSingle();

      if (data) {
        setNutrition(data as NutricionRegistro);
      } else {
        setNutrition({
          id: "",
          alumno_id: athleteId,
          fecha: todayStr,
          calorias_consumidas: 1850,
          calorias_meta: 2200,
          proteinas_g: 140,
          proteinas_meta_g: 160,
          carbos_g: 190,
          carbos_meta_g: 220,
          grasas_g: 55,
          grasas_meta_g: 65,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("Fallo cargando nutrición de Supabase:", e);
    } finally {
      setIsLoading(false);
    }
  }, [athleteId, todayStr]);

  React.useEffect(() => {
    loadNutrition();
  }, [loadNutrition]);

  const saveToSupabase = async (updated: NutricionRegistro) => {
    setNutrition(updated);
    try {
      const { error } = await supabase.from("nutricion_registros").upsert(
        {
          alumno_id: updated.alumno_id,
          fecha: updated.fecha,
          calorias_consumidas: updated.calorias_consumidas,
          calorias_meta: updated.calorias_meta,
          proteinas_g: updated.proteinas_g,
          proteinas_meta_g: updated.proteinas_meta_g,
          carbos_g: updated.carbos_g,
          carbos_meta_g: updated.carbos_meta_g,
          grasas_g: updated.grasas_g,
          grasas_meta_g: updated.grasas_meta_g,
        },
        { onConflict: "alumno_id, fecha" }
      );

      if (!error) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (e) {
      console.warn("Error guardando nutrición en Supabase:", e);
    }
  };

  if (!nutrition) return null;

  const updateMacro = (field: keyof NutricionRegistro, delta: number) => {
    const currentVal = (nutrition[field] as number) || 0;
    const updated = {
      ...nutrition,
      [field]: Math.max(0, currentVal + delta),
    };
    // Recalcular calorías totales estimadas: 4*Prot + 4*Carb + 9*Grasa
    if (field === "proteinas_g" || field === "carbos_g" || field === "grasas_g") {
      const p = field === "proteinas_g" ? updated.proteinas_g : nutrition.proteinas_g;
      const c = field === "carbos_g" ? updated.carbos_g : nutrition.carbos_g;
      const g = field === "grasas_g" ? updated.grasas_g : nutrition.grasas_g;
      updated.calorias_consumidas = p * 4 + c * 4 + g * 9;
    }
    saveToSupabase(updated);
  };

  const getPercent = (actual: number, target: number) =>
    target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;

  return (
    <Card className="border border-border/80 bg-card shadow-lg" data-testid="nutrition-tracker-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 text-lg">
              🥗
            </span>
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Nutrición &amp; Balance de Macros
              </CardTitle>
              <CardDescription className="text-xs">
                {athleteName} • Everfit Macro Tracker • {todayStr}
              </CardDescription>
            </div>
          </div>
          <span className="font-mono text-sm font-black text-primary">
            {nutrition.calorias_consumidas} / {nutrition.calorias_meta} kcal
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Barra de Calorías Totales */}
        <div className="space-y-1.5 bg-secondary/20 p-3 rounded-xl border border-border/40">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>Calorías Totales</span>
            <span className="font-mono text-primary">
              {getPercent(nutrition.calorias_consumidas, nutrition.calorias_meta)}%
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all"
              style={{
                width: `${getPercent(nutrition.calorias_consumidas, nutrition.calorias_meta)}%`,
              }}
            />
          </div>
        </div>

        {/* Tres Desgloses de Macronutrientes */}
        <div className="grid grid-cols-3 gap-2">
          {/* Proteínas */}
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-2.5 text-center space-y-1.5">
            <span className="text-[11px] font-bold text-blue-400 block">
              🥩 Proteínas
            </span>
            <span className="font-mono text-xs font-bold text-foreground block">
              {nutrition.proteinas_g} / {nutrition.proteinas_meta_g}g
            </span>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{
                  width: `${getPercent(nutrition.proteinas_g, nutrition.proteinas_meta_g)}%`,
                }}
              />
            </div>
            <div className="flex gap-1 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 text-[10px] px-1"
                onClick={() => updateMacro("proteinas_g", -10)}
              >
                -10
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 text-[10px] px-1"
                onClick={() => updateMacro("proteinas_g", 10)}
              >
                +10
              </Button>
            </div>
          </div>

          {/* Carbohidratos */}
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-2.5 text-center space-y-1.5">
            <span className="text-[11px] font-bold text-amber-400 block">
              🍚 Carbos
            </span>
            <span className="font-mono text-xs font-bold text-foreground block">
              {nutrition.carbos_g} / {nutrition.carbos_meta_g}g
            </span>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-amber-500"
                style={{
                  width: `${getPercent(nutrition.carbos_g, nutrition.carbos_meta_g)}%`,
                }}
              />
            </div>
            <div className="flex gap-1 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 text-[10px] px-1"
                onClick={() => updateMacro("carbos_g", -15)}
              >
                -15
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 text-[10px] px-1"
                onClick={() => updateMacro("carbos_g", 15)}
              >
                +15
              </Button>
            </div>
          </div>

          {/* Grasas */}
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-2.5 text-center space-y-1.5">
            <span className="text-[11px] font-bold text-rose-400 block">
              🥑 Grasas
            </span>
            <span className="font-mono text-xs font-bold text-foreground block">
              {nutrition.grasas_g} / {nutrition.grasas_meta_g}g
            </span>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-rose-500"
                style={{
                  width: `${getPercent(nutrition.grasas_g, nutrition.grasas_meta_g)}%`,
                }}
              />
            </div>
            <div className="flex gap-1 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 text-[10px] px-1"
                onClick={() => updateMacro("grasas_g", -5)}
              >
                -5
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 flex-1 text-[10px] px-1"
                onClick={() => updateMacro("grasas_g", 5)}
              >
                +5
              </Button>
            </div>
          </div>
        </div>

        {saveSuccess && (
          <p className="text-center text-[10px] text-emerald-400 font-semibold pt-1">
            ✓ Nutrición sincronizada en Supabase con éxito
          </p>
        )}
      </CardContent>
    </Card>
  );
}
