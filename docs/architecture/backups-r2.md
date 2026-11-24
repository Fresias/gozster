# Backups Diarios Cifrados de Producción (Supabase → Cloudflare R2)

> **Estado:** Vigente (O-1 / G10 · GOZS-794)
> **Script del pipeline y restore:** `scripts/backup-restore-verify.sh`
> **Workflow de GitHub Actions:** `.github/workflows/backup-production.yml` *(alta protegida por `harness.authorized-only`: se publica en rama `chore/<#>-harness-*` autorizada por `@PM-GOZster` / `@Fresias`, siguiendo el mismo patrón GOZS-688 → GOZS-731).*

---

## 1. Arquitectura y alcance del respaldo

Para operar producción en **Supabase Free** a costo mensual **$0** manteniendo recuperabilidad verificable (G10), un workflow diario de GitHub Actions (`06:00 UTC` = `03:00 ART`, más disparo manual vía `workflow_dispatch`) ejecuta `bash scripts/backup-restore-verify.sh run`:

1. Valida fail-fast que los 6 secretos obligatorios estén presentes (`validate-env`, sin imprimir valores).
2. Ejecuta `pg_dump --format=plain --no-owner --no-privileges` (PostgreSQL 17 client, compatible con PG 15/16/17).
3. Comprime con `gzip -9` y elimina el `.sql` en claro de inmediato (`umask 077` + `trap 'rm -rf "$work_dir"' EXIT`).
4. Cifra simétricamente con `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_ENCRYPTION_PASSPHRASE` y borra el `.sql.gz`.
5. Calcula el checksum SHA-256 (`.sha256` con nombre relativo al archivo).
6. Sube ambos artefactos a un bucket privado de **Cloudflare R2** (`backups/gozster-prod-YYYY-MM-DDTHH-MM-SSZ.sql.gz.enc` y `.sha256`) usando AWS CLI preinstalado (`--endpoint-url`).
7. Verifica con `aws s3api head-object` que ambos objetos remotos existen, tienen `ContentLength > 0` y que el tamaño remoto coincide byte a byte con el archivo cifrado local.

### Estrategia de esquemas (restore limpio en Supabase sin romper roles ni extensiones)

Un `pg_dump` completo sin filtrar esquemas falla al restaurarse en Supabase porque intenta recrear esquemas administrados (`auth`, `storage`, `realtime`, `extensions`, `vault`, `pgsodium`, `cron`, `net`, `supabase_migrations`) y asigna propietarios internos (`supabase_admin`, `supabase_auth_admin`).

Por eso el backup lógico se divide en dos bloques dentro del mismo `.sql`, ambos con `--format=plain --no-owner --no-privileges`:

1. **Datos de autenticación (`--data-only --column-inserts --on-conflict-do-nothing --table=auth.users --table=auth.identities`):**
   - Preserva usuarios, hashes de contraseña, metadatos (`raw_app_meta_data` / roles) e identidades sin tocar el DDL gestionado por GoTrue.
   - `--column-inserts` omite automáticamente columnas generadas (`auth.users.confirmed_at`, `auth.identities.email`).
   - Se carga **antes** que `public` para satisfacer la foreign key `public.perfiles(id) REFERENCES auth.users(id)`.
2. **Esquema y datos de negocio (`--schema=public`):**
   - Incluye todas las tablas, enums, funciones, índices, triggers de `public`, políticas RLS y filas de negocio.
   - No emite `ALTER ... OWNER TO` ni `GRANT/REVOKE` dependientes de roles internos del proyecto origen, ni toca extensiones instaladas en `extensions` o `pg_catalog`.

> **Qué NO incluye `pg_dump` y cómo se recupera en un proyecto Supabase nuevo:**
> - **Triggers adjuntos a `auth.users`**, bucket/políticas de `storage`, jobs de `pg_cron` y permisos finos (`REVOKE/GRANT` de RPCs): viven versionados de forma idempotente en `supabase/migrations/`. Tras restaurar el `.sql` en un proyecto nuevo, se reaplican con `supabase db push --remote` (o verificando con `node scripts/check-supabase-migrations.mjs`).
> - **Videos binarios en Supabase Storage:** los archivos multimedia no viajan dentro del dump SQL; solo sus metadatos/rutas en `public.registro_series`.

---

## 2. Configuración inicial (una sola vez)

### 2.1. Secretos y variables en GitHub (`environment: production`)

Configurar en **Settings → Environments → `production`**:

| Tipo | Nombre | Descripción |
|---|---|---|
| Variable | `PRODUCTION_BACKUP_ENABLED` | `true` para habilitar el cron diario (`0 6 * * *` UTC). El disparo manual (`workflow_dispatch`) funciona siempre. |
| Secret | `SUPABASE_DB_URL` | URI PostgreSQL de producción (`postgresql://...`). En GitHub Actions (runners sin IPv6), usar la URI del **Session Pooler** (`aws-0-<region>.pooler.supabase.com:5432`) con `sslmode=require`. |
| Secret | `R2_ACCOUNT_ID` | Account ID de Cloudflare (solo el identificador alfanumérico, sin URL ni barras). |
| Secret | `R2_ACCESS_KEY_ID` | Access Key ID del token API de R2 (permisos mínimos: `Object Read & Write` solo sobre el bucket de backups). |
| Secret | `R2_SECRET_ACCESS_KEY` | Secret Access Key del token API de R2. |
| Secret | `R2_BUCKET_NAME` | Nombre del bucket privado en Cloudflare R2 (nunca commitear en el repo público). |
| Secret | `BACKUP_ENCRYPTION_PASSPHRASE` | Frase secreta de cifrado AES-256. Generarla con `openssl rand -base64 32` y guardarla en un gestor de contraseñas seguro fuera de GitHub. |

> **Confidencialidad (repo público):** nunca commitear nombres reales de buckets, `R2_ACCOUNT_ID`, URLs con credenciales ni passphrases.

### 2.2. Configuración del bucket y Lifecycle en Cloudflare R2 (30 días)

1. Crear un bucket **privado** (Public Access desactivado) en Cloudflare R2.
2. En **Bucket → Settings → Object lifecycle rules → Add rule**:
   - **Rule name:** `expire-prod-backups-30d`
   - **Apply to objects with prefix:** `backups/`
   - **Action 1:** Delete uploaded objects after **30 days**
   - **Action 2:** Abort incomplete multipart uploads after **1 day**
3. Crear un **R2 API Token** restringido exclusivamente a ese bucket con permisos `Object Read & Write` y cargar `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` en GitHub.

### 2.3. Definición canónica de `.github/workflows/backup-production.yml`

```yaml
name: Backup Production

on:
  schedule:
    # 06:00 UTC = 03:00 ART (horario de baja actividad)
    - cron: "0 6 * * *"
  workflow_dispatch:

concurrency:
  group: backup-production
  cancel-in-progress: false

jobs:
  backup:
    name: Daily Encrypted Backup (pg_dump -> Cloudflare R2)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    if: github.event_name == 'workflow_dispatch' || vars.PRODUCTION_BACKUP_ENABLED == 'true'
    environment: production
    permissions:
      contents: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7

      - name: Validate required secrets
        shell: bash
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
          BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.BACKUP_ENCRYPTION_PASSPHRASE }}
        run: bash scripts/backup-restore-verify.sh validate-env

      - name: Install PostgreSQL 17 client (pg_dump)
        shell: bash
        run: |
          set -euo pipefail
          sudo apt-get update
          sudo apt-get install -y --no-install-recommends postgresql-common
          sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
          sudo apt-get install -y --no-install-recommends postgresql-client-17
          pg_dump --version
          openssl version
          aws --version

      - name: Run encrypted backup pipeline and verify on Cloudflare R2
        shell: bash
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
          BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.BACKUP_ENCRYPTION_PASSPHRASE }}
        run: bash scripts/backup-restore-verify.sh run
```

---

## 3. Runbook de verificación y restore

### 3.1. Descargar el último backup desde Cloudflare R2

```bash
export AWS_ACCESS_KEY_ID="<R2_ACCESS_KEY_ID>"
export AWS_SECRET_ACCESS_KEY="<R2_SECRET_ACCESS_KEY>"
export AWS_DEFAULT_REGION="auto"
export R2_ENDPOINT="https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com"
export R2_BUCKET="<R2_BUCKET_NAME>"

# Listar los últimos backups
aws s3 ls "s3://${R2_BUCKET}/backups/" --endpoint-url "$R2_ENDPOINT" | sort | tail -n 10

# Definir el archivo elegido y descargar artefacto + checksum
BACKUP_NAME="gozster-prod-YYYY-MM-DDTHH-MM-SSZ.sql.gz.enc"
mkdir -p ./restore-drill && cd ./restore-drill

aws s3 cp "s3://${R2_BUCKET}/backups/${BACKUP_NAME}" "./${BACKUP_NAME}" --endpoint-url "$R2_ENDPOINT"
aws s3 cp "s3://${R2_BUCKET}/backups/${BACKUP_NAME}.sha256" "./${BACKUP_NAME}.sha256" --endpoint-url "$R2_ENDPOINT"
```

### 3.2. Verificar SHA-256, descifrar y descomprimir

**Opción A — Usando el script del repositorio (recomendado):**

```bash
read -rsp "Passphrase de backup: " BACKUP_ENCRYPTION_PASSPHRASE
export BACKUP_ENCRYPTION_PASSPHRASE
echo ""

bash ../scripts/backup-restore-verify.sh verify "./${BACKUP_NAME}" --output "./restored.sql"
```

**Opción B — Comandos manuales equivalentes:**

```bash
sha256sum -c "./${BACKUP_NAME}.sha256"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -salt \
  -in "./${BACKUP_NAME}" \
  -out "./restored.sql.gz" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE

gzip -dc "./restored.sql.gz" > "./restored.sql"
rm -f "./restored.sql.gz"
```

### 3.3. Restaurar sobre una instancia local limpia (`supabase start` — recomendado)

`supabase start` levanta Postgres 17 local con los mismos esquemas gestionados (`auth`, `storage`, `extensions`) y roles (`anon`, `authenticated`, `service_role`) que producción:

```bash
# 1. Iniciar Supabase local limpio
npx supabase start

# URL por defecto del Postgres local (supabase/config.toml -> puerto 54322)
LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# 2. Preparar estado limpio antes del restore:
#    - Eliminar triggers de GOZSter en auth.users (si ya corrieron migraciones) para que
#      el INSERT en auth.users no duplique perfiles antes de cargar public.perfiles.
#    - Vaciar auth.users/auth.identities locales y recrear esquema public vacío.
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_auth_users_limpiar_debe_cambiar_password ON auth.users;
DROP TRIGGER IF EXISTS trg_auth_users_quitar_must_change_password ON auth.users;
DROP TRIGGER IF EXISTS trg_auth_users_sync_rol_app_metadata ON auth.users;
TRUNCATE auth.identities, auth.users CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
SQL

# 3. Verificar, descifrar y restaurar en un solo comando
bash ../scripts/backup-restore-verify.sh verify "./${BACKUP_NAME}" --restore-url "$LOCAL_DB_URL"

# 4. Validar conteos e integridad relacional
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT 'auth.users' AS tabla, count(*) FROM auth.users
UNION ALL SELECT 'public.perfiles', count(*) FROM public.perfiles
UNION ALL SELECT 'public.ejercicios', count(*) FROM public.ejercicios
UNION ALL SELECT 'public.planes_entrenamiento', count(*) FROM public.planes_entrenamiento
UNION ALL SELECT 'public.registro_sesiones', count(*) FROM public.registro_sesiones
UNION ALL SELECT 'public.contrataciones', count(*) FROM public.contrataciones;
"

# 5. Limpiar archivos temporales en claro al terminar el ensayo
cd .. && rm -rf ./restore-drill
unset BACKUP_ENCRYPTION_PASSPHRASE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
```

### 3.4. Alternativa ligera (Docker Postgres 17 sin Supabase local)

Para validar sintaxis SQL y carga de datos sin levantar todo el stack de Supabase (requiere crear previamente los roles base `anon`, `authenticated`, `service_role` y un stub mínimo de `auth` si el dump incluye `auth.users`):

```bash
docker run --rm --name gozster-restore-test \
  -e POSTGRES_PASSWORD=postgres \
  -p 54399:5432 -d postgres:17

# Esperar readiness, crear roles y esquema auth mínimo, y luego ejecutar:
# bash scripts/backup-restore-verify.sh verify "./${BACKUP_NAME}" --restore-url "postgresql://postgres:postgres@127.0.0.1:54399/postgres"
```

> Para ensayos reales de G10 (pre-corte y drills mensuales) usar siempre **`supabase start`**, ya que valida también la compatibilidad exacta con `auth.users`, `auth.identities`, `extensions` y políticas RLS.

### 3.5. Recuperación ante desastre en un proyecto Supabase nuevo (DR)

1. Crear el proyecto Supabase destino (o resetear `public` y los triggers de `auth.users` como en el paso 3.3).
2. Ejecutar el restore con `--allow-remote` apuntando al nuevo `SUPABASE_DB_URL`:
   ```bash
   bash scripts/backup-restore-verify.sh verify "./${BACKUP_NAME}" \
     --restore-url "$NEW_SUPABASE_DB_URL" \
     --allow-remote
   ```
3. Reaplicar permisos, triggers sobre `auth.users`, políticas de `storage` y jobs `pg_cron` desde el repositorio versionado (`supabase db push --remote` o verificando con `node scripts/check-supabase-migrations.mjs`).
4. Confirmar login de prueba, conteos de tablas críticas y limpieza de archivos locales descifrados.
