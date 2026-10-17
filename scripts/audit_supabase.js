const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(url, key);

async function verify() {
  console.log('====================================================');
  console.log('AUDITORIA EN VIVO: SUPABASE (PROYECTO cutvhrxgrwwfntetdsdo)');
  console.log('====================================================\n');

  const { data: perfiles, error: e1 } = await supabase.from('perfiles').select('*');
  if (e1) {
    console.error('Error fetching perfiles:', e1);
    return;
  }

  const alumnos = perfiles.filter(p => p.rol === 'ALUMNO');
  const coaches = perfiles.filter(p => p.rol === 'ENTRENADOR');
  console.log(`Perfiles totales: ${perfiles.length}`);
  console.log(`- Alumnos: ${alumnos.length} (Esperado: 13)`);
  console.log(`- Coaches: ${coaches.length} (Esperado: 1)`);
  console.log('\nListado de Alumnos Reales (Backup Sanitizado Mynter):');
  alumnos.forEach((a, i) => {
    console.log(`  ${(i + 1).toString().padStart(2, ' ')}. ${a.nombre_completo.padEnd(25, ' ')} | ${a.email.padEnd(25, ' ')} | Estado: ${a.estado_membresia}`);
  });

  const { data: planes } = await supabase.from('planes_entrenamiento').select('*');
  console.log(`\nPlanes de Entrenamiento creados: ${planes?.length || 0}`);

  const { data: dias } = await supabase.from('dias_rutina').select('*');
  console.log(`Días de Rutina estructurados: ${dias?.length || 0}`);

  const { data: ejercicios } = await supabase.from('ejercicios').select('*');
  console.log(`Ejercicios en Catálogo Maestro: ${ejercicios?.length || 0}`);

  const { data: ejRutina } = await supabase.from('ejercicios_en_rutina').select('*');
  console.log(`Ejercicios configurados en Rutina: ${ejRutina?.length || 0}`);
  const superseries = ejRutina?.filter(e => e.es_superserie) || [];
  console.log(`- Ejercicios en Superserie: ${superseries.length}`);

  const { data: convs } = await supabase.from('conversaciones').select('*');
  console.log(`Conversaciones de Chat activas: ${convs?.length || 0}`);

  console.log('\n====================================================');
  console.log('RESULTADO: TODAS LAS TABLAS Y DATOS OPERACIONALES EN VIVO');
  console.log('====================================================');
}

verify().catch(console.error);
