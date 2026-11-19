# Guía para coaches: cómo escribir indicaciones con formato

En **Athlete App v7**, la app del alumno ordena automáticamente las indicaciones técnicas en secciones claras (pasos numerados, puntos clave, errores comunes, tempo y respiración) **sin cambiar la forma en que cargás los ejercicios en Coach Studio**.

No hace falta migrar ni reescribir rutinas anteriores: cualquier texto libre sin encabezados se sigue mostrando exactamente igual que antes.

---

## 1. Dónde se escriben

Seguís usando los mismos campos de siempre en Coach Studio:

1. **En la rutina del alumno** (constructor de rutinas, campo *"Notas técnicas del coach para el atleta..."* → `ejercicios_en_rutina.notas`): indicaciones específicas para esa prescripción.
2. **En la biblioteca de ejercicios** (ficha del ejercicio, campo *"Comentarios / Indicaciones técnicas"* → `ejercicios.comentario`): guía técnica base reutilizable.

En la app del alumno se muestran primero las notas de la rutina y, si el comentario de la biblioteca tiene texto distinto, se agrega debajo bajo **"De la biblioteca"**.

---

## 2. Plantilla lista para copiar y pegar

```text
Pasos:
1. Barra apoyada en los trapecios, manos un poco más abiertas que los hombros.
2. Pies al ancho de la cadera, puntas levemente hacia afuera.
3. Inspirá, apretá el abdomen y bajá sentándote hacia atrás.
4. Bajá hasta que la cadera pase la rodilla.
5. Subí empujando el piso, sin perder la espalda neutra.
Puntos clave:
- Las rodillas siguen la dirección de las puntas.
- El peso queda en todo el pie, no en las puntas.
- La mirada al frente, el cuello neutro.
Errores comunes:
- Rodillas que se cierran al subir.
- Talones que se despegan del piso.
- Redondear la espalda abajo de todo.
Tempo: 3-1-X-1
Respiración: inspirá arriba, aguantá al bajar y soltá al pasar la parte más dura de la subida.
```

---

## 3. Reglas de la convención

No necesitás usar todas las secciones: la app muestra únicamente las que tengan contenido, siempre en el orden estándar (**texto libre → Pasos → Puntos clave → Errores comunes → Tempo y respiración**).

### Encabezados de lista
Deben ir **solos en su línea** (no importa si están en mayúsculas, minúsculas o sin dos puntos `:`):

- `Pasos:` (o `PASOS`) → lista numerada en la app.
- `Puntos clave:` (o `PUNTOS CLAVE`) → lista con tilde de verificación.
- `Errores comunes:` (o `ERRORES COMUNES`) → lista marcada con `×` de advertencia.

### Ítems dentro de cada sección
Cada línea debajo de un encabezado se toma como un ítem. Podés usar cualquiera de estos prefijos (la app los limpia para aplicar su propio estilo) o escribir la línea directa sin marcador:

- `1.` o `1)`
- `-`
- `•`
- `*`

### Campos de una línea (`Tempo` y `Respiración`)
Se escriben en una sola línea con dos puntos `:` y su valor a continuación:

- `Tempo: 3-1-X-1`
- `Respiración: inspirá arriba, aguantá al bajar.` (también se reconoce `Respiracion:` sin tilde).

> **Importante:** escribí `Tempo:` y `Respiración:` **al final** (o antes del siguiente encabezado), porque al leer una de estas líneas el parser cierra la sección de lista que estuviera abierta arriba.

### Texto libre y compatibilidad hacia atrás
- Todo texto escrito **antes del primer encabezado** se muestra arriba como párrafo normal.
- Si escribís una indicación rápida sin ningún encabezado (por ejemplo: `"Bajá la barra hasta el pecho, controlada, y empujá sin despegar los glúteos del banco."`), se conserva intacta tal como la escribiste, incluso si empieza con `- ` o `1. `.

---

## 4. Ejemplos cortos

### Solo puntos clave y tempo
```text
Enfocarse en el control excéntrico durante las 4 series.
Puntos clave:
- Codos a 45 grados del torso.
- Escápulas retraídas contra el banco.
Tempo: 3-1-1-0
```

### Indicaciones rápidas (texto libre tradicional)
```text
Mantener tensión constante sin bloquear rodillas arriba.
```
