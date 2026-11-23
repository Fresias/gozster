import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// GOZS-696: los seeds y su fuente no cargan datos personales de terceros.
const ROOT = path.resolve(__dirname, "../..");
const leer = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf-8");
const ARCHIVOS = [
  "supabase/seed.sql",
  "supabase/seed_gozs.sql",
  "supabase/seed_data/gozster_alumnos_y_rutinas_sanitizado.json",
  "scripts/seed_from_mynter_backup.ts",
];
const DOMINIOS_FICTICIOS = /@(gozster\.local|ficticio\.ar)$/i;

type Alumno = Record<string, unknown> & { domicilio?: Record<string, unknown> | null };

describe("GOZS-696: seeds sin datos personales", () => {
  it.each(ARCHIVOS)("%s solo usa emails de dominios ficticios", (archivo) => {
    const emails = leer(archivo).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) ?? [];
    expect(emails.filter((e) => !DOMINIOS_FICTICIOS.test(e))).toEqual([]);
  });

  it("los alumnos de seed_gozs.sql tienen nombres ficticios", () => {
    const nombres = [...leer("supabase/seed_gozs.sql").matchAll(/'alumno\d+@gozster\.local', '([^']+)'/g)].map((m) => m[1]);
    expect(nombres).toHaveLength(13);
    for (const n of nombres) expect(n).toMatch(/^Alumno Ficticio \d{2}$/);
  });

  it("el backup fuente no trae nombres reales, contacto, nacimiento, foto ni documento", () => {
    const data = JSON.parse(leer("supabase/seed_data/gozster_alumnos_y_rutinas_sanitizado.json")) as { alumno: Alumno }[];
    expect(data).toHaveLength(13);
    for (const { alumno } of data) {
      expect(`${alumno.nombre} ${alumno.apellido}`).toMatch(/^Alumno Ficticio \d{2}$/);
      for (const campo of ["imgPerfil", "fechaNacimiento", "fechaNacimientoStr", "telefono", "telefonos", "codPaisTelefono", "dni"]) {
        expect(alumno[campo] ?? null).toBeNull();
      }
      for (const campo of ["calle", "nroCalle", "piso", "depto"]) {
        expect(alumno.domicilio?.[campo] ?? null).toBeNull();
      }
    }
  });
});
