#!/usr/bin/env bash
# GOZSter — Pipeline de backup diario cifrado (pg_dump -> Cloudflare R2) y verificación/restore (O-1 / G10).
#
# Subcomandos:
#   validate-env
#          Valida fail-fast que los 6 secretos requeridos estén definidos (sin imprimir valores).
#
#   pack   <input.sql> <output.sql.gz.enc>
#          Comprime (gzip -9), cifra (AES-256-CBC + PBKDF2 600000 iteraciones) y genera <output>.sha256.
#
#   run
#          Ejecuta el pipeline completo de producción:
#          validate-env -> pg_dump (auth.users/auth.identities data-only + public con GRANT/REVOKE)
#          -> triggers de auth.users -> gzip -9
#          -> openssl AES-256-CBC PBKDF2 -> sha256sum -> aws s3 cp (R2) -> aws s3api head-object (> 0 bytes).
#
#   verify <backup.sql.gz.enc> [--sha256 <archivo.sha256>] [--output <restored.sql>]
#          [--restore-url <postgres_url>] [--allow-remote]
#          Verifica SHA-256, descifra, descomprime y opcionalmente restaura sobre Postgres local
#          (psql --single-transaction: o se restaura todo o no se restaura nada).
#
# Las URLs de conexión nunca viajan por argv (visibles en `ps`): se traducen a variables PG*.

set -euo pipefail
umask 077

readonly PBKDF2_ITERATIONS=600000
WORK_DIR=""

cleanup() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Uso:
  scripts/backup-restore-verify.sh validate-env
  scripts/backup-restore-verify.sh pack <input.sql> <output.sql.gz.enc>
  scripts/backup-restore-verify.sh run
  scripts/backup-restore-verify.sh verify <backup.sql.gz.enc> [--sha256 <file.sha256>] [--output <restored.sql>] [--restore-url <postgres_url>] [--allow-remote]

Variables requeridas:
  pack / verify: BACKUP_ENCRYPTION_PASSPHRASE
  validate-env / run: SUPABASE_DB_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
                      R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, BACKUP_ENCRYPTION_PASSPHRASE
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: comando requerido no encontrado en PATH: ${cmd}" >&2
    exit 1
  fi
}

require_passphrase() {
  if [ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
    echo "ERROR: falta la variable de entorno BACKUP_ENCRYPTION_PASSPHRASE." >&2
    exit 1
  fi
}

is_local_postgres_url() {
  local url="$1"
  [[ "$url" =~ ^postgres(ql)?://([^@/]+@)?(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?(/|$|\?) ]]
}

url_decode() {
  local encoded="${1//+/ }"
  printf '%b' "${encoded//%/\\x}"
}

# Traduce una URI postgres(ql):// a variables PG* de libpq para no exponer credenciales en argv.
export_pg_env_from_url() {
  local url="$1"
  local re='^postgres(ql)?://([^:@/?]+)(:(.*))?@(\[[^]]+\]|[^]:/?@[]+)(:([0-9]+))?(/([^?]*))?(\?(.*))?$'
  if ! [[ "$url" =~ $re ]]; then
    echo "ERROR: URI de Postgres con formato no soportado (se espera postgresql://usuario:password@host:puerto/base)." >&2
    exit 1
  fi
  local host="${BASH_REMATCH[5]}" port="${BASH_REMATCH[7]}" dbname="${BASH_REMATCH[9]}" query="${BASH_REMATCH[11]}"
  host="${host#[}"
  host="${host%]}"
  PGUSER="$(url_decode "${BASH_REMATCH[2]}")"
  PGPASSWORD="$(url_decode "${BASH_REMATCH[4]}")"
  PGHOST="$host"
  PGPORT="${port:-5432}"
  PGDATABASE="$(url_decode "${dbname:-postgres}")"
  export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE

  local pair pairs=()
  if [ -n "$query" ]; then
    IFS='&' read -r -a pairs <<< "$query"
  fi
  for pair in "${pairs[@]+"${pairs[@]}"}"; do
    case "$pair" in
      sslmode=*) export PGSSLMODE="${pair#sslmode=}" ;;
    esac
  done
}

cmd_validate_env() {
  local required_vars=(
    SUPABASE_DB_URL
    R2_ACCOUNT_ID
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET_NAME
    BACKUP_ENCRYPTION_PASSPHRASE
  )

  local missing=()
  local var_name
  for var_name in "${required_vars[@]}"; do
    if [ -z "${!var_name:-}" ]; then
      missing+=("$var_name")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    echo "ERROR: faltan secretos requeridos en el entorno production: ${missing[*]}" >&2
    exit 1
  fi

  if [[ "$R2_ACCOUNT_ID" =~ [[:space:]/] ]]; then
    echo "ERROR: R2_ACCOUNT_ID contiene caracteres inválidos." >&2
    exit 1
  fi

  if [[ "$R2_BUCKET_NAME" =~ [[:space:]/] ]]; then
    echo "ERROR: R2_BUCKET_NAME contiene caracteres inválidos." >&2
    exit 1
  fi

  echo "OK: secretos requeridos validados (6/6 presentes)."
}

encrypt_and_checksum() {
  local input_sql="$1"
  local output_enc="$2"
  local output_sha="${output_enc}.sha256"
  local work_dir="$3"

  if [ ! -s "$input_sql" ]; then
    echo "ERROR: archivo SQL de entrada inexistente o vacío: ${input_sql}" >&2
    exit 1
  fi

  local gz_tmp="${work_dir}/payload.sql.gz"
  gzip -9 -c "$input_sql" > "$gz_tmp"
  if [ ! -s "$gz_tmp" ]; then
    echo "ERROR: la compresión gzip produjo un archivo vacío." >&2
    exit 1
  fi

  mkdir -p "$(dirname "$output_enc")"
  openssl enc -aes-256-cbc -pbkdf2 -iter "$PBKDF2_ITERATIONS" -salt \
    -in "$gz_tmp" \
    -out "$output_enc" \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  rm -f "$gz_tmp"

  if [ ! -s "$output_enc" ]; then
    echo "ERROR: el cifrado openssl produjo un archivo vacío." >&2
    exit 1
  fi

  local enc_dir enc_base
  enc_dir="$(dirname "$output_enc")"
  enc_base="$(basename "$output_enc")"
  (cd "$enc_dir" && sha256sum "$enc_base") > "$output_sha"

  if [ ! -s "$output_sha" ]; then
    echo "ERROR: el archivo .sha256 está vacío." >&2
    exit 1
  fi
}

cmd_pack() {
  if [ "$#" -ne 2 ]; then
    echo "ERROR: 'pack' requiere exactamente 2 argumentos: <input.sql> <output.sql.gz.enc>" >&2
    exit 2
  fi

  local input_sql="$1"
  local output_enc="$2"

  require_passphrase
  require_cmd gzip
  require_cmd openssl
  require_cmd sha256sum

  WORK_DIR="$(mktemp -d)"
  encrypt_and_checksum "$input_sql" "$output_enc" "$WORK_DIR"
  echo "OK: backup cifrado generado (${output_enc}) + checksum (${output_enc}.sha256)."
}

cmd_run() {
  cmd_validate_env

  require_cmd pg_dump
  require_cmd psql
  require_cmd gzip
  require_cmd openssl
  require_cmd sha256sum
  require_cmd aws
  require_cmd wc

  WORK_DIR="$(mktemp -d)"

  local timestamp base_name sql_file enc_file sha_file
  timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  base_name="gozster-prod-${timestamp}"
  sql_file="${WORK_DIR}/${base_name}.sql"
  enc_file="${WORK_DIR}/${base_name}.sql.gz.enc"
  sha_file="${enc_file}.sha256"

  echo "Iniciando dump lógico de producción (${base_name})..."

  {
    echo "-- GOZSter production logical backup (${timestamp})"
    echo "-- Part 1: auth.users, auth.identities and storage.buckets data-only (preserves public.perfiles FK without colliding with Supabase auth DDL)"
    echo "-- Part 2: public schema + data + GRANT/REVOKE (excludes Supabase-managed internal schemas and extensions)"
    echo "-- Part 3: GOZSter triggers on auth.users and policies on storage.objects (created after the data load so restored rows do not fire them)"
    echo ""
  } > "$sql_file"

  # Credenciales vía variables PG* (nunca en argv de pg_dump/psql, visibles con `ps`).
  export_pg_env_from_url "$SUPABASE_DB_URL"

  # Parte 1: datos de autenticación sin DDL de auth (evita colisiones con roles/extensiones de Supabase)
  pg_dump \
    --format=plain \
    --no-owner \
    --no-privileges \
    --data-only \
    --column-inserts \
    --on-conflict-do-nothing \
    --table=auth.users \
    --table=auth.identities \
    --table=storage.buckets >> "$sql_file"

  # Parte 2: esquema completo y datos de public. SIN --no-privileges: los GRANT/REVOKE de las
  # migraciones (p. ej. RPC SECURITY DEFINER revocadas a anon) deben sobrevivir al restore.
  # anon, authenticated y service_role existen en todo proyecto Supabase.
  # Se descartan los ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin: son de la plataforma y el rol
  # postgres no puede aplicarlos ("permission denied to change default privileges").
  pg_dump \
    --format=plain \
    --no-owner \
    --schema=public | sed '/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin /d' >> "$sql_file"

  # Parte 3: objetos de GOZSter fuera de public que dependen de funciones de public y que
  # pg_dump --schema=public no incluye (DROP SCHEMA public CASCADE también los elimina).
  {
    echo ""
    echo "-- Part 3: triggers on auth.users and policies on storage.objects"
    psql -X -q -At -v ON_ERROR_STOP=1 <<'SQL'
SET search_path = '';
SELECT format('DROP TRIGGER IF EXISTS %I ON auth.users;', t.tgname) || E'\n' || pg_get_triggerdef(t.oid) || ';'
FROM pg_catalog.pg_trigger t
WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;
SELECT format('DROP POLICY IF EXISTS %I ON storage.objects;', p.policyname) || E'\n'
  || format('CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s', p.policyname, p.permissive, p.cmd,
            (SELECT string_agg(quote_ident(r), ', ') FROM unnest(p.roles) AS r))
  || coalesce(' USING (' || p.qual || ')', '')
  || coalesce(' WITH CHECK (' || p.with_check || ')', '') || ';'
FROM pg_catalog.pg_policies p
WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
ORDER BY p.policyname;
SQL
  } >> "$sql_file"

  if [ ! -s "$sql_file" ]; then
    echo "ERROR: el dump SQL resultante está vacío." >&2
    exit 1
  fi

  encrypt_and_checksum "$sql_file" "$enc_file" "$WORK_DIR"
  rm -f "$sql_file"

  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="auto"
  export AWS_EC2_METADATA_DISABLED="true"

  local r2_endpoint enc_key sha_key
  r2_endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  enc_key="backups/${base_name}.sql.gz.enc"
  sha_key="backups/${base_name}.sql.gz.enc.sha256"

  echo "Subiendo artefactos cifrados a Cloudflare R2 (${enc_key})..."
  aws s3 cp "$enc_file" "s3://${R2_BUCKET_NAME}/${enc_key}" \
    --endpoint-url "$r2_endpoint" \
    --no-progress
  aws s3 cp "$sha_file" "s3://${R2_BUCKET_NAME}/${sha_key}" \
    --endpoint-url "$r2_endpoint" \
    --no-progress

  # Verificación post-upload fail-fast (existencia, > 0 bytes y coincidencia exacta)
  local enc_remote_size sha_remote_size local_enc_size
  enc_remote_size="$(aws s3api head-object \
    --bucket "$R2_BUCKET_NAME" \
    --key "$enc_key" \
    --endpoint-url "$r2_endpoint" \
    --query 'ContentLength' \
    --output text | tr -d '[:space:]')"
  sha_remote_size="$(aws s3api head-object \
    --bucket "$R2_BUCKET_NAME" \
    --key "$sha_key" \
    --endpoint-url "$r2_endpoint" \
    --query 'ContentLength' \
    --output text | tr -d '[:space:]')"

  if ! [[ "$enc_remote_size" =~ ^[0-9]+$ ]] || [ "$enc_remote_size" -le 0 ]; then
    echo "ERROR: verificación fallida: objeto cifrado remoto vacío o inexistente." >&2
    exit 1
  fi

  if ! [[ "$sha_remote_size" =~ ^[0-9]+$ ]] || [ "$sha_remote_size" -le 0 ]; then
    echo "ERROR: verificación fallida: archivo .sha256 remoto vacío o inexistente." >&2
    exit 1
  fi

  local_enc_size="$(wc -c < "$enc_file" | tr -d '[:space:]')"
  if [ "$enc_remote_size" -ne "$local_enc_size" ]; then
    echo "ERROR: verificación fallida: tamaño remoto (${enc_remote_size}) != tamaño local (${local_enc_size})." >&2
    exit 1
  fi

  echo "OK: backup verificado en Cloudflare R2 (${enc_key}: ${enc_remote_size} bytes; ${sha_key}: ${sha_remote_size} bytes)."
}

cmd_verify() {
  if [ "$#" -lt 1 ]; then
    echo "ERROR: 'verify' requiere la ruta al archivo .sql.gz.enc." >&2
    exit 2
  fi

  local enc_file="$1"
  shift

  local sha_file="${enc_file}.sha256"
  local output_sql=""
  local restore_url=""
  local allow_remote=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --sha256)
        [ "$#" -ge 2 ] || { echo "ERROR: falta valor para --sha256." >&2; exit 2; }
        sha_file="$2"
        shift 2
        ;;
      --output)
        [ "$#" -ge 2 ] || { echo "ERROR: falta valor para --output." >&2; exit 2; }
        output_sql="$2"
        shift 2
        ;;
      --restore-url)
        [ "$#" -ge 2 ] || { echo "ERROR: falta valor para --restore-url." >&2; exit 2; }
        restore_url="$2"
        shift 2
        ;;
      --allow-remote)
        allow_remote=1
        shift
        ;;
      *)
        echo "ERROR: opción desconocida para verify: $1" >&2
        exit 2
        ;;
    esac
  done

  require_passphrase
  require_cmd gzip
  require_cmd openssl
  require_cmd sha256sum
  require_cmd awk

  if [ -n "$restore_url" ] && [ "$allow_remote" -ne 1 ]; then
    if ! is_local_postgres_url "$restore_url"; then
      echo "ERROR: --restore-url apunta a un host no local. Usá un Postgres local (localhost/127.0.0.1) o pasá --allow-remote explícitamente." >&2
      exit 1
    fi
  fi

  if [ ! -s "$enc_file" ]; then
    echo "ERROR: archivo cifrado inexistente o vacío: ${enc_file}" >&2
    exit 1
  fi

  if [ ! -s "$sha_file" ]; then
    echo "ERROR: archivo .sha256 inexistente o vacío: ${sha_file}" >&2
    exit 1
  fi

  local expected_hash actual_hash
  expected_hash="$(tr -d '\r' < "$sha_file" | awk 'NF { print tolower($1); exit }')"
  if ! [[ "$expected_hash" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: formato inválido en archivo .sha256." >&2
    exit 1
  fi

  actual_hash="$(sha256sum "$enc_file" | awk '{ print tolower($1) }')"
  if [ "$expected_hash" != "$actual_hash" ]; then
    echo "ERROR: checksum SHA-256 inválido (esperado ${expected_hash}, obtenido ${actual_hash})." >&2
    exit 1
  fi

  WORK_DIR="$(mktemp -d)"

  local gz_tmp="${WORK_DIR}/restored.sql.gz"
  local sql_tmp="${WORK_DIR}/restored.sql"

  if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter "$PBKDF2_ITERATIONS" -salt \
    -in "$enc_file" \
    -out "$gz_tmp" \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE 2>/dev/null; then
    echo "ERROR: falló el descifrado AES-256-CBC (verificá BACKUP_ENCRYPTION_PASSPHRASE o integridad del archivo)." >&2
    exit 1
  fi

  if ! gzip -dc "$gz_tmp" > "$sql_tmp"; then
    echo "ERROR: falló la descompresión gzip tras descifrar." >&2
    exit 1
  fi
  rm -f "$gz_tmp"

  if [ ! -s "$sql_tmp" ]; then
    echo "ERROR: el SQL restaurado está vacío." >&2
    exit 1
  fi

  if [ -n "$output_sql" ]; then
    mkdir -p "$(dirname "$output_sql")"
    cp "$sql_tmp" "$output_sql"
  fi

  if [ -n "$restore_url" ]; then
    require_cmd psql
    export_pg_env_from_url "$restore_url"
    psql -X -v ON_ERROR_STOP=1 --single-transaction -f "$sql_tmp"
  fi

  local sql_bytes
  sql_bytes="$(wc -c < "$sql_tmp" | tr -d '[:space:]')"
  echo "OK: SHA-256 válido, descifrado y descompresión exitosos (${sql_bytes} bytes SQL)."
}

main() {
  if [ "$#" -lt 1 ]; then
    usage >&2
    exit 2
  fi

  local subcmd="$1"
  shift

  case "$subcmd" in
    validate-env)
      cmd_validate_env "$@"
      ;;
    pack)
      cmd_pack "$@"
      ;;
    run)
      cmd_run "$@"
      ;;
    verify)
      cmd_verify "$@"
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "ERROR: subcomando desconocido: ${subcmd}" >&2
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
