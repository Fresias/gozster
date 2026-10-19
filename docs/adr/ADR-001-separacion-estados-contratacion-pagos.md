# ADR-001: Separación de Estado de Cuenta, Contratación, Pago y Rutina

- **Estado:** Aprobado (Definido en Grill Ronda 1 con Gabriel)
- **Fecha:** 2026-10-19
- **Prioridad:** P0 · Crítico (Bloqueante de lanzamiento)

## Contexto y Problema

En el esquema actual de `Fresias/gozster`:
1. La tabla `public.perfiles` utiliza un único campo `estado_membresia` (`ACTIVA`, `INACTIVA`, `PENDIENTE`, `BAJA`, `ACTIVE`, `EXPIRED_PAYMENT_PENDING`, `ARCHIVED`) y una columna plana `fecha_vencimiento_cuota`.
2. La vigencia se extiende mediante `extender_vigencia_plan` directamente sobre `public.planes_entrenamiento.fecha_fin`, acoplando la rutina prescripta con el período comercial pagado.
3. En el frontend (`src/app/(athlete)/athlete/page.tsx`), el estado `EXPIRED_PAYMENT_PENDING` reemplaza toda la aplicación por un bloqueo total (`<MembershipPaywall />`), impidiendo ver la app con normalidad.

## Decisiones Cerradas de Dominio

1. **Desacoplamiento en 4 Entidades/Estados Independientes:**
   - **Cuenta (`public.perfiles`):** Estado administrativo del perfil (`ACTIVO`, `BAJA_ADMINISTRATIVA`, `SUSPENDIDO`). La baja administrativa jamás borra rutinas, sesiones, mensajes ni historial de dolor.
   - **Contratación (`public.contrataciones`):** Entidad comercial por servicio (`ASESORIA_ONLINE` vs `PRESENCIAL`), con estados:
     - `VIGENTE`
     - `POR_VENCER`: se activa automáticamente **5 días antes** de `fecha_fin`.
     - `VENCIDA`: se activa automáticamente **1 día después** de `fecha_fin` (`CURRENT_DATE > fecha_fin::date`).
     - `EN_PAUSA`
     - `PENDIENTE_RENOVACION`
   - **Pago (`public.pagos`):** Registro transaccional con `idempotency_key` UNIQUE, medio (`TRANSFERENCIA`, `EFECTIVO`, `PASARELA_ONLINE`), estado (`PENDIENTE`, `CONFIRMADO`, `RECHAZADO`) y `confirmado_por`. Nunca se habilita ni renueva por el mero retorno desde la URL de una pasarela sin confirmación verificada.
   - **Rutina (`public.planes_entrenamiento`):** Estado metodológico (`ACTIVO`, `INACTIVO`, `BORRADOR`).
2. **Regla de Anclaje de Fecha en Renovaciones ("No se corre la fecha"):**
   - Si una contratación venció el día 10 y el alumno paga el día 18, la nueva vigencia **mantiene el día 10 como fecha de corte del mes siguiente** (`fecha_fin_anterior + INTERVAL '1 month'`), sin desplazar el ciclo al día 18.
   - Cualquier extensión excepcional fuera de ciclo requiere acción explícita de administrador/entrenador registrando `motivo`, `fecha` y `autorizado_por` en auditoría.
3. **Experiencia del Alumno con Suscripción Vencida (Acceso + Aviso al Inicio):**
   - Cuando la contratación está `VENCIDA`, el alumno **mantiene acceso a la aplicación y al Chat GOZS habilitado**, pero **al iniciar la app recibe un aviso prominente indicando que su suscripción se venció y que se comunique con el equipo de GOZS** (con acceso directo al chat).
