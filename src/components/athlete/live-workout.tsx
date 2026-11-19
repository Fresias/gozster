"use client";

import * as React from "react";
// Contenedor fino: la pantalla del ejercicio vive en `ejercicio-activo.tsx` (FE-05).
import { EjercicioActivo, findNextExerciseInWorkout } from "@/components/athlete/ejercicio-activo";

export { findNextExerciseInWorkout };

export function LiveWorkout() {
  return <EjercicioActivo />;
}
