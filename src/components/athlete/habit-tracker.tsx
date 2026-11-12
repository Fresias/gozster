"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { HabitoRegistro } from "@/types/database.types";

interface HabitTrackerProps {
  athleteId?: string;
  athleteName?: string;
}

export function HabitTracker({ athleteId = "66b92b9a-1ce7-4e2e-a47c-7c5600000000", athleteName = "Fernando Rosales" }: HabitTrackerProps) {
  const [todayHabits, setTodayHabits] = React.useState<HabitoRegistro | null>(null);
  const [streakDays, setStreakDays] = React.useState<number>(5);
  const [isLoading, setIsLoading] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const todayStr = new Date().toISOString().split("T")[0]!;

  // Cargar registro de hábitos desde Supabase
  const loadHabits = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("habitos_registros")
        .select("*")
        .eq("alumno_id", athleteId)
        .eq("fecha", todayStr)
        .maybeSingle();

      if (data) {
        setTodayHabits(data as HabitoRegistro);
      } else {
        // Inicializar nuevo estado para el día de hoy
        setTodayHabits({
          id: "",
          alumno_id: athleteId,
          fecha: todayStr,
          agua_ml: 1500,
          pasos: 6500,
          sueno_horas: 7.5,
          habitos_completados: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // Calcular racha de días pasados completados
      const { count } = await supabase
        .from("habitos_registros")
        .select("*", { count: "exact", head: true })
        .eq("alumno_id", athleteId)
        .eq("habitos_completados", true);

      if (count !== null && count > 0) {
        setStreakDays(count);
      }
    } catch (e) {
      console.warn("Fallo cargando hábitos de Supabase, usando estado local:", e);
    } finally {
      setIsLoading(false);
    }
  }, [athleteId, todayStr]);

  React.useEffect(() => {
    loadHabits();
  }, [loadHabits]);

  // Guardar en Supabase en vivo
  const saveToSupabase = async (updated: HabitoRegistro) => {
    setTodayHabits(updated);
    try {
      const { error } = await supabase.from("habitos_registros").upsert(
        {
          alumno_id: updated.alumno_id,
          fecha: updated.fecha,
          agua_ml: updated.agua_ml,
          pasos: updated.pasos,
          sueno_horas: updated.sueno_horas,
          habitos_completados: updated.habitos_completados,
        },
        { onConflict: "alumno_id, fecha" }
      );

      if (!error) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (e) {
      console.warn("Error guardando hábito en Supabase:", e);
    }
  };

  if (!todayHabits) return null;

  const toggleComplete = () => {
    const updated = {
      ...todayHabits,
      habitos_completados: !todayHabits.habitos_completados,
    };
    saveToSupabase(updated);
  };

  const addWater = (amount: number) => {
    const updated = {
      ...todayHabits,
      agua_ml: Math.max(0, todayHabits.agua_ml + amount),
    };
    saveToSupabase(updated);
  };

  const addSteps = (amount: number) => {
    const updated = {
      ...todayHabits,
      pasos: Math.max(0, todayHabits.pasos + amount),
    };
    saveToSupabase(updated);
  };

  const updateSleep = (hours: number) => {
    const updated = {
      ...todayHabits,
      sueno_horas: Math.max(0, Math.min(24, hours)),
    };
    saveToSupabase(updated);
  };

  return (
    <Card className="border border-border/80 bg-card shadow-lg" data-testid="habit-tracker-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft text-success text-lg">
              🎯
            </span>
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Tracker de Hábitos Diarios
              </CardTitle>
              <CardDescription className="text-xs">
                {athleteName} • Fecha: {todayStr}
              </CardDescription>
            </div>
          </div>

          {/* Racha (Streak) */}
          <div className="flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 border border-warning-soft-border text-xs font-bold text-warning">
            <span>🔥</span>
            <span>Racha: {streakDays} días</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Hábito 1: Agua */}
        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <span>💧</span> Agua (Meta: 3.000 ml)
            </span>
            <span className="font-mono font-bold text-primary">
              {todayHabits.agua_ml} / 3000 ml
            </span>
          </div>
          {/* Barra de progreso */}
          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (todayHabits.agua_ml / 3000) * 100)}%` }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => addWater(250)}
            >
              +250 ml
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => addWater(500)}
            >
              +500 ml
            </Button>
          </div>
        </div>

        {/* Hábito 2: Pasos */}
        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <span>👟</span> Pasos Diarios (Meta: 10.000)
            </span>
            <span className="font-mono font-bold text-primary">
              {todayHabits.pasos} / 10000
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-success transition-all"
              style={{ width: `${Math.min(100, (todayHabits.pasos / 10000) * 100)}%` }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => addSteps(1000)}
            >
              +1.000 pasos
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => addSteps(2500)}
            >
              +2.500 pasos
            </Button>
          </div>
        </div>

        {/* Hábito 3: Horas de Sueño */}
        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <span>💤</span> Horas de Sueño (Meta: 8h)
            </span>
            <span className="font-mono font-bold text-primary">
              {todayHabits.sueno_horas}h
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="4"
              max="12"
              step="0.5"
              value={todayHabits.sueno_horas}
              onChange={(e) => updateSleep(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>

        {/* Checkbox de finalización del día */}
        <div className="pt-2">
          <Button
            size="touch"
            variant={todayHabits.habitos_completados ? "outline" : "default"}
            className={`w-full font-bold ${
              todayHabits.habitos_completados
                ? "border-success-soft-border text-success-soft-foreground bg-success-soft"
                : "bg-success hover:bg-success/90 text-success-foreground"
            }`}
            onClick={toggleComplete}
            data-testid="toggle-habits-completed-btn"
          >
            {todayHabits.habitos_completados
              ? "✓ ¡Hábitos del Día Cumplidos!"
              : "Marcar Hábitos como Cumplidos"}
          </Button>
          {saveSuccess && (
            <p className="text-center text-xs text-success font-semibold pt-1">
              ✓ Sincronizado en Supabase con éxito
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
