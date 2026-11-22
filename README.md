# GOZSter

Plataforma web y mobile (PWA) de alto rendimiento para la gestión de entrenamientos, rutinas y atletas de fuerza.

## Base de datos y migraciones

El único camino autorizado para aplicar migraciones en Supabase es `supabase db push --remote` (CLI de Supabase, usando `supabase/config.toml`) o el workflow de CI (`.github/workflows/deploy-production.yml`).

- Guía completa, orden **migración → deploy** y runbook X1: [docs/architecture/migraciones-supabase.md](docs/architecture/migraciones-supabase.md).
