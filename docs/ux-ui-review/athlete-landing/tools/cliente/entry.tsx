// Monta en el navegador componentes que cargan datos en useEffect (Hábitos, Nutrición),
// con un cliente Supabase simulado que responde "sin registro" (el componente usa sus valores por defecto).
import * as React from "react";
import { createRoot } from "react-dom/client";
import { HabitTracker } from "@/components/athlete/habit-tracker";
import { NutritionTracker } from "@/components/athlete/nutrition-tracker";

const COMPONENTES: Record<string, React.ReactElement> = {
  habitos: <HabitTracker athleteId="0f0f0f0f-0000-4000-8000-000000000000" athleteName="Lucía Fernández" />,
  nutricion: <NutritionTracker athleteId="0f0f0f0f-0000-4000-8000-000000000000" athleteName="Lucía Fernández" />,
};
const id = new URLSearchParams(location.search).get("c") || "habitos";
createRoot(document.getElementById("root")!).render(COMPONENTES[id]!);
