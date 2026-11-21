# GOZS-605 · R1 · Medición válida en fidelidad (`scale: "css"` + validación de dimensiones)

- **Rama:** `fix/605-athlete-v7-contraste-escala` (base `origin/main` en `f3a59f0`)
- **Issue Multica:** GOZS-605 (épica GOZS-573)
- **Estado:** listo para PR / `in_review`
- **Owner:** `@qa-eng`

## Cambios aplicados

1. **`tests/e2e/athlete-v7-fidelidad.e2e.ts` (línea 134):**
   - `await page.screenshot({ path: appPngPath });` reemplazado por `await page.screenshot({ path: appPngPath, scale: "css" });` para capturar a `390×844` (CSS pixels) en lugar del DPR del dispositivo (`Pixel 7` = `2.625` → `1024×2216`).
   - **Verificación de `toHaveScreenshot` (línea 135):** en Playwright (`node_modules/playwright/types/test.d.ts`), `toHaveScreenshot` ya tiene `scale: "css"` como valor por defecto (mientras que `page.screenshot` tiene `"device"` por defecto). Inspeccionando los snapshots existentes en `tests/e2e/athlete-v7-fidelidad.e2e.ts-snapshots/`, su resolución ya es `390×844`. No requiere agregar `scale: "css"` en la línea 135 para R3/R2 en Linux.

2. **`tests/e2e/helpers/contraste.ts`:**
   - Extraído y exportado `validarDimensionesContraste(refW, refH, appW, appH, contexto?)`, que lanza `Error` con clave, tema y dimensiones reales (`ref=...×..., app=...×...`) cuando `refW !== appW || refH !== appH`.
   - Inyectado e invocado dentro de `window.__procesarContraste` en `generarContrastePar` inmediatamente después de cargar `refImg` y `appImg` (`refImg.naturalWidth`, `refImg.naturalHeight`, `appImg.naturalWidth`, `appImg.naturalHeight`).

3. **`src/__tests__/athlete-v7-contraste.spec.ts`:**
   - Verifica que `validarDimensionesContraste` lanza `Error` cuando `app` mide `1024×2216` y `ref` mide `390×844` (incluyendo clave, tema y dimensiones), cuando difiere solo el ancho o solo el alto, y que pasa sin error cuando ambas miden `390×844`.
   - Prueba `generarContrastePar` end-to-end con PNGs reales generados en memoria/directorio temporal: rechaza la promesa con el `Error` esperado ante distinto tamaño y resuelve con `pctDistinto: 0` cuando coinciden (usando Chromium real cuando está disponible).

## Evidencia y restricciones respetadas

- **No se regeneró** evidencia visual (`antes` / `final`, archivada en historial git desde GOZS-648; la nueva evidencia se adjunta al PR/issue o como artifact) ni `tests/e2e/*-snapshots/**` en Windows.
- **No se declaró aprobada** ninguna evidencia visual (queda para R3/R2 en `ubuntu-latest`).
