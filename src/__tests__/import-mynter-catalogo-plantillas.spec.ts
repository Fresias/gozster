import { describe, expect, it } from 'vitest';
import {
  clasificarMusculos,
  construirCatalogo,
  construirPlantillas,
  normalizarNombre,
  parseCsv,
  parsePrescripcion,
} from '../../scripts/import_mynter_export';

// Datos inventados: no hay información real del export.
const catalogo = [
  { id: 'a1', nombre: 'Sentadilla Libre', urlVideo: 'VID_A', musculos: [{ nombre: 'Cuádriceps', participacion: 70 }, { nombre: 'Glúteo', participacion: 30 }] },
  { id: 'a2', nombre: ' sentadilla  libre ', urlVideo: 'VID_B' },
  { id: 'b1', nombre: 'Press Banca', urlVideo: 'VID_P' },
  { id: 'b2', nombre: 'Press de Pecho', urlVideo: 'VID_P' },
  { id: 'c1', nombre: 'Remo Único', urlVideo: null },
  { id: 'd1', nombre: 'Curl Sin Uso', urlVideo: 'VID_C' },
];

const ej = (id: string, extra: object = {}) => ({ id, nombreEjercicio: id, ...extra });
const plantillas = [
  {
    id: 'p1', nombre: 'Fuerza A', audFechaUpd: '2026-01-01',
    semanas: [{ dias: [{ nombre: 'Día 1', bloques: [{ ejercicios: [
      ej('a2', { ejecucionEjercicio: [[{ key: 'Series:', value: '3' }, { key: 'Rep.:', value: '10-8-6' }, { key: 'Desc.:', value: '2 min' }, { key: 'Esffuerzo:', value: '8' }]] }),
      ej('b1', { children: [ej('c1', { ejecucionEjercicio: [[{ key: 'Esfuerzo: ', value: 'fuerte' }]] })] }),
    ] }] }] }],
  },
  { id: 'p2', nombre: 'fuerza  a', audFechaUpd: '2026-06-01', semanas: [{ dias: [{ nombre: 'Día 1', ejercicios: [ej('a1'), ej('a2')] }] }] },
];

describe('importador catálogo + plantillas', () => {
  it('normaliza nombres', () => {
    expect(normalizarNombre('  Sentadílla   LIBRE ')).toBe('sentadilla libre');
  });

  it('fusiona por nombre normalizado y deja el video del más usado', () => {
    const r = construirCatalogo(catalogo, plantillas, []);
    const nombres = r.ejercicios.map((e) => normalizarNombre(e.nombre));
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(r.mapa['a1']).toBe(r.mapa['a2']);
    const sent = r.ejercicios.find((e) => e.id === r.mapa['a1'])!;
    expect(sent.url_video).toBe('VID_B'); // a2 tiene 2 usos, a1 uno
  });

  it('mismo video con nombre distinto queda separado salvo marca en el CSV', () => {
    const sin = construirCatalogo(catalogo, plantillas, []);
    expect(sin.mapa['b1']).not.toBe(sin.mapa['b2']);
    const csv = parseCsv('grupo,nombre,id_mynter,queda\n1,Press Banca,b1,si\n1,Press de Pecho,b2,\n');
    const con = construirCatalogo(catalogo, plantillas, csv);
    expect(con.mapa['b2']).toBe(con.mapa['b1']);
    expect(con.fusionados).toBe(sin.fusionados + 1);
  });

  it('importa los sin uso por defecto y --solo-usados los omite', () => {
    expect(construirCatalogo(catalogo, plantillas, []).mapa['d1']).toBeDefined();
    const r = construirCatalogo(catalogo, plantillas, [], { soloUsados: true });
    expect(r.mapa['d1']).toBeUndefined();
    expect(r.omitidos).toBeGreaterThan(0);
  });

  it('reutiliza el id de un ejercicio existente con el mismo nombre normalizado', () => {
    const r = construirCatalogo(catalogo, plantillas, [], { existentes: [{ id: 'x-existente', nombre: 'SENTADILLA libre' }] });
    expect(r.mapa['a1']).toBe('x-existente');
  });

  it('guarda videos distintos como alternativos en comentario', () => {
    const r = construirCatalogo(catalogo, plantillas, []);
    const sent = r.ejercicios.find((e) => e.id === r.mapa['a1'])!;
    expect(sent.comentario).toMatch(/Video alternativo: VID_[AB]/);
  });

  it('clasifica músculos por participación', () => {
    expect(clasificarMusculos(catalogo[0]!.musculos)).toEqual({ principales: ['Cuádriceps'], secundarios: ['Glúteo'] });
  });

  it('parsea prescripciones con claves mal tipeadas y manda lo inválido a notas', () => {
    const p = parsePrescripcion([[{ key: 'Series:', value: '3' }, { key: 'Rep.:', value: '10-8-6' }, { key: 'Desc.:', value: '2 min' }, { key: 'Esffuerzo:', value: '8' }]]);
    expect(p).toMatchObject({ series: 3, repeticiones: '10-8-6', descanso_segundos: 120, rpe_objetivo: 8, noInterpretados: 0 });
    const m = parsePrescripcion([[{ key: 'Esfuerzo: ', value: 'fuerte' }, { key: 'Series:', value: 'tres' }]]);
    expect(m.noInterpretados).toBe(2);
    expect(m.notas).toContain('fuerte');
    expect(m.series).toBeGreaterThanOrEqual(1);
  });

  it('plantillas repetidas: la más reciente ACTIVO, la otra INACTIVO; superseries agrupadas', () => {
    const cat = construirCatalogo(catalogo, plantillas, []);
    const r = construirPlantillas(plantillas, cat.mapa);
    expect(r.planes.map((p) => p.estado)).toEqual(['INACTIVO', 'ACTIVO']);
    expect(r.activas).toBe(1);
    expect(r.inactivas).toBe(1);
    const ss = r.rutina.filter((f) => f.es_superserie);
    expect(ss).toHaveLength(2);
    expect(new Set(ss.map((f) => f.grupo_superserie)).size).toBe(1);
    expect(r.rutina.filter((f) => !f.es_superserie).every((f) => f.grupo_superserie === null)).toBe(true);
    expect(r.noInterpretados).toBe(1);
  });

  it('es determinista (idempotente)', () => {
    const run = () => {
      const c = construirCatalogo(catalogo, plantillas, []);
      return JSON.stringify([c, construirPlantillas(plantillas, c.mapa)]);
    };
    expect(run()).toBe(run());
  });
});
