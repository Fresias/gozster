import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/20261027120000_suscripciones_cobros.sql'),
  'utf8',
);

describe('migración servicios/suscripciones/cobros (GOZS-182)', () => {
  it('habilita RLS en todas las tablas nuevas', () => {
    for (const t of ['suscripciones', 'cobros', 'pagos_cobro']) {
      expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('no usa USING (true)', () => {
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it('coach ve solo sus cobros; alumno solo los propios', () => {
    expect(sql).toMatch(/cobros_select[\s\S]*alumno_id = auth\.uid\(\) OR entrenador_id = auth\.uid\(\)/);
  });

  it('cobros y pagos_cobro no tienen escritura directa', () => {
    expect(sql).not.toMatch(/ON public\.(cobros|pagos_cobro) FOR (ALL|INSERT|UPDATE|DELETE)/);
  });

  it('registrar_pago_cobro marca el cobro como PAGADO y es idempotente por periodo', () => {
    expect(sql).toContain("SET estado = 'PAGADO'");
    expect(sql).toContain('UNIQUE (suscripcion_id, periodo)');
    expect(sql).toContain('ON CONFLICT (suscripcion_id, periodo) DO NOTHING');
  });
});
