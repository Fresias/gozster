import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
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
import { resolveBash } from "../harness-kit/core/guard/guard-core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const scriptPath = path.join(repoRoot, "scripts", "backup-restore-verify.sh");
const runbookPath = path.join(repoRoot, "docs", "architecture", "backups-r2.md");
const workflowPath = path.join(repoRoot, ".github", "workflows", "backup-production.yml");

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
  try {
    const stdout = execFileSync(bash, [toPosix(scriptPath), ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
      env: buildBashEnv(envOverrides, prependBins),
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
      mkdirSync(binDir, { recursive: true });
      mkdirSync(r2Store, { recursive: true });

      const pgDumpStub = path.join(binDir, "pg_dump");
      writeFileSync(
        pgDumpStub,
        [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          `echo "pg_dump $*" >> "${toPosix(logFile)}"`,
          'if [[ "$*" == *"--table=auth.users"* ]]; then',
          '  echo "INSERT INTO auth.users (id, email) VALUES (\'00000000-0000-0000-0000-000000000001\', \'test@example.com\') ON CONFLICT DO NOTHING;"',
          "else",
          '  echo "CREATE TABLE public.ejemplo (id int primary key, nombre text);"',
          '  echo "INSERT INTO public.ejemplo (id, nombre) VALUES (1, \'GOZSter OK\');"',
          "fi",
          "",
        ].join("\n"),
        "utf8"
      );
      chmodSync(pgDumpStub, 0o755);

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
          SUPABASE_DB_URL: `postgresql://postgres:${fakeDbPass}@127.0.0.1:54322/postgres`,
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
      expect(invocations).toContain("--format=plain --no-owner --no-privileges --data-only --column-inserts --on-conflict-do-nothing --table=auth.users --table=auth.identities");
      expect(invocations).toContain("--format=plain --no-owner --no-privileges --schema=public");
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
    });

    it("falla fail-fast si aws s3api head-object reporta objeto vacío (0 bytes)", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "gozs-backup-zero-"));
      tempDirs.push(dir);
      const binDir = path.join(dir, "bin");
      mkdirSync(binDir, { recursive: true });

      const pgDumpStub = path.join(binDir, "pg_dump");
      writeFileSync(pgDumpStub, "#!/usr/bin/env bash\necho 'SELECT 1;'\n", "utf8");
      chmodSync(pgDumpStub, 0o755);

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
      tampered[tampered.length - 1] ^= 0xff;
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
        "--no-owner --no-privileges",
      ]) {
        expect(doc).toContain(required);
      }

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
});
