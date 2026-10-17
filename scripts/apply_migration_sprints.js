const fs = require('fs');
const path = require('path');

const token = process.env.GOZSTER_DB;
const projectRef = 'cutvhrxgrwwfntetdsdo';

if (!token) {
  console.error('Error: GOZSTER_DB access token not found');
  process.exit(1);
}

async function runMigration() {
  const sqlPath = path.join(__dirname, '../supabase/migrations/20261017000000_hevy_everfit_mynter_sprints.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Aplicando migración a Supabase (cutvhrxgrwwfntetdsdo)...');
  const url = 'https://api.supabase.com/v1/projects/' + projectRef + '/database/query';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Error aplicando migración (' + res.status + '):', errorText);
    process.exit(1);
  }

  const result = await res.json();
  console.log('Migración aplicada con éxito. Respuesta:', result);

  // Verificación en vivo de columnas y tablas
  const verifySql = `
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND (
        (table_name = 'ejercicios_en_rutina' AND column_name IN ('tempo', 'force_rpe_required')) OR
        (table_name = 'registro_series' AND column_name IN ('set_type', 'pain_reported', 'pain_notes', 'video_url')) OR
        (table_name = 'registro_sesiones' AND column_name IN ('effective_volume_kg', 'athlete_feedback')) OR
        (table_name = 'perfiles' AND column_name = 'telefono') OR
        (table_name IN ('habitos_registros', 'nutricion_registros'))
      )
    ORDER BY table_name, column_name;
  `;

  const verifyRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: verifySql })
  });

  const columns = await verifyRes.json();
  console.log('\nColumnas y tablas verificadas en la base de datos Supabase:');
  console.table(columns);
}

runMigration().catch(err => {
  console.error('Excepción:', err);
  process.exit(1);
});
