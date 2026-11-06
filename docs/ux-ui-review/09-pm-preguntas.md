# 09 · Tarea para el PM: preguntas antes de implementar la fidelidad visual

> **Para:** `@PM-GOZster`
> **Entregable:** un solo archivo, `docs/handoff/ux-ui-review/09-respuesta-pm.md`, con las preguntas consolidadas en el formato de la sección 4. El dueño del producto se lo pasa al diseñador (Claude Design), que responde, actualiza el canvas si hace falta y devuelve las respuestas.
> **No abrir issues de implementación (FIX-V1 a FIX-V10) hasta tener las respuestas.**

---

## 1. Objetivo

Coach Studio tiene que verse **como el canvas "GOZSter — Review UX/UI"**. La implementación en `main` del 6 de noviembre no se parece: usa el azul de marca, sombras, mayúsculas y estructuras de la versión anterior. Antes de una segunda vuelta queremos eliminar toda ambigüedad, para que los agentes no tengan que suponer nada.

Tu trabajo es **encontrar todo lo que falta definir** para que el resultado quede igual al objetivo, preguntárselo a los agentes y consolidarlo en preguntas concretas. No hay que responder ni diseñar nada.

---

## 2. Qué leer (en este orden)

1. `08-fidelidad-visual.md` — qué cambia y por qué; checklist por vista; issues FIX-V1 a FIX-V10.
2. `comparar/*.jpg` — objetivo vs implementado, por vista.
3. `objetivo/html/*.html` — abrir en el navegador; es la fuente exacta de medidas y colores.
4. `01-sistema-visual.md` y `02-vistas.md` — componentes, datos, estados y textos.
5. `07-revision-implementacion.md` — problemas de datos que siguen abiertos (FIX-01 a FIX-09).

---

## 3. Cómo armar las preguntas

1. **Pedile a cada agente** que lea su parte y te devuelva todo lo que no podría implementar o verificar **sin suponer**:
   - `@frontend-eng`: lo que no está dibujado, medidas que no puede leer del HTML, estados sin diseño, conflictos entre el canvas y los documentos, componentes que no sabe cómo construir sin dependencias.
   - `@qa-eng`: criterios que no puede verificar de forma binaria; cómo decidir si algo es "igual al objetivo".
   - `@backend-eng`: solo si algo visual necesita un dato que hoy no existe (por ejemplo, la medición de peso corporal o "alumno desde").
2. **Revisá por tu cuenta** los temas de la sección 5. Son huecos que ya sabemos que existen; incluí los que sigan abiertos después de leer.
3. **Consolidá:**
   - Una pregunta por tema; uní duplicados.
   - Descartá lo que ya responden los documentos y citá dónde está la respuesta.
   - Si una pregunta tiene una respuesta razonable por defecto, escribila como recomendación: el dueño solo confirma.
   - Ordená de más a menos bloqueante.
4. **Máximo 25 preguntas.** Si hay más, agrupá las menores en una sola pregunta de "detalles".

---

## 4. Formato de `09-respuesta-pm.md`

```markdown
# Preguntas para cerrar la fidelidad visual

Fecha · Agentes consultados: frontend, qa, backend

## Resumen
- Preguntas bloqueantes: N
- Preguntas con recomendación (solo confirmar): N
- Vistas que necesitan diseño nuevo en el canvas: lista

## Preguntas

### P01 · <título corto>
- **De:** frontend | qa | backend | PM
- **Bloquea:** FIX-V4 (y otros)
- **Vista / componente:** Ficha · isla Fuerza
- **Contexto:** qué dice el canvas, qué dicen los documentos, qué hay hoy. Citar archivo y sección.
- **Pregunta:** una sola, concreta.
- **Opciones:** A) … B) …
- **Recomendación del PM:** A, porque …
- **Respuesta:** _(la completa el diseñador)_

### P02 · …

## Ya respondido en los documentos (no hace falta preguntar)
- <duda> → `08-fidelidad-visual.md §3`
```

---

## 5. Temas que ya sabemos que hay que cubrir

Incluí cada uno como pregunta si sigue abierto, o en "Ya respondido" si lo resuelven los documentos.

**Pantallas y estados sin diseño en el canvas**
1. **Vistas que no están dibujadas:** Métricas, Ingresos (Sankey), Documentación, chat, constructor de rutinas, Sheet "Editar datos del alumno", vista previa del alumno ("Ver como alumno"), Athlete App, login. ¿Se dibujan antes de implementar o se aplican las reglas globales?
2. **Móvil más allá de Inicio:** ficha, Cobros, Agenda, directorio. Solo está dibujado Inicio a 390 px.
3. **Modo noche:** el canvas solo tiene modo día. ¿Alcanzan los tokens dark de `08 §2` o se necesitan pantallas dibujadas?
4. **Estados no dibujados:** carga, vacío, error, hover, foco, deshabilitado, Sheet y Dialog abiertos, menú `⋯` abierto, Personalizar activo. ¿Cuáles necesitan diseño y cuáles salen de `01-sistema-visual.md`?

**Marca y alcance**

5. **Azul de marca:** con zinc en Coach Studio, ¿la Athlete App y la landing siguen en azul? ¿Quién aprueba el cambio en `docs/MARCA.md`?
6. **Logo:** el canvas usa un cuadrado negro con "G". ¿Es el logo definitivo o hay un asset de marca?

**Conflictos entre el canvas y los documentos**

7. **Tasa de cobro:** el canvas dice "25 de 36 contratos pagos"; `02-vistas.md §5` la define en pesos (cobrado / facturado). Confirmar que mandan los documentos.
8. **Chat en escritorio:** se elimina el botón flotante. ¿Desde dónde se accede al chat general (no al de un alumno)?
9. **Menú en pantallas secundarias:** confirmar que va completo (240 px), como en Inicio, y no colapsado como se ve en el canvas.
10. **Directorio abierto por defecto (D5):** el canvas lo muestra abierto y la implementación lo recuerda colapsado. Confirmar.

**Ficha del alumno**

11. **Personalizar con dos columnas:** ¿una isla puede moverse de una columna a la otra? ¿Hay un límite por columna?
12. **Cosas que salen de la vista principal:** heatmap de adherencia, 1RM Brzycki, puntaje "Salud x/100", "Cargas históricas". ¿Dónde viven (Registros, Tooltip, `⋯`) o se eliminan?
13. **Datos que el diseño muestra y quizá no existen:** peso corporal histórico, "alumno desde", medio de pago, top set por sesión. Backend confirma cuáles hay.

**Criterio de aceptación**

14. **¿Qué es "igual al objetivo"?** ¿Checklist binario de `08 §4` + capturas lado a lado, o una tolerancia medible (por ejemplo, ±2 px en espaciado y los colores exactos de los tokens)?
15. **¿Quién da el OK visual final?** ¿QA con el checklist, el dueño del producto mirando las capturas, o ambos?

**Orden de trabajo**

16. **Prioridades:** ¿la parte visual (FIX-V*) va antes que los problemas de datos (FIX-01 a FIX-09)? Recomendación del diseñador: visual primero, salvo FIX-02, que va en paralelo porque hoy escribe una nota de ejemplo en fichas clínicas reales.
17. **Granularidad de los PR:** ¿un PR por vista o varios por componente?

---

## 6. Qué no hacer

- No implementar ni abrir PRs de FIX-V* hasta tener las respuestas.
- No inventar respuestas: si una pregunta tiene recomendación, igual queda para confirmar.
- No preguntar lo que ya responden `08-fidelidad-visual.md` o `02-vistas.md`: citarlo en "Ya respondido".
- No tomar los números del canvas como datos reales: son ejemplos.
