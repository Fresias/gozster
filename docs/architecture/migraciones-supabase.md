# Migraciones de Base de Datos (Supabase CLI y Gate de CI)

> **Estado:** Vigente (E-3 / E-4 · GOZS-688)
> **Regla única:** el **único camino autorizado** para aplicar migraciones en dev o producción es `supabase db push` mediante la CLI de Supabase (usando `supabase/config.toml`) o el job de CI en `.github/workflows/deploy-production.yml`.

---

## 1. Política única de migraciones

- **Prohibido** aplicar migraciones pegando SQL a mano en el SQL Editor del Dashboard o mediante scripts ad-hoc contra la Management API.
- Toda modificación de esquema es **append-only** en `supabase/migrations/` con versión numérica única (`<YYYYMMDDHHMMSS>_<slug>.sql`) posterior a la última de `main` y de los PRs abiertos.
- La configuración local y de CLI vive versionada en `supabase/config.toml` (generado con `supabase init`).

---

## 2. Flujo estándar para crear, validar y aplicar migraciones

1. **Crear el archivo de migración:**
   ```bash
   supabase migration new <nombre_descriptivo>
   ```
   (o crear `supabase/migrations/<YYYYMMDDHHMMSS>_<nombre_descriptivo>.sql` respetando el orden append-only).
2. **Validar localmente sobre Postgres real (PGlite):**
   ```bash
   npx vitest run --project db
   ```
3. **Aplicar en el proyecto destino únicamente con Supabase CLI:**
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push --remote
   ```
   (En CLI v3 `db push` es local por defecto; `--remote` apunta al proyecto enlazado.) También se puede disparar desde el job de CI (`.github/workflows/deploy-production.yml` con `apply_migrations=true` o `SUPABASE_AUTO_PUSH=true`).
4. **Verificar paridad de migraciones:**
   ```bash
   supabase migration list --remote <project-ref>
   node scripts/check-supabase-migrations.mjs --remote <project-ref>
   ```

---

## 3. Gate de CI antes del deploy a producción (orden: migración → deploy)

El workflow `.github/workflows/deploy-production.yml` garantiza que el código **nunca** salga a producción antes que sus migraciones:

1. **`check-migrations` (Migration Gate):**
   - Si `apply_migrations=true` (en `workflow_dispatch`) o `vars.SUPABASE_AUTO_PUSH == 'true'`, ejecuta primero `supabase db push`.
   - Ejecuta `node scripts/check-supabase-migrations.mjs`, que consulta `supabase migration list` en el destino y lo contrasta contra `supabase/migrations/*.sql`.
   - Si existe **cualquier** migración del repositorio sin aplicar en la base destino (o si faltan credenciales / falla la consulta), el job falla con código `1` y **bloquea el deploy**.
2. **`deploy` (Deploy to Production):**
   - Declara `needs: [check-migrations]` e `if: success() && ...`.
   - Solo corre cuando el gate de migraciones terminó en verde.

### Variables y secretos requeridos en GitHub (`environment: production`)

- Variable de repositorio/entorno: `PRODUCTION_DEPLOY_ENABLED=true` (habilita el gate automático en cada push a `main`). Opcional: `SUPABASE_AUTO_PUSH=true`.
- Secretos de Supabase: `SUPABASE_DB_URL` **o** la terna `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` (token con permisos acotados, distinto del entorno dev) + `SUPABASE_DB_PASSWORD`.
- Secretos de Vercel: `VERCEL_TOKEN` + `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` (o `VERCEL_DEPLOY_HOOK_URL`). En Vercel, desactivar el auto-deploy por Git de la rama `main` para que el único despliegue a producción pase por este workflow.

---

## 4. Nota operativa X1 (`20261016100000_multicoach_subscription_cloning.sql`)

La migración histórica `20261016100000_multicoach_subscription_cloning.sql` ejecuta `ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS ...` antes de `BEGIN;` y luego referencia `'ACTIVE'` dentro de la misma migración.

Al inicializar una base de datos **nueva desde cero**, `supabase db push` ejecuta cada archivo dentro de una única transacción y PostgreSQL puede rechazar ese archivo con `"unsafe use of new value"`.

**Runbook para corte en base nueva (X1):**
1. Ejecutar `supabase db push --remote`.
2. Si se detiene en `20261016100000` por `"unsafe use of new value"`, aplicar fuera de transacción únicamente esas 3 sentencias de enum en la base destino:
   ```sql
   ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'ACTIVE';
   ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'EXPIRED_PAYMENT_PENDING';
   ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'ARCHIVED';
   ```
3. Repetir `supabase db push --remote`: las migraciones restantes se aplican limpiamente por CLI.

**Estado final del enum (`M-1 · GOZS-703`):** la migración `20261122200000_normalizar_estado_membresia.sql` recrea `estado_membresia` con un único juego de valores en español: `ACTIVA`, `INACTIVA`, `PENDIENTE`, `BAJA` y `VENCIDA`. Los datos se mapean así: `ACTIVE` → `ACTIVA`, `ARCHIVED` → `BAJA` y `EXPIRED_PAYMENT_PENDING` → `VENCIDA`. El paso 2 sigue siendo necesario porque la migración histórica es append-only y no se puede corregir. Los 3 valores en inglés son transitorios: el resultado final del `db push` no depende de ellos. Código, tests y RPCs usan solo los valores en español.

---

## 5. Tipos TypeScript generados (`E-5 · GOZS-698`)

- `types/database.types.ts` se genera exclusivamente con la CLI de Supabase (nunca se edita a mano):
  ```bash
  npx supabase start
  npx supabase gen types typescript --local --schema public > types/database.types.ts
  ```
- Los alias y refinamientos de dominio de la aplicación viven en `types/domain.types.ts` (reexportados por `src/types/database.types.ts`).
- Para verificar paridad entre el esquema de `supabase/migrations/` y `types/database.types.ts` (y en CI):
  ```bash
  node scripts/check-supabase-types.mjs
  ```
  Si una migración modifica el esquema sin regenerar `types/database.types.ts`, el check falla con código `1`.
