# Glosario de Dominio (Ubiquitous Language) — GOZS

> **Estado:** Aprobado (`/grill-with-docs` completado con Gabriel)
> **Fuente de verdad:** `Guia_reunion_desarrollo_app_GOZS.docx` + ADRs `001` a `005` en `docs/adr/`.

---

## 1. Identidad, Cuenta, Contratación y Pagos (P0 · `ADR-001`)

| Término de Dominio | Definición Estricta | Entidad / Tabla Técnica | Regla de Negocio Cerrada |
| :--- | :--- | :--- | :--- |
| **Cuenta de Usuario (`Perfil`)** | Identidad de acceso (`ALUMNO`, `ENTRENADOR`, `ADMIN`). Su estado administrativo (`ACTIVO`, `SUSPENDIDO`, `BAJA_ADMINISTRATIVA`) está separado de las contrataciones y pagos. | `public.perfiles` | La **Baja Administrativa** nunca elimina rutinas, sesiones, evaluaciones, mensajes ni reportes de dolor. |
| **Contratación** | Suscripción de un alumno a un servicio (`ASESORIA_ONLINE` o `PRESENCIAL`) con período `fecha_inicio` y `fecha_fin`. Estados: `VIGENTE`, `POR_VENCER`, `VENCIDA`, `EN_PAUSA`, `PENDIENTE_RENOVACION`. | `public.contrataciones` | **`POR_VENCER`**: 5 días antes de `fecha_fin`. **`VENCIDA`**: 1 día después de `fecha_fin`. **Ciclo fijo ("no se corre la fecha"):** si venció el día 10 y paga el 18, la nueva vigencia vence el 10 del mes siguiente. |
| **Acceso de Alumno Vencido** | Estado de experiencia cuando la contratación `ASESORIA_ONLINE` está `VENCIDA`. | `src/app/(athlete)/athlete/page.tsx` | El alumno **conserva acceso a la app y al Chat GOZS habilitado**, mostrando al inicio un **aviso claro de suscripción vencida** que lo invita a hablar con el equipo GOZS. |
| **Pago** | Registro financiero manual (`TRANSFERENCIA`, `EFECTIVO`) u online (`PASARELA_ONLINE`) asociado a una `contratacion_id`, con `idempotency_key` única y estado (`PENDIENTE`, `CONFIRMADO`, `RECHAZADO`). | `public.pagos` | Dos intentos de renovación con la misma operación no duplican cobros ni períodos. Jamás se activa por simple retorno de URL sin confirmar pago. |
| **Extensión Excepcional** | Prórroga manual otorgada por administrador/entrenador sin pago asociado. | `public.auditoria_cambios` + `public.contrataciones` | Exige obligatoriamente `motivo`, `fecha` y `autorizado_por`. |

---

## 2. Onboarding y Experiencia del Alumno (P1 · `ADR-004`)

| Término de Dominio | Definición Estricta | Entidad / Tabla Técnica | Regla de Negocio Cerrada |
| :--- | :--- | :--- | :--- |
| **Cuestionario Inicial Opcional** | Solapa de preguntas iniciales (por única vez, genéricas para la demo) disponible al ingresar a la app. | `public.alumno_cuestionario_inicial` / `perfiles` | **No bloqueante:** el alumno tiene acceso inmediato a su rutina aunque todavía no haya completado la solapa del cuestionario. |
| **Vista Minimalista (`SIMPLE`) vs. Vista Técnica (`TECNICA`)** | Nivel de complejidad visual configurado por el entrenador para cada alumno (`nivel_vista_alumno`). | `public.perfiles.nivel_vista_alumno` | **`SIMPLE` (default):** solo Series × Reps × Peso + Video + Descanso. **`TECNICA`:** añade RPE, %1RM, Epley/Brzycki y métricas avanzadas. |

---

## 3. Chat Compartido e Identidad Institucional GOZS (P1 · `ADR-004`)

| Término de Dominio | Definición Estricta | Entidad / Tabla Técnica | Regla de Negocio Cerrada |
| :--- | :--- | :--- | :--- |
| **Identidad Equipo GOZS** | Presentación institucional unificada frente al alumno en la bandeja de mensajes. | `public.conversaciones` + `public.mensajes` | **Sin firma individual hacia el alumno ("Somos un equipo"):** el alumno ve siempre a **GOZS**. En base de datos y en el Coach Studio queda registrado el `remitente_id` real de cada mensaje. |
| **Transferencia de Responsable** | Asignación o traspaso de una conversación a un profesor responsable dentro del Coach Studio. | `public.conversaciones.responsable_id` + `public.entrenador_alumnos` | Al transferir una conversación a un profesor, se lo vincula automáticamente en `entrenador_alumnos` para que RLS le habilite contexto completo (chat + rutina). |

---

## 4. Molestias, Síntomas de Alarma y Sustitución de Ejercicios (P1 · `ADR-002`)

| Término de Dominio | Definición Estricta | Entidad / Tabla Técnica | Regla de Negocio Cerrada |
| :--- | :--- | :--- | :--- |
| **Reporte de Molestia** | Aviso iniciado por el alumno desde el botón **"Tengo una molestia"** (en sesión o ejercicio). | `public.alumno_historial_dolor` + `public.alertas_entrenador` | Registra zona corporal, intensidad, `momento_aparicion`, ejercicio asociado, checks de alarma y comentario. Ciclo del caso: `PENDIENTE` → `ATENDIDO` → `CERRADO`. |
| **Síntomas de Alarma (Red Flags)** | Indicadores de riesgo agudo en el reporte de molestia. | `public.alumno_historial_dolor.es_sintoma_alarma` | Dispara alerta `CRITICA` al equipo y recomienda al alumno **frenar por hoy y avisar en el gimnasio o al entrenador cercano**. |
| **Sustitución Trazable por Entrenador** | Reemplazo de un ejercicio por una alternativa biomecánica para toda la rutina vigente. | `public.sustituciones_ejercicios` + `public.ejercicios_alternativas` | **El alumno NO puede elegir ni cambiar el ejercicio alternativo.** Lo asigna exclusivamente el entrenador para toda la rutina vigente, guardando original, sustituto, fecha, motivo y responsable sin alterar sesiones ya completadas. |

---

## 5. Marca Limpia y Respaldo Verificado (P0 · `ADR-005`)

| Término de Dominio | Definición Estricta | Entidad / Tabla Técnica | Regla de Negocio Cerrada |
| :--- | :--- | :--- | :--- |
| **Exclusividad de Marca GOZS** | Ausencia total de referencias a plataformas de terceros ("Mynter") en la interfaz web y móvil. | `src/app/page.tsx`, `live-workout.tsx`, `studio-shell.tsx` | Ningún texto, selector ni footer puede mostrar la palabra "Mynter". |
| **Respaldo Recuperable GOZS** | Copia exportable y restaurable de la base de datos probada mediante test automatizado. | `scripts/backup-restore-gozs.mjs` | Debe existir copia recuperable con prueba automatizada de restauración íntegra. |
