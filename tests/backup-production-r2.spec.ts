import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const scriptPath = path.join(repoRoot, "scripts", "backup-restore-verify.sh");
const runbookPath = path.join(repoRoot, "docs", "architecture", "backups-r2.md");
const workflowPath = path.join(repoRoot, ".github", "workflows", "backup-production.yml");

function resolveBash(): string {
  if (process.platform === "win32") {
    for (const candidate of [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return "bash";
}

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function buildBashEnv(
  extra: Record<string, string | undefined> = {},
  prependBins: string[] = []
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const sep = process.platform === "win32" ? ";" : ":";
  const baseBins: string[] = [...prependBins];
  if (process.platform === "win32") {
    for (const dir of [
      "C:\\Program Files\\Git\\usr\\bin",
      "C:\\Program Files\\Git\\mingw64\\bin",
      "C:\\Program Files\\Git\\bin",
    ]) {
      if (existsSync(dir)) baseBins.push(dir);
    }
  }
  if (baseBins.length > 0) {
    env.PATH = `${baseBins.join(sep)}${sep}${env.PATH ?? ""}`;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

function runBackupScript(
  args: string[],
  envOverrides: Record<string, string | undefined> = {},
  prependBins: string[] = []
): { status: number; stdout: string; stderr: string } {
  const bash = resolveBash();
  const childEnv = { ...buildBashEnv(envOverrides, prependBins), HARNESS_TELEMETRY: "0" };
  try {
    const stdout = execFileSync(bash, [toPosix(scriptPath), ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
      env: childEnv,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: execErr.status ?? 1,
      stdout: execErr.stdout ?? "",
      stderr: execErr.stderr ?? "",
    };
  }
}

describe("GOZS-794 (O-1 / G10): Backup diario cifrado (pg_dump -> Cloudflare R2) y runbook de restore", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  describe("AC 1 & AC 2: Contrato de seguridad, secretos y pipeline en scripts/backup-restore-verify.sh", () => {
    it("declara fail-fast (set -euo pipefail), umask 077, cifrado AES-256-CBC PBKDF2 600000 sin passphrase en argv ni curl | sh", () => {
      expect(existsSync(scriptPath)).toBe(true);
      const script = readFileSync(scriptPath, "utf8");

      expect(script).toContain("set -euo pipefail");
      expect(script).toContain("umask 077");
      expect(script).toContain("PBKDF2_ITERATIONS=600000");
      expect(script).toContain("--format=plain");
      expect(script).toContain("--no-owner");
      expect(script).toContain("--no-privileges");
      expect(script).toContain("--table=auth.users");
      expect(script).toContain("--table=auth.identities");
      expect(script).toContain("--schema=public");
      expect(script).toContain("gzip -9");
      expect(script).toContain('openssl enc -aes-256-cbc -pbkdf2 -iter "$PBKDF2_ITERATIONS" -salt');
      expect(script).toContain("-pass env:BACKUP_ENCRYPTION_PASSPHRASE");
      expect(script).toContain("https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com");
      expect(script).toContain("backups/${base_name}.sql.gz.enc");
      expect(script).toContain("aws s3 cp");
      expect(script).toContain("aws s3api head-object");

      // Nunca debug trace ni passphrase en argv ni curl | sh
      expect(script).not.toMatch(/\bset\s+-[a-z]*x/);
      expect(script).not.toMatch(/openssl\s+enc[^\n]*\s-k\s/);
      expect(script).not.toMatch(/-pass\s+["']?pass:/);
      expect(script).not.toMatch(/curl[^\n]*\|\s*(sudo\s+)?(ba)?sh/);
    });

    it("B3/B2/N1: el dump de public conserva GRANT/REVOKE (sin --no-privileges), el restore es --single-transaction y ninguna URL de conexión viaja por argv", () => {
      const script = readFileSync(scriptPath, "utf8");

      const pgDumpBlocks = script.match(/pg_dump \\\n(?:[ \t]+--[^\n]*\n)+/g) ?? [];
      expect(pgDumpBlocks).toHaveLength(2);
      const publicBlock = pgDumpBlocks.find((block) => block.includes("--schema=public"));
      expect(publicBlock).toBeDefined();
      expect(publicBlock).toContain("--no-owner");
      expect(publicBlock).not.toContain("--no-privileges");

      expect(script).toContain('psql -X -v ON_ERROR_STOP=1 --single-transaction -f "$sql_tmp"');
      expect(script).toContain('export_pg_env_from_url "$SUPABASE_DB_URL"');
      expect(script).toContain('export_pg_env_from_url "$restore_url"');
      // Ninguna invocación de pg_dump/psql recibe la URL (visible en `ps`)
      expect(script).not.toMatch(/(pg_dump|psql)[^\n]*"\$(SUPABASE_DB_URL|restore_url)"/);
      expect(script).not.toMatch(/"\$(SUPABASE_DB_URL|restore_url)"\s*>>/);
    });

    it("GIVEN que falta cualquiera de los 6 secretos requeridos WHEN corre validate-env o run THEN falla con código 1 sin filtrar secretos", () => {
      const canaryUrl = `postgresql://postgres:secret-${randomBytes(8).toString("hex")}@db.example:5432/postgres`;
      const canaryPass = `pass-${randomBytes(12).toString("hex")}`;

      const res = runBackupScript(["validate-env"], {
        SUPABASE_DB_URL: canaryUrl,
        R2_ACCOUNT_ID: "acctplaceholder",
        R2_ACCESS_KEY_ID: "",
        R2_SECRET_ACCESS_KEY: "",
        R2_BUCKET_NAME: "bucket-placeholder",
        BACKUP_ENCRYPTION_PASSPHRASE: canaryPass,
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("R2_ACCESS_KEY_ID");
      expect(res.stderr).toContain("R2_SECRET_ACCESS_KEY");
      expect(res.stderr).not.toContain(canaryUrl);
      expect(res.stderr).not.toContain(canaryPass);
      expect(res.stdout).not.toContain(canaryUrl);
      expect(res.stdout).not.toContain(canaryPass);

      // También debe fallar antes de invocar pg_dump/aws cuando corre `run` sin todos los secretos
      const runRes = runBackupScript(["run"], {
        SUPABASE_DB_URL: "",
        R2_ACCOUNT_ID: "",
        R2_ACCESS_KEY_ID: "",
        R2_SECRET_ACCESS_KEY: "",
        R2_BUCKET_NAME: "",
        BACKUP_ENCRYPTION_PASSPHRASE: "",
      });
      expect(runRes.status).toBe(1);
      for (const secretName of [
        "SUPABASE_DB_URL",
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "BACKUP_ENCRYPTION_PASSPHRASE",
      ]) {
        expect(runRes.stderr).toContain(secretName);
      }
    });

    it("GIVEN credenciales y herramientas disponibles WHEN corre run con stubs de pg_dump y aws THEN genera backup cifrado + .sha256, sube a R2, verifica tamaño > 0 y el objeto descifra limpio", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-run-"));
      tempDirs.push(dir);

      const binDir = path.join(dir, "bin");
      const r2Store = path.join(dir, "r2-store");
      const logFile = path.join(dir, "invocations.log");
      const pgEnvFile = path.join(dir, "pg-env.log");
      mkdirSync(binDir, { recursive: true });
      mkdirSync(r2Store, { recursive: true });

      const pgDumpStub = path.join(binDir, "pg_dump");
      writeFileSync(
        pgDumpStub,
        [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          `echo "pg_dump $*" >> "${toPosix(logFile)}"`,
          `echo "$PGHOST|$PGPORT|$PGUSER|$PGPASSWORD|$PGDATABASE|\${PGSSLMODE:-}" >> "${toPosix(pgEnvFile)}"`,
          'if [[ "$*" == *"--table=auth.users"* ]]; then',
          '  echo "INSERT INTO auth.users (id, email) VALUES (\'00000000-0000-0000-0000-000000000001\', \'test@example.com\') ON CONFLICT DO NOTHING;"',
          "else",
          '  echo "CREATE TABLE public.ejemplo (id int primary key, nombre text);"',
          '  echo "INSERT INTO public.ejemplo (id, nombre) VALUES (1, \'GOZSter OK\');"',
          '  echo "REVOKE ALL ON FUNCTION public.rpc_revocada() FROM PUBLIC;"',
          '  echo "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;"',
          '  echo "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;"',
          "fi",
          "",
        ].join("\n"),
        "utf8"
      );
      chmodSync(pgDumpStub, 0o755);

      const psqlStub = path.join(binDir, "psql");
      writeFileSync(
        psqlStub,
        [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          `echo "psql $*" >> "${toPosix(logFile)}"`,
          "cat > /dev/null",
          'echo "DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;"',
          'echo "CREATE TRIGGER trg_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();"',
          "",
        ].join("\n"),
        "utf8"
      );
      chmodSync(psqlStub, 0o755);

      const awsStub = path.join(binDir, "aws");
      writeFileSync(
        awsStub,
        [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          `STORE="${toPosix(r2Store)}"`,
          `echo "aws $*" >> "${toPosix(logFile)}"`,
          'if [ "$1" = "s3" ] && [ "$2" = "cp" ]; then',
          '  src="$3"',
          '  dest="$4"',
          '  rel="${dest#s3://}"',
          '  target="${STORE}/${rel}"',
          '  mkdir -p "$(dirname "$target")"',
          '  cp "$src" "$target"',
          '  exit 0',
          "fi",
          'if [ "$1" = "s3api" ] && [ "$2" = "head-object" ]; then',
          '  bucket=""',
          '  key=""',
          '  shift 2',
          '  while [ "$#" -gt 0 ]; do',
          '    case "$1" in',
          '      --bucket) bucket="$2"; shift 2 ;;',
          '      --key) key="$2"; shift 2 ;;',
          '      *) shift ;;',
          "    esac",
          "  done",
          '  target="${STORE}/${bucket}/${key}"',
          '  [ -f "$target" ] || exit 254',
          '  wc -c < "$target" | tr -d "[:space:]"',
          '  echo ""',
          '  exit 0',
          "fi",
          "exit 1",
          "",
        ].join("\n"),
        "utf8"
      );
      chmodSync(awsStub, 0o755);

      const passphrase = randomBytes(24).toString("base64");
      const fakeDbPass = `dbpwd-${randomBytes(8).toString("hex")}`;
      const fakeR2Secret = `r2sec-${randomBytes(8).toString("hex")}`;
      const accountId = "acc0123456789test";
      const bucketName = "gozster-backups-test";

      const runRes = runBackupScript(
        ["run"],
        {
          SUPABASE_DB_URL: `postgresql://postgres.projref:${fakeDbPass}%40x@db.example.test:6543/postgres?sslmode=require`,
          R2_ACCOUNT_ID: accountId,
          R2_ACCESS_KEY_ID: "r2-key-test",
          R2_SECRET_ACCESS_KEY: fakeR2Secret,
          R2_BUCKET_NAME: bucketName,
          BACKUP_ENCRYPTION_PASSPHRASE: passphrase,
        },
        [binDir]
      );

      expect(runRes.status, runRes.stderr).toBe(0);
      expect(runRes.stdout).toContain("OK: backup verificado en Cloudflare R2");
      expect(runRes.stdout).not.toContain(passphrase);
      expect(runRes.stdout).not.toContain(fakeDbPass);
      expect(runRes.stdout).not.toContain(fakeR2Secret);

      const invocations = readFileSync(logFile, "utf8");
      expect(invocations).toContain("--format=plain --no-owner --no-privileges --data-only --column-inserts --on-conflict-do-nothing --table=auth.users --table=auth.identities --table=storage.buckets");
      const publicDumpCall = invocations.split("\n").find((line) => line.includes("--schema=public"));
      expect(publicDumpCall).toBe("pg_dump --format=plain --no-owner --schema=public");
      // N1: credenciales solo vía PG*, nunca en argv de pg_dump/psql
      expect(invocations).not.toContain(fakeDbPass);
      expect(invocations).not.toContain("postgresql://");
      expect(invocations).toContain("psql -X -q -At -v ON_ERROR_STOP=1");
      const pgEnvLines = readFileSync(pgEnvFile, "utf8").trim().split("\n");
      expect(pgEnvLines).toHaveLength(2);
      for (const line of pgEnvLines) {
        expect(line).toBe(`db.example.test|6543|postgres.projref|${fakeDbPass}@x|postgres|require`);
      }
      expect(invocations).toContain(`--endpoint-url https://${accountId}.r2.cloudflarestorage.com`);
      expect(invocations).toContain("aws s3api head-object");

      const backupsDir = path.join(r2Store, bucketName, "backups");
      const uploaded = readdirSync(backupsDir).sort();
      const encName = uploaded.find((f) => /^gozster-prod-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.sql\.gz\.enc$/.test(f));
      const shaName = encName ? `${encName}.sha256` : undefined;
      expect(encName).toBeDefined();
      expect(shaName && uploaded.includes(shaName)).toBe(true);

      const restoredSqlPath = path.join(dir, "restored-from-r2.sql");
      const verifyRes = runBackupScript(
        ["verify", toPosix(path.join(backupsDir, encName!)), "--output", toPosix(restoredSqlPath)],
        { BACKUP_ENCRYPTION_PASSPHRASE: passphrase }
      );
      expect(verifyRes.status, verifyRes.stderr).toBe(0);

      const restoredSql = readFileSync(restoredSqlPath, "utf8");
      expect(restoredSql).toContain("INSERT INTO auth.users");
      expect(restoredSql).toContain("CREATE TABLE public.ejemplo");
      expect(restoredSql).toContain("GOZSter OK");
      // B3: GRANT/REVOKE de public sobreviven; default privileges de supabase_admin se descartan
      expect(restoredSql).toContain("REVOKE ALL ON FUNCTION public.rpc_revocada() FROM PUBLIC;");
      expect(restoredSql).toContain("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public");
      expect(restoredSql).not.toContain("ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin");
      // Parte 3: triggers de auth.users después de los datos de public
      const triggerIdx = restoredSql.indexOf("CREATE TRIGGER trg_on_auth_user_created");
      expect(triggerIdx).toBeGreaterThan(restoredSql.indexOf("GOZSter OK"));
    });

    it("falla fail-fast si aws s3api head-object reporta objeto vacío (0 bytes)", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-zero-"));
      tempDirs.push(dir);
      const binDir = path.join(dir, "bin");
      mkdirSync(binDir, { recursive: true });

      const pgDumpStub = path.join(binDir, "pg_dump");
      writeFileSync(pgDumpStub, "#!/usr/bin/env bash\necho 'SELECT 1;'\n", "utf8");
      chmodSync(pgDumpStub, 0o755);
      const psqlStub = path.join(binDir, "psql");
      writeFileSync(psqlStub, "#!/usr/bin/env bash\ncat > /dev/null\n", "utf8");
      chmodSync(psqlStub, 0o755);

      const awsStub = path.join(binDir, "aws");
      writeFileSync(
        awsStub,
        [
          "#!/usr/bin/env bash",
          'if [ "$1" = "s3" ] && [ "$2" = "cp" ]; then exit 0; fi',
          'if [ "$1" = "s3api" ] && [ "$2" = "head-object" ]; then echo "0"; exit 0; fi',
          "exit 1",
          "",
        ].join("\n"),
        "utf8"
      );
      chmodSync(awsStub, 0o755);

      const runRes = runBackupScript(
        ["run"],
        {
          SUPABASE_DB_URL: "postgresql://postgres:pwd@127.0.0.1:54322/postgres",
          R2_ACCOUNT_ID: "acc0123456789test",
          R2_ACCESS_KEY_ID: "r2-key-test",
          R2_SECRET_ACCESS_KEY: "r2-secret-test",
          R2_BUCKET_NAME: "gozster-backups-test",
          BACKUP_ENCRYPTION_PASSPHRASE: randomBytes(24).toString("base64"),
        },
        [binDir]
      );

      expect(runRes.status).toBe(1);
      expect(runRes.stderr).toContain("objeto cifrado remoto vacío o inexistente");
    });
  });

  describe("AC 3: Round-trip real (comprimir -> cifrar -> verificar SHA-256 -> descifrar -> descomprimir)", () => {
    it("completa el ciclo completo y recupera el SQL idéntico byte a byte sin secretos hardcoded", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-rt-"));
      tempDirs.push(dir);

      const originalSql = [
        "-- GOZSter round-trip test dump",
        "SET standard_conforming_strings = on;",
        "INSERT INTO public.ejercicios (id, nombre) VALUES ('00000000-0000-0000-0000-000000000001', 'Sentadilla barra alta');",
        "INSERT INTO public.planes_entrenamiento (id, nombre) VALUES ('00000000-0000-0000-0000-000000000002', 'Fuerza Base 2026');",
        "",
      ].join("\n");

      const sqlIn = path.join(dir, "gozster-prod-2026-11-24T06-00-00Z.sql");
      const encOut = path.join(dir, "gozster-prod-2026-11-24T06-00-00Z.sql.gz.enc");
      const shaOut = `${encOut}.sha256`;
      const sqlRestored = path.join(dir, "restored.sql");
      const passphrase = randomBytes(24).toString("base64");

      writeFileSync(sqlIn, originalSql, "utf8");

      const packRes = runBackupScript(["pack", toPosix(sqlIn), toPosix(encOut)], {
        BACKUP_ENCRYPTION_PASSPHRASE: passphrase,
      });
      expect(packRes.status, packRes.stderr).toBe(0);
      expect(existsSync(encOut)).toBe(true);
      expect(existsSync(shaOut)).toBe(true);

      const encBytes = readFileSync(encOut);
      // OpenSSL salted header "Salted__" y sin texto SQL en claro
      expect(encBytes.subarray(0, 8).toString("ascii")).toBe("Salted__");
      expect(encBytes.toString("latin1")).not.toContain("Sentadilla barra alta");
      expect(encBytes.toString("latin1")).not.toContain("Fuerza Base 2026");

      const shaContent = readFileSync(shaOut, "utf8").trim();
      expect(shaContent).toMatch(/^[0-9a-f]{64}\s+\*?gozster-prod-2026-11-24T06-00-00Z\.sql\.gz\.enc$/);

      const verifyRes = runBackupScript(
        ["verify", toPosix(encOut), "--output", toPosix(sqlRestored)],
        { BACKUP_ENCRYPTION_PASSPHRASE: passphrase }
      );
      expect(verifyRes.status, verifyRes.stderr).toBe(0);
      expect(verifyRes.stdout).toContain("SHA-256 válido");
      expect(readFileSync(sqlRestored, "utf8")).toBe(originalSql);
    });

    it("rechaza un artefacto alterado al verificar SHA-256 antes de descifrar", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-tamper-"));
      tempDirs.push(dir);

      const sqlIn = path.join(dir, "sample.sql");
      const encOut = path.join(dir, "sample.sql.gz.enc");
      const passphrase = randomBytes(24).toString("base64");
      writeFileSync(sqlIn, "SELECT 1;\n", "utf8");

      const packRes = runBackupScript(["pack", toPosix(sqlIn), toPosix(encOut)], {
        BACKUP_ENCRYPTION_PASSPHRASE: passphrase,
      });
      expect(packRes.status, packRes.stderr).toBe(0);

      const tampered = Buffer.from(readFileSync(encOut));
      const lastIdx = tampered.length - 1;
      tampered[lastIdx] = (tampered[lastIdx] ?? 0) ^ 0xff;
      writeFileSync(encOut, tampered);

      const verifyRes = runBackupScript(["verify", toPosix(encOut)], {
        BACKUP_ENCRYPTION_PASSPHRASE: passphrase,
      });
      expect(verifyRes.status).not.toBe(0);
      expect(verifyRes.stderr).toContain("SHA-256 inválido");
      expect(verifyRes.stderr).not.toContain(passphrase);
    });

    it("rechaza descifrado con passphrase incorrecta y falla fail-fast si falta BACKUP_ENCRYPTION_PASSPHRASE", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-pass-"));
      tempDirs.push(dir);

      const sqlIn = path.join(dir, "sample.sql");
      const encOut = path.join(dir, "sample.sql.gz.enc");
      const rightPass = randomBytes(24).toString("base64");
      const wrongPass = randomBytes(24).toString("base64");
      writeFileSync(sqlIn, "SELECT 42;\n", "utf8");

      expect(
        runBackupScript(["pack", toPosix(sqlIn), toPosix(encOut)], {
          BACKUP_ENCRYPTION_PASSPHRASE: rightPass,
        }).status
      ).toBe(0);

      const wrongRes = runBackupScript(["verify", toPosix(encOut)], {
        BACKUP_ENCRYPTION_PASSPHRASE: wrongPass,
      });
      expect(wrongRes.status).not.toBe(0);
      expect(wrongRes.stderr).toContain("falló el descifrado");
      expect(wrongRes.stderr).not.toContain(wrongPass);
      expect(wrongRes.stderr).not.toContain(rightPass);

      const missingRes = runBackupScript(["verify", toPosix(encOut)], {
        BACKUP_ENCRYPTION_PASSPHRASE: undefined,
      });
      expect(missingRes.status).not.toBe(0);
      expect(missingRes.stderr).toContain("BACKUP_ENCRYPTION_PASSPHRASE");
    });

    it("falla de forma determinística si el payload descifrado no es gzip válido (openssl sale 0)", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-nogzip-"));
      tempDirs.push(dir);

      const plainIn = path.join(dir, "not-gzip.bin");
      const encOut = path.join(dir, "not-gzip.sql.gz.enc");
      const passphrase = randomBytes(24).toString("base64");
      writeFileSync(plainIn, "SELECT 1; -- esto no es un stream gzip\n", "utf8");

      execFileSync(
        "openssl",
        ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-salt", "-in", plainIn, "-out", encOut, "-pass", "env:BACKUP_ENCRYPTION_PASSPHRASE"],
        { env: { ...process.env, BACKUP_ENCRYPTION_PASSPHRASE: passphrase }, stdio: "pipe" }
      );
      const hash = createHash("sha256").update(readFileSync(encOut)).digest("hex");
      writeFileSync(`${encOut}.sha256`, `${hash}  ${path.basename(encOut)}\n`, "utf8");

      const res = runBackupScript(["verify", toPosix(encOut)], {
        BACKUP_ENCRYPTION_PASSPHRASE: passphrase,
      });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain("falló el descifrado");
      expect(res.stderr).toContain("gzip");
      expect(res.stderr).not.toContain(passphrase);
    });

    it("bloquea --restore-url hacia un host remoto por defecto sin filtrar credenciales", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-remote-"));
      tempDirs.push(dir);

      const sqlIn = path.join(dir, "sample.sql");
      const encOut = path.join(dir, "sample.sql.gz.enc");
      const passphrase = randomBytes(24).toString("base64");
      const fakeDbPassword = `pwd-${randomBytes(8).toString("hex")}`;
      writeFileSync(sqlIn, "SELECT 1;\n", "utf8");

      expect(
        runBackupScript(["pack", toPosix(sqlIn), toPosix(encOut)], {
          BACKUP_ENCRYPTION_PASSPHRASE: passphrase,
        }).status
      ).toBe(0);

      const remoteRes = runBackupScript(
        [
          "verify",
          toPosix(encOut),
          "--restore-url",
          `postgresql://postgres:${fakeDbPassword}@db.example.supabase.co:5432/postgres`,
        ],
        { BACKUP_ENCRYPTION_PASSPHRASE: passphrase }
      );
      expect(remoteRes.status).not.toBe(0);
      expect(remoteRes.stderr).toContain("--allow-remote");
      expect(remoteRes.stderr).not.toContain(fakeDbPassword);
    });

    it("B2/N1: --restore-url restaura con psql --single-transaction y ON_ERROR_STOP, con credenciales solo en PG*", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-restore-"));
      tempDirs.push(dir);
      const binDir = path.join(dir, "bin");
      mkdirSync(binDir, { recursive: true });
      const logFile = path.join(dir, "psql.log");

      const psqlStub = path.join(binDir, "psql");
      writeFileSync(
        psqlStub,
        [
          "#!/usr/bin/env bash",
          `echo "argv: $*" >> "${toPosix(logFile)}"`,
          `echo "env: $PGHOST|$PGPORT|$PGUSER|$PGPASSWORD|$PGDATABASE" >> "${toPosix(logFile)}"`,
          "",
        ].join("\n"),
        "utf8"
      );
      chmodSync(psqlStub, 0o755);

      const sqlIn = path.join(dir, "sample.sql");
      const encOut = path.join(dir, "sample.sql.gz.enc");
      const passphrase = randomBytes(24).toString("base64");
      const fakeDbPassword = `pwd-${randomBytes(8).toString("hex")}`;
      writeFileSync(sqlIn, "SELECT 1;\n", "utf8");
      expect(
        runBackupScript(["pack", toPosix(sqlIn), toPosix(encOut)], {
          BACKUP_ENCRYPTION_PASSPHRASE: passphrase,
        }).status
      ).toBe(0);

      const res = runBackupScript(
        ["verify", toPosix(encOut), "--restore-url", `postgresql://postgres:${fakeDbPassword}@127.0.0.1:54322/postgres`],
        { BACKUP_ENCRYPTION_PASSPHRASE: passphrase },
        [binDir]
      );
      expect(res.status, res.stderr).toBe(0);

      const log = readFileSync(logFile, "utf8");
      expect(log).toMatch(/^argv: -X -v ON_ERROR_STOP=1 --single-transaction -f \S+restored\.sql$/m);
      expect(log).toContain(`env: 127.0.0.1|54322|postgres|${fakeDbPassword}|postgres`);
      expect(log.split("\n").find((line) => line.startsWith("argv:"))).not.toContain(fakeDbPassword);
      expect(res.stdout).not.toContain(fakeDbPassword);
      expect(res.stderr).not.toContain(fakeDbPassword);
    });
  });

  describe("Runbook, especificación de workflow y confidencialidad (docs/architecture/backups-r2.md)", () => {
    it("documenta los 6 secretos exactos, workflow canónico (cron + workflow_dispatch + environment), retención 30 días en R2, restore local y cero secretos reales", () => {
      expect(existsSync(runbookPath)).toBe(true);
      const doc = readFileSync(runbookPath, "utf8");

      for (const required of [
        "SUPABASE_DB_URL",
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "BACKUP_ENCRYPTION_PASSPHRASE",
        "PRODUCTION_BACKUP_ENABLED",
        'cron: "0 6 * * *"',
        "workflow_dispatch:",
        "environment: production",
        "github.event_name == 'workflow_dispatch' || vars.PRODUCTION_BACKUP_ENABLED == 'true'",
        "30 days",
        "supabase start",
        "sha256sum",
        "openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -salt",
        "--no-owner --schema=public",
        "--single-transaction",
        "DROP SCHEMA IF EXISTS public CASCADE;",
        "trg_on_auth_user_created",
        "trg_auth_users_limpiar_debe_cambiar_password",
        "trg_auth_users_quitar_must_change_password",
        "trg_auth_users_sync_rol_app_metadata",
        "Del esquema `auth` solo se respaldan `auth.users` y `auth.identities`",
        "MFA",
      ]) {
        expect(doc).toContain(required);
      }

      // B2/B3: el dump crea public (no se recrea a mano) y no se reaplican migraciones
      expect(doc).not.toContain("db push --remote");
      expect(doc).not.toMatch(/^CREATE SCHEMA public;$/m);
      expect(doc).not.toContain("GRANT USAGE ON SCHEMA public TO");
      expect(doc).not.toContain("--no-owner --no-privileges --schema=public");

      const filesToAudit = [scriptPath, runbookPath];
      if (existsSync(workflowPath)) {
        filesToAudit.push(workflowPath);
      }
      for (const filePath of filesToAudit) {
        const content = readFileSync(filePath, "utf8");
        expect(content).not.toMatch(/sbp_[a-zA-Z0-9]{10,}/);
        expect(content).not.toMatch(/eyJhbGciOiJIUzI1NiIs/);
        expect(content).not.toMatch(/https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com/i);
      }
    });
  });

  describe("GOZS-800: Contrato de .github/workflows/backup-production.yml", () => {
    type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

    function parseYamlScalar(raw: string): string | number | boolean | null {
      const value = raw.trim();
      if (value === "" || value === "null" || value === "~") return null;
      if (value === "true") return true;
      if (value === "false") return false;
      if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
      if (value.startsWith('"')) {
        if (!value.endsWith('"') || value.length < 2) {
          throw new Error(`Invalid double-quoted YAML scalar: ${value}`);
        }
        return JSON.parse(value) as string;
      }
      if (value.startsWith("'")) {
        if (!value.endsWith("'") || value.length < 2) {
          throw new Error(`Invalid single-quoted YAML scalar: ${value}`);
        }
        return value.slice(1, -1).replace(/''/g, "'");
      }
      return value;
    }

    function splitYamlKeyValue(text: string): { key: string; rest: string } {
      const match = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(text);
      if (!match || !match[1]) {
        throw new Error(`Invalid YAML mapping entry: ${text}`);
      }
      return { key: match[1], rest: (match[2] ?? "").trim() };
    }

    /**
     * Strict zero-dependency YAML parser for GitHub Actions workflow files
     * (mappings, sequences, literal/folded block scalars, quoted scalars, comments).
     */
    function parseWorkflowYaml(source: string): Record<string, YamlValue> {
      const rawLines = source.replace(/\r\n/g, "\n").split("\n");
      for (let i = 0; i < rawLines.length; i++) {
        const rawLine = rawLines[i] ?? "";
        if (/^\s*\t/.test(rawLine)) {
          throw new Error(`YAML indentation must not use tabs (line ${i + 1})`);
        }
      }

      let cursor = 0;

      function currentLine(): string {
        return rawLines[cursor] ?? "";
      }

      function skipIgnorable(): void {
        while (cursor < rawLines.length) {
          const trimmed = currentLine().trim();
          if (trimmed === "" || trimmed.startsWith("#")) {
            cursor++;
          } else {
            break;
          }
        }
      }

      function indentOf(line: string): number {
        let count = 0;
        while (count < line.length && line[count] === " ") count++;
        return count;
      }

      function readBlockScalar(parentIndent: number, style: "|" | ">"): string {
        const blockLines: string[] = [];
        let blockIndent: number | null = null;
        while (cursor < rawLines.length) {
          const line = currentLine();
          if (line.trim() === "") {
            blockLines.push("");
            cursor++;
            continue;
          }
          const ind = indentOf(line);
          if (ind <= parentIndent) break;
          if (blockIndent === null) blockIndent = ind;
          if (ind < blockIndent) {
            throw new Error(`Inconsistent indentation inside YAML block scalar (line ${cursor + 1})`);
          }
          blockLines.push(line.slice(blockIndent));
          cursor++;
        }
        while (blockLines.length > 0 && blockLines[blockLines.length - 1] === "") {
          blockLines.pop();
        }
        return style === "|" ? blockLines.join("\n") : blockLines.join(" ");
      }

      function parseNode(expectedIndent: number): YamlValue {
        skipIgnorable();
        if (cursor >= rawLines.length) return null;
        const line = currentLine();
        const ind = indentOf(line);
        if (ind < expectedIndent) return null;
        if (line.slice(ind).startsWith("- ")) {
          return parseSequence(ind);
        }
        return parseMapping(ind);
      }

      function parseSequence(seqIndent: number): YamlValue[] {
        const items: YamlValue[] = [];
        while (cursor < rawLines.length) {
          skipIgnorable();
          if (cursor >= rawLines.length) break;
          const line = currentLine();
          const ind = indentOf(line);
          if (ind < seqIndent) break;
          if (ind > seqIndent) {
            throw new Error(`Unexpected sequence indentation at line ${cursor + 1}`);
          }
          const content = line.slice(ind);
          if (!content.startsWith("- ")) break;
          const afterDash = content.slice(2).trim();
          cursor++;

          if (afterDash === "") {
            items.push(parseNode(seqIndent + 2));
          } else if (/^[A-Za-z0-9_.-]+:(?:\s+.*)?$/.test(afterDash)) {
            const obj: Record<string, YamlValue> = {};
            const { key, rest } = splitYamlKeyValue(afterDash);
            const itemIndent = seqIndent + 2;
            obj[key] = parseMappingValue(rest, itemIndent);
            while (cursor < rawLines.length) {
              skipIgnorable();
              if (cursor >= rawLines.length) break;
              const nextLine = currentLine();
              const nextInd = indentOf(nextLine);
              if (nextInd < itemIndent) break;
              if (nextInd > itemIndent) {
                throw new Error(`Unexpected mapping indentation inside sequence item at line ${cursor + 1}`);
              }
              const nextContent = nextLine.slice(nextInd);
              if (nextContent.startsWith("- ")) break;
              const entry = splitYamlKeyValue(nextContent);
              if (Object.prototype.hasOwnProperty.call(obj, entry.key)) {
                throw new Error(`Duplicate YAML key "${entry.key}" at line ${cursor + 1}`);
              }
              cursor++;
              obj[entry.key] = parseMappingValue(entry.rest, itemIndent);
            }
            items.push(obj);
          } else {
            items.push(parseYamlScalar(afterDash));
          }
        }
        return items;
      }

      function parseMappingValue(rest: string, keyIndent: number): YamlValue {
        if (rest === "|" || rest === ">") {
          return readBlockScalar(keyIndent, rest);
        }
        if (rest !== "") {
          return parseYamlScalar(rest);
        }
        skipIgnorable();
        if (cursor >= rawLines.length) return null;
        const nextInd = indentOf(currentLine());
        if (nextInd <= keyIndent) return null;
        return parseNode(nextInd);
      }

      function parseMapping(mapIndent: number): Record<string, YamlValue> {
        const obj: Record<string, YamlValue> = {};
        while (cursor < rawLines.length) {
          skipIgnorable();
          if (cursor >= rawLines.length) break;
          const line = currentLine();
          const ind = indentOf(line);
          if (ind < mapIndent) break;
          if (ind > mapIndent) {
            throw new Error(`Unexpected mapping indentation at line ${cursor + 1}`);
          }
          const content = line.slice(ind);
          if (content.startsWith("- ")) {
            throw new Error(`Unexpected sequence item inside mapping at line ${cursor + 1}`);
          }
          const { key, rest } = splitYamlKeyValue(content);
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            throw new Error(`Duplicate YAML key "${key}" at line ${cursor + 1}`);
          }
          cursor++;
          obj[key] = parseMappingValue(rest, mapIndent);
        }
        return obj;
      }

      const root = parseNode(0);
      skipIgnorable();
      if (cursor < rawLines.length) {
        throw new Error(`Unparsed trailing YAML content at line ${cursor + 1}`);
      }
      if (!root || typeof root !== "object" || Array.isArray(root)) {
        throw new Error("Workflow YAML root must be a mapping");
      }
      return root;
    }

    it("GIVEN .github/workflows/backup-production.yml THEN existe, es YAML válido y cumple la especificación canónica de docs/architecture/backups-r2.md §2.3", () => {
      expect(existsSync(workflowPath)).toBe(true);
      const raw = readFileSync(workflowPath, "utf8");
      const workflow = parseWorkflowYaml(raw);

      expect(workflow.name).toBe("Backup Production");

      const onBlock = workflow.on as Record<string, YamlValue>;
      expect(onBlock).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(onBlock, "workflow_dispatch")).toBe(true);
      const schedule = onBlock.schedule as Array<Record<string, YamlValue>>;
      expect(Array.isArray(schedule)).toBe(true);
      expect(schedule).toContainEqual({ cron: "0 6 * * *" });

      const concurrency = workflow.concurrency as Record<string, YamlValue>;
      expect(concurrency).toEqual({
        group: "backup-production",
        "cancel-in-progress": false,
      });

      const jobs = workflow.jobs as Record<string, Record<string, YamlValue>>;
      const backupJob = jobs.backup;
      expect(backupJob).toBeTruthy();
      if (!backupJob) throw new Error("Missing jobs.backup in backup-production.yml");
      expect(backupJob["runs-on"]).toBe("ubuntu-latest");
      expect(backupJob["timeout-minutes"]).toBe(20);
      expect(backupJob.environment).toBe("production");
      expect(backupJob.if).toBe(
        "github.event_name == 'workflow_dispatch' || vars.PRODUCTION_BACKUP_ENABLED == 'true'"
      );
      expect(backupJob.permissions).toEqual({ contents: "read" });

      const steps = backupJob.steps as Array<Record<string, YamlValue>>;
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBe(4);

      // Consistencia con ci.yml / deploy-production.yml: actions/checkout@v7
      const checkoutStep = steps.find((step) => step.uses === "actions/checkout@v7");
      expect(checkoutStep).toBeTruthy();
      expect(raw).not.toMatch(/uses:\s*actions\/(checkout|setup-node)@v4/);

      const requiredSecrets = [
        "SUPABASE_DB_URL",
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "BACKUP_ENCRYPTION_PASSPHRASE",
      ];

      const validateStep = steps.find(
        (step) => typeof step.run === "string" && step.run.includes("bash scripts/backup-restore-verify.sh validate-env")
      );
      expect(validateStep).toBeTruthy();
      expect(validateStep?.shell).toBe("bash");
      const validateEnv = validateStep?.env as Record<string, YamlValue>;
      for (const secret of requiredSecrets) {
        expect(validateEnv[secret]).toBe(`\${{ secrets.${secret} }}`);
      }

      const installStep = steps.find(
        (step) => typeof step.run === "string" && step.run.includes("postgresql-client-17")
      );
      expect(installStep).toBeTruthy();
      expect(installStep?.shell).toBe("bash");
      expect(String(installStep?.run)).toContain("set -euo pipefail");

      const runStep = steps.find(
        (step) => typeof step.run === "string" && step.run.includes("bash scripts/backup-restore-verify.sh run")
      );
      expect(runStep).toBeTruthy();
      expect(runStep?.shell).toBe("bash");
      const runEnv = runStep?.env as Record<string, YamlValue>;
      for (const secret of requiredSecrets) {
        expect(runEnv[secret]).toBe(`\${{ secrets.${secret} }}`);
      }

      // Paridad exacta con el bloque canónico de docs/architecture/backups-r2.md §2.3
      const doc = readFileSync(runbookPath, "utf8");
      const canonicalMatch = /### 2\.3\.[^\n]*\r?\n\r?\n```yaml\r?\n([\s\S]*?)\r?\n```/.exec(doc);
      const canonicalYaml = canonicalMatch?.[1];
      expect(canonicalYaml).toBeTruthy();
      if (!canonicalYaml) throw new Error("Missing canonical YAML block in docs/architecture/backups-r2.md §2.3");
      expect(raw.replace(/\r\n/g, "\n").trim()).toBe(canonicalYaml.replace(/\r\n/g, "\n").trim());
    });

    it("GIVEN los bloques run: de .github/workflows/backup-production.yml THEN nunca interpola ${{ secrets.* }}, no usa curl|sh ni filtra secretos", () => {
      expect(existsSync(workflowPath)).toBe(true);
      const raw = readFileSync(workflowPath, "utf8");
      const workflow = parseWorkflowYaml(raw);
      const jobs = workflow.jobs as Record<string, Record<string, YamlValue>>;

      for (const job of Object.values(jobs)) {
        const steps = (job.steps as Array<Record<string, YamlValue>>) ?? [];
        for (const step of steps) {
          if (typeof step.run !== "string") continue;
          expect(step.run).not.toMatch(/\$\{\{\s*secrets\./);
          expect(step.run).not.toMatch(/\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(ba)?sh\b/i);
          expect(step.run).not.toMatch(/\bset\s+-x\b/);
          expect(step.run).not.toMatch(
            /\becho\b[^\n]*(SUPABASE_DB_URL|R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_BUCKET_NAME|BACKUP_ENCRYPTION_PASSPHRASE)/
          );
        }
      }
    });
  });
});
