import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type PGlite } from "@electric-sql/pglite";
import { crearDbMigrada, listarMigraciones, MIGRATIONS_DIR } from "./helpers/pglite-migrada";
import { TABLAS } from "../../scripts/backup-restore-gozs.mjs";
import {
  evaluarParidadMigraciones,
  listarVersionesLocales,
} from "../../scripts/check-supabase-migrations.mjs";
import { escanearDirectorio, escanearTexto } from "../../scripts/privacy-guard.mjs";

// Invariantes de catálogo (pg_catalog) sobre TODAS las migraciones aplicadas en PGlite.
// Cada aserción compara contra [] para que un fallo liste los objetos infractores.

let db: PGlite;

async function nombres(sql: string): Promise<string[]> {
  const r = await db.query<{ n: string }>(sql);
  return r.rows.map((x) => x.n);
}

const TABLAS_PUBLIC = `
  SELECT c.oid, c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
`;
const VISTAS_PUBLIC = `
  SELECT c.oid, c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
`;
const FUNCIONES_PUBLIC = `
  SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.prorettype::regtype::text AS ret,
         p.oid::regprocedure::text AS firma
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
`;

beforeAll(async () => {
  db = await crearDbMigrada();
}, 120_000);

describe("G1 · RLS en el 100 % de las tablas de public", () => {
  it("todas las tablas regulares tienen RLS habilitado", async () => {
    const r = await nombres(
      `SELECT t.relname AS n FROM (${TABLAS_PUBLIC}) t
       JOIN pg_class c ON c.oid = t.oid WHERE NOT c.relrowsecurity ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("cada tabla tiene al menos una política o anon/authenticated no tienen ningún privilegio", async () => {
    const r = await nombres(
      `SELECT t.relname AS n FROM (${TABLAS_PUBLIC}) t
       WHERE NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = t.oid)
         AND (
           has_table_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege('authenticated', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         )
       ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("ninguna política permite escritura a anon o PUBLIC", async () => {
    const r = await nombres(
      `SELECT c.relname || '.' || p.polname AS n
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND p.polcmd IN ('a', 'w', 'd', '*')
         AND (0 = ANY (p.polroles) OR 'anon'::regrole::oid = ANY (p.polroles))
       ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });
});

describe("G2 · anon y PUBLIC sin escritura ni EXECUTE", () => {
  it("anon no tiene INSERT/UPDATE/DELETE/TRUNCATE en tablas ni vistas", async () => {
    const r = await nombres(
      `SELECT x.relname || ':' || priv AS n
       FROM (${TABLAS_PUBLIC} UNION ALL ${VISTAS_PUBLIC}) x,
            unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) priv
       WHERE has_table_privilege('anon', x.oid, priv) ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("PUBLIC (grantee 0) no tiene escritura en tablas ni vistas", async () => {
    const r = await nombres(
      `SELECT x.relname || ':' || a.privilege_type AS n
       FROM (${TABLAS_PUBLIC} UNION ALL ${VISTAS_PUBLIC}) x
       JOIN pg_class c ON c.oid = x.oid,
            LATERAL aclexplode(c.relacl) a
       WHERE a.grantee = 0 AND a.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
       ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("anon no puede escribir en secuencias de public", async () => {
    const r = await nombres(
      `SELECT c.relname AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'S'
         AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('anon', c.oid, 'USAGE,UPDATE') END ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("anon no tiene EXECUTE sobre ninguna función de public", async () => {
    const r = await nombres(
      `SELECT firma AS n FROM (${FUNCIONES_PUBLIC}) f
       WHERE has_function_privilege('anon', f.oid, 'EXECUTE') ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("PUBLIC no tiene EXECUTE sobre funciones SECURITY DEFINER ni triggers de public", async () => {
    const r = await nombres(
      `SELECT firma AS n FROM (${FUNCIONES_PUBLIC}) f
       JOIN pg_proc p ON p.oid = f.oid
       WHERE (f.prosecdef OR f.ret = 'trigger')
         AND (p.proacl IS NULL OR EXISTS (
           SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
       ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("las funciones trigger no son ejecutables por anon ni authenticated", async () => {
    const r = await nombres(
      `SELECT firma AS n FROM (${FUNCIONES_PUBLIC}) f
       WHERE f.ret = 'trigger'
         AND (has_function_privilege('anon', f.oid, 'EXECUTE')
              OR has_function_privilege('authenticated', f.oid, 'EXECUTE'))
       ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });
});

describe("S-6 · SECURITY DEFINER con search_path fijo", () => {
  it("el 100 % de las SECURITY DEFINER fija search_path", async () => {
    const r = await nombres(
      `SELECT firma AS n FROM (${FUNCIONES_PUBLIC}) f
       WHERE f.prosecdef
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(f.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
       ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("el search_path fijado no incluye esquemas escribibles por usuarios salvo public y pg_temp al final", async () => {
    const r = await db.query<{ firma: string; cfg: string }>(
      `SELECT firma, c AS cfg FROM (${FUNCIONES_PUBLIC}) f, unnest(f.proconfig) c
       WHERE f.prosecdef AND c LIKE 'search_path=%'`,
    );
    const malos = r.rows
      .filter(({ cfg }) => {
        const items = cfg
          .replace("search_path=", "")
          .split(",")
          .map((s) => s.trim().replace(/"/g, ""));
        const idxTemp = items.indexOf("pg_temp");
        return idxTemp !== -1 && idxTemp !== items.length - 1;
      })
      .map((x) => x.firma);
    expect(malos).toEqual([]);
  });
});

describe("Vistas de public", () => {
  it("ninguna vista otorga SELECT a anon ni a PUBLIC", async () => {
    const r = await nombres(
      `SELECT v.relname AS n FROM (${VISTAS_PUBLIC}) v JOIN pg_class c ON c.oid = v.oid
       WHERE has_table_privilege('anon', v.oid, 'SELECT')
          OR EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                     WHERE a.grantee = 0 AND a.privilege_type = 'SELECT')
       ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("ninguna vista referencia auth.users", async () => {
    const r = await nombres(
      `SELECT DISTINCT v.relname AS n FROM (${VISTAS_PUBLIC}) v
       JOIN pg_rewrite rw ON rw.ev_class = v.oid
       JOIN pg_depend d ON d.objid = rw.oid AND d.classid = 'pg_rewrite'::regclass
       JOIN pg_class t ON t.oid = d.refobjid AND d.refclassid = 'pg_class'::regclass
       JOIN pg_namespace tn ON tn.oid = t.relnamespace
       WHERE tn.nspname = 'auth' AND t.relname = 'users' ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("toda vista es security_invoker o solo es legible por authenticated/service_role sin PUBLIC", async () => {
    const r = await nombres(
      `SELECT v.relname AS n FROM (${VISTAS_PUBLIC}) v JOIN pg_class c ON c.oid = v.oid
       WHERE NOT coalesce('security_invoker=true' = ANY (c.reloptions)
                          OR 'security_invoker=on' = ANY (c.reloptions), false)
         AND (has_table_privilege('anon', v.oid, 'SELECT')
              OR EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                         WHERE a.grantee = 0))
       ORDER BY 1`,
    );
    expect(r).toEqual([]);
  });

  it("v_estado_alumno y v_prs existen con contrato de seguridad explícito", async () => {
    for (const vista of ["v_estado_alumno", "v_prs"]) {
      const r = await db.query<{ invoker: boolean; anon: boolean; auth: boolean }>(
        `SELECT coalesce('security_invoker=true' = ANY (c.reloptions)
                         OR 'security_invoker=on' = ANY (c.reloptions), false) AS invoker,
                has_table_privilege('anon', c.oid, 'SELECT') AS anon,
                has_table_privilege('authenticated', c.oid, 'SELECT') AS auth
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [vista],
      );
      expect(r.rows, `vista ${vista}`).toHaveLength(1);
      const fila = r.rows[0]!;
      expect(fila.anon, `${vista} anon`).toBe(false);
      expect(fila.invoker || fila.auth, `${vista} contrato`).toBe(true);
    }
  });
});

describe("G6/G10 · paridad de respaldo y scripts de control", () => {
  it("TABLAS del script de respaldo == tablas de public (sin huérfanas ni sobrantes)", async () => {
    const reales = (await nombres(`SELECT t.relname AS n FROM (${TABLAS_PUBLIC}) t`)).sort();
    const script = TABLAS.map((t: { nombre: string }) => t.nombre).sort();
    expect(script).toEqual(reales);
  });

  it("el whitelist de restaurar_filas_respaldo == TABLAS del script", async () => {
    const r = await db.query<{ def: string }>(
      `SELECT pg_get_functiondef('public.restaurar_filas_respaldo(text,jsonb)'::regprocedure) AS def`,
    );
    const def = r.rows[0]!.def;
    const bloque = def.match(/p_tabla\s+NOT\s+IN\s*\(([\s\S]*?)\)\s*THEN/i);
    expect(bloque, "whitelist no encontrado").not.toBeNull();
    const whitelist = [...bloque![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    const script = TABLAS.map((t: { nombre: string }) => t.nombre).sort();
    expect(whitelist).toEqual(script);
  });

  it("restaurar_filas_respaldo solo es ejecutable por service_role", async () => {
    const r = await db.query<{ anon: boolean; auth: boolean; svc: boolean; pub: boolean }>(
      `SELECT has_function_privilege('anon', oid, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', oid, 'EXECUTE') AS auth,
              has_function_privilege('service_role', oid, 'EXECUTE') AS svc,
              coalesce((SELECT bool_or(a.grantee = 0) FROM aclexplode(proacl) a), true) AS pub
       FROM pg_proc WHERE oid = 'public.restaurar_filas_respaldo(text,jsonb)'::regprocedure`,
    );
    expect(r.rows[0]).toEqual({ anon: false, auth: false, svc: true, pub: false });
  });

  it("las FKs declaradas en TABLAS coinciden con pg_constraint y respetan el orden topológico", async () => {
    const r = await db.query<{ tabla: string; col: string; ref: string }>(
      `SELECT c.conrelid::regclass::text AS tabla, a.attname AS col, c.confrelid::regclass::text AS ref
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'f' AND n.nspname = 'public' AND c.confrelid::regclass::text NOT LIKE 'auth.%'`,
    );
    const quitar = (s: string) => s.replace(/^public\./, "");
    const reales = r.rows.map((x) => `${quitar(x.tabla)}.${x.col}->${quitar(x.ref)}`).sort();
    const orden = new Map<string, number>(
      TABLAS.map((t: { nombre: string }, i: number) => [t.nombre, i] as [string, number]),
    );
    const declaradas = (
      TABLAS as { nombre: string; fks: Record<string, string> }[]
    )
      .flatMap((t) => Object.entries(t.fks).map(([col, ref]) => `${t.nombre}.${col}->${ref}`))
      .sort();
    expect(declaradas).toEqual(reales);

    const fuera = r.rows
      .map((x) => ({ t: quitar(x.tabla), ref: quitar(x.ref) }))
      .filter(({ t, ref }) => t !== ref && (orden.get(ref) ?? Infinity) > (orden.get(t) ?? -1))
      .map(({ t, ref }) => `${t}->${ref}`);
    expect(fuera).toEqual([]);
  });

  it("las versiones de migraciones locales son únicas, ordenadas y la paridad detecta pendientes", () => {
    const locales = listarVersionesLocales(MIGRATIONS_DIR);
    const archivos = listarMigraciones();
    expect(locales).toHaveLength(archivos.length);
    const versiones = locales.map((m) => m.version);
    expect(new Set(versiones).size).toBe(versiones.length);
    expect([...versiones].sort()).toEqual(versiones);

    const ok = evaluarParidadMigraciones({
      locales,
      registrosRemotos: versiones.map((v) => ({ local: v, remote: v })),
    });
    expect(ok.ok).toBe(true);
    expect(ok.pendientes).toEqual([]);

    const sinUltima = evaluarParidadMigraciones({
      locales,
      registrosRemotos: versiones.slice(0, -1).map((v) => ({ local: v, remote: v })),
    });
    expect(sinUltima.ok).toBe(false);
    expect(sinUltima.pendientes.map((m: { version: string }) => m.version)).toEqual([
      versiones[versiones.length - 1],
    ]);

    const vacia = evaluarParidadMigraciones({ locales, registrosRemotos: [] });
    expect(vacia.ok).toBe(false);
    expect(vacia.pendientes).toHaveLength(locales.length);
  });

  it("privacy-guard detecta emails personales y no da falsos positivos en texto neutro", () => {
    expect(escanearTexto("contacto: persona@gmail.com")).toContain("email-personal");
    expect(escanearTexto("contacto: x@hotmail.com")).toContain("email-personal");
    expect(escanearTexto("const a = 'coach@test.local'; // 11111111-1111-4111-8111-111111111101")).toEqual([]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-guard-"));
    try {
      fs.writeFileSync(path.join(dir, "limpio.js"), "console.log('ok')");
      expect(escanearDirectorio(dir)).toEqual([]);
      fs.writeFileSync(path.join(dir, "sucio.js"), "x='alguien@gmail.com'");
      const hits = escanearDirectorio(dir) as { file: string; motivos: string[] }[];
      expect(hits).toHaveLength(1);
      expect(path.basename(hits[0]!.file)).toBe("sucio.js");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
