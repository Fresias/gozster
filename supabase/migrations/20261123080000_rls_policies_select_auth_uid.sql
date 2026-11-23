-- GOZS-722 (PL-10): envolver auth.uid() en (SELECT auth.uid()) en políticas RLS
-- para habilitar InitPlan (evaluación una vez por sentencia en lugar de por fila).
-- No cambia la lógica de acceso, roles, comandos ni nombres de política.
-- Idempotente: ALTER POLICY aplica la misma expresión en re-ejecuciones.

BEGIN;

ALTER POLICY "alertas_entrenador_select" ON public.alertas_entrenador
  USING (((profesor_id = (SELECT auth.uid())) OR (alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "alumno_actividades_select" ON public.alumno_actividades
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "alumno_cuestionario_inicial_insert" ON public.alumno_cuestionario_inicial
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_admin()));

ALTER POLICY "alumno_cuestionario_inicial_select" ON public.alumno_cuestionario_inicial
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "alumno_cuestionario_inicial_update" ON public.alumno_cuestionario_inicial
  USING (((alumno_id = (SELECT auth.uid())) OR es_admin()))
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_admin()));

ALTER POLICY "alumno_historial_dolor_insert" ON public.alumno_historial_dolor
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "alumno_historial_dolor_select" ON public.alumno_historial_dolor
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "alumno_historial_dolor_update" ON public.alumno_historial_dolor
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()))
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "auditoria_cambios_select_staff" ON public.auditoria_cambios
  USING ((es_admin() OR (es_entrenador_o_admin() AND (((entidad = 'contrataciones'::text) AND (EXISTS ( SELECT 1
   FROM contrataciones c
  WHERE ((c.id = auditoria_cambios.entidad_id) AND es_entrenador_de(c.alumno_id))))) OR ((entidad = 'conversaciones'::text) AND (EXISTS ( SELECT 1
   FROM conversaciones conv
  WHERE ((conv.id = auditoria_cambios.entidad_id) AND es_entrenador_de(conv.alumno_id))))) OR ((entidad = 'planes_entrenamiento'::text) AND (EXISTS ( SELECT 1
   FROM planes_entrenamiento p
  WHERE ((p.id = auditoria_cambios.entidad_id) AND ((p.alumno_id IS NULL) OR es_entrenador_de(p.alumno_id)))))) OR ((entidad = 'dias_rutina'::text) AND (EXISTS ( SELECT 1
   FROM (dias_rutina d
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((d.id = auditoria_cambios.entidad_id) AND ((p.alumno_id IS NULL) OR es_entrenador_de(p.alumno_id)))))) OR ((entidad = 'ejercicios_en_rutina'::text) AND (EXISTS ( SELECT 1
   FROM ((ejercicios_en_rutina er
     JOIN dias_rutina d ON ((d.id = er.dia_id)))
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((er.id = auditoria_cambios.entidad_id) AND ((p.alumno_id IS NULL) OR es_entrenador_de(p.alumno_id)))))) OR (autorizado_por = (SELECT auth.uid())) OR (usuario_id = (SELECT auth.uid()))))));

ALTER POLICY "clases_select_autenticado" ON public.clases
  USING (((SELECT auth.uid()) IS NOT NULL));

ALTER POLICY "clases_fijas_select_alumno_o_staff" ON public.clases_fijas
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_o_admin()));

ALTER POLICY "clases_horario_select_autenticado" ON public.clases_horario
  USING (((SELECT auth.uid()) IS NOT NULL));

ALTER POLICY "clases_profesores_select_autenticado" ON public.clases_profesores
  USING (((SELECT auth.uid()) IS NOT NULL));

ALTER POLICY "cobros_select_alumno_o_entrenador" ON public.cobros
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "contrataciones_select_alumno_o_entrenador" ON public.contrataciones
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "conversaciones_insert_participantes" ON public.conversaciones
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "conversaciones_select_participantes" ON public.conversaciones
  USING (((alumno_id = (SELECT auth.uid())) OR (responsable_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "conversaciones_update_participantes" ON public.conversaciones
  USING (((alumno_id = (SELECT auth.uid())) OR (responsable_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()))
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR (responsable_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "dias_rutina_delete_entrenador" ON public.dias_rutina
  USING ((es_entrenador_o_admin() AND (EXISTS ( SELECT 1
   FROM planes_entrenamiento p
  WHERE ((p.id = dias_rutina.plan_id) AND ((p.profesor_id = (SELECT auth.uid())) OR es_admin()))))));

ALTER POLICY "dias_rutina_insert_entrenador" ON public.dias_rutina
  WITH CHECK ((es_entrenador_o_admin() AND (EXISTS ( SELECT 1
   FROM planes_entrenamiento p
  WHERE ((p.id = dias_rutina.plan_id) AND ((p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin()))))));

ALTER POLICY "dias_rutina_select_acceso_plan" ON public.dias_rutina
  USING ((EXISTS ( SELECT 1
   FROM planes_entrenamiento p
  WHERE ((p.id = dias_rutina.plan_id) AND ((p.alumno_id = (SELECT auth.uid())) OR (p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NULL) AND es_entrenador_o_admin()) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin())))));

ALTER POLICY "dias_rutina_update_entrenador" ON public.dias_rutina
  USING ((es_entrenador_o_admin() AND (EXISTS ( SELECT 1
   FROM planes_entrenamiento p
  WHERE ((p.id = dias_rutina.plan_id) AND ((p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin()))))))
  WITH CHECK ((es_entrenador_o_admin() AND (EXISTS ( SELECT 1
   FROM planes_entrenamiento p
  WHERE ((p.id = dias_rutina.plan_id) AND ((p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin()))))));

ALTER POLICY "ejercicios_select_autenticados" ON public.ejercicios
  USING (((SELECT auth.uid()) IS NOT NULL));

ALTER POLICY "ejercicios_alternativas_select" ON public.ejercicios_alternativas
  USING (((SELECT auth.uid()) IS NOT NULL));

ALTER POLICY "ejercicios_en_rutina_delete_entrenador" ON public.ejercicios_en_rutina
  USING ((es_entrenador_o_admin() AND (EXISTS ( SELECT 1
   FROM (dias_rutina d
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((d.id = ejercicios_en_rutina.dia_id) AND ((p.profesor_id = (SELECT auth.uid())) OR es_admin()))))));

ALTER POLICY "ejercicios_en_rutina_insert_entrenador" ON public.ejercicios_en_rutina
  WITH CHECK ((es_entrenador_o_admin() AND (EXISTS ( SELECT 1
   FROM (dias_rutina d
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((d.id = ejercicios_en_rutina.dia_id) AND ((p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin()))))));

ALTER POLICY "ejercicios_en_rutina_select_acceso_plan" ON public.ejercicios_en_rutina
  USING ((EXISTS ( SELECT 1
   FROM (dias_rutina d
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((d.id = ejercicios_en_rutina.dia_id) AND (((p.alumno_id = (SELECT auth.uid())) AND (NOT (EXISTS ( SELECT 1
           FROM perfiles perf
          WHERE ((perf.id = (SELECT auth.uid())) AND (perf.estado_membresia = 'VENCIDA'::estado_membresia)))))) OR (p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NULL) AND es_entrenador_o_admin()) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin())))));

ALTER POLICY "ejercicios_en_rutina_update_entrenador" ON public.ejercicios_en_rutina
  USING ((es_entrenador_o_admin() AND (EXISTS ( SELECT 1
   FROM (dias_rutina d
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((d.id = ejercicios_en_rutina.dia_id) AND ((p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin()))))))
  WITH CHECK ((es_entrenador_o_admin() AND (EXISTS ( SELECT 1
   FROM (dias_rutina d
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((d.id = ejercicios_en_rutina.dia_id) AND ((p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin()))))));

ALTER POLICY "entrenador_alumnos_delete_entrenador_o_admin" ON public.entrenador_alumnos
  USING ((es_admin() OR (entrenador_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id)));

ALTER POLICY "entrenador_alumnos_insert_entrenador_o_admin" ON public.entrenador_alumnos
  WITH CHECK ((es_admin() OR (es_entrenador_o_admin() AND ((entrenador_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id)))));

ALTER POLICY "entrenador_alumnos_select_participantes" ON public.entrenador_alumnos
  USING (((entrenador_id = (SELECT auth.uid())) OR (alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "entrenador_alumnos_update_entrenador_o_admin" ON public.entrenador_alumnos
  USING ((es_admin() OR (entrenador_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id)))
  WITH CHECK ((es_admin() OR (entrenador_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id)));

ALTER POLICY "errores_app_insert_propio" ON public.errores_app
  WITH CHECK ((usuario_id = (SELECT auth.uid())));

ALTER POLICY "feriados_select_autenticado" ON public.feriados
  USING (((SELECT auth.uid()) IS NOT NULL));

ALTER POLICY "habitos_propio_o_entrenador" ON public.habitos_registros
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()))
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "mensajes_delete_autor_o_admin" ON public.mensajes
  USING (((remitente_id = (SELECT auth.uid())) OR es_admin()));

ALTER POLICY "mensajes_insert_participantes" ON public.mensajes
  WITH CHECK (((remitente_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM conversaciones c
  WHERE ((c.id = mensajes.conversacion_id) AND ((c.alumno_id = (SELECT auth.uid())) OR es_entrenador_de(c.alumno_id) OR es_admin()))))));

ALTER POLICY "mensajes_select_participantes" ON public.mensajes
  USING ((EXISTS ( SELECT 1
   FROM conversaciones c
  WHERE ((c.id = mensajes.conversacion_id) AND ((c.alumno_id = (SELECT auth.uid())) OR es_entrenador_de(c.alumno_id) OR es_admin())))));

ALTER POLICY "mensajes_update_participantes" ON public.mensajes
  USING ((EXISTS ( SELECT 1
   FROM conversaciones c
  WHERE ((c.id = mensajes.conversacion_id) AND ((c.alumno_id = (SELECT auth.uid())) OR es_entrenador_de(c.alumno_id) OR es_admin())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM conversaciones c
  WHERE ((c.id = mensajes.conversacion_id) AND ((c.alumno_id = (SELECT auth.uid())) OR es_entrenador_de(c.alumno_id) OR es_admin())))));

ALTER POLICY "nutricion_propio_o_entrenador" ON public.nutricion_registros
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()))
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "pagos_select_alumno_o_entrenador" ON public.pagos
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "perfiles_insert_propio_o_admin" ON public.perfiles
  WITH CHECK ((((SELECT auth.uid()) = id) OR es_admin()));

ALTER POLICY "perfiles_select_propio_o_entrenador" ON public.perfiles
  USING ((((SELECT auth.uid()) = id) OR (profesor_asignado_id = (SELECT auth.uid())) OR es_entrenador_de(id) OR es_admin()));

ALTER POLICY "perfiles_update_propio_o_entrenador" ON public.perfiles
  USING ((((SELECT auth.uid()) = id) OR ((profesor_asignado_id = (SELECT auth.uid())) AND es_entrenador_o_admin()) OR (es_entrenador_de(id) AND es_entrenador_o_admin()) OR es_admin()))
  WITH CHECK ((((SELECT auth.uid()) = id) OR ((profesor_asignado_id = (SELECT auth.uid())) AND es_entrenador_o_admin()) OR (es_entrenador_de(id) AND es_entrenador_o_admin()) OR es_admin()));

ALTER POLICY "planes_delete_entrenador_o_admin" ON public.planes_entrenamiento
  USING ((es_entrenador_o_admin() AND ((profesor_id = (SELECT auth.uid())) OR es_admin())));

ALTER POLICY "planes_insert_entrenador_o_admin" ON public.planes_entrenamiento
  WITH CHECK ((es_entrenador_o_admin() AND ((profesor_id = (SELECT auth.uid())) OR es_admin()) AND ((alumno_id IS NULL) OR (alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR (profesor_id = (SELECT auth.uid())) OR es_admin())));

ALTER POLICY "planes_select_alumno_o_entrenador" ON public.planes_entrenamiento
  USING (((alumno_id = (SELECT auth.uid())) OR (profesor_id = (SELECT auth.uid())) OR ((alumno_id IS NULL) AND es_entrenador_o_admin()) OR ((alumno_id IS NOT NULL) AND es_entrenador_de(alumno_id)) OR es_admin()));

ALTER POLICY "planes_update_entrenador_o_admin" ON public.planes_entrenamiento
  USING ((es_entrenador_o_admin() AND ((profesor_id = (SELECT auth.uid())) OR (alumno_id = (SELECT auth.uid())) OR ((alumno_id IS NOT NULL) AND es_entrenador_de(alumno_id)) OR es_admin())))
  WITH CHECK ((es_entrenador_o_admin() AND ((profesor_id = (SELECT auth.uid())) OR (alumno_id = (SELECT auth.uid())) OR ((alumno_id IS NOT NULL) AND es_entrenador_de(alumno_id)) OR es_admin())));

ALTER POLICY "planes_membresia_select_autenticado" ON public.planes_membresia
  USING (((SELECT auth.uid()) IS NOT NULL));

ALTER POLICY "planes_membresia_precios_select_autenticado" ON public.planes_membresia_precios
  USING (((SELECT auth.uid()) IS NOT NULL));

ALTER POLICY "push_suscripciones_propias" ON public.push_suscripciones
  USING ((usuario_id = (SELECT auth.uid())))
  WITH CHECK ((usuario_id = (SELECT auth.uid())));

ALTER POLICY "ranking_prs_insert_coach" ON public.ranking_prs
  WITH CHECK ((es_profesor_de_clase(clase_id) AND (registrado_por = (SELECT auth.uid()))));

ALTER POLICY "ranking_prs_select" ON public.ranking_prs
  USING (((alumno_id = (SELECT auth.uid())) OR es_profesor_de_clase(clase_id)));

ALTER POLICY "registro_series_delete_propio_alumno" ON public.registro_series
  USING ((EXISTS ( SELECT 1
   FROM registro_sesiones s
  WHERE ((s.id = registro_series.sesion_id) AND ((s.alumno_id = (SELECT auth.uid())) OR es_admin())))));

ALTER POLICY "registro_series_insert_propio_alumno" ON public.registro_series
  WITH CHECK ((EXISTS ( SELECT 1
   FROM registro_sesiones s
  WHERE ((s.id = registro_series.sesion_id) AND ((s.alumno_id = (SELECT auth.uid())) OR es_admin())))));

ALTER POLICY "registro_series_select_alumno_o_entrenador" ON public.registro_series
  USING ((EXISTS ( SELECT 1
   FROM registro_sesiones s
  WHERE ((s.id = registro_series.sesion_id) AND ((s.alumno_id = (SELECT auth.uid())) OR es_entrenador_de(s.alumno_id) OR es_admin())))));

ALTER POLICY "registro_series_update_propio_alumno" ON public.registro_series
  USING ((EXISTS ( SELECT 1
   FROM registro_sesiones s
  WHERE ((s.id = registro_series.sesion_id) AND ((s.alumno_id = (SELECT auth.uid())) OR es_admin())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM registro_sesiones s
  WHERE ((s.id = registro_series.sesion_id) AND ((s.alumno_id = (SELECT auth.uid())) OR es_admin())))));

ALTER POLICY "registro_sesiones_delete_propio_alumno" ON public.registro_sesiones
  USING (((alumno_id = (SELECT auth.uid())) OR es_admin()));

ALTER POLICY "registro_sesiones_insert_propio_alumno" ON public.registro_sesiones
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_admin()));

ALTER POLICY "registro_sesiones_select_alumno_o_entrenador" ON public.registro_sesiones
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_admin()));

ALTER POLICY "registro_sesiones_update_propio_alumno" ON public.registro_sesiones
  USING (((alumno_id = (SELECT auth.uid())) OR es_admin()))
  WITH CHECK (((alumno_id = (SELECT auth.uid())) OR es_admin()));

ALTER POLICY "reservas_select_alumno_o_entrenador" ON public.reservas
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_de(alumno_id) OR es_profesor_de_clase(clase_id)));

ALTER POLICY "sustituciones_ejercicios_insert" ON public.sustituciones_ejercicios
  WITH CHECK ((es_admin() OR (EXISTS ( SELECT 1
   FROM planes_entrenamiento pe
  WHERE ((pe.id = sustituciones_ejercicios.plan_id) AND ((pe.profesor_id = (SELECT auth.uid())) OR es_entrenador_de(pe.alumno_id)))))));

ALTER POLICY "sustituciones_ejercicios_select" ON public.sustituciones_ejercicios
  USING (((EXISTS ( SELECT 1
   FROM planes_entrenamiento pe
  WHERE ((pe.id = sustituciones_ejercicios.plan_id) AND ((pe.alumno_id = (SELECT auth.uid())) OR (pe.profesor_id = (SELECT auth.uid())) OR es_entrenador_de(pe.alumno_id) OR es_admin())))) OR (responsable_id = (SELECT auth.uid())) OR es_admin()));

COMMIT;
