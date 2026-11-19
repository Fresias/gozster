# 03a · Backend: molestias

> **Agente:** `@backend-eng` (el frontend lee §2 y §6). Reglas generales y BE-00, del que depende este issue: `03-backend.md`. Checkpoints: `07-checkpoints.md`.

---

## BE-02 · Molestias: guardar, asociar y avisar (D-51)

### 1 Qué está mal hoy

| Problema | Dónde |
|---|---|
| Sin señal, **el reporte se pierde**: la cola encola `PAIN_REPORT_SUBMITTED`, pero `flushQueue` solo envía eventos `WORKOUT_SET_*` y descarta el resto como "ok". | `use-offline-queue.ts:151-166` |
| El insert directo no manda `eva` y usa como `ejercicio_id` el id de la fila de rutina; si no es UUID, uno inventado (`30000000-…-0001`). | `use-athlete-store.ts:775-858` |
| El reporte no queda asociado a la sesión: `alumno_historial_dolor` no tiene `sesion_id`. Solo se marca `pain_reported` en la serie si hay `setNumber`. | esquema |
| El aviso es uno solo para toda la sesión (`activePainBanner`), no persiste al recargar la página y no sabe de articulaciones. | store |

### 2 Modelo: cómo se asocia una molestia

```
registro_sesiones (id UUID, BE-00)
   │ 1
   │ N
alumno_historial_dolor ──► ejercicios (ejercicio_id: el ejercicio del catálogo)
   │  + sesion_id               (columna nueva)  → la sesión en la que se reportó
   │  + ejercicio_en_rutina_id  (columna nueva)  → la prescripción concreta (Press banca del Día 1)
   │  + numero_serie            (columna nueva)  → la serie, si ya había alguna registrada
   │
   ├──► registro_series.pain_reported/pain_notes  (si numero_serie y la serie existe)
   └──► alertas_entrenador.reporte_dolor_id       (ya existe: el trigger la crea para alarma o EVA ≥ 7)
```

- **Molestia = una fila de `alumno_historial_dolor`.** Es el historial clínico que ya consume Coach Studio.
- **Aviso de la sesión = derivado**, no se guarda aparte: son las molestias con `sesion_id = la sesión en curso`. Por eso **no pasa a la sesión siguiente** (la sesión nueva tiene otro id) y se recupera si el alumno recarga la página o cambia de teléfono en medio de la sesión.
- **Herencia** (formato chico): también derivada, en la app (§6). No se guarda.

### 3 Migración `<ts>_molestias_sesion.sql`

```sql
-- D-51 (Athlete v7): asociar cada molestia a la sesión, la prescripción y la serie.
ALTER TABLE public.alumno_historial_dolor
  ADD COLUMN IF NOT EXISTS sesion_id UUID REFERENCES public.registro_sesiones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ejercicio_en_rutina_id UUID REFERENCES public.ejercicios_en_rutina(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_serie INT CHECK (numero_serie IS NULL OR numero_serie >= 1);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_sesion ON public.alumno_historial_dolor (sesion_id);

-- Registro idempotente: la app genera p_id; reintentar no duplica.
CREATE OR REPLACE FUNCTION public.registrar_molestia(
  p_id UUID,
  p_sesion_id UUID,
  p_ejercicio_id UUID,
  p_zona TEXT,
  p_eva INT,
  p_dia_id UUID DEFAULT NULL,
  p_ejercicio_en_rutina_id UUID DEFAULT NULL,
  p_numero_serie INT DEFAULT NULL,
  p_momento TEXT DEFAULT NULL,
  p_sintomas TEXT[] DEFAULT '{}',
  p_notas TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alumno UUID := auth.uid();
  v_dueno UUID;
  v_alarma BOOLEAN := coalesce(array_length(p_sintomas, 1), 0) > 0 OR p_eva >= 10;
BEGIN
  IF v_alumno IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501'; END IF;
  IF p_eva NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'EVA fuera de rango' USING ERRCODE = '23514'; END IF;
  IF p_zona NOT IN ('HOMBRO','RODILLA','LUMBAR','CODO','CUELLO','CADERA','TOBILLO','OTRO') THEN
    RAISE EXCEPTION 'Zona inválida' USING ERRCODE = '23514';
  END IF;

  -- La sesión puede no existir todavía (molestia antes de la primera serie): se crea, siempre del alumno.
  INSERT INTO public.registro_sesiones (id, alumno_id, dia_id)
  VALUES (p_sesion_id, v_alumno, p_dia_id)
  ON CONFLICT (id) DO NOTHING;
  SELECT alumno_id INTO v_dueno FROM public.registro_sesiones WHERE id = p_sesion_id;
  IF v_dueno IS DISTINCT FROM v_alumno THEN RAISE EXCEPTION 'Sesión ajena' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.alumno_historial_dolor (
    id, alumno_id, ejercicio_id, zona_articular, eva, momento_aparicion,
    es_sintoma_alarma, sintomas_alarma, notas_alumno, estado, fecha_reporte,
    sesion_id, ejercicio_en_rutina_id, numero_serie
  ) VALUES (
    p_id, v_alumno, p_ejercicio_id, p_zona, p_eva, p_momento,
    v_alarma, coalesce(p_sintomas, '{}'), NULLIF(btrim(p_notas), ''), 'PENDIENTE', current_date,
    p_sesion_id, p_ejercicio_en_rutina_id, p_numero_serie
  ) ON CONFLICT (id) DO NOTHING;
  -- severidad: la deriva fn_derivar_severidad_dolor desde eva. Alerta al coach: trigger existente.

  IF p_numero_serie IS NOT NULL THEN
    UPDATE public.registro_series
       SET pain_reported = true,
           pain_notes = concat_ws(' · ', p_zona, p_eva || '/10', NULLIF(btrim(p_notas), ''))
     WHERE sesion_id = p_sesion_id AND ejercicio_id = p_ejercicio_id AND numero_serie = p_numero_serie;
  END IF;
  RETURN p_id;
END $$;

REVOKE ALL ON FUNCTION public.registrar_molestia(UUID,UUID,UUID,TEXT,INT,UUID,UUID,INT,TEXT,TEXT[],TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_molestia(UUID,UUID,UUID,TEXT,INT,UUID,UUID,INT,TEXT,TEXT[],TEXT) TO authenticated;
```

**Antes de escribirla:** verificar que `severidad` tenga el trigger `BEFORE INSERT` que la completa desde `eva` (migración `20261106110000`). Si la columna es `NOT NULL` y el trigger no corre antes del check, pasar también la severidad derivada (`eva ≥ 7` AGUDO, `≥ 4` MODERADO, si no LEVE). RLS: la lectura ya la cubre `alumno_historial_dolor_select` (fila propia).

### 4 Store: estado, outbox y recuperación

```ts
export type ZonaArticular = "HOMBRO" | "RODILLA" | "LUMBAR" | "CODO" | "CUELLO" | "CADERA" | "TOBILLO" | "OTRO";
export type NivelMolestia = "leve" | "moderada" | "alta" | "alarma";

export interface MolestiaSesion {
  id: string;                      // UUID generado en la app = alumno_historial_dolor.id
  sesionId: string;                // currentSession.id (UUID, BE-00)
  ejercicioEnRutinaId: string;     // ej.id de currentSession
  ejercicioId: string;             // ejercicios.id del catálogo
  numeroSerie: number | null;      // serie en curso si ya había alguna registrada
  zona: ZonaArticular;
  eva: number;                     // 1-10
  sintomas: string[];
  momento: "CALENTAMIENTO" | "EN_SERIE" | "POST_EJERCICIO" | null;
  notas: string | null;
  nivel: NivelMolestia;            // alarma si hay síntoma o eva 10; alta 7-9; moderada 4-6; leve 1-3
  reportadaAt: string;             // ISO
  envio: "pendiente" | "enviada" | "error";
}
// currentSession.molestias: MolestiaSesion[]  (opcional, por defecto [])
```

Flujo de `reportarMolestia(datos)` (reemplaza a `reportPainEvent` dentro de la app):

1. Arma la `MolestiaSesion` con `envio: "pendiente"` y la agrega a `currentSession.molestias` (si ya había una del mismo `ejercicioEnRutinaId`, la reemplaza en pantalla; en la base quedan las dos).
2. **El aviso aparece al instante**, con o sin señal.
3. Si es alarma: `stopProtocolActive = true` (como hoy). Si es alta: el ejercicio queda bloqueado (§6).
4. Si hay señal, llama `registrar_molestia`. Éxito → `envio: "enviada"`. Error de red o 5xx → queda `pendiente`. Error `42501` o `23514` → `envio: "error"` + registro en `errores_app` (contexto `"molestia"`).
5. **Outbox propia:** `flushMolestiasPendientes()` envía, en orden, todas las `pendiente` de la sesión en curso y de `molestiasPendientesFueraDeSesion` (las de sesiones ya cerradas sin señal: se mueven ahí al cerrar). Se llama al volver la red (el shell ya escucha `online`), al abrir la app y después de cada reporte. No usa `use-offline-queue.ts`.
6. Persistencia: `currentSession` ya se persiste; agregar `molestiasPendientesFueraDeSesion` a `partialize`.
7. **Recuperación:** al cargar una sesión en curso con señal, `cargarMolestiasDeSesion(sesionId)` hace `select` de `alumno_historial_dolor` con `sesion_id = sesionId` y las fusiona por `id` (gana la local si está `pendiente`).
8. Al cerrar o reiniciar la sesión, `currentSession.molestias` vuelve a `[]` (después de mover las pendientes).

`PainReportModal` sigue llamando a la acción del store, ahora con `ejercicioId` real (`ej.ejercicio_id`). `reportPainEvent` y `activePainBanner` quedan sin uso en la app; borrarlos si ningún otro módulo los importa.

### 5 Copy del aviso y mensaje al coach

El copy del aviso completo y del formato chico está en `02-pantallas.md §3.3`. Coach Studio no cambia: ya lee `alumno_historial_dolor` y `alertas_entrenador`.

### 6 Herencia por articulación (lógica pura) · `src/lib/athlete/molestias.ts`

Grupos = etiquetas canónicas de `ejercicios.musculos_principales` (migración `20261108170000`: Pecho, Espalda, Piernas, Hombros, Brazos, Core).

```ts
export const TREN_SUPERIOR = ["Pecho", "Espalda", "Hombros", "Brazos"] as const;
export const TREN_INFERIOR = ["Piernas"] as const;
export const GRUPOS_POR_ZONA: Record<ZonaArticular, readonly string[]> = {
  HOMBRO: TREN_SUPERIOR, CODO: TREN_SUPERIOR, CUELLO: TREN_SUPERIOR,
  RODILLA: TREN_INFERIOR, CADERA: TREN_INFERIOR, TOBILLO: TREN_INFERIOR,
  LUMBAR: [...TREN_SUPERIOR, ...TREN_INFERIOR, "Core"], // ambos trenes y core
  OTRO: [],                                             // solo el ejercicio reportado
};
export function nivelMolestia(eva: number, sintomas: string[]): NivelMolestia;
export type AvisoMolestia =
  | { tipo: "propio"; molestia: MolestiaSesion }   // aviso completo; alta y alarma bloquean
  | { tipo: "heredado"; origen: MolestiaSesion }   // "! Molestia reportada"; no bloquea
  | null;
export function avisoMolestiaPara(
  ejercicio: { id: string; musculos_principales?: string[] | null },
  molestias: MolestiaSesion[],
): AvisoMolestia;
export function ejercicioBloqueado(ejercicioEnRutinaId: string, molestias: MolestiaSesion[]): boolean;
```

Reglas: (1) gana la molestia propia (la más reciente); (2) si no, hereda la más reciente de **otro** ejercicio cuya zona incluya alguno de sus `musculos_principales` (sin tildes ni mayúsculas); (3) sin grupo canónico, no hereda; (4) `OTRO` nunca hereda; (5) la heredada nunca bloquea.

### 7 Tests

`src/__tests__/athlete-molestias-herencia.spec.ts`:

| Reportado en | Zona | Evaluado (grupo) | Resultado |
|---|---|---|---|
| Press banca (Pecho) | HOMBRO | Remo (Espalda) | heredado |
| Press banca (Pecho) | HOMBRO | Sentadilla (Piernas) | null |
| Press banca (Pecho) | HOMBRO | Plancha (Core) | null |
| Sentadilla (Piernas) | LUMBAR | Plancha (Core) | heredado |
| Sentadilla (Piernas) | LUMBAR | Press militar (Hombros) | heredado |
| Sentadilla (Piernas) | RODILLA | Peso muerto rumano (Piernas) | heredado |
| Press banca (Pecho) | OTRO | Remo (Espalda) | null |
| Press banca (Pecho) | HOMBRO | Press banca (Pecho) | propio |
| Press banca, EVA 8 | HOMBRO | Remo | heredado y `ejercicioBloqueado(remo) === false` |
| — | — | Sesión nueva | `molestias = []` |

`src/__tests__/athlete-molestias-persistencia.spec.ts` (store con Supabase mockeado + PGlite para la RPC):

- Sin señal → aviso visible y `envio: "pendiente"`; vuelve la señal → una llamada a `registrar_molestia` con el mismo `p_id`; reintento → sin duplicado (PGlite: 1 fila).
- Molestia antes de la primera serie → la RPC crea `registro_sesiones` y la fila de dolor con `sesion_id`.
- Con `numero_serie` → `registro_series.pain_reported = true`.
- `p_sesion_id` de otro alumno → `42501`.
- EVA 8 → existe `alertas_entrenador` con `reporte_dolor_id` (trigger existente).
- Recargar la sesión con señal → `cargarMolestiasDeSesion` recupera los avisos.
- Cerrar la sesión con una pendiente → pasa a `molestiasPendientesFueraDeSesion` y se envía después.
