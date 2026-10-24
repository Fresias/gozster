import { describe, expect, it } from 'vitest';
import {
  construirAlumnos,
  construirHistorial,
  construirPlanesAlumnos,
  deduplicarRegistros,
} from '../../scripts/import_mynter_export';

// Datos inventados: no hay información real del export.
const PROF = '00000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-24T12:00:00Z');

const ej = (id: string) => ({ id, nombreEjercicio: id });
const plan = (id: string, estado: string, fecha: string, ejercicios: string[]) => ({
  id, nombrePlan: `Plan ${id}`, estado, audFechaIns: fecha, comentario: null,
  semanas: [{ dias: [{ nombre: 'DIA 1', bloques: [{ ejercicios: ejercicios.map(ej) }] }] }],
});
const reg = (id: string, extra: object = {}) => ({
  id, idEjercicio: 'e1', fecha: '2026-04-10T15:00:00+0000', peso: 100, nroRep: 5, nroSerie: 1, comentario: null, notificoDolor: false, ...extra,
});

const mapa = { e1: 'ejercicio-gozs-1', e2: 'ejercicio-gozs-2', e1bis: 'ejercicio-gozs-1' };
const entradas = [{
  id: 'ases1', idProfesional: 'prof1', inicioAsesoria: '2026-09-25T03:01:00+0000', finAsesoria: '2026-10-25T02:59:00+0000', modalidad: 'VIRTUAL',
  alumno: { id: 'al1', email: 'a@test.com', nombre: 'Ana', apellido: 'Prueba', telefono: '1' },
}];

function armar(registros: object[]) {
  const historial = [{
    id: 'al1',
    planes: [
      plan('pA', 'ESTADO_INACTIVO', '2026-01-01T00:00:00+0000', ['e1', 'e2']),
      plan('pB', 'ESTADO_ACTIVO', '2026-04-01T00:00:00+0000', ['e1bis']),
    ],
    registros,
  }];
  const al = construirAlumnos(entradas, PROF, AHORA);
  const ids = new Set(al.perfiles.map((p) => p.id));
  const pl = construirPlanesAlumnos(historial, mapa, PROF, ids);
  return { historial, pl, ids, run: () => construirHistorial(historial, mapa, pl.planes, pl.dias, pl.rutina, ids) };
}

const registros = [
  reg('r1'),
  reg('r1'), // duplicado idéntico
  reg('r2', { nroSerie: 2, peso: null, nroRep: 8, comentario: ' se sintió pesado ' }),
  reg('r3', { idEjercicio: 'e2', nroSerie: 1, peso: 50, nroRep: 10, fecha: '2026-02-10T15:00:00+0000' }),
  reg('r4', { idEjercicio: 'e1bis', nroSerie: 1, peso: 105, nroRep: 5, fecha: '2026-04-20T15:00:00+0000', notificoDolor: true, comentario: 'molestia hombro' }),
  reg('r5', { idEjercicio: 'desconocido', fecha: '2026-04-20T15:00:00+0000' }),
];

describe('importador historial', () => {
  it('duplicados idénticos se descartan; los que difieren son conflicto y no se descartan', () => {
    const ok = deduplicarRegistros([reg('a'), reg('a'), reg('b')]);
    expect(ok).toMatchObject({ identicos: 1, conflictos: [] });
    expect(ok.unicos).toHaveLength(2);
    const mal = deduplicarRegistros([reg('a'), reg('a', { peso: 101 })]);
    expect(mal.conflictos).toEqual(['a']);
    expect(mal.unicos).toHaveLength(2);
  });

  it('agrupa por alumno + día, asigna plan vigente y calcula volumen', () => {
    const r = armar(registros).run();
    expect(r.sesiones).toHaveLength(3);
    const [feb, abr10, abr20] = r.sesiones;
    const planA = armar(registros).pl.planes.find((p) => p.nombre === 'Plan pA')!;
    const diasA = armar(registros).pl.dias.filter((d) => d.plan_id === planA.id).map((d) => d.id);
    expect(feb!.dia_id).toBe(diasA[0]);
    expect(feb!.volumen_total_kg).toBe(500);
    expect(abr10!.volumen_total_kg).toBe(500); // 100x5 + (null->0)x8
    expect(abr10!.dia_id).not.toBeNull();
    expect(abr20!.dia_id).toBe(abr10!.dia_id); // mismo día del plan pB
    expect(abr10!.dia_id).not.toBe(feb!.dia_id); // pA vigente en febrero
  });

  it('series: peso null → 0, completada, rpe NULL, comentario en notas, ejercicio canónico', () => {
    const r = armar(registros).run();
    const s2 = r.series.find((s) => s.numero_serie === 2)!;
    expect(s2).toMatchObject({ peso_kg: 0, reps_hechas: 8, completada: true, rpe_real: null, notas: 'se sintió pesado', ejercicio_id: 'ejercicio-gozs-1' });
    expect(r.series.filter((s) => s.ejercicio_id === 'ejercicio-gozs-1')).toHaveLength(3);
  });

  it('sin mapeo se reporta, no se descarta en silencio', () => {
    const r = armar(registros).run();
    expect(r.sinMapeoIds).toEqual(['desconocido']);
    expect(Object.values(r.reporte)[0]).toMatchObject({ sinMapeo: 1, duplicadosIdenticos: 1, conflictos: [], sesiones: 3, series: 4 });
  });

  it('choque (sesión, ejercicio, n.º serie): queda la de mayor peso', () => {
    const r = armar([reg('x1', { peso: 80 }), reg('x2', { peso: 90, idEjercicio: 'e1bis' })]).run();
    expect(r.series).toHaveLength(1);
    expect(r.series[0]!.peso_kg).toBe(90);
    expect(r.choquesDeSerie).toBe(1);
  });

  it('notificoDolor → alumno_historial_dolor con fecha y ejercicio', () => {
    const r = armar(registros).run();
    expect(r.dolores).toHaveLength(1);
    expect(r.dolores[0]).toMatchObject({ ejercicio_id: 'ejercicio-gozs-1', fecha_reporte: '2026-04-20', notas_alumno: 'molestia hombro' });
  });

  it('ejercicio con historial que atraviesa dos planes se cuenta', () => {
    const r = armar([...registros, reg('r6', { fecha: '2026-02-12T15:00:00+0000' })]).run();
    expect(Object.values(r.reporte)[0]!.ejerciciosMultiplan).toBe(1);
  });

  it('idempotente: dos corridas dan exactamente lo mismo', () => {
    const a = armar(registros);
    expect(a.run()).toEqual(a.run());
  });

  it('alumno sin ficha se omite', () => {
    const a = armar(registros);
    const r = construirHistorial([{ id: 'otro', registros }], mapa, a.pl.planes, a.pl.dias, a.pl.rutina, a.ids);
    expect(r.sinFicha).toEqual(['otro']);
    expect(r.sesiones).toHaveLength(0);
  });
});
