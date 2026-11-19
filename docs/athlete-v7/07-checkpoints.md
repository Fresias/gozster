# 07 · Checkpoints: cómo retomar un issue cortado

> **Para todos los agentes.** Un issue se puede cortar en cualquier momento (sin uso disponible, contenedor reciclado, sesión cerrada). El trabajo que no esté **commiteado y pusheado** se pierde. Este protocolo hace que lo perdido sea, como mucho, un checkpoint, y que otro agente o el mismo, en una sesión nueva, retome sin preguntar nada.

---

## 1. Reglas

1. **Cada issue tiene checkpoints numerados** (`CP1`, `CP2`…) en `06-issues.md`. Cada uno es chico (unos 30 a 60 minutos de trabajo), deja el repo compilando y termina con commit + push.
2. **Archivo de progreso por issue**, en la rama del issue: `docs/athlete-v7/progreso/<ID>.md` (por ejemplo `progreso/FE-05.md`). Es la fuente de verdad del estado, no la memoria del agente ni los comentarios de Multica.
3. **Al cerrar cada checkpoint, en este orden:**
   1. Verificación del checkpoint (la que dice el issue: un test, typecheck, una captura).
   2. Actualizar `progreso/<ID>.md`: marcar el CP como ✅, anotar el commit y escribir **el próximo paso concreto** (archivo y función, no "seguir con FE-05").
   3. `git add` de los archivos tocados (nunca `git add -A` a ciegas) + commit + `git push -u origin <rama>`. Reintentar el push hasta 4 veces si falla la red. **Nunca `--force`.**
4. **Commit de checkpoint:** commit convencional normal, con el checkpoint al final del asunto:
   `feat(athlete): tarjeta de serie con metric-input [FE-05 CP2]`
5. **Durante un checkpoint**, si el trabajo va a llevar más de lo previsto, partirlo: commitear lo que compila como `CP2a` y seguir con `CP2b`. Mejor un checkpoint de más que una hora perdida.
6. **Gate:** en cada checkpoint, solo los tests afectados (`npx vitest run <spec>`) y `npm run typecheck`. El gate completo (`npm test && npm run typecheck && npm run lint && npm run build`) va en el **último** checkpoint, antes del PR.
7. **Comentarios en Multica:** no se comenta por checkpoint (regla "sin acción, sin comentario"). Solo al pasar a `in_review`, al quedar `blocked` o al entregar al PM.

---

## 2. Plantilla de `progreso/<ID>.md`

```markdown
# <ID> · <título>

- **Rama:** feature/<#>-<slug>
- **Issue Multica:** <#>
- **Estado:** en curso | bloqueado | listo para PR | PR abierto (<url>)
- **Última actualización:** <fecha y hora> por <agente>

## Checkpoints
- [x] CP1 · <título> · `<sha corto>`
- [x] CP2 · <título> · `<sha corto>`
- [ ] CP3 · <título>   ← próximo
- [ ] CP4 · <título>

## Próximo paso concreto
<archivo, función o componente y qué falta; comando de verificación>

## Decisiones tomadas en este issue
- <decisión> (motivo)

## Pendientes y dudas
- <qué falta confirmar y con quién>

## Tests afectados todavía sin actualizar
- <spec>
```

---

## 3. Cómo retomar (cualquier agente, sesión nueva)

```bash
git fetch origin
git checkout <rama> 2>/dev/null || git checkout -b <rama> origin/<rama>
cat docs/athlete-v7/progreso/<ID>.md
git log --oneline -8
git status -s
```

1. Si la rama no existe en `origin`, el issue no empezó: crearla desde `main` y arrancar en CP1.
2. Comparar el último commit con el último CP marcado ✅. Si hay un commit `[<ID> CPn]` sin marcar en el archivo, marcarlo (quedó cortado entre el push y la actualización).
3. Repetir la verificación del último CP ✅ (barato: un test o typecheck). Si falla, arreglar eso primero.
4. Seguir con el **primer CP sin marcar**, empezando por "Próximo paso concreto".
5. Si `git status` muestra cambios sin commitear de una sesión anterior en el mismo contenedor: revisarlos con `git diff`; si corresponden al próximo CP, terminarlos; si no se entienden, descartarlos **archivo por archivo** (`git restore <archivo>`). Nunca `git reset --hard` ni `git clean -fd`.

---

## 4. Estado de la épica (para el PM)

El PM mantiene `docs/athlete-v7/progreso/EPICA.md` (ya viene armado en este paquete, con todos los issues en "sin empezar"). Lo actualiza en una rama de documentación propia, `docs/<#>-athlete-v7-progreso`, con un commit y push por cambio, y lo mergea a `main` por PR cuando conviene. Una fila por issue:

| ID | Owner | Rama | Estado | Último CP | PR | Notas |
|---|---|---|---|---|---|---|

Lo actualiza al crear issues, al recibir cada entrega y al mergear. Para retomar la orquestación alcanza con leer ese archivo y los `progreso/<ID>.md` de las ramas abiertas (`git branch -r --list 'origin/*athlete-v7*'`).
