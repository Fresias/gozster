# Protocolo de Seguridad y Gobernanza Estricta: Token GOZSTER_DB

**Documento:** `docs/security/TOKEN_GOVERNANCE_GOZSTER_DB.md`  
**Clasificación:** Confidencial / Nivel Crítico (Infraestructura de Base de Datos)  
**Custodio Exclusivo:** Product Manager & Tech Lead (`@PM-GOZster`)  
**Responsable de Negocio / Autoridad:** Gabriel (`ds.gabriel.sanchez@gmail.com`)  
**Fecha de Emisión:** 16 de Octubre de 2026  
**Proyecto Supabase:** `cutvhrxgrwwfntetdsdo`  

---

## 1. Identificación y Alcance de la Credencial

- **Identificador de Variable:** `GOZSTER_DB`
- **Naturaleza del Secreto:** Supabase Personal Access Token (`sbp_...`) con privilegios de Management API y CLI sobre el proyecto `cutvhrxgrwwfntetdsdo`.
- **Propósito Único Autorizado:** Ejecución de migraciones DDL controladas, aprovisionamiento de esquema inicial y sincronización de catálogo maestro/seed de alumnos desde el backup sanitizado de Mynter.
- **Principio de Mínimo Privilegio:** Esta credencial jamás se usará para consultas operativas de la aplicación. Para la interacción en tiempo de ejecución (Next.js / Cliente), la aplicación utiliza exclusivamente `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.

---

## 2. Aislamiento y No Exposición (Directiva de Confidencialidad)

1. **Custodia Exclusiva del Tech Lead:**
   - La variable `GOZSTER_DB` reside únicamente en el entorno restringido del Tech Lead.
   - **Prohibido delegar a subagentes:** Los subagentes de desarrollo (`@frontend-eng`, `@backend-eng`, `@qa-eng`) no reciben ni tienen visibilidad de `GOZSTER_DB`. El Squad opera contra la Data API y entornos de prueba.
2. **Cero Persistencia en Código Fuente:**
   - Queda estrictamente prohibido commitear o escribir el valor del token en archivos de código, `.env`, `.env.local`, `.gitignore`, scripts temporales o repositorios de Git (`Fresias/gozster`).
   - El archivo `.gitignore` debe mantener el bloqueo estricto de cualquier archivo `.env*`.
3. **Ofuscación en Logs y Salidas:**
   - Queda terminantemente prohibido imprimir el valor de `GOZSTER_DB` en terminales, mensajes de chat, pull requests, issues o pipelines de CI/CD.

---

## 3. Matriz de Operaciones Permitidas vs. Prohibidas

### A. Operaciones Estrictamente Permitidas (White-list)
Únicamente se autorizan las siguientes acciones mediante el uso de `GOZSTER_DB`:
1. **Migraciones Versionadas Aditivas:**
   - Ejecución de scripts contenidos en `supabase/migrations/` debidamente auditados.
   - Sentencias DDL idempotentes (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
2. **Carga y Sincronización Idempotente:**
   - Ejecución de datos maestros sanitizados con sentencias `ON CONFLICT DO UPDATE` o `ON CONFLICT DO NOTHING`.
   - Inserción de usuarios en `auth.users` exclusivamente en **modo silencioso** (`email_confirm: true`, sin disparo de correos o invitaciones).
3. **Introspección y Diagnóstico:**
   - Consultas de solo lectura sobre el catálogo de PostgreSQL (`list_tables`, introspección de esquemas y generación de tipos estáticos TypeScript).

### B. Operaciones Estrictamente Prohibidas (Black-list / Tolerancia Cero)
Bajo ninguna circunstancia ni automatización se ejecutarán las siguientes acciones:
1. **Destrucción de Bases de Datos o Esquemas:**
   - **PROHIBIDO:** `DROP DATABASE`, `DROP SCHEMA public CASCADE`, `supabase db reset --linked`.
2. **Eliminación de Tablas con Datos:**
   - **PROHIBIDO:** `DROP TABLE` sobre cualquier tabla de producción (`perfiles`, `planes_entrenamiento`, `dias_rutina`, `ejercicios_en_rutina`, `registro_sesiones`, `conversaciones`, etc.).
3. **Vaciado Indiscriminado:**
   - **PROHIBIDO:** `TRUNCATE` masivo sobre tablas pobladas sin autorización expresa por escrito de Gabriel.
4. **Comunicaciones Externas No Autorizadas:**
   - **PROHIBIDO:** `auth.admin.inviteUserByEmail` o cualquier procedimiento que emita notificaciones a cuentas de correo de los alumnos.

---

## 4. Checklist Obligatorio Pre-Ejecución (Safety Gates)

Antes de invocar cualquier comando que consuma `GOZSTER_DB`, el Tech Lead debe verificar obligatoriamente:

- [ ] **Gate 1 - Transaccionalidad Atómica:** El script a ejecutar debe estar encapsulado en bloques `BEGIN ... COMMIT` para asegurar que cualquier fallo revierta el 100% de los cambios (Rollback total).
- [ ] **Gate 2 - Idempotencia Probada:** El script debe ser seguro ante re-ejecuciones (no duplicar registros ni fallar si la tabla/columna ya existe).
- [ ] **Gate 3 - No-Destructividad:** Se verifica que no exista ninguna sentencia `DROP`, `DELETE FROM ... sin WHERE` o `ALTER TABLE DROP COLUMN`.
- [ ] **Gate 4 - Modo Silencioso:** Se verifica que la inserción de usuarios mantenga `email_confirmed_at = now()` y no invoque disparadores de mailing.
- [ ] **Gate 5 - Notificación Posterior:** Concluida la ejecución, se emitirá un reporte detallado a Gabriel con el listado de tablas y conteo de filas creadas.

---

## 5. Protocolo de Emergencia y Revocación

Si en cualquier momento se sospecha una anomalía, inconsistencia o filtración accidental:
1. **Revocación Inmediata:** Gabriel puede revocar el token en 1 clic desde:
   `https://supabase.com/dashboard/account/tokens`
2. **Cese de Acceso:** La revocación invalida inmediatamente cualquier llamado de la Management API sin afectar el funcionamiento de la aplicación web (la cual opera con las llaves de datos independientes).
3. **Auditoría Post-Mortem:** El Tech Lead generará un informe técnico con la trazabilidad completa de las acciones ejecutadas.

---
*Aprobado por el Tech Lead de GOZSter para cumplimiento obligatorio en todo el ciclo de vida del proyecto.*
