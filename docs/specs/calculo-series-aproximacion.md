# Cálculo de series de aproximación según último PR (GOZS-236)

Investigación para recomendar series de calentamiento/aproximación a partir del último PR o 1RM estimado del alumno. Solo diseño: sin cambios de código ni de BD.

## Hallazgos de las fuentes

- Esquema común: 3–4 series, con menos reps a medida que sube la carga. Ejemplo: barra vacía, 50 %, 75 %, 90 % del peso de trabajo ([Hevy](https://www.hevyapp.com/warm-up-sets/)).
- Variante con reps decrecientes: 40/55/70/85 % con 8/5/3/1 reps.
- Ejemplo para 100 kg en sentadilla o peso muerto: 50 % x8, 70 % x5, 85 % x2–3.
- Starting Strength: 2 x5 con barra vacía y luego 5-3-2-1 con carga creciente ([foro Starting Strength](https://startingstrength.com/resources/forum/general-programming/84551-warming-question.html)).
- StrongLifts publica una guía propia de calentamiento ([StrongLifts](https://support.stronglifts.com/article/87-how-to-warmup)). No se pudo contrastar su detalle numérico en esta investigación.
- Los porcentajes son plantillas, no prescripciones fijas: dependen del ejercicio, la carga, la edad de entrenamiento y las lesiones.
- Epley y Brzycki son más fiables con 2–10 reps y pierden precisión por encima de 15. El error típico es 2–5 % en entrenados y puede pasar del 10 % en otros casos ([Wikipedia: 1RM](https://en.wikipedia.org/wiki/One-repetition_maximum), [Metric Coach](https://metric.coach/docs/estimated-1rm)).
- Con 5–10 series de trabajo repartidas en un rango de cargas, el e1RM ya refleja cambios reales y no ruido ([Metric Coach](https://metric.coach/docs/estimated-1rm)).

Límite de la investigación: las fuentes secundarias coinciden en el esquema, pero no se leyó ningún estudio primario. Los umbrales de sesiones de abajo son una decisión de producto, no un valor de la literatura.

## Fórmula propuesta

**Base de cálculo.** `W` = peso de la serie de trabajo objetivo. Si el plan no lo fija, `W = último PR del ejercicio`, o el mejor e1RM (Epley) de series de 2–10 reps, que es el que sea mayor y esté disponible.

- Epley: `e1RM = peso × (1 + reps/30)`. Se usa solo con reps entre 2 y 10.

**Series.** Redondear al múltiplo de 2.5 kg más cercano (mínimo: barra vacía, 20 kg). Si dos series salen al mismo peso, se omite la repetida.

| # | % de W | Reps |
|---|--------|------|
| 1 | barra vacía | 8 |
| 2 | 50 % | 5 |
| 3 | 70 % | 3 |
| 4 | 85 % | 1–2 |

Reglas de recorte:
- Ejercicios de aislamiento o `W` < 40 kg: solo series 2 y 3.
- Trabajo ligero (RPE ≤ 6 o más de 12 reps objetivo): solo series 1–2.
- Las series generadas se marcan como `W` (calentamiento) y no entran en el tonelaje efectivo, según `ATHLETE_APP_UX_SPEC.md`.
- La recomendación no se persiste. Se calcula al vuelo y el alumno puede editarla.

## Mínimo de datos para recomendar

| Datos en ese ejercicio | Comportamiento |
|------------------------|----------------|
| 0 sesiones | Sin recomendación |
| 1 sesión con al menos una serie efectiva de 2–10 reps | Recomendación marcada como "estimada" |
| 2 o más sesiones | Recomendación normal |
| Último dato con más de 8 semanas de antigüedad | Se trata como "estimada" y se sugiere confirmar el peso |

Se descartan series de calentamiento, series de más de 10 reps y series sin peso (`peso = 0` o nulo). Estos umbrales son una propuesta a validar con el PM.

## Texto para el caso sin datos

> Aún no tenemos datos de este ejercicio. Empieza con la barra vacía o una carga muy ligera, haz 2 o 3 series progresivas y registra tu primera serie de trabajo. Con ella te sugeriremos tus series de aproximación.

## Implicaciones para backend

- Solo hace falta leer el mejor peso y reps efectivos por ejercicio y alumno desde `registro_series`. Se puede resolver con una RPC existente de récords o con una nueva sin tablas adicionales.
- Cualquier RPC nueva debe llevar su propia migración y RLS: el alumno solo ve sus propios registros.
- El cálculo es aritmética simple. Puede vivir en el cliente, y la RPC solo entregaría el mejor set.
