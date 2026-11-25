
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "alertas_entrenador": {
                  Row: {
                    "accion_tomada": string | null,"alumno_id": string,"created_at": string,"detalle": string | null,"ejercicio_id": string | null,"estado": string,"id": string,"profesor_id": string,"reporte_dolor_id": string | null,"resuelto_at": string | null,"resuelto_por": string | null,"serie_id": string | null,"severidad": string,"tipo_alerta": string,"titulo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accion_tomada"?: string | null,"alumno_id": string,"created_at"?: string,"detalle"?: string | null,"ejercicio_id"?: string | null,"estado"?: string,"id"?: string,"profesor_id": string,"reporte_dolor_id"?: string | null,"resuelto_at"?: string | null,"resuelto_por"?: string | null,"serie_id"?: string | null,"severidad"?: string,"tipo_alerta": string,"titulo": string,"updated_at"?: string
                  }
                  Update: {
                    "accion_tomada"?: string | null,"alumno_id"?: string,"created_at"?: string,"detalle"?: string | null,"ejercicio_id"?: string | null,"estado"?: string,"id"?: string,"profesor_id"?: string,"reporte_dolor_id"?: string | null,"resuelto_at"?: string | null,"resuelto_por"?: string | null,"serie_id"?: string | null,"severidad"?: string,"tipo_alerta"?: string,"titulo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alertas_entrenador_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_entrenador_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_entrenador_profesor_id_fkey"
      columns: ["profesor_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_entrenador_reporte_dolor_id_fkey"
      columns: ["reporte_dolor_id"]
isOneToOne: false
      referencedRelation: "alumno_historial_dolor"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_entrenador_reporte_dolor_id_fkey"
      columns: ["reporte_dolor_id"]
isOneToOne: false
      referencedRelation: "v_dolor_activo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_entrenador_resuelto_por_fkey"
      columns: ["resuelto_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_entrenador_serie_id_fkey"
      columns: ["serie_id"]
isOneToOne: false
      referencedRelation: "registro_series"
      referencedColumns: ["id"]
    }
                  ]
                },"alumno_actividades": {
                  Row: {
                    "actividad": string,"alumno_id": string,"created_at": string,"id": string,"pase_libre": boolean,"updated_at": string,"veces_por_semana": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actividad": string,"alumno_id": string,"created_at"?: string,"id"?: string,"pase_libre"?: boolean,"updated_at"?: string,"veces_por_semana"?: number | null
                  }
                  Update: {
                    "actividad"?: string,"alumno_id"?: string,"created_at"?: string,"id"?: string,"pase_libre"?: boolean,"updated_at"?: string,"veces_por_semana"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "alumno_actividades_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"alumno_cuestionario_inicial": {
                  Row: {
                    "alumno_id": string,"completado_at": string,"dias_disponibles_semana": number | null,"equipamiento_disponible": string | null,"experiencia_previa": string | null,"id": string,"molestias_o_lesiones_previas": string | null,"objetivo_principal": string | null,"respuestas_extra": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id": string,"completado_at"?: string,"dias_disponibles_semana"?: number | null,"equipamiento_disponible"?: string | null,"experiencia_previa"?: string | null,"id"?: string,"molestias_o_lesiones_previas"?: string | null,"objetivo_principal"?: string | null,"respuestas_extra"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "alumno_id"?: string,"completado_at"?: string,"dias_disponibles_semana"?: number | null,"equipamiento_disponible"?: string | null,"experiencia_previa"?: string | null,"id"?: string,"molestias_o_lesiones_previas"?: string | null,"objetivo_principal"?: string | null,"respuestas_extra"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alumno_cuestionario_inicial_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: true
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"alumno_historial_dolor": {
                  Row: {
                    "alumno_id": string,"created_at": string,"ejercicio_en_rutina_id": string | null,"ejercicio_id": string,"es_sintoma_alarma": boolean,"estado": string,"eva": number | null,"fecha_reporte": string,"id": string,"momento_aparicion": string | null,"notas_alumno": string | null,"notas_profesor": string | null,"numero_serie": number | null,"sesion_id": string | null,"severidad": string,"sintomas_alarma": (string)[],"updated_at": string,"zona_articular": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id": string,"created_at"?: string,"ejercicio_en_rutina_id"?: string | null,"ejercicio_id": string,"es_sintoma_alarma"?: boolean,"estado"?: string,"eva"?: number | null,"fecha_reporte"?: string,"id"?: string,"momento_aparicion"?: string | null,"notas_alumno"?: string | null,"notas_profesor"?: string | null,"numero_serie"?: number | null,"sesion_id"?: string | null,"severidad"?: string,"sintomas_alarma"?: (string)[],"updated_at"?: string,"zona_articular": string
                  }
                  Update: {
                    "alumno_id"?: string,"created_at"?: string,"ejercicio_en_rutina_id"?: string | null,"ejercicio_id"?: string,"es_sintoma_alarma"?: boolean,"estado"?: string,"eva"?: number | null,"fecha_reporte"?: string,"id"?: string,"momento_aparicion"?: string | null,"notas_alumno"?: string | null,"notas_profesor"?: string | null,"numero_serie"?: number | null,"sesion_id"?: string | null,"severidad"?: string,"sintomas_alarma"?: (string)[],"updated_at"?: string,"zona_articular"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alumno_historial_dolor_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alumno_historial_dolor_ejercicio_en_rutina_id_fkey"
      columns: ["ejercicio_en_rutina_id"]
isOneToOne: false
      referencedRelation: "ejercicios_en_rutina"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alumno_historial_dolor_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alumno_historial_dolor_sesion_id_fkey"
      columns: ["sesion_id"]
isOneToOne: false
      referencedRelation: "registro_sesiones"
      referencedColumns: ["id"]
    }
                  ]
                },"auditoria_cambios": {
                  Row: {
                    "accion": string,"autorizado_por": string | null,"created_at": string,"entidad": string,"entidad_id": string,"id": string,"motivo": string | null,"usuario_id": string | null,"valores_anteriores": Json | null,"valores_nuevos": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accion": string,"autorizado_por"?: string | null,"created_at"?: string,"entidad": string,"entidad_id": string,"id"?: string,"motivo"?: string | null,"usuario_id"?: string | null,"valores_anteriores"?: Json | null,"valores_nuevos"?: Json | null
                  }
                  Update: {
                    "accion"?: string,"autorizado_por"?: string | null,"created_at"?: string,"entidad"?: string,"entidad_id"?: string,"id"?: string,"motivo"?: string | null,"usuario_id"?: string | null,"valores_anteriores"?: Json | null,"valores_nuevos"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "auditoria_cambios_autorizado_por_fkey"
      columns: ["autorizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auditoria_cambios_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clases": {
                  Row: {
                    "actividad": string,"capacidad": number | null,"created_at": string,"duracion_minutos": number,"estado": string,"horario_id": string | null,"id": string,"inicio": string,"motivo_cancelacion": string | null,"nota": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actividad": string,"capacidad"?: number | null,"created_at"?: string,"duracion_minutos": number,"estado"?: string,"horario_id"?: string | null,"id"?: string,"inicio": string,"motivo_cancelacion"?: string | null,"nota"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "actividad"?: string,"capacidad"?: number | null,"created_at"?: string,"duracion_minutos"?: number,"estado"?: string,"horario_id"?: string | null,"id"?: string,"inicio"?: string,"motivo_cancelacion"?: string | null,"nota"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clases_horario_id_fkey"
      columns: ["horario_id"]
isOneToOne: false
      referencedRelation: "clases_horario"
      referencedColumns: ["id"]
    }
                  ]
                },"clases_fijas": {
                  Row: {
                    "alumno_id": string,"created_at": string,"horario_id": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id": string,"created_at"?: string,"horario_id": string,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "alumno_id"?: string,"created_at"?: string,"horario_id"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clases_fijas_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clases_fijas_horario_id_fkey"
      columns: ["horario_id"]
isOneToOne: false
      referencedRelation: "clases_horario"
      referencedColumns: ["id"]
    }
                  ]
                },"clases_horario": {
                  Row: {
                    "actividad": string,"activo": boolean,"capacidad": number | null,"created_at": string,"dia_semana": number,"duracion_minutos": number,"hora_inicio": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actividad": string,"activo"?: boolean,"capacidad"?: number | null,"created_at"?: string,"dia_semana": number,"duracion_minutos": number,"hora_inicio": string,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "actividad"?: string,"activo"?: boolean,"capacidad"?: number | null,"created_at"?: string,"dia_semana"?: number,"duracion_minutos"?: number,"hora_inicio"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"clases_profesores": {
                  Row: {
                    "clase_id": string,"created_at": string,"id": string,"profesor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clase_id": string,"created_at"?: string,"id"?: string,"profesor_id": string
                  }
                  Update: {
                    "clase_id"?: string,"created_at"?: string,"id"?: string,"profesor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clases_profesores_clase_id_fkey"
      columns: ["clase_id"]
isOneToOne: false
      referencedRelation: "clases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clases_profesores_profesor_id_fkey"
      columns: ["profesor_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cobros": {
                  Row: {
                    "alumno_id": string,"concepto": string | null,"contratacion_id": string,"created_at": string,"estado": string,"fecha_vencimiento": string,"id": string,"monto": number,"notas": string | null,"periodo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id": string,"concepto"?: string | null,"contratacion_id": string,"created_at"?: string,"estado"?: string,"fecha_vencimiento": string,"id"?: string,"monto": number,"notas"?: string | null,"periodo": string,"updated_at"?: string
                  }
                  Update: {
                    "alumno_id"?: string,"concepto"?: string | null,"contratacion_id"?: string,"created_at"?: string,"estado"?: string,"fecha_vencimiento"?: string,"id"?: string,"monto"?: number,"notas"?: string | null,"periodo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cobros_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobros_contratacion_id_fkey"
      columns: ["contratacion_id"]
isOneToOne: false
      referencedRelation: "contrataciones"
      referencedColumns: ["id"]
    }
                  ]
                },"contrataciones": {
                  Row: {
                    "actividad": string | null,"alumno_id": string,"created_at": string,"dia_vencimiento": number,"dias_aviso_previo": number,"estado": string,"fecha_fin": string,"fecha_inicio": string,"id": string,"plan_membresia_id": string | null,"precio_pactado": number | null,"tipo_servicio": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actividad"?: string | null,"alumno_id": string,"created_at"?: string,"dia_vencimiento": number,"dias_aviso_previo"?: number,"estado"?: string,"fecha_fin": string,"fecha_inicio": string,"id"?: string,"plan_membresia_id"?: string | null,"precio_pactado"?: number | null,"tipo_servicio"?: string,"updated_at"?: string
                  }
                  Update: {
                    "actividad"?: string | null,"alumno_id"?: string,"created_at"?: string,"dia_vencimiento"?: number,"dias_aviso_previo"?: number,"estado"?: string,"fecha_fin"?: string,"fecha_inicio"?: string,"id"?: string,"plan_membresia_id"?: string | null,"precio_pactado"?: number | null,"tipo_servicio"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrataciones_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrataciones_plan_membresia_id_fkey"
      columns: ["plan_membresia_id"]
isOneToOne: false
      referencedRelation: "planes_membresia"
      referencedColumns: ["id"]
    }
                  ]
                },"conversaciones": {
                  Row: {
                    "alumno_id": string,"created_at": string,"estado": string,"id": string,"responsable_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id": string,"created_at"?: string,"estado"?: string,"id"?: string,"responsable_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "alumno_id"?: string,"created_at"?: string,"estado"?: string,"id"?: string,"responsable_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversaciones_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: true
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversaciones_responsable_id_fkey"
      columns: ["responsable_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"dias_rutina": {
                  Row: {
                    "created_at": string,"id": string,"nombre": string,"orden": number,"plan_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"nombre": string,"orden": number,"plan_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"nombre"?: string,"orden"?: number,"plan_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dias_rutina_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_entrenamiento"
      referencedColumns: ["id"]
    }
                  ]
                },"ejercicios": {
                  Row: {
                    "comentario": string | null,"creado_por": string | null,"created_at": string,"id": string,"musculos_principales": (string)[],"musculos_secundarios": (string)[],"nombre": string,"updated_at": string,"url_video": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comentario"?: string | null,"creado_por"?: string | null,"created_at"?: string,"id"?: string,"musculos_principales"?: (string)[],"musculos_secundarios"?: (string)[],"nombre": string,"updated_at"?: string,"url_video"?: string | null
                  }
                  Update: {
                    "comentario"?: string | null,"creado_por"?: string | null,"created_at"?: string,"id"?: string,"musculos_principales"?: (string)[],"musculos_secundarios"?: (string)[],"nombre"?: string,"updated_at"?: string,"url_video"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ejercicios_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ejercicios_en_rutina": {
                  Row: {
                    "created_at": string,"descanso_segundos": number,"dia_id": string,"ejercicio_id": string,"es_superserie": boolean,"es_unilateral": boolean,"force_rpe_required": boolean,"grupo_superserie": number | null,"id": string,"notas": string | null,"orden": number,"repeticiones": string,"rpe_objetivo": string | null,"series": number,"tempo": string | null,"tempo_activo": boolean,"tiempo_objetivo_segundos": number | null,"tipo_medicion": string,"tipo_serie": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"descanso_segundos"?: number,"dia_id": string,"ejercicio_id": string,"es_superserie"?: boolean,"es_unilateral"?: boolean,"force_rpe_required"?: boolean,"grupo_superserie"?: number | null,"id"?: string,"notas"?: string | null,"orden": number,"repeticiones": string,"rpe_objetivo"?: string | null,"series": number,"tempo"?: string | null,"tempo_activo"?: boolean,"tiempo_objetivo_segundos"?: number | null,"tipo_medicion"?: string,"tipo_serie"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"descanso_segundos"?: number,"dia_id"?: string,"ejercicio_id"?: string,"es_superserie"?: boolean,"es_unilateral"?: boolean,"force_rpe_required"?: boolean,"grupo_superserie"?: number | null,"id"?: string,"notas"?: string | null,"orden"?: number,"repeticiones"?: string,"rpe_objetivo"?: string | null,"series"?: number,"tempo"?: string | null,"tempo_activo"?: boolean,"tiempo_objetivo_segundos"?: number | null,"tipo_medicion"?: string,"tipo_serie"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ejercicios_en_rutina_dia_id_fkey"
      columns: ["dia_id"]
isOneToOne: false
      referencedRelation: "dias_rutina"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ejercicios_en_rutina_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    }
                  ]
                },"errores_app": {
                  Row: {
                    "contexto": string,"created_at": string,"detalle_tecnico": string | null,"id": string,"mensaje_humano": string,"payload_resumen": Json | null,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contexto": string,"created_at"?: string,"detalle_tecnico"?: string | null,"id"?: string,"mensaje_humano": string,"payload_resumen"?: Json | null,"usuario_id": string
                  }
                  Update: {
                    "contexto"?: string,"created_at"?: string,"detalle_tecnico"?: string | null,"id"?: string,"mensaje_humano"?: string,"payload_resumen"?: Json | null,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "errores_app_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback_clase": {
                  Row: {
                    "created_at": string,"id": string,"reserva_id": string,"sensacion": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"reserva_id": string,"sensacion": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"reserva_id"?: string,"sensacion"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_clase_reserva_id_fkey"
      columns: ["reserva_id"]
isOneToOne: true
      referencedRelation: "reservas"
      referencedColumns: ["id"]
    }
                  ]
                },"feriados": {
                  Row: {
                    "created_at": string,"fecha": string,"fuente": string,"hay_clases": boolean,"id": string,"nombre": string,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fecha": string,"fuente"?: string,"hay_clases"?: boolean,"id"?: string,"nombre": string,"tipo": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"fecha"?: string,"fuente"?: string,"hay_clases"?: boolean,"id"?: string,"nombre"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"logros_racha": {
                  Row: {
                    "alumno_id": string,"created_at": string,"fecha_logro": string,"id": string,"numero_ciclo": number,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id"?: string,"created_at"?: string,"fecha_logro"?: string,"id"?: string,"numero_ciclo": number,"tipo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "alumno_id"?: string,"created_at"?: string,"fecha_logro"?: string,"id"?: string,"numero_ciclo"?: number,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "logros_racha_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"mensajes": {
                  Row: {
                    "contenido": string,"conversacion_id": string,"created_at": string,"id": string,"leido": boolean,"remitente_id": string,"requiere_lectura_inicio": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contenido": string,"conversacion_id": string,"created_at"?: string,"id"?: string,"leido"?: boolean,"remitente_id": string,"requiere_lectura_inicio"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "contenido"?: string,"conversacion_id"?: string,"created_at"?: string,"id"?: string,"leido"?: boolean,"remitente_id"?: string,"requiere_lectura_inicio"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensajes_conversacion_id_fkey"
      columns: ["conversacion_id"]
isOneToOne: false
      referencedRelation: "conversaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensajes_remitente_id_fkey"
      columns: ["remitente_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pagos": {
                  Row: {
                    "alumno_id": string,"cobro_id": string | null,"confirmado_at": string | null,"confirmado_por": string | null,"contratacion_id": string,"created_at": string,"estado": string,"id": string,"idempotency_key": string,"medio_pago": string,"monto": number,"monto_cobrado": number | null,"monto_lista": number | null,"nota": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id": string,"cobro_id"?: string | null,"confirmado_at"?: string | null,"confirmado_por"?: string | null,"contratacion_id": string,"created_at"?: string,"estado"?: string,"id"?: string,"idempotency_key": string,"medio_pago": string,"monto": number,"monto_cobrado"?: never,"monto_lista"?: number | null,"nota"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "alumno_id"?: string,"cobro_id"?: string | null,"confirmado_at"?: string | null,"confirmado_por"?: string | null,"contratacion_id"?: string,"created_at"?: string,"estado"?: string,"id"?: string,"idempotency_key"?: string,"medio_pago"?: string,"monto"?: number,"monto_cobrado"?: never,"monto_lista"?: number | null,"nota"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagos_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_cobro_id_fkey"
      columns: ["cobro_id"]
isOneToOne: false
      referencedRelation: "cobros"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_cobro_id_fkey"
      columns: ["cobro_id"]
isOneToOne: false
      referencedRelation: "v_morosos"
      referencedColumns: ["cobro_id"]
    },{
      foreignKeyName: "pagos_confirmado_por_fkey"
      columns: ["confirmado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_contratacion_id_fkey"
      columns: ["contratacion_id"]
isOneToOne: false
      referencedRelation: "contrataciones"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "apoyo_acceso_financiero": boolean,"created_at": string,"debe_cambiar_password": boolean,"email": string | null,"estado_cuenta": string,"estado_membresia": Database["public"]['Enums']["estado_membresia"],"fecha_baja": string | null,"fecha_vencimiento_cuota": string | null,"id": string,"nivel_vista_alumno": string,"nombre_completo": string,"nombre_preferido": string | null,"onboarding_completado": boolean,"peso_corporal_kg": number | null,"profesor_asignado_id": string | null,"profesor_apoyo_id": string | null,"rol": Database["public"]['Enums']["rol_usuario"],"sexo": string | null,"telefono": string | null,"ultimo_entreno_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "apoyo_acceso_financiero"?: boolean,"created_at"?: string,"debe_cambiar_password"?: boolean,"email"?: string | null,"estado_cuenta"?: string,"estado_membresia"?: Database["public"]['Enums']["estado_membresia"],"fecha_baja"?: string | null,"fecha_vencimiento_cuota"?: string | null,"id": string,"nivel_vista_alumno"?: string,"nombre_completo": string,"nombre_preferido"?: string | null,"onboarding_completado"?: boolean,"peso_corporal_kg"?: number | null,"profesor_asignado_id"?: string | null,"profesor_apoyo_id"?: string | null,"rol"?: Database["public"]['Enums']["rol_usuario"],"sexo"?: string | null,"telefono"?: string | null,"ultimo_entreno_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "apoyo_acceso_financiero"?: boolean,"created_at"?: string,"debe_cambiar_password"?: boolean,"email"?: string | null,"estado_cuenta"?: string,"estado_membresia"?: Database["public"]['Enums']["estado_membresia"],"fecha_baja"?: string | null,"fecha_vencimiento_cuota"?: string | null,"id"?: string,"nivel_vista_alumno"?: string,"nombre_completo"?: string,"nombre_preferido"?: string | null,"onboarding_completado"?: boolean,"peso_corporal_kg"?: number | null,"profesor_asignado_id"?: string | null,"profesor_apoyo_id"?: string | null,"rol"?: Database["public"]['Enums']["rol_usuario"],"sexo"?: string | null,"telefono"?: string | null,"ultimo_entreno_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "perfiles_profesor_apoyo_id_fkey"
      columns: ["profesor_apoyo_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "perfiles_profesor_asignado_id_fkey"
      columns: ["profesor_asignado_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"planes_compartidos": {
                  Row: {
                    "compartido_por": string,"created_at": string,"id": string,"plan_id": string,"profesor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "compartido_por": string,"created_at"?: string,"id"?: string,"plan_id": string,"profesor_id": string
                  }
                  Update: {
                    "compartido_por"?: string,"created_at"?: string,"id"?: string,"plan_id"?: string,"profesor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planes_compartidos_compartido_por_fkey"
      columns: ["compartido_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planes_compartidos_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_entrenamiento"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planes_compartidos_profesor_id_fkey"
      columns: ["profesor_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"planes_entrenamiento": {
                  Row: {
                    "alumno_id": string | null,"comentarios": string | null,"created_at": string,"estado": Database["public"]['Enums']["estado_plan"],"etiqueta": string | null,"fecha_fin": string | null,"fecha_inicio": string,"id": string,"nombre": string,"plan_origen_id": string | null,"profesor_id": string | null,"tags": (string)[],"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id"?: string | null,"comentarios"?: string | null,"created_at"?: string,"estado"?: Database["public"]['Enums']["estado_plan"],"etiqueta"?: string | null,"fecha_fin"?: string | null,"fecha_inicio"?: string,"id"?: string,"nombre": string,"plan_origen_id"?: string | null,"profesor_id"?: string | null,"tags"?: (string)[],"tipo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "alumno_id"?: string | null,"comentarios"?: string | null,"created_at"?: string,"estado"?: Database["public"]['Enums']["estado_plan"],"etiqueta"?: string | null,"fecha_fin"?: string | null,"fecha_inicio"?: string,"id"?: string,"nombre"?: string,"plan_origen_id"?: string | null,"profesor_id"?: string | null,"tags"?: (string)[],"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planes_entrenamiento_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planes_entrenamiento_plan_origen_id_fkey"
      columns: ["plan_origen_id"]
isOneToOne: false
      referencedRelation: "planes_entrenamiento"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planes_entrenamiento_profesor_id_fkey"
      columns: ["profesor_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"planes_membresia": {
                  Row: {
                    "activo": boolean,"cantidad_actividades": number,"created_at": string,"duracion_meses": number,"id": string,"limite_semanal": number | null,"nombre": string,"notas": string | null,"precio": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"cantidad_actividades": number,"created_at"?: string,"duracion_meses": number,"id"?: string,"limite_semanal"?: number | null,"nombre": string,"notas"?: string | null,"precio": number,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"cantidad_actividades"?: number,"created_at"?: string,"duracion_meses"?: number,"id"?: string,"limite_semanal"?: number | null,"nombre"?: string,"notas"?: string | null,"precio"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"planes_membresia_precios": {
                  Row: {
                    "creado_por": string | null,"created_at": string,"id": string,"plan_membresia_id": string,"precio": number,"vigente_desde": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_por"?: string | null,"created_at"?: string,"id"?: string,"plan_membresia_id": string,"precio": number,"vigente_desde": string
                  }
                  Update: {
                    "creado_por"?: string | null,"created_at"?: string,"id"?: string,"plan_membresia_id"?: string,"precio"?: number,"vigente_desde"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planes_membresia_precios_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planes_membresia_precios_plan_membresia_id_fkey"
      columns: ["plan_membresia_id"]
isOneToOne: false
      referencedRelation: "planes_membresia"
      referencedColumns: ["id"]
    }
                  ]
                },"push_cola": {
                  Row: {
                    "created_at": string,"destinatario_id": string,"enviado_at": string | null,"id": string,"mensaje_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"destinatario_id": string,"enviado_at"?: string | null,"id"?: string,"mensaje_id": string
                  }
                  Update: {
                    "created_at"?: string,"destinatario_id"?: string,"enviado_at"?: string | null,"id"?: string,"mensaje_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_cola_destinatario_id_fkey"
      columns: ["destinatario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_cola_mensaje_id_fkey"
      columns: ["mensaje_id"]
isOneToOne: false
      referencedRelation: "mensajes"
      referencedColumns: ["id"]
    }
                  ]
                },"push_suscripciones": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"usuario_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_suscripciones_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"registro_series": {
                  Row: {
                    "completada": boolean,"created_at": string,"ejercicio_id": string,"id": string,"notas": string | null,"numero_serie": number,"pain_notes": string | null,"pain_reported": boolean,"peso_kg": number,"reps_hechas": number,"rpe_real": number | null,"sesion_id": string,"set_type": string,"updated_at": string,"video_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "completada"?: boolean,"created_at"?: string,"ejercicio_id": string,"id"?: string,"notas"?: string | null,"numero_serie": number,"pain_notes"?: string | null,"pain_reported"?: boolean,"peso_kg"?: number,"reps_hechas"?: number,"rpe_real"?: number | null,"sesion_id": string,"set_type"?: string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Update: {
                    "completada"?: boolean,"created_at"?: string,"ejercicio_id"?: string,"id"?: string,"notas"?: string | null,"numero_serie"?: number,"pain_notes"?: string | null,"pain_reported"?: boolean,"peso_kg"?: number,"reps_hechas"?: number,"rpe_real"?: number | null,"sesion_id"?: string,"set_type"?: string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "registro_series_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registro_series_sesion_id_fkey"
      columns: ["sesion_id"]
isOneToOne: false
      referencedRelation: "registro_sesiones"
      referencedColumns: ["id"]
    }
                  ]
                },"registro_sesiones": {
                  Row: {
                    "alumno_id": string,"clase_id": string | null,"created_at": string,"dia_id": string | null,"dia_sugerido_id": string | null,"duracion_minutos": number | null,"effective_volume_kg": number,"fecha": string,"id": string,"motivo_cambio_dia": string | null,"updated_at": string,"volumen_total_kg": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id": string,"clase_id"?: string | null,"created_at"?: string,"dia_id"?: string | null,"dia_sugerido_id"?: string | null,"duracion_minutos"?: number | null,"effective_volume_kg"?: number,"fecha"?: string,"id"?: string,"motivo_cambio_dia"?: string | null,"updated_at"?: string,"volumen_total_kg"?: number
                  }
                  Update: {
                    "alumno_id"?: string,"clase_id"?: string | null,"created_at"?: string,"dia_id"?: string | null,"dia_sugerido_id"?: string | null,"duracion_minutos"?: number | null,"effective_volume_kg"?: number,"fecha"?: string,"id"?: string,"motivo_cambio_dia"?: string | null,"updated_at"?: string,"volumen_total_kg"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "registro_sesiones_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registro_sesiones_dia_id_fkey"
      columns: ["dia_id"]
isOneToOne: false
      referencedRelation: "dias_rutina"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registro_sesiones_dia_sugerido_id_fkey"
      columns: ["dia_sugerido_id"]
isOneToOne: false
      referencedRelation: "dias_rutina"
      referencedColumns: ["id"]
    }
                  ]
                },"reservas": {
                  Row: {
                    "alumno_id": string,"clase_id": string,"created_at": string,"estado": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alumno_id": string,"clase_id": string,"created_at"?: string,"estado"?: string,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "alumno_id"?: string,"clase_id"?: string,"created_at"?: string,"estado"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reservas_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reservas_clase_id_fkey"
      columns: ["clase_id"]
isOneToOne: false
      referencedRelation: "clases"
      referencedColumns: ["id"]
    }
                  ]
                },"sustituciones_ejercicios": {
                  Row: {
                    "created_at": string,"ejercicio_en_rutina_id": string | null,"ejercicio_original_id": string,"ejercicio_sustituto_id": string,"id": string,"motivo": string | null,"plan_id": string,"reporte_dolor_id": string | null,"responsable_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ejercicio_en_rutina_id"?: string | null,"ejercicio_original_id": string,"ejercicio_sustituto_id": string,"id"?: string,"motivo"?: string | null,"plan_id": string,"reporte_dolor_id"?: string | null,"responsable_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"ejercicio_en_rutina_id"?: string | null,"ejercicio_original_id"?: string,"ejercicio_sustituto_id"?: string,"id"?: string,"motivo"?: string | null,"plan_id"?: string,"reporte_dolor_id"?: string | null,"responsable_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sustituciones_ejercicios_ejercicio_en_rutina_id_fkey"
      columns: ["ejercicio_en_rutina_id"]
isOneToOne: false
      referencedRelation: "ejercicios_en_rutina"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sustituciones_ejercicios_ejercicio_original_id_fkey"
      columns: ["ejercicio_original_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sustituciones_ejercicios_ejercicio_sustituto_id_fkey"
      columns: ["ejercicio_sustituto_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sustituciones_ejercicios_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_entrenamiento"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sustituciones_ejercicios_reporte_dolor_id_fkey"
      columns: ["reporte_dolor_id"]
isOneToOne: false
      referencedRelation: "alumno_historial_dolor"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sustituciones_ejercicios_reporte_dolor_id_fkey"
      columns: ["reporte_dolor_id"]
isOneToOne: false
      referencedRelation: "v_dolor_activo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sustituciones_ejercicios_responsable_id_fkey"
      columns: ["responsable_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_descuentos_otorgados": {
                  Row: {
                    "alumno_id": string,"cobro_id": string | null,"confirmado_at": string | null,"descuento": number | null,"monto_cobrado": number | null,"monto_lista": number | null,"nota": string | null,"pago_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "alumno_id"?: string | null,"cobro_id"?: string | null,"confirmado_at"?: string | null,"descuento"?: never,"monto_cobrado"?: number | null,"monto_lista"?: number | null,"nota"?: string | null,"pago_id"?: string | null
                         }
                        Update: {
                           "alumno_id"?: string | null,"cobro_id"?: string | null,"confirmado_at"?: string | null,"descuento"?: never,"monto_cobrado"?: number | null,"monto_lista"?: number | null,"nota"?: string | null,"pago_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "pagos_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_cobro_id_fkey"
      columns: ["cobro_id"]
isOneToOne: false
      referencedRelation: "cobros"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_cobro_id_fkey"
      columns: ["cobro_id"]
isOneToOne: false
      referencedRelation: "v_morosos"
      referencedColumns: ["cobro_id"]
    }
                  ]
                },"v_dolor_activo": {
                  Row: {
                    "alumno_email": string | null,"alumno_id": string,"alumno_nombre": string | null,"created_at": string,"ejercicio_id": string,"ejercicio_nombre": string | null,"es_sintoma_alarma": boolean,"estado": string,"eva": number | null,"fecha_reporte": string,"id": string,"momento_aparicion": string | null,"nivel": string | null,"notas_alumno": string | null,"notas_profesor": string | null,"severidad": string,"sintomas_alarma": (string)[],"updated_at": string,"zona_articular": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "alumno_historial_dolor_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alumno_historial_dolor_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    }
                  ]
                },"v_estado_alumno": {
                  Row: {
                    "al_dia": boolean | null,"alumno_id": string | null,"cobros_vencidos": number | null,"contratacion_id": string | null,"estado": "AL_DIA"|"POR_VENCER"|"VENCIDA"|"PENDIENTE"|"EN_PAUSA"|"SIN_CONTRATACION" | null,"estado_contratacion": string | null,"fecha_vencimiento": string | null,"primer_vencimiento_impago": string | null,"profesor_asignado_id": string | null
                  }
                  ComputedFields: never
                  Relationships: []
                },"v_morosos": {
                  Row: {
                    "alumno_id": string,"cobro_id": string,"contratacion_id": string,"dias_atraso": number | null,"fecha_vencimiento": string,"monto": number,"periodo": string
                  }
                  ComputedFields: never
                  Insert: {
                           "alumno_id"?: string | null,"cobro_id"?: string | null,"contratacion_id"?: string | null,"dias_atraso"?: never,"fecha_vencimiento"?: string | null,"monto"?: number | null,"periodo"?: string | null
                         }
                        Update: {
                           "alumno_id"?: string | null,"cobro_id"?: string | null,"contratacion_id"?: string | null,"dias_atraso"?: never,"fecha_vencimiento"?: string | null,"monto"?: number | null,"periodo"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "cobros_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobros_contratacion_id_fkey"
      columns: ["contratacion_id"]
isOneToOne: false
      referencedRelation: "contrataciones"
      referencedColumns: ["id"]
    }
                  ]
                },"v_prs": {
                  Row: {
                    "alumno_id": string,"ejercicio_id": string,"fecha": string,"peso_kg": number,"reps": number,"serie_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "registro_sesiones_alumno_id_fkey"
      columns: ["alumno_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registro_series_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "_resolver_cobertura_actividad_alumno":
{ Args: { "p_actividad": string,"p_alumno_id": string,"p_hoy": string }; Returns: {
              "contar_solo_actividad": boolean,"fecha_fin_aviso": string,"habilitado": boolean,"limite_semanal": number,"motivo_codigo": string,"motivo_detalle": string,"motivo_subtipo": string
            }[]
                           },
"actualizar_estado_dolor":
{ Args: { "p_nota"?: string,"p_nuevo_estado": string,"p_reporte_id": string }; Returns: {
              "alumno_id": string,
"created_at": string,
"ejercicio_en_rutina_id": string | null,
"ejercicio_id": string,
"es_sintoma_alarma": boolean,
"estado": string,
"eva": number | null,
"fecha_reporte": string,
"id": string,
"momento_aparicion": string | null,
"notas_alumno": string | null,
"notas_profesor": string | null,
"numero_serie": number | null,
"sesion_id": string | null,
"severidad": string,
"sintomas_alarma": (string)[],
"updated_at": string,
"zona_articular": string
            }
                          SetofOptions: {
        from: "*"
        to: "alumno_historial_dolor"
        isOneToOne: true
        isSetofReturn: false
      } },
"actualizar_nombre_preferido":
{ Args: { "p_nombre"?: string }; Returns: string
                           },
"anotar_alumno_coach":
{ Args: { "p_alumno_id": string,"p_clase_id": string,"p_forzar"?: boolean }; Returns: {
              "aviso": string,"requiere_confirmacion": boolean,"reserva_id": string,"sobrecupo": boolean,"tipo_aviso": string
            }[]
                           },
"asignar_clase_fija":
{ Args: { "p_alumno_id"?: string,"p_horario_id": string }; Returns: string
                           },
"asignar_rutina_a_alumno":
{ Args: { "p_alumno_id": string,"p_nombre"?: string,"p_plan_id": string }; Returns: string
                           },
"asignar_suscripcion_y_cobro":
{ Args: { "p_actividad"?: string,"p_alumno_id": string,"p_concepto"?: string,"p_es_adicional"?: boolean,"p_medio_pago"?: string,"p_monto"?: number,"p_nota"?: string,"p_pagado"?: boolean,"p_pase_libre"?: boolean,"p_plan_id"?: string,"p_veces_por_semana"?: number }; Returns: {
              "cobro_id": string,"concepto": string,"contratacion_id": string,"estado_cobro": string,"monto": number,"pago_id": string
            }[]
                           },
"calcular_volumen_semanal":
{ Args: { "p_alumno_id": string,"p_fecha_inicio"?: string }; Returns: number
                           },
"cancelar_clase":
{ Args: { "p_clase_id": string,"p_motivo"?: string }; Returns: {
              "actividad": string,
"capacidad": number | null,
"created_at": string,
"duracion_minutos": number,
"estado": string,
"horario_id": string | null,
"id": string,
"inicio": string,
"motivo_cancelacion": string | null,
"nota": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "clases"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancelar_clase_con_aviso":
{ Args: { "p_clase_id": string,"p_motivo"?: string,"p_pushear_inicio"?: boolean }; Returns: {
              "actividad": string,
"capacidad": number | null,
"created_at": string,
"duracion_minutos": number,
"estado": string,
"horario_id": string | null,
"id": string,
"inicio": string,
"motivo_cancelacion": string | null,
"nota": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "clases"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancelar_reserva":
{ Args: { "p_reserva_id": string }; Returns: {
              "alumno_id": string,
"clase_id": string,
"created_at": string,
"estado": string,
"id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "reservas"
        isOneToOne: true
        isSetofReturn: false
      } },
"clonar_plan_entrenamiento":
{ Args: { "p_nuevo_nombre": string,"p_plan_id": string }; Returns: string
                           },
"completar_onboarding_alumno":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"contar_mensajes_no_leidos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"crear_clases_agenda":
{ Args: { "p_actividad": string,"p_capacidad"?: number,"p_dias_semana"?: (number)[],"p_duracion_minutos"?: number,"p_fecha_fin"?: string,"p_fecha_inicio"?: string,"p_hora_inicio"?: string,"p_inicio"?: string,"p_recurrente"?: boolean,"p_semanas"?: number }; Returns: {
              "actividad": string,
"capacidad": number | null,
"created_at": string,
"duracion_minutos": number,
"estado": string,
"horario_id": string | null,
"id": string,
"inicio": string,
"motivo_cancelacion": string | null,
"nota": string | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "clases"
        isOneToOne: false
        isSetofReturn: true
      } },
"detectar_sobrecarga_progresiva":
{ Args: { "p_alumno_id": string,"p_ejercicio_id": string }; Returns: {
              "fecha": string,"hubo_sobrecarga": boolean,"peso_max_kg": number,"sesion_id": string,"volumen_ejercicio_kg": number
            }[]
                           },
"eliminar_clase_vacia":
{ Args: { "p_clase_id": string }; Returns: boolean
                           },
"es_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"es_entrenador_de":
{ Args: { "p_alumno_id": string }; Returns: boolean
                           },
"es_entrenador_financiero_de":
{ Args: { "p_alumno_id": string }; Returns: boolean
                           },
"es_entrenador_o_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"es_profesor_de_clase":
{ Args: { "p_clase_id": string }; Returns: boolean
                           },
"evaluar_vencimientos_contrataciones":
{ Args: Record<PropertyKey, never>; Returns: {
              "por_vencer": number,"vencidas": number
            }[]
                           },
"extender_contratacion_excepcional":
{ Args: { "p_contratacion_id": string,"p_motivo": string,"p_nueva_fecha_fin": string }; Returns: {
              "actividad": string | null,
"alumno_id": string,
"created_at": string,
"dia_vencimiento": number,
"dias_aviso_previo": number,
"estado": string,
"fecha_fin": string,
"fecha_inicio": string,
"id": string,
"plan_membresia_id": string | null,
"precio_pactado": number | null,
"tipo_servicio": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "contrataciones"
        isOneToOne: true
        isSetofReturn: false
      } },
"feriados_en_rango":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "created_at": string,
"fecha": string,
"fuente": string,
"hay_clases": boolean,
"id": string,
"nombre": string,
"tipo": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "feriados"
        isOneToOne: false
        isSetofReturn: true
      } },
"fn_estado_contratacion_por_fecha":
{ Args: { "p_dias_aviso_previo": number,"p_fecha_fin": string }; Returns: string
                           },
"guardar_rutina":
{ Args: { "p_payload": Json }; Returns: string
                           },
"job_diario_contrataciones":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"listar_entrenadores_staff":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"nombre_completo": string
            }[]
                           },
"marcar_ausente":
{ Args: { "p_reserva_id": string }; Returns: {
              "alumno_id": string,
"clase_id": string,
"created_at": string,
"estado": string,
"id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "reservas"
        isOneToOne: true
        isSetofReturn: false
      } },
"marcar_mensajes_leidos":
{ Args: { "p_conversacion_id": string }; Returns: number
                           },
"obtener_kpis_negocio":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "activos_fin": number,"altas": number,"alumnos_al_dia": number,"alumnos_morosos": number,"bajas": number,"cobranza_esperada": number,"cobranza_pendiente_monto": number,"cobranza_por_vencer_monto": number,"cobranza_vencida_monto": number,"cobranza_vencidas_cant": number,"ingresos": number,"ingresos_6m": (number)[],"ingresos_online": number,"ingresos_periodo_anterior": number,"ingresos_presencial": number,"sin_entrenar_7d_ids": (string)[]
            }[]
                           },
"obtener_metricas_retencion":
{ Args: { "p_profesor_id"?: string }; Returns: {
              "cantActivas": number,"cantClientesPerdidosMes": number,"cantSinPlanEntrenamiento": number
            }[]
                           },
"obtener_ranking_funcional_alumno":
{ Args: { "p_ejercicio_id"?: string }; Returns: {
              "ejercicio_id": string,"es_usuario_actual": boolean,"fecha": string,"nombre_corto": string,"peso_kg": number,"posicion": number | null,"ratio": number | null,"reps": number,"sexo": string | null
            }[]
                           },
"obtener_o_crear_conversacion":
{ Args: { "p_alumno_id": string }; Returns: string
                           },
"obtener_records_historicos":
{ Args: { "p_alumno_id": string,"p_ejercicio_id"?: string }; Returns: {
              "ejercicio_id": string,"mejor_1rm_brzycki": number,"mejor_1rm_epley": number,"peso_max_kg": number
            }[]
                           },
"plan_compartido_conmigo":
{ Args: { "p_plan_id": string }; Returns: boolean
                           },
"precio_vigente":
{ Args: { "p_fecha": string,"p_plan_id": string }; Returns: number
                           },
"puede_gestionar_clases_fijas":
{ Args: { "p_alumno_id": string }; Returns: boolean
                           },
"quick_swap_ejercicio":
{ Args: { "p_alerta_id"?: string,"p_ejercicio_en_rutina_id": string,"p_motivo"?: string,"p_nuevo_ejercicio_id": string }; Returns: {
              "created_at": string,
"descanso_segundos": number,
"dia_id": string,
"ejercicio_id": string,
"es_superserie": boolean,
"es_unilateral": boolean,
"force_rpe_required": boolean,
"grupo_superserie": number | null,
"id": string,
"notas": string | null,
"orden": number,
"repeticiones": string,
"rpe_objetivo": string | null,
"series": number,
"tempo": string | null,
"tempo_activo": boolean,
"tiempo_objetivo_segundos": number | null,
"tipo_medicion": string,
"tipo_serie": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "ejercicios_en_rutina"
        isOneToOne: true
        isSetofReturn: false
      } },
"quitar_clase_fija":
{ Args: { "p_clase_fija_id": string }; Returns: undefined
                           },
"quitar_reserva_coach":
{ Args: { "p_reserva_id": string }; Returns: {
              "alumno_id": string,
"clase_id": string,
"created_at": string,
"estado": string,
"id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "reservas"
        isOneToOne: true
        isSetofReturn: false
      } },
"reactivar_clase":
{ Args: { "p_clase_id": string }; Returns: {
              "actividad": string,
"capacidad": number | null,
"created_at": string,
"duracion_minutos": number,
"estado": string,
"horario_id": string | null,
"id": string,
"inicio": string,
"motivo_cancelacion": string | null,
"nota": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "clases"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_logro_racha":
{ Args: { "numero_ciclo": number,"tipo"?: string }; Returns: {
              "alumno_id": string,
"created_at": string,
"fecha_logro": string,
"id": string,
"numero_ciclo": number,
"tipo": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "logros_racha"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_marca_funcional":
{ Args: { "p_alumno_id": string,"p_clase_id"?: string,"p_ejercicio_id": string,"p_fecha"?: string,"p_peso_corporal_kg"?: number,"p_peso_kg": number,"p_reps": number,"p_sexo"?: string }; Returns: string
                           },
"registrar_molestia":
{ Args: { "p_dia_id"?: string,"p_ejercicio_en_rutina_id"?: string,"p_ejercicio_id": string,"p_eva": number,"p_id": string,"p_momento"?: string,"p_notas"?: string,"p_numero_serie"?: number,"p_sesion_id": string,"p_sintomas"?: (string)[],"p_zona": string }; Returns: string
                           },
"registrar_pago":
{ Args: { "p_cobro_id": string,"p_metodo": string,"p_monto": number,"p_nota": string }; Returns: {
              "alumno_id": string,
"concepto": string | null,
"contratacion_id": string,
"created_at": string,
"estado": string,
"fecha_vencimiento": string,
"id": string,
"monto": number,
"notas": string | null,
"periodo": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "cobros"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_y_confirmar_renovacion":
{ Args: { "p_contratacion_id": string,"p_idempotency_key": string,"p_medio_pago": string,"p_monto": number }; Returns: {
              "actividad": string | null,
"alumno_id": string,
"created_at": string,
"dia_vencimiento": number,
"dias_aviso_previo": number,
"estado": string,
"fecha_fin": string,
"fecha_inicio": string,
"id": string,
"plan_membresia_id": string | null,
"precio_pactado": number | null,
"tipo_servicio": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "contrataciones"
        isOneToOne: true
        isSetofReturn: false
      } },
"renovar_contratacion":
{ Args: { "p_contratacion_id": string,"p_idempotency_key": string,"p_medio_pago": string,"p_monto": number }; Returns: {
              "cobro_id": string,"contratacion_id": string,"estado": string,"fecha_fin": string,"pago_id": string,"periodo": string
            }[]
                           },
"reservar_clase":
{ Args: { "p_clase_id": string }; Returns: {
              "aviso": string,"reserva_id": string
            }[]
                           },
"restaurar_filas_respaldo":
{ Args: { "p_filas": Json,"p_tabla": string }; Returns: number
                           },
"resumen_clases_alumno":
{ Args: { "p_desde"?: string }; Returns: {
              "asistencias": Json,"limite_semanal": number,"racha_semanas": number,"usadas_semana": number
            }[]
                           },
"transferir_conversacion_gozs":
{ Args: { "p_conversacion_id": string,"p_motivo"?: string,"p_nuevo_responsable_id": string }; Returns: {
              "alumno_id": string,
"created_at": string,
"estado": string,
"id": string,
"responsable_id": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "conversaciones"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "estado_membresia": "ACTIVA"|"INACTIVA"|"PENDIENTE"|"BAJA"|"VENCIDA","estado_plan": "ACTIVO"|"INACTIVO"|"BORRADOR","rol_usuario": "ENTRENADOR"|"ALUMNO"|"ADMIN"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "estado_membresia": ["ACTIVA", "INACTIVA", "PENDIENTE", "BAJA", "VENCIDA"],"estado_plan": ["ACTIVO", "INACTIVO", "BORRADOR"],"rol_usuario": ["ENTRENADOR", "ALUMNO", "ADMIN"]
          }
        }
} as const
