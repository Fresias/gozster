import { describe, expect, it } from 'vitest';
import {
  construirAlumnos,
  construirPlanesAlumnos,
  reutilizarDias,
} from '../../scripts/import_mynter_export';

// Datos inventados: no hay información real del export.
const PROF = '00000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-24T12:00:00Z');

const entrada = (n: number, extra: object = {}) => ({
  id: `ases${n}`,
  idProfesional: 'prof1',
  inicioAsesoria: '2026-09-25T03:01:00+0000',
  finAsesoria: '2026-10-25T02:59:00+0000',
  modalidad: 'VIRTUAL',
  pagoAlumno: { importe: 99999, nroTarjeta: '4111111111111111', nroDniTitularTarjeta: '12345678', cuentaBanco: { cbu: 'CBU-SECRETO' } },
  alumno: {
    id: `al${n}`, email: ` Alumno${n}@Test.com `, nombre: 'Ana', apellido: `Prueba${n}`, telefono: '1155550000', codPaisTelefono: '+54',
    dni: '30111222', cuentasBancarias: [{ cbu: 'CBU-SECRETO' }], domicilio: { calle: 'Calle Falsa' },
  },
  ...extra,
});
const entradas = Array.from({ length: 13 }, (_, i) => entrada(i + 1));

const ej = (id: string) => ({ id, nombreEjercicio: id });
const plan = (id: string, estado: string, fecha: string) => ({
  id, nombrePlan: `Plan ${id}`, estado, audFechaIns: fecha, comentario: null,
  semanas: [{ dias: [{ nombre: 'DIA 1', bloques: [{ ejercicios: [ej('e1')] }] }] }],
});
const mapa = { e1: 'ejercicio-gozs-1' };
const historial = {
  alumnos: [
    { id: 'al1', planes: [
      plan('pC', 'ESTADO_ACTIVO', '2026-08-02T22:55:40+0000'),
      plan('pA', 'ESTADO_INACTIVO', '2025-12-15T02:55:40+0000'),
      plan('pB', 'ESTADO_INACTIVO', '2026-03-16T17:21:45+0000'),
    ] },
    { id: 'sin-ficha', planes: [plan('pX', 'ESTADO_ACTIVO', '2026-01-01T00:00:00+0000')] },
  ],
};

describe('importador alumnos + planes', () => {
  it('13 alumnos sin duplicados aunque el export los repita', () => {
    const r = construirAlumnos([...entradas, entrada(1)], PROF, AHORA);
    expect(r.perfiles).toHaveLength(13);
    expect(new Set(r.perfiles.map((p) => p.id)).size).toBe(13);
    expect(r.vinculos).toHaveLength(13);
    expect(r.contrataciones).toHaveLength(13);
    expect(r.perfiles[0]).toMatchObject({ email: 'alumno1@test.com', nombre_completo: 'Ana Prueba1', rol: 'ALUMNO', profesor_asignado_id: PROF });
  });

  it('ningún dato de pago, DNI, cuenta bancaria o domicilio llega al payload', () => {
    const r = construirAlumnos(entradas, PROF, AHORA);
    const json = JSON.stringify(r);
    for (const prohibido of ['4111111111111111', '12345678', 'CBU-SECRETO', '30111222', 'Calle Falsa', '99999', 'pago', 'dni', 'domicilio', 'tarjeta']) {
      expect(json.toLowerCase()).not.toContain(prohibido.toLowerCase());
    }
  });

  it('contratación: fechas, modalidad y vigencia', () => {
    const [vigente, vencida, presencial] = construirAlumnos(
      [entrada(1), entrada(2, { finAsesoria: '2026-10-01T00:00:00+0000' }), entrada(3, { modalidad: 'PRESENCIAL' })],
      PROF,
      AHORA
    ).contrataciones;
    expect(vigente).toMatchObject({ estado: 'VIGENTE', fecha_inicio: '2026-09-25', fecha_fin: '2026-10-25', dia_vencimiento: 25, tipo_servicio: 'ASESORIA_ONLINE' });
    expect(vencida!.estado).toBe('VENCIDA');
    expect(presencial!.tipo_servicio).toBe('PRESENCIAL');
  });

  it('sin fechas válidas no inventa la contratación', () => {
    const r = construirAlumnos([entrada(1, { finAsesoria: null })], PROF, AHORA);
    expect(r.perfiles).toHaveLength(1);
    expect(r.contrataciones).toHaveLength(0);
    expect(r.sinContratacion).toBe(1);
  });

  it('vigencia de planes: cada plan rige hasta la creación del siguiente; sólo el último activo queda ACTIVO', () => {
    const ids = new Set(construirAlumnos(entradas, PROF, AHORA).perfiles.map((p) => p.id));
    const r = construirPlanesAlumnos(historial.alumnos, mapa, PROF, ids);
    expect(r.planes.map((p) => [p.nombre, p.estado, p.fecha_inicio, p.fecha_fin])).toEqual([
      ['Plan pA', 'INACTIVO', '2025-12-15T02:55:40.000Z', '2026-03-16T17:21:45.000Z'],
      ['Plan pB', 'INACTIVO', '2026-03-16T17:21:45.000Z', '2026-08-02T22:55:40.000Z'],
      ['Plan pC', 'ACTIVO', '2026-08-02T22:55:40.000Z', null],
    ]);
    expect(r.planes.every((p) => p.alumno_id !== null && p.profesor_id === PROF)).toBe(true);
    expect(r.sinFicha).toEqual(['sin-ficha']);
    expect(r.dias).toHaveLength(3);
    expect(r.rutina.every((f) => f.ejercicio_id === 'ejercicio-gozs-1')).toBe(true);
  });

  it('idempotente: dos corridas dan exactamente los mismos ids (la segunda no crea filas)', () => {
    const run = () => {
      const al = construirAlumnos(entradas, PROF, AHORA);
      const pl = construirPlanesAlumnos(historial.alumnos, mapa, PROF, new Set(al.perfiles.map((p) => p.id)));
      return JSON.stringify([al, pl]);
    };
    expect(run()).toBe(run());
  });

  it('reutiliza los ids de día del seed para actualizar sin duplicar', () => {
    const ids = new Set(construirAlumnos(entradas, PROF, AHORA).perfiles.map((p) => p.id));
    const { dias, rutina } = construirPlanesAlumnos(historial.alumnos, mapa, PROF, ids);
    const d0 = dias[0]!;
    const r = reutilizarDias(dias, rutina, new Map([[`${d0.plan_id}:${d0.orden}`, 'dia-del-seed']]));
    expect(r.dias[0]!.id).toBe('dia-del-seed');
    expect(r.rutina.filter((f) => f.dia_id === 'dia-del-seed')).toHaveLength(1);
    expect(r.dias.slice(1).map((d) => d.id)).toEqual(dias.slice(1).map((d) => d.id));
  });

  it('ejercicio sin mapear corta con error explícito', () => {
    const al = construirAlumnos(entradas, PROF, AHORA);
    expect(() => construirPlanesAlumnos(historial.alumnos, {}, PROF, new Set(al.perfiles.map((p) => p.id)))).toThrow(/sin mapear/);
  });
});
