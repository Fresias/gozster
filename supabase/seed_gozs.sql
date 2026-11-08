-- ============================================================================
-- GOZSter: Carga de Datos Semilla desde Backup GOZS (13 Alumnos Reales)
-- Script SQL idempotente para PostgreSQL 15+ / Supabase
-- ============================================================================

BEGIN;

-- 1. Profesor Titular / Coach Asignado
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '20685bca-6304-4e55-abba-37a1cf8f6113', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'coach.gozs@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Profesor Titular GOZS"}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id)
VALUES ('20685bca-6304-4e55-abba-37a1cf8f6113', 'coach.gozs@gozster.local', 'Profesor Titular GOZS', 'ENTRENADOR', 'ACTIVA', NULL)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ENTRENADOR', estado_membresia = 'ACTIVA', updated_at = now();

-- 2. Catálogo Maestro de Ejercicios Únicos
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('55ddab2b-3449-41af-a04d-1f5ce33ad7d6', '90/90', 'Movilidad de cadera', 'noTGHlQVKfA', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('f5190986-2dcc-40b4-a22a-2bd1fda33de9', 'Extension de rodilla', 'Activacion de cadena posterior', 'Jd9rYOetS9U', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('43b309bb-72bd-4728-a9cb-c34489cc859d', 'Sentadilla en silla', 'Ejercicio de fuerza para el tren inferior', 'QnPCi09koPc', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('b23e4443-f2b8-4122-ad2a-c551ad7446bd', 'Skater con peso', 'Ejercicio de fuerza para el tren inferior', 'JfOu50OK9a4', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('54661849-67ec-48f1-a90e-c37522f0e7af', 'Puente de Gluteo Asimetrico', 'Configuración:
-Acostarse en el suelo, mirando hacia arriba. 
-Una rodilla flexionada y la otra semi-estirada, con los pies apoyados en el piso.
-Mantener el contacto con los hombros en el suelo en todo momento.

Ejecución:
-Elevar la cadera, de modo que las rodillas y caderas se encuentren en una misma línea horizontal.
-Aguantar arriba durante 1'''' y contraer los glúteos.
-Evitar la hiperextensión de la columna.
-Al volver a la posición inicial, bajar la cadera de manera controlada.', '9-r_r2KlpI8', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('b19721dc-8846-492f-a9b0-f42086dfd9e9', 'Sentadilla isometrica', 'Mantener las rodillas a 90 grados y la espalda completamente apoyada contra la pared', '-qXuHrdmk4g', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('2c43bdae-c530-4ae7-a126-ee1e927f7a14', 'Abducción de cadera Acostado con Tobillera', 'Configuración:
Acostado, de manera lateral. 
Flexionar la pierna de base a 90º y mantener la pierna contraria estirada.
Colocar una tobillera en cada pierna. 

Ejecuccion: 
Realizar una abducción lateral, manteniendo la pierna estirada. 
Volver al punto de inicio, contactando el pie con el suelo.', 'n43TRof0MwU', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('c9f392e1-2221-47a6-a187-789dabc65ed8', 'Apertura de hombros c/ banda', NULL, 'k4SJcYp3cuk', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('2fd2a01d-70cd-4313-acc4-c96adbd71038', 'Flexiones de Brazos Cerradas', 'Configuración:
-Ubicar el cuerpo boca abajo con las piernas juntas y estiradas. 
-Ubicar los brazos estirados por dentro de la anchura de los hombros.

Instrucciones:
-Flexionar los codos  en un angulo de 45º, con la intención de llevar el pecho a al suelo. 
-Mantener una línea recta a lo largo de toda la trayectoria de movimiento.', 'Lz1aFtuNvEQ', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('e26cd601-0e6f-4f44-a3a2-07a236f54cad', 'Fondos estrictos con carga', 'Configuración:
-Comenzar con los brazos estirados sobre la barra.
-Sostener el peso entre las piernas o en un cinturón.

Ejecución:
-Iniciar el movimiento empujando los codos hacia atrás.
-Ubicar los hombros debajo de los codos en la parte inferior.
-Descender la cadera por debajo de la barra.', 'QGcbSt4NSC0', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('01ca81d4-8e81-4595-ac5a-59669b51c446', 'Aperturas Planas con Mancuernas', 'Configuracion:
- Acostado boca arriba en un banco plano.
- Apoyo de Gluteo, escapula y pies sobre el suelo.
- Agarrando dos mancuernas, una en cada mano por encima del pecho con los codos estirados.
- Las palmas enfrentadas.

Ejecucion:
- Separar lo brazos, moviendolos en centidos opuestos.
- Durante el recorrido semi-flexionar el codo.
- Abrir los brazos esta alinearse con el tronco.
- Volver a la posicion inicial, juntando los brazos y extendiendo el codo al final.', 'z8juzhSsFKU', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('58fb0ac9-c454-4217-a72b-67e3e942a2a1', 'Sentadilla Copa (Enfocada en Cuádriceps)', 'Configuración:
- Apoyar ambos talones sobre un disco.
- De pie, piernas juntas.
- Manos sosteniendo una pesa rusa. 

Ejecución: 
- Realizar una flexión de rodillas, llevando la cadera hacia atrás.
- Centrar el punto de apoyo en los talones de los pies.
- Llegar a los 90º y volver al punto de inicio.', 'UZvdUM3kBSc', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('ba53fc0a-ff13-4eb5-ae7a-d3d50a15dadd', 'Cruce de polea bajo', NULL, 'nP9KArjEDeU', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('6dee16eb-63e0-4a2b-a10d-32f4f6e6e080', 'Press Frances con Barra EZ en Banco Plano', 'Configuración:
-Ubicarse acostado en un banco plano.
-Piernas al ancho de caderas.
-Brazos estirados por delante del hombro, sosteniendo una barra Z.

Ejecución:
-Flexionar los codos llevándolos a la altura de la frente.
-Volver a la posición inicial, extendiendo los brazos.', 'l3rHYPtMUo8', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('a53f51bf-55b3-4629-a795-1dba2fb9986e', 'Sillon de Cuadriceps', 'Configuración:
- Sentarse sobre el sillón de cuádriceps.
- Pies posicionados por debajo del rodillo con puntas direccionadas hacia arriba.

Ejecución: 
- Realizar una extensión de rodilla y luego regresar al punto de inicio.', 'MpEydcQ1oDw', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('ed06151d-8e3c-405f-ae17-1e955e962439', 'Rotaciones torácicas arrodillado', NULL, 'pvWRd-JinBs', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('3473c3f2-f239-4d69-a62a-d8abb92ff936', 'Plancha Toco Hombro', 'Configuración:
-Ubicar el cuerpo boca abajo en el suelo con los brazos extendidos.
-Piernas al ancho de cadera.
-Manos alineadas con hombros.

Ejecucción:
-Mantener la posición de plancha.
-Quitar un brazo y tocar el hombro contrario al de ejecucción.
-Volver a colocar el apoyo.
-Repetir con el brazo contrario el mismo movimiento.', 'D5bBXAew8Es', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('f2b732c6-623d-4def-ac84-9f6fe940d3a8', 'Press Plano con Barra', 'Configuración:
- Acostarse boca arriba sobre banco plano.
- Puntos de apoyo en pies, glúteos y escapular.
- Agarrar barra mayor al ancho de hombros.

Ejecución:
- Realizar una retracción escapular .
- Sacar barra del soporte.
- Tomar aire y bajar barra direccionada al pecho.
- Codos a 45 grados en movimiento de bajada y subida.
- Levantar la barra hacia el punto de inicio.', 'EsTu2NVM1EI', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('0bdd3b1c-26fe-4c7c-abf7-aa59c486ff43', 'Press Inclinado con Mancuernas', 'Configuración:
Acostarse boca arriba sobre banco plano.
Puntos de apoyo en pies, glúteos y escapular.
Usar una posición de pies amplia con las rodillas hacia afuera.
Ajustar los omóplatos contra el banco.
Comenzar con las mancuernas en línea con el torso y sobre el hombro.

Ejecución:
Bajar las mancuernas a la parte inferior de los pectorales.
Permanecer con los pies en el suelo.
Ajustar los glúteos en contacto con el banco, durante todo el movimiento.
Subir las mancuernas, hasta alinear las mueñcas con los hombros.', 'jMQA3XtJSgo', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('1213e846-0ff9-4750-a129-31a242ef5356', 'Press francés con mancuernas en banco plano', NULL, 'Rn6LgSEPsDc', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('c7521ded-a63c-48fc-a019-f01872eb3f5c', 'Curl Concentrado', 'Configuracion:
-Sentarse en un banco y ubicar el brazo extendido sobre el aductor sosteniendo la mancuerna.
Ejecucion:
-Flexionar el codo elevando la mancuerna hacia la cadera y descender de manera controlada.', 'GnSwYWNgWuk', '{"Biceps"}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('72c7a0d9-3341-4b2a-a987-3de8a62a09a2', 'Extension de triceps barra V', 'Ejercicio para aislar los triceps', 'v7f6PjSAO-4', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('ad020a89-eea0-43ff-abea-bc1fcc47c7fa', 'Mariposa para Hombros Posteriores', 'Configuración:
-Regular el asiento de la máquina de modo que los pies esten en contacto con el suelo.
-Sentarse con el torso apoyado en el respaldo y tomar las manijas de los costados de modo que los codos queden levemente flexionados, utilizando un agarre neutro. 
Ejecución:
- Realizar aperturas laterales de ambos brazos de manera simultánea, de modo que las manos se alineen con los hombros.
-Volver al punto de inicio.', 'VpTc5ACO0Qc', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('14919757-ac5b-4b1b-a00c-13c0e2439178', 'Press militar c/ banda', NULL, '5_hYNIjsSvs', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('b8e0e509-955b-402e-abd8-ae16eade90a5', 'Press Plano con Barra + Pausa (1",2",3")', 'Configuración:
- Acostarse sobre banco plano
- puntos de apoyo en pies, glúteos y escapulas.
- Agarrar la barra al ancho de hombros.
Ejecución:
- Realizar una retracción escapular.
- Sacar la barra del soporte y bajarla direcciona hacia el pecho.
- Aguantar 1,2,3 segundo en el pecho. 
- Volver al punto de inicio.', 'NudCjXj1R2M', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('db7e7fc2-7599-4133-a380-293324b5fd94', 'APERTURA EN MAQUINA', '-Mantene el codo levemente flexionado durante todo el recorrido', 'kUTbYC_8Zg4', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('e979e45c-166c-4d5e-ab2b-26db8f6b9430', 'Press militar en guia', 'Colocar la guia a la altura de nuestras claviculas. Con un banco con espaldar recto, colocarnos bajo la guia y empujar hacia arriba. Descender hasta que la guía vuelva a la posición inicial para finalizar la repetición.', 'ia4NTz2XIQA', '{"Hombro"}', '{"Hombro anterior"}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('943ba0d9-6b8b-4df9-a828-ba7a4a9c23eb', 'Vuelos laterales con mancuernas', 'Ejercicio para aislar la cara media del deltoides.', 'FIQt9pqinXc', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('cd9e0518-3ee7-4b79-a592-125796eaf724', 'Dorsiflexion y movilidad de cadera', 'Ejercicio para la movilidad del tobillo y la cadera', 'mBppBW8mob8', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('7b6143fa-6c2a-45f5-a9be-abd7954160a4', 'Plancha baja + plancha alta', 'Ejercicio de activación', '2sYoLRFTkxQ', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('ed40902f-15c4-4b48-a6ca-8de025514c76', 'Fondos Paralelas Asistido con Maquina', 'Configuración:
Ubicar ambos pies sobre la plataforma, manteniendo las piernas estiradas.
Tomar cada manija con agarre neutro.

Ejecución:
Descender de manera controlada, llevando los codos hacia atrás e inclinando el torso levemente hacia adelante.
Volver al punto de inicio.', 'zQ9ELqwBgAE', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('7277039e-6d8d-4d6f-afcd-ed44b3020fca', 'Press plano con mancuernas', NULL, 'qW519gsE2M8', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('21311af0-704c-41ff-a074-16a956fda259', 'Prensa 45°', 'Configuración:
-Sentado en la máquina, con la cabeza, la espalda, las caderas, y las nalgas presionando por igual contra sus respectivos apoyos almohadillados.
-Si el ángulo del respaldo es ajustable, moverlo
hacia arriba o hacia abajo para que el tronco y las piernas formen un ángulo de 90 grados aproximadamente , con los pies colocados
correctamente sobre su plataforma de apoyo y las rodillas completamente extendidas. 
-Los pies han de estar separados a la anchura entre la cadera y los hombros,
planos sobre la plataforma de apoyo y sus puntas dirigidas ligeramente hacia fuera. 

Ejecucion:
-Agarrar los manillares, y extender  las rodillas para elevar la plataforma.
-Quitar el mecanismo de sujeción de la plataforma de los pies.
-Comenzar flexionando las caderas y las rodillas lenta y controladamente.
-Mantener las caderas y las nalgas presionando contra el asiento y la espalda.

Continuar el movimiento de descenso hasta que se produzca una de estas
cuatro situaciones:
l. Los muslos quedan paralelos con la plataforma de los pies (si se puede
conseguir).
2. Las nalgas pierden contacto con el asiento.
3. Las caderas se separan del almohadillado de la espalda.
4. Los talones se separan de la plataforma de los pies.

-Empujar hacia arriba y controladamente de los pies extendiendo las caderas y las rodillas. 
-Continuar empujando hacia arriba hasta que las rodillas estén estiradas por completo, pero sin bloquearlas forzadamente.', 'yZmx_Ac3880', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('f0ec50f8-cd75-4d67-a66c-7b371f043aee', 'Remo al mentón c/ pesa rusa', NULL, '6iybrrctpjs', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('991f6823-5969-4f2d-afe0-e6b703206936', 'Sentadilla skater facilitada', 'Ejercicio progresivo de fuerza para el tren inferior', 'eCrJf80jyWo', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('c530e026-700b-4a56-ab65-f41c588337e2', 'Facepull parado con soga', 'Configuración:
- De pie, frente a la polea.
- Utilizar la soga agarrándola en pronación con los nudillos enfrentados.
Ejecución:
-Traccionar con los codos hacia atrás.
-Realizar un ajuste escapular.
-Volver a a la posición incial.', '0Po47vvj9g4', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('a36b7410-ba07-4def-ab5d-3069f5b2b2ff', 'Patada de gluteo diagonal', 'Ejercicio para aislar el gluteo medio', '1p1nU8CB98k', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('de50165c-084b-44d6-a57c-21b2d6d1f7ed', 'Extensiones de Espalda a 45°', 'Configuración:
Colocar los pies en la base de un GHD y mantener la columna erguida pero levemente inclinada hacia adelante. 
Ubicar los brazos por encima del pecho y piernas estiradas. 
Ejecución:
Iniciar el movimiento arqueando la espalda y mirando ligeramente hacia abajo.
Volver al punto de inicio.', 'wmB_AETn1fs', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('88152d73-de17-47a1-a635-f3438cea0c24', 'Angelitos acostado', 'Ejercicio de movilidad y activacion de la cintura escapular y los miembros superiores', 'xiaW-3YiYvU', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('3652ccf8-63a6-4b5c-a242-638b3f187011', 'Plancha lateral c/ rotación', 'Configuración: 
Apoyar un antebrazo en contacto con el suelo y mantener ambas piernas estiradas, una por encima de la otra.
Ejecución:
El brazo que ese encuentra estirado en línea con el hombro, llevarlo por debajo del cuerpo.
Volver al punto de inicio.', 'RXlHKL_NEN8', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('64817423-63ce-45a1-a411-44d827c273b5', 'Rotaciones de hombro con disco', 'Ejercicio de resistencia para los hombros', 'ygvnl_u_nnA', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('f339d55c-0dfd-4f32-a75b-b069f2bb5975', 'Remo con barra desde rack', 'Ejercicio de fuerza máxima para los musculos de tracción', 'GXqSFyntKPo', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('476bfb69-21ef-4681-af65-ee8bf9f3990a', 'Estocadas Frontales con Barra', 'Configuración:
-Colocar la barra por encima de los hombros.
-Mantener un agarre frontal. 

Ejecución:
-Caminar hacia adelante, a traves de estocadas. 
-Mantener el torso sobre las caderas en todo momento.', 'nqTPrgqSuTI', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('fbc74266-fca5-41a3-a7fd-75d6482e73d6', 'Dominada al Pecho Supina', 'Configuración:
Colgarse de la barra, con los brazos completamen estirados, sin apoyar los pies sobre el suelo.
Ubicar los brazos ligeramente al ancho superior de hombros y utilizando un agarre supino.
Ejecución:
Realizar con potencia un tirón de brazos, el pecho debe tocar la barra.
Los pies deben mantenerse al ancho de caderas, sin abrirse en exceso.
Volver al punto de inicio.', 'kwdx1Kk-RDc', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('84d87480-deea-4d89-ad9e-b2d0230154ea', 'Pullover en polea alta', 'Ejercicio para los dorsales', '5cqIDziQ5Ko', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('65200d67-f176-45a0-aaca-f067d5257196', 'Curl 45°', 'Recostarse en un banco inclinado a 45° y dejar los brazos colgando a los costados para luego subir ambos hacia los hombros', 'aTYlqC_JacQ', '{"Biceps"}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('7a38528b-9b84-4025-afe5-89570f647c73', 'Rotaciones toracicas en Cuadripedia', 'Configuración:
-Colocar las manos, pies y rodillas en contacto con el suelo
-Comenzar con los brazos extendidos.
-Ubicar las rodillas alineadas con la cadera y los pies alineados con las rodillas.
-No muever las caderas durante el movimiento. 

Ejecución:
-Colocar una mano contra la oreja.
-Deje caer ese codo debajo del tronco, apuntando al espacio debajo de la axila opuesta.
-Regresar a la posición inicial y continuar levantando el codo lo más alto posible.
-No mover las caderas durante todo el movimiento.', 's-lZ6VfElPo', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('357e1785-c4af-4271-a03c-d561ffd51c3e', 'Press militar parado con barra', 'Con la barra colocada sobre nuestro pecho superior, tomar aire y apretar el abdomen. Empujar en linea vertical, evitando que la barra vaya hacia delante. Una vez la barra este arriba, debemos descenderla nuevamente hasta la posición inicial.', 'BjmI3A5_hWs', '{"Hombro"}', '{"Hombro anterior"}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('b3a04a0b-91b0-4366-a359-0131acd6c084', 'Sentadilla sumo c/ barra', NULL, 'g2FBW50XRUg', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('0de62cb9-7f0d-406b-ac00-c6a1ef6f966c', 'Extension de Triceps Supino a un Brazo en Polea', 'Configuración:
- De pie, al frente de una polea. Ubicar el agarre en la parte superior.
- Utilizar un agarre unilateral con toma supina y flexionar el codo a 90º.

Ejecucción:
-Realizar una extensión unilateral,  llevando la mano a la altura de la cadera.
- Evitar despegar el codo cerca del cuerpo o balancearse.
- Volver al punto de inicio.
- Realizar las repeticiones estipuladas y cambiar de brazo.', '8EmiPnxZS4M', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('730a60f0-49ac-4384-acf7-9d4e2f4443c9', 'Sentadilla bulgara 90° con barra', 'Configuración:
-Ubicar una barra en un rack o jaula.
-Colocar la barra en la parte superior de los trapecios.
-Brazos por fuera de los hombros.
-Realizar un ajuste escapular. 
-Una pierna da un paso largo hacia adelante al ancho de la cadera.
-Pie trasero va encima de un soporte o banco plano. 

Ejecución:
-Descender hasta que la rodilla trasera toque el suelo.
-Descender con el torso recto. 
-Mantener el talón en contacto con el suelo durante todo el movimiento.
-Volver a subir hasta extender completamente la cadera.', 'IJkhxApUqP4', '{"Cuadriceps"}', '{"Glúteos"}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('0342ef22-9092-4b15-adbf-6da9f445e82c', 'Rotaciones Dorsales', 'Configuración: 
En posición de cuadrupedia, manos estiradas al ancho de hombros en contacto con el suelo.
Cabeza en línea con la columna.
Ejecución:
Realizar una rotación interna, de modo que un brazo estirado se ubique por debajo del hombro contario.
El mismo brazo debe contactar con la colchenta.
Luego realizar una rotación externa. 
Volver al punto de inicio.', 'ds3umIYJDrE', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('67947c59-3dec-4e04-ad24-0de994173179', 'Almeja isometrica con banda', 'Ejercicio de activación del gluteo medio', 'kTRkqjbKHGw', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('c0aaba94-49f3-4fe6-a36d-4ee942058882', 'Sentadilla Paralela Barra Baja al Cajon', 'Configuración:
-Ubicar un banco plano o cajón  cerca de nuestro cuerpo
-Colocar la barra en un rack o jaula de potencia justo por debajo de los hombros.
-Ubicar la barra por debajo del deltoides posterior. 
-Sujetar con ambas manos a cada lado.
-Pies al ancho de caderas.
-Posición inicial del torso, levemente inclinado hacia adelante. 

Ejecución: 
-Tomar la barra ubicada en el rack o jaula de potencia.
-Colocar las piernas al ancho de caderas, con los dedos de los pies apuntando ligeramente hacia afuera.
-Bajar la barra hasta llegar a sentarse en el cajón. 
-Volver a la posición inicial de manera controlada.', 'Rffukx_0--0', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('608a25d1-0532-4acb-a633-5cc6ef1b0ae0', 'Dominada isométrica', NULL, 'bjGe73KUJWo', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('7eeb358c-e230-4a46-abf2-a6526fc6dd2f', 'Camilla de Isquios', 'Configuración: 
- Acostado sobre la camilla de isquiotibiales.
- Talones ubicados por debajo del rodillo. 

Ejecución: 
- Realizar una flexión de rodilla, luego volver al punto de inicio.', 'SiwJ_T62l9c', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('b182cdf4-c36a-4a93-a855-b1bb1e93d1de', 'Remo gorila', 'Ejercicio de fuerza para los musculos de la espalda', 'eIM8d32x2Go', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('b62de09b-26a9-4fe7-a1ef-30a61f725d58', 'Sentadilla bulgara 45° con mancuernas', 'Configuración:
-Sostener una mancuerna en cada mano.
-Los brazos permanecen rectos a los lados.
-Una pierna da un paso largo hacia adelante al ancho de la cadera.
-El pie trasero va encima del soporte.

Ejecución:
-Descender hasta que la rodilla trasera toque el suelo o el pliegue de la cadera quede por debajo de la rodilla.
-Mantener el talón en contacto con el suelo durante todo el movimiento.
-Volver a subir hasta extender completamente la cadera.', 'MGh5po3i5cE', '{"Isquio"}', '{"Glúteos"}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('75b64ec7-ba2d-4924-a6f0-37cbabe2fdaf', 'Sillon de cuadriceps unilateral', 'Ejercicio de fuerza para el cuadriceps', 'OhHvfoomEfY', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('fc5cbe0e-68a0-441f-ad3f-6e422a33c560', 'Flexiones de Brazos con Discos', 'Configuración:
-Ubicar el cuerpo boca abajo con las piernas juntas y estiradas. 
-Ubicar los brazos estirados a la altura de los hombros, sobre un superficie elevada. Mientras mayor inclinación, menor dificultad de ejecucción. 

Instrucciones:
-Flexionar los codos en un angulo de 45º, con la intención de llevar el pecho a la superficie seleccionada. 
-Una vez completado el rango de moviemiento, extender los codos. 
-Mantener una línea recta a lo largo de toda la trayectoria de movimiento.', 'KadL9HpmWSg', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('0a2c2da5-3f3d-4e25-a800-e1fcce32a646', 'Fondos con pausa', 'Ejercicio para los pectorales y triceps', 'WBQqSX1vy3A', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('c5d56949-3a06-4168-a087-9ea2e8bceafb', 'Sentadilla con Barra', 'Configuración:
-Colocar la barra en un rack o jaula de potencia justo por debajo de los hombros.
-Ubicar la barra en la parte superior de los omoplatos. 
-Sujetar con ambas manos a cada lado.
-Pies al ancho de caderas.

Ejecución: 
-Alejarse del soporte del rack o jaula.
-Colocar las piernas al ancho de caderas, con los dedos de los pies apuntando ligeramente hacia afuera.
-Bajar la barra hasta llegar a la posición de cuclillas.
-Volver a la posición inicial de manera controlada.', 'rrJIyZGlK8c', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('81707c19-53dd-4f84-a9f2-dc88cdc057cb', 'Step Up Contralateral', NULL, '7kf18bICPUM', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('15892e3e-1567-433d-ad74-dc6cf9adc272', 'Abdominales Acostado con Disco', 'Configuración:
Acostado en una colchoneta, con las piernas al ancho de caderas.
Tomar un disco con los brazos estirados entre ambas manos.

Ejecución:
Elevar el torso hacia adelante, manteniendo la espalda erguida. 
Volver al punto de inicio de manera controlada, apoyando la espalda baja primero.', 'y-BkLY8jyuw', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('050c8756-5f7f-4cc9-a323-3aeae589c753', 'Russian Twist c/ Mancuerna', NULL, 'Tau0hsW8iR0', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('0c9d22aa-370c-41a4-a781-2b79c714cd62', 'Caminata Lateral en Sentadilla', 'Configuración:
Piernas flexionadas a 90º, al ancho de caderas.
Brazos al costado del cuerpo o juntos. 

Ejecución:
Realizar pasos laterales ampliando el ancho de caderas, manteniendo la posición de sentadilla. 
Volver al punto de inicio.', 'g78CxAtjkCE', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('90076515-125a-4b30-a030-98748a900baa', 'Plancha Frontal desplazando Elemento', 'Configuración:
-Ubicar el cuerpo boca abajo con los brazos estirados.
-Colocar una sola mancuerna de peso ligero/moderado a su lado.

Ejecución:
-Alinear hombros, caderas,  rodillas y talones  en línea recta.
-Comenzar con una mancuerna en el lado derecho del cuerpo.
-Con la mano izquierda, agarrar la mancuerna.
-Colocar la mancuerna del lado izquierdo y volver a la posición de plancha.
-Ahora realizar el mismo movimiento en el lado opuesto.', 'aFrXv1bdioY', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('3beb9f1d-351f-4437-a83a-3d67637848fe', 'Hip thrust en maquina', 'Ejercicio de hipertrofia para la cadena posterior', 'Xk8ZEl4i_O8', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('7d4702d4-35ae-47b8-a737-c6c00b78d5de', 'Peso Muerto Rumano a una Pierna con Manc.', 'Configuración:
-Mantener las mancuernas cerca del cuerpo.
-Comenzar con el apoyo de un solo pie, con las mancuernas en ambas manos.

Ejecución:
-Realizar una flexión de cadera, y por ende, ir flexionando la rodilla de base levemente. 
-La pierna contraria se mantiene recta, acompañando el movimiento de la cadera.
-Bajar las mancuernas pegadas al cuerpo.
-Mantener la columna neutra. 
-Regresar extendiendo la cadera.
-Completar las repeticiones estipuladas y cambiar de pierna.', 'PHZ-RBb8KYc', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('d514bf7c-c4c5-4a26-a153-b20cd4ca017f', 'Patada de gluteo lateral en polea', 'Configuración: 
- De pie, posicionado de costado a la polea.
- Tobillera puesta en la pierna que va a ejecutar el movimiento.
- Pierna de apoyo por delante de la que va a realizar el movimiento.
- Brazos teniendo un apoyo sobre soporte de la polea

Ejecución: 
- Realizar una patada lateral hacia el costado contrario a la polea.
- Volver al punto de inicio.', 'vSqhrbzZb7A', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('c6a5debf-dc7b-4d33-a607-05658a33008b', 'Despliegue c/ rueda abdominal', 'Configuración:
Boca abajo, con el apoyo de ambas rodillas flexionadas.
Comenzar con las manos estiradas sosteniendo la rueda abdominal.
La espalda lumbar se encuentra redondeada. 
Ejecución:
Rolar la rueda hacia adelante, de modo que nuestra espalda pueda seguir manteniendo la misma curva, hasta contactar el pecho con el suelo.
Volver a la posición de inicio.', 'DA2QGI0NPWU', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('16ca8589-d145-475a-a3f6-b37e7cbb71fd', 'Sentadilla Aerea', 'Configuración:
-Pies al ancho de caderas.
-Puntas de los pies levemente hacia afuera.
-Brazos estirados hacia el frente.

Ejecución:
-Bajar hasta llegar a la posición de cuclillas.
-Volver a la posición inicial de manera controlada.', 'hOzIP_sDfU0', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('a0da644a-198d-4b0f-a286-56efcd318e13', 'Remo Inclinado Agarre Prono con Barra', 'Configuracion:
-Los pies a la ancho de los hombros, hacer peso muerto con la barra para iniciar el ejercicio.
-Mantenga ambas manos en un agarre prono (las palmas hacia el cuerpo) con las manos mayor al ancho de los hombros.
-Mantener la espalda baja plana.

Ejecución:
-Bisagra en la cadera, desplazando las caderas hacia atrás.
-Continuar hasta que el pecho quede en frente al suelo o paralelo.
-Tirar de los codos hacia atrás y juntos hasta que la barra llegue a la parte superior de los abdominales o boca del estomago.
-Volver a la posición inicial.', 'GIqICKwpUHw', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('3b1647e1-5771-4b74-aaf3-5c72df77affd', 'Remo unilateral con Giro de Torso', 'Ejecución:
Utilizar un banco plano para apoyar un brazo y una pierna del mismo lado.
Pierna contraria estirada, y brazo estirado con una mancuerna.

Configuración:
Llevar un brazo hacia atrás a la altura del pectoral.
Rotar levemente el torso.
Volver a la posición inicial.', 'OJqzswBViq0', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('582fc07a-e7e0-4366-aa3b-93ff2f6b3a6e', 'Estocadas Isometricas', 'Configuración:
- De pie, al ancho de caderas.

Ejecución:
- Realizar un paso hacia adelante y flexionar una rodilla a 90 grados.
-Pierna de atrás en la misma posición. 
- Mantener la cantidad de segundos estipulados. 
-Alternar de pierna.', '869fS-uDgz0', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('77d7856b-6957-4ac3-a46c-fbfdacdd51b9', 'Sentadilla + bisagra', 'Ejercicio de movilidad para tren inferior', 'TMjo01fOESs', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('a68fe779-de36-4690-af14-366be05f62c7', 'Sentadilla Frontal agarre cruzado', 'Configuración:
-Colocar la barra en un rack o jaula de potencia justo por debajo de los hombros.
-Apoyar la barra en los hombros, con los brazos cruzados. 
-Codos altos.
-Agarre desde la punta de los dedos.
-De pie, al ancho de caderas.

Ejecución:
-Alejarse del soporte del rack o jaula.
-Colocar las piernas al ancho de las caderas, con los dedos de los pies apuntando ligeramente hacia afuera.
-Bajar la barra hasta llegar a la posición de cuclillas.
-Volver a la posición inicial de manera controlada.', 'Ceh8f8pIeKY', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('d1558a7b-c764-4e2e-ac0f-91d4d347f3f7', 'Sentadilla lateral', 'Ejercicio de fuerza para el tren inferior', 'XRT7wdEqJ1I', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('4ce4faee-0b2b-43b7-acc8-95838b4c9e97', 'Aduccion en maquina', 'En maquina para aducción, buscar juntar las piernas focalizando el trabajo en aductores', 'd5DW2sBKxog', '{"Aductores"}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('bcbac147-2a78-4063-a6af-f2386f2f06b3', 'Movilidad de tobillo en sentadilla', 'Ejercicio de movilidad para el tren inferior', 'weC9PRj6n3U', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('2c2c63b9-5ebe-4128-a543-a82360a9ccbb', 'Sentadilla frontal con mochila', NULL, 'Pgj8OXPRHjA', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('d6b0e0d9-5d7e-46f6-a369-c10370bcfd82', 'Flexiones de brazos', 'Configuración:
-Ubicar el cuerpo boca abajo con la rodillas apoyadas en el suelo y las piernas juntas. 
-Ubicar los brazos estirados a la altura de los hombros, cerca del cuerpo.

Instrucciones:
-Flexionar los codos en un angulo de 45º, con la intención de llevar el pecho al suelo.
-Completar el rango total de movimiento, o llegar a los 90º, 
-Extender los codos. 
-Mantener una línea recta a lo largo de toda la trayectoria de movimiento.', 'JhFCg91vXR0', '{"Pecho"}', '{"Hombro anterior","Triceps"}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('8f58bf34-3e36-40d6-af71-8a72b35f2d70', 'Sentadilla Bulgara con Peso Corporal', 'Configuración:
-Los brazos permanecen rectos a los lados.
-Una pierna da un paso largo hacia adelante al ancho de la cadera.
-El pie trasero va encima del soporte.

Ejecución:
-Descender hasta que la rodilla trasera toque el suelo o el pliegue de la cadera quede por debajo de la rodilla.
-Mantener el talón en contacto con el suelo durante todo el movimiento.
-Volver a subir hasta extender completamente la cadera.', 'kBQ1krvKFBU', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('bfb24d47-2238-46ed-a6d7-84d0688e4d91', 'Remo al Mentón+ Press de Hombro c/ Banda', 'Configuración: 
De pie, al ancho de caderas.
Ubicar una banda circular de tensión baja, en el soporte inferior de una columna.
Colocar las manos al ancho de hombros.
Ejecución:
Realizar una tracción llevando ambos codos hacia atrás y luego realizando un press por encima de la cabeza. 
Volver al punto de inicio.', 'YE70G9abE98', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('da13c7ce-3660-4344-ada1-9e4fa2735c30', 'Abdominales acordeón', NULL, 'rBihuuvVMaM', '{}', '{}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();
INSERT INTO public.ejercicios (id, nombre, comentario, url_video, musculos_principales, musculos_secundarios, creado_por)
VALUES ('208d5c64-957b-4fcf-ab4c-08c22ac26453', 'Plancha 4 apoyos', NULL, 'tdQL8yQ6fQE', '{"Recto abdominal"}', '{"Lumbares"}', '20685bca-6304-4e55-abba-37a1cf8f6113')
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario, url_video = EXCLUDED.url_video, musculos_principales = EXCLUDED.musculos_principales, musculos_secundarios = EXCLUDED.musculos_secundarios, updated_at = now();

-- 3. Creación Silenciosa de Alumnos en auth.users y public.perfiles
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno1@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Celeste Gerardi","sexo":"F","peso_corporal_kg":58.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7', 'alumno1@gozster.local', 'Celeste Gerardi', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 58.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '299665bc-7349-4c9d-a937-fcd0bed437bf', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno2@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Esteban Papic","sexo":"M","peso_corporal_kg":80.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('299665bc-7349-4c9d-a937-fcd0bed437bf', 'alumno2@gozster.local', 'Esteban Papic', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'M', 80.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '0a7a4dfd-e040-4b92-ac29-9507cbb13215', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno3@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Gabriel Sanchez","sexo":"M","peso_corporal_kg":75.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('0a7a4dfd-e040-4b92-ac29-9507cbb13215', 'alumno3@gozster.local', 'Gabriel Sanchez', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'M', 75.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '9015b7d8-7118-4912-aa01-0fb6e62848c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno4@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Michelle Roach","sexo":"F","peso_corporal_kg":60.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('9015b7d8-7118-4912-aa01-0fb6e62848c6', 'alumno4@gozster.local', 'Michelle Roach', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 60.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '41d387a0-04e0-4b33-a47b-2bda95f53019', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno5@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Oriana Bongiovanni","sexo":"F","peso_corporal_kg":57.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('41d387a0-04e0-4b33-a47b-2bda95f53019', 'alumno5@gozster.local', 'Oriana Bongiovanni', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 57.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'b952505b-3695-4daf-acf5-7f99b7844666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno6@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Miguel Sanchez","sexo":"M","peso_corporal_kg":74.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('b952505b-3695-4daf-acf5-7f99b7844666', 'alumno6@gozster.local', 'Miguel Sanchez', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'M', 74.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '8f7949b8-49df-4f85-a4ff-c314e631eb11', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno7@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Agustin Artero","sexo":"M","peso_corporal_kg":82.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('8f7949b8-49df-4f85-a4ff-c314e631eb11', 'alumno7@gozster.local', 'Agustin Artero', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'M', 82.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'bf34698b-114e-45ef-a97d-98396704cf8e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno8@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Camila Rosaschi","sexo":"F","peso_corporal_kg":54.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('bf34698b-114e-45ef-a97d-98396704cf8e', 'alumno8@gozster.local', 'Camila Rosaschi', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 54.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '97114142-d446-430e-a3eb-53c7960a670f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno9@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Agustin Scarafioca","sexo":"M","peso_corporal_kg":85.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('97114142-d446-430e-a3eb-53c7960a670f', 'alumno9@gozster.local', 'Agustin Scarafioca', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'M', 85.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'effe6558-3937-479d-ae4c-6253c728b365', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno10@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Olivia Scarafioca","sexo":"F","peso_corporal_kg":53.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('effe6558-3937-479d-ae4c-6253c728b365', 'alumno10@gozster.local', 'Olivia Scarafioca', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 53.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'f45d21ae-ad2a-4a8a-ac28-a6080cc87000', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno11@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Camila Maza","sexo":"F","peso_corporal_kg":56.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('f45d21ae-ad2a-4a8a-ac28-a6080cc87000', 'alumno11@gozster.local', 'Camila Maza', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 56.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '1b9075d0-e34f-46ce-af26-556912be9436', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno12@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Romina Villalba","sexo":"F","peso_corporal_kg":59.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('1b9075d0-e34f-46ce-af26-556912be9436', 'alumno12@gozster.local', 'Romina Villalba', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 59.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'd957443f-674a-46da-a6b1-40cf367f40ad', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'alumno13@gozster.local', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Kiki Fernandez","sexo":"F","peso_corporal_kg":61.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('d957443f-674a-46da-a6b1-40cf367f40ad', 'alumno13@gozster.local', 'Kiki Fernandez', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 61.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'e8b1a08c-3430-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'camila.navarro@ficticio.ar', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"nombre_completo":"Camila Navarro","sexo":"F","peso_corporal_kg":55.0}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
VALUES ('e8b1a08c-3430-4000-8000-000000000008', 'camila.navarro@ficticio.ar', 'Camila Navarro', 'ALUMNO', 'ACTIVA', '20685bca-6304-4e55-abba-37a1cf8f6113', 'F', 55.0)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = EXCLUDED.profesor_asignado_id, sexo = EXCLUDED.sexo, peso_corporal_kg = EXCLUDED.peso_corporal_kg, updated_at = now();

-- 4. Planes de Entrenamiento
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('a71c2d01-3dbe-4030-a984-6c015cd297e4', '20685bca-6304-4e55-abba-37a1cf8f6113', 'f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7', 'CELES AGOSTO V.2', 'ACTIVO', 'RECOMENDACIONES:
-El RPE (escala del esfuerzo percibido) como su nombre indica es una escala subjetiva del esfuerzo que refiere el ejercicio, se mide del 1 al 10 donde el número 1 seria algo de minima dificultad y el número 10 algo de máxima dificultad.
-Las "superseries" indican que realices todos los ejercicios que la componen de manera seguida uno detras del otro, pudiendo descansar al finalizar el ultimo.
-Los descansos pueden ser de 45'''' a 1'' 30''''', '2026-09-19T03:01:00+0000', '2026-10-19T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('c664e439-ec25-41e2-ac59-6468e4bb41e9', '20685bca-6304-4e55-abba-37a1cf8f6113', '299665bc-7349-4c9d-a937-fcd0bed437bf', 'TEFI AGOSTO', 'ACTIVO', 'RECOMENDACIONES: -El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar. 
-Los descansos entre series y ejercicios pueden ser de 1 a 3 minutos dependiendo lo que tardes en recuperarte. 
-Los ejercicios que presentan sus repeticiones de forma descendente (10-8-6) tienen como objetivo que aumentes el peso utilizado, a menos repeticiones mayor peso.', '2026-09-24T03:01:00+0000', '2026-10-24T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('cab4ad3d-8595-47be-a220-6dc52117048e', '20685bca-6304-4e55-abba-37a1cf8f6113', '0a7a4dfd-e040-4b92-ac29-9507cbb13215', 'GABI AGOSTO', 'ACTIVO', 'RECOMENDACIONES: 
-El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar. 
-Los descansos entre series y ejercicios pueden ser de 1 a 3 minutos.', '2026-09-25T03:01:00+0000', '2026-10-25T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('e75708d4-5548-474f-aa57-3dd0f05bad23', '20685bca-6304-4e55-abba-37a1cf8f6113', '9015b7d8-7118-4912-aa01-0fb6e62848c6', 'MICHELLE SEPTIEMBRE', 'ACTIVO', 'RECOMENDACIONES: -El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar.
- Los descansos entre series pueden ir de 3 a 5 minutos', '2026-09-27T03:01:00+0000', '2026-10-27T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('9a5e101e-6493-4c77-a011-9c46ca4366c9', '20685bca-6304-4e55-abba-37a1cf8f6113', '41d387a0-04e0-4b33-a47b-2bda95f53019', 'ORI 2 DÍAS', 'ACTIVO', 'RECOMENDACIONES: 
-El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar. 
-Los descansos entre series y ejercicios del bloque de fuerza pueden ser de 2 a 5 minutos.
-Los ejercicios que presentan sus repeticiones de forma descendente (10-8-6) tienen como objetivo que aumentes el peso utilizado, a menos repeticiones mayor peso. 
- En la máquina de fondos, el peso funciona como asistencia: A mayor peso, más asistencia y menor dificultad', '2026-09-30T03:01:00+0000', '2026-10-30T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('a9dfcbce-2457-4e0d-ac3f-effea124c6d4', '20685bca-6304-4e55-abba-37a1cf8f6113', 'b952505b-3695-4daf-acf5-7f99b7844666', 'FUERZA MIGUE', 'ACTIVO', 'RECOMENDACIONES: 
-El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar. -Los descansos entre series y ejercicios pueden ser de 1 a 3 minutos dependiendo lo que tardes en recuperarte. -Los ejercicios que presentan sus repeticiones de forma descendente (10-8-6) tienen como objetivo que aumentes el peso utilizado, a menos repeticiones mayor peso.', '2026-10-02T03:01:00+0000', '2026-11-02T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('dcdd2aef-47be-40ec-a431-f09906839372', '20685bca-6304-4e55-abba-37a1cf8f6113', '8f7949b8-49df-4f85-a4ff-c314e631eb11', 'A. ARTERO SEPTIEMBRE', 'ACTIVO', 'RECOMENDACIONES:
-"Super serie" refiere a realizar ambos ejercicios consecutivamente sin descanso, solo se descansa entre series.
 -El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sentis esfuerzo, y 10 es el máximo que podes dar. 
-Los descansos entre series y ejercicios pueden ser de 1 a 3 minutos.', '2026-10-06T03:01:00+0000', '2026-11-06T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('993c7f08-e9da-4d10-a503-e7417b7fd296', '20685bca-6304-4e55-abba-37a1cf8f6113', 'bf34698b-114e-45ef-a97d-98396704cf8e', 'ESTABILIZACIÓN V.3', 'ACTIVO', 'RECOMENDACIONES:
-El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sentis durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar.
-Puede que haya dolor o molestia mantenelo en un umbral bajo, por eso los ejercicios unilaterales ajusta el peso dependiendo de la pierna asi le generamos resistencia a cada pierna en base a sus posibilidades.', '2026-10-06T03:01:00+0000', '2026-11-06T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('032594a9-4a78-49ba-a75c-5ff28478c2d6', '20685bca-6304-4e55-abba-37a1cf8f6113', '97114142-d446-430e-a3eb-53c7960a670f', 'A.SCARAFIOCA AGOSTO', 'ACTIVO', 'RECOMENDACIONES: -El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar. 
-Los descansos entre series y ejercicios pueden ser de 1 a 3 minutos dependiendo lo que tardes en recuperarte. 
-Los ejercicios que presentan sus repeticiones de forma descendente (10-8-6) tienen como objetivo que aumentes el peso utilizado, a menos repeticiones mayor peso.', '2026-10-11T03:01:00+0000', '2026-11-11T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('d564bc92-ad8a-4330-ac64-e990d2036bd2', '20685bca-6304-4e55-abba-37a1cf8f6113', 'effe6558-3937-479d-ae4c-6253c728b365', 'OLIVIA AGOSTO', 'ACTIVO', 'RECOMENDACIONES:
-El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar. 
-Los descansos entre series y ejercicios pueden ser de 1 a 3 minutos dependiendo lo que tardes en recuperarte. 
-Los ejercicios que presentan sus repeticiones de forma descendente (10-8-6) tienen como objetivo que aumentes el peso utilizado, a menos repeticiones mayor peso.', '2026-10-11T03:01:00+0000', '2026-11-11T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('1fe02d16-6f60-4584-a9d0-14d369ef3b56', '20685bca-6304-4e55-abba-37a1cf8f6113', 'f45d21ae-ad2a-4a8a-ac28-a6080cc87000', 'CAMI MAZA OCTUBRE', 'ACTIVO', 'RECOMENDACIONES: 
-El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar. -Los descansos entre series y ejercicios pueden ser de 1 a 3 minutos dependiendo lo que tardes en recuperarte. -Los ejercicios que presentan sus repeticiones de forma descendente (10-8-6) tienen como objetivo que aumentes el peso utilizado, a menos repeticiones mayor peso.', '2026-10-14T03:01:00+0000', '2026-11-14T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('b873d962-6b90-4f6a-ad0f-fb8e3570d8be', '20685bca-6304-4e55-abba-37a1cf8f6113', '1b9075d0-e34f-46ce-af26-556912be9436', 'FUERZA ROMI', 'ACTIVO', 'RECOMENDACIONES:
-El RPE (Radio de esfuerzo percibido) es una escala que mide el esfuerzo físico que sientes durante una actividad. Va del 1 al 10, donde 1 significa que casi no sientes esfuerzo, y 10 es el máximo que podes dar. 
-Los descansos entre series y ejercicios del bloque de fuerza pueden ser de 1 a 3 minutos. 
-Los ejercicios que presentan sus repeticiones de forma descendente (10-8-6) tienen como objetivo que aumentes el peso utilizado, a menos repeticiones mayor peso.
-"DROP-SET" refiere a realizar la primer serie al fallo, reducir el peso y continuar con la segunda tambien al fallo, repitiendo el ciclo hasta terminar las series indicadas.
-"Superserie" refiere a que realices ambos ejercicios consecutivamente sin descanso.', '2026-10-14T03:01:00+0000', '2026-11-14T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios, fecha_inicio, fecha_fin)
VALUES ('4ebc61af-6f71-4b04-a859-016c06e3718b', '20685bca-6304-4e55-abba-37a1cf8f6113', 'd957443f-674a-46da-a6b1-40cf367f40ad', 'KIKI FER SEPTIEMBRE', 'ACTIVO', 'RECOMENDACIONES:
-El RPE (escala del esfuerzo percibido) como su nombre indica es una escala subjetiva del esfuerzo que refiere el ejercicio, se mide del 1 al 10 donde el número 1 seria algo de minima dificultad y el número 10 algo de máxima dificultad.
-Las "superseries" indican que realices todos los ejercicios que la componen de manera seguida uno detras del otro, pudiendo descansar al finalizar el ultimo.
-Los descansos pueden ser de 45'''' a 1'' 30''''', '2026-10-16T03:01:00+0000', '2026-11-16T02:59:00+0000')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, estado = 'ACTIVO', comentarios = EXCLUDED.comentarios, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, updated_at = now();

-- 5. Días de Rutina (Bloques)
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('52a5d867-5f37-4256-a952-9a122c667c0d', 'a71c2d01-3dbe-4030-a984-6c015cd297e4', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('086d14b0-262e-4efd-ae56-cd7f1210b10e', 'a71c2d01-3dbe-4030-a984-6c015cd297e4', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('e64710ad-a24f-4901-ae81-1563285e59f4', 'c664e439-ec25-41e2-ac59-6468e4bb41e9', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('67684253-e3f4-43d6-a4e4-f931520fe866', 'c664e439-ec25-41e2-ac59-6468e4bb41e9', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('d0276837-4fe4-418f-a3e2-841cc9a865e5', 'cab4ad3d-8595-47be-a220-6dc52117048e', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('0839bec2-f325-46b2-aa49-5164b3b6290d', 'cab4ad3d-8595-47be-a220-6dc52117048e', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('1cc9386f-71e7-4aa7-a64c-46e8ba442f2b', 'e75708d4-5548-474f-aa57-3dd0f05bad23', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('6b677760-3a0f-44bf-a6f5-e246a58a3b8a', 'e75708d4-5548-474f-aa57-3dd0f05bad23', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('8bdca85c-9d01-4493-ae72-69eaf3451ba1', '9a5e101e-6493-4c77-a011-9c46ca4366c9', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('ec97829f-c49d-41de-aefb-210fc4da3069', '9a5e101e-6493-4c77-a011-9c46ca4366c9', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('015961ac-fe88-4e7b-ad62-b4545285db12', '9a5e101e-6493-4c77-a011-9c46ca4366c9', 'CORE', 3)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('c03e88d4-a2e4-4ae7-af49-69243dcaa582', 'a9dfcbce-2457-4e0d-ac3f-effea124c6d4', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('29999d21-d9b4-4c31-a569-b9adc075515f', 'a9dfcbce-2457-4e0d-ac3f-effea124c6d4', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('a82a4edf-10c4-4184-a7e0-b74f6b682a50', 'dcdd2aef-47be-40ec-a431-f09906839372', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('f2f8d71a-a197-4489-a813-f1d7e8d37060', 'dcdd2aef-47be-40ec-a431-f09906839372', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('ee9b12cb-2438-4852-a02f-7fd2d7ed5360', '993c7f08-e9da-4d10-a503-e7417b7fd296', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('70e23a83-9914-4ac5-a4a7-63ae1b0f4b22', '993c7f08-e9da-4d10-a503-e7417b7fd296', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('7917e71d-c0d3-4ee0-a169-9436209b2a74', '032594a9-4a78-49ba-a75c-5ff28478c2d6', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('5a885575-913d-40de-aee6-19bd97fee277', '032594a9-4a78-49ba-a75c-5ff28478c2d6', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('c3dd1290-fa63-4a62-aae2-239025dc0bbf', '032594a9-4a78-49ba-a75c-5ff28478c2d6', 'ABS', 3)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('f4df62f2-8313-46c1-a928-6d4633adddf6', 'd564bc92-ad8a-4330-ac64-e990d2036bd2', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('6a2b34be-eb25-4021-a9dd-556279c00838', 'd564bc92-ad8a-4330-ac64-e990d2036bd2', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('e2b6000b-8941-458b-ab2e-ffd1c8e9616e', 'd564bc92-ad8a-4330-ac64-e990d2036bd2', 'ZONA MEDIA', 3)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('b2d847d2-4300-4b8d-a55d-d29caa26771f', '1fe02d16-6f60-4584-a9d0-14d369ef3b56', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('0e039540-485c-47f6-a1bc-208b3077f0ec', '1fe02d16-6f60-4584-a9d0-14d369ef3b56', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('e5b976aa-fab7-4ac2-adfb-bb7b187d69ae', 'b873d962-6b90-4f6a-ad0f-fb8e3570d8be', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('7dad1990-5fa4-4376-ad02-e45126b0a247', 'b873d962-6b90-4f6a-ad0f-fb8e3570d8be', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('ab8a92d9-de53-4512-a595-e98efcfa5cc4', '4ebc61af-6f71-4b04-a859-016c06e3718b', 'WARM UP', 1)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES ('b8bcbf2d-912f-4427-ac6e-b7b002a4cce9', '4ebc61af-6f71-4b04-a859-016c06e3718b', 'PRINCIPAL', 2)
ON CONFLICT (plan_id, orden) DO UPDATE SET
  nombre = EXCLUDED.nombre, updated_at = now();

-- 6. Ejercicios en Rutina (incluyendo Superseries)
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('e3d8fbff-49ab-42fc-aabb-34a1e104b9a2', '52a5d867-5f37-4256-a952-9a122c667c0d', '55ddab2b-3449-41af-a04d-1f5ce33ad7d6', 1, 2, '4', 90, 5, 'Movilidad de cadera', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('4378d6d3-7117-4db7-a97c-7119b264de3d', '52a5d867-5f37-4256-a952-9a122c667c0d', 'f5190986-2dcc-40b4-a22a-2bd1fda33de9', 2, 2, '6', 90, 5, 'Activacion de cadena posterior', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('1ac28f97-2a4e-4785-ad4d-c10aced6fc95', '52a5d867-5f37-4256-a952-9a122c667c0d', '43b309bb-72bd-4728-a9cb-c34489cc859d', 3, 2, '8', 90, 6, '-Ubicar los pies al ancho de los hombros con las puntas ligeramente hacia afuera
-Al comenzar el descenso las rodillas deben seguir las puntas de los pies
-Hacer una leve pausa cuando se llega a la silla sin relajar el cuerpo', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('6ba8fe69-865e-40a9-a165-af9575824948', '086d14b0-262e-4efd-ae56-cd7f1210b10e', 'b23e4443-f2b8-4122-ad2a-c551ad7446bd', 1, 4, '6', 90, 8, 'Ejercicio de fuerza para el tren inferior', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('cb0b758e-036c-42ec-ab32-546c1e34d459', '086d14b0-262e-4efd-ae56-cd7f1210b10e', '54661849-67ec-48f1-a90e-c37522f0e7af', 2, 4, '10', 90, 7, 'Configuración:
-Acostarse en el suelo, mirando hacia arriba. 
-Una rodilla flexionada y la otra semi-estirada, con los pies apoyados en el piso.
-Mantener el contacto con los hombros en el suelo en todo momento.

Ejecución:
-Elevar la cadera, de modo que las rodillas y caderas se encuentren en una misma línea horizontal.
-Aguantar arriba durante 1'''' y contraer los glúteos.
-Evitar la hiperextensión de la columna.
-Al volver a la posición inicial, bajar la cadera de manera controlada.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('0691f385-50f8-42d1-af72-b53e81f90028', '086d14b0-262e-4efd-ae56-cd7f1210b10e', 'b19721dc-8846-492f-a9b0-f42086dfd9e9', 3, 4, '30-1', 90, 8, 'Mantener las rodillas a 90 grados y la espalda completamente apoyada contra la pared', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('001c30d3-0a25-421e-a67a-c82ef3f3a71f', '086d14b0-262e-4efd-ae56-cd7f1210b10e', '2c43bdae-c530-4ae7-a126-ee1e927f7a14', 4, 4, '12', 90, 8, 'Configuración:
Acostado, de manera lateral. 
Flexionar la pierna de base a 90º y mantener la pierna contraria estirada.
Colocar una tobillera en cada pierna. 

Ejecuccion: 
Realizar una abducción lateral, manteniendo la pierna estirada. 
Volver al punto de inicio, contactando el pie con el suelo.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('8ccc2d40-0c39-4de2-a035-c36ab8fac1da', 'e64710ad-a24f-4901-ae81-1563285e59f4', 'c9f392e1-2221-47a6-a187-789dabc65ed8', 1, 2, '10', 90, 6, NULL, true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('cacefcea-e899-4d96-a5b7-8f9ab26a2ae3', 'e64710ad-a24f-4901-ae81-1563285e59f4', '2fd2a01d-70cd-4313-acc4-c96adbd71038', 2, 2, '5-8', 90, 6, 'Configuración:
-Ubicar el cuerpo boca abajo con las piernas juntas y estiradas. 
-Ubicar los brazos estirados por dentro de la anchura de los hombros.

Instrucciones:
-Flexionar los codos  en un angulo de 45º, con la intención de llevar el pecho a al suelo. 
-Mantener una línea recta a lo largo de toda la trayectoria de movimiento.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('b21b758e-5d4e-4613-aec8-1c56bbb4aa91', '67684253-e3f4-43d6-a4e4-f931520fe866', 'e26cd601-0e6f-4f44-a3a2-07a236f54cad', 1, 5, '4-6-3-5-1-3', 90, 10, 'Configuración:
-Comenzar con los brazos estirados sobre la barra.
-Sostener el peso entre las piernas o en un cinturón.

Ejecución:
-Iniciar el movimiento empujando los codos hacia atrás.
-Ubicar los hombros debajo de los codos en la parte inferior.
-Descender la cadera por debajo de la barra.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('02f40ca3-ca86-4e63-ab23-79566d534b72', '67684253-e3f4-43d6-a4e4-f931520fe866', '01ca81d4-8e81-4595-ac5a-59669b51c446', 2, 3, '10', 90, 8, 'Configuracion:
- Acostado boca arriba en un banco plano.
- Apoyo de Gluteo, escapula y pies sobre el suelo.
- Agarrando dos mancuernas, una en cada mano por encima del pecho con los codos estirados.
- Las palmas enfrentadas.

Ejecucion:
- Separar lo brazos, moviendolos en centidos opuestos.
- Durante el recorrido semi-flexionar el codo.
- Abrir los brazos esta alinearse con el tronco.
- Volver a la posicion inicial, juntando los brazos y extendiendo el codo al final.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('6e35c15f-894a-4a30-a3e4-c0ef28303206', '67684253-e3f4-43d6-a4e4-f931520fe866', '58fb0ac9-c454-4217-a72b-67e3e942a2a1', 3, 3, '10-12', 90, 9, 'Configuración:
- Apoyar ambos talones sobre un disco.
- De pie, piernas juntas.
- Manos sosteniendo una pesa rusa. 

Ejecución: 
- Realizar una flexión de rodillas, llevando la cadera hacia atrás.
- Centrar el punto de apoyo en los talones de los pies.
- Llegar a los 90º y volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('663bd447-78b8-4b26-a520-86258de5d5f9', '67684253-e3f4-43d6-a4e4-f931520fe866', 'ba53fc0a-ff13-4eb5-ae7a-d3d50a15dadd', 4, 3, '10', 90, 8, NULL, false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('7f00b412-0b69-47e0-a936-6f865039d25e', '67684253-e3f4-43d6-a4e4-f931520fe866', '6dee16eb-63e0-4a2b-a10d-32f4f6e6e080', 5, 4, '6-8', 90, 8, 'Configuración:
-Ubicarse acostado en un banco plano.
-Piernas al ancho de caderas.
-Brazos estirados por delante del hombro, sosteniendo una barra Z.

Ejecución:
-Flexionar los codos llevándolos a la altura de la frente.
-Volver a la posición inicial, extendiendo los brazos.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('7f576e1f-0a5f-4e59-a553-4c62fa89c123', '67684253-e3f4-43d6-a4e4-f931520fe866', 'a53f51bf-55b3-4629-a795-1dba2fb9986e', 6, 3, '12', 90, 10, 'Configuración:
- Sentarse sobre el sillón de cuádriceps.
- Pies posicionados por debajo del rodillo con puntas direccionadas hacia arriba.

Ejecución: 
- Realizar una extensión de rodilla y luego regresar al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('e96f1d55-480d-4901-a33e-5abedec8eafe', 'd0276837-4fe4-418f-a3e2-841cc9a865e5', 'ed06151d-8e3c-405f-ae17-1e955e962439', 1, 2, '6', 90, 6, NULL, true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('ca776e0c-b53d-437c-a1dd-0f5d4306cf0e', 'd0276837-4fe4-418f-a3e2-841cc9a865e5', '3473c3f2-f239-4d69-a62a-d8abb92ff936', 2, 2, '6', 90, 6, 'Configuración:
-Ubicar el cuerpo boca abajo en el suelo con los brazos extendidos.
-Piernas al ancho de cadera.
-Manos alineadas con hombros.

Ejecucción:
-Mantener la posición de plancha.
-Quitar un brazo y tocar el hombro contrario al de ejecucción.
-Volver a colocar el apoyo.
-Repetir con el brazo contrario el mismo movimiento.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('5e606805-ca91-4481-a36b-eeba865a5433', '0839bec2-f325-46b2-aa49-5164b3b6290d', 'f2b732c6-623d-4def-ac84-9f6fe940d3a8', 1, 4, '8-10', 90, 8, 'Configuración:
- Acostarse boca arriba sobre banco plano.
- Puntos de apoyo en pies, glúteos y escapular.
- Agarrar barra mayor al ancho de hombros.

Ejecución:
- Realizar una retracción escapular .
- Sacar barra del soporte.
- Tomar aire y bajar barra direccionada al pecho.
- Codos a 45 grados en movimiento de bajada y subida.
- Levantar la barra hacia el punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('c466854f-a1d5-4233-a1db-65bdb178d8c9', '0839bec2-f325-46b2-aa49-5164b3b6290d', '0bdd3b1c-26fe-4c7c-abf7-aa59c486ff43', 2, 3, '12', 90, 7, 'Configuración:
Acostarse boca arriba sobre banco plano.
Puntos de apoyo en pies, glúteos y escapular.
Usar una posición de pies amplia con las rodillas hacia afuera.
Ajustar los omóplatos contra el banco.
Comenzar con las mancuernas en línea con el torso y sobre el hombro.

Ejecución:
Bajar las mancuernas a la parte inferior de los pectorales.
Permanecer con los pies en el suelo.
Ajustar los glúteos en contacto con el banco, durante todo el movimiento.
Subir las mancuernas, hasta alinear las mueñcas con los hombros.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('1a9aa495-4bf9-488a-a881-e9733d95960d', '0839bec2-f325-46b2-aa49-5164b3b6290d', '1213e846-0ff9-4750-a129-31a242ef5356', 3, 3, '8-10', 90, 7, NULL, false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('ff0d6280-cf01-4595-a66e-a06345628f0d', '0839bec2-f325-46b2-aa49-5164b3b6290d', 'c7521ded-a63c-48fc-a019-f01872eb3f5c', 4, 3, '6-8', 90, 7, 'Configuracion:
-Sentarse en un banco y ubicar el brazo extendido sobre el aductor sosteniendo la mancuerna.
Ejecucion:
-Flexionar el codo elevando la mancuerna hacia la cadera y descender de manera controlada.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('6e8c8d13-b5d8-461b-aa4b-b2eaa751acf5', '0839bec2-f325-46b2-aa49-5164b3b6290d', '72c7a0d9-3341-4b2a-a987-3de8a62a09a2', 5, 3, '10-12', 90, 7, 'Ejercicio para aislar los triceps', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('e22d8988-0d4f-4738-a210-4ffd58ccadb6', '0839bec2-f325-46b2-aa49-5164b3b6290d', 'ad020a89-eea0-43ff-abea-bc1fcc47c7fa', 6, 3, '10', 90, 7, 'Configuración:
-Regular el asiento de la máquina de modo que los pies esten en contacto con el suelo.
-Sentarse con el torso apoyado en el respaldo y tomar las manijas de los costados de modo que los codos queden levemente flexionados, utilizando un agarre neutro. 
Ejecución:
- Realizar aperturas laterales de ambos brazos de manera simultánea, de modo que las manos se alineen con los hombros.
-Volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('90d7b46d-dc98-4d8d-a485-d83876f82360', '1cc9386f-71e7-4aa7-a64c-46e8ba442f2b', '14919757-ac5b-4b1b-a00c-13c0e2439178', 1, 2, '10', 90, 6, NULL, true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('01245e69-34df-49cf-ac8d-39ac15f8c220', '1cc9386f-71e7-4aa7-a64c-46e8ba442f2b', '2fd2a01d-70cd-4313-acc4-c96adbd71038', 2, 2, '5', 90, 6, 'Configuración:
-Ubicar el cuerpo boca abajo con las piernas juntas y estiradas. 
-Ubicar los brazos estirados por dentro de la anchura de los hombros.

Instrucciones:
-Flexionar los codos  en un angulo de 45º, con la intención de llevar el pecho a al suelo. 
-Mantener una línea recta a lo largo de toda la trayectoria de movimiento.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('4efb1f43-7706-4dad-a4e5-6001aedf4412', '6b677760-3a0f-44bf-a6f5-e246a58a3b8a', 'b8e0e509-955b-402e-abd8-ae16eade90a5', 1, 4, '6-8-4-6', 90, 9, 'Configuración:
- Acostarse sobre banco plano
- puntos de apoyo en pies, glúteos y escapulas.
- Agarrar la barra al ancho de hombros.
Ejecución:
- Realizar una retracción escapular.
- Sacar la barra del soporte y bajarla direcciona hacia el pecho.
- Aguantar 1,2,3 segundo en el pecho. 
- Volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('c39eef99-2524-4e53-ade9-1b97b5663af3', '6b677760-3a0f-44bf-a6f5-e246a58a3b8a', 'db7e7fc2-7599-4133-a380-293324b5fd94', 2, 3, '12', 90, 8, '-Mantene el codo levemente flexionado durante todo el recorrido', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('437e7ba2-9080-4acb-a058-edeca738a640', '6b677760-3a0f-44bf-a6f5-e246a58a3b8a', 'e979e45c-166c-4d5e-ab2b-26db8f6b9430', 3, 3, '10-12', 90, 8, 'Colocar la guia a la altura de nuestras claviculas. Con un banco con espaldar recto, colocarnos bajo la guia y empujar hacia arriba. Descender hasta que la guía vuelva a la posición inicial para finalizar la repetición.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('f4b2d9d4-472e-4118-a323-b2065e095142', '6b677760-3a0f-44bf-a6f5-e246a58a3b8a', '6dee16eb-63e0-4a2b-a10d-32f4f6e6e080', 4, 4, '6-8', 90, 8, 'Configuración:
-Ubicarse acostado en un banco plano.
-Piernas al ancho de caderas.
-Brazos estirados por delante del hombro, sosteniendo una barra Z.

Ejecución:
-Flexionar los codos llevándolos a la altura de la frente.
-Volver a la posición inicial, extendiendo los brazos.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('a9ab3811-b5da-4581-ad2a-e009ccef144c', '6b677760-3a0f-44bf-a6f5-e246a58a3b8a', '943ba0d9-6b8b-4df9-a828-ba7a4a9c23eb', 5, 3, '12-15', 90, 7, 'Ejercicio para aislar la cara media del deltoides.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('8d55fae8-6910-43bf-ac23-42378bd8ef32', '8bdca85c-9d01-4493-ae72-69eaf3451ba1', 'cd9e0518-3ee7-4b79-a592-125796eaf724', 1, 2, '8', 90, 5, 'Ejercicio para la movilidad del tobillo y la cadera', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('777a88de-bdea-457e-aa40-36fbc570c810', '8bdca85c-9d01-4493-ae72-69eaf3451ba1', '7b6143fa-6c2a-45f5-a9be-abd7954160a4', 2, 2, '6', 90, 6, 'Ejercicio de activación', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('5167d8f2-a637-47f8-a311-4607757aa1fd', 'ec97829f-c49d-41de-aefb-210fc4da3069', 'ed40902f-15c4-4b48-a6ca-8de025514c76', 1, 4, '6-8-4-6', 90, 9, 'Configuración:
Ubicar ambos pies sobre la plataforma, manteniendo las piernas estiradas.
Tomar cada manija con agarre neutro.

Ejecución:
Descender de manera controlada, llevando los codos hacia atrás e inclinando el torso levemente hacia adelante.
Volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('6604ac04-9094-467f-a29f-7ad410891abe', 'ec97829f-c49d-41de-aefb-210fc4da3069', '7277039e-6d8d-4d6f-afcd-ed44b3020fca', 2, 3, '10-12', 90, 8, NULL, true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('79b1ef3f-649e-48a4-a421-1aa1f376016f', 'ec97829f-c49d-41de-aefb-210fc4da3069', '21311af0-704c-41ff-a074-16a956fda259', 3, 3, '8-10', 90, 9, 'Configuración:
-Sentado en la máquina, con la cabeza, la espalda, las caderas, y las nalgas presionando por igual contra sus respectivos apoyos almohadillados.
-Si el ángulo del respaldo es ajustable, moverlo
hacia arriba o hacia abajo para que el tronco y las piernas formen un ángulo de 90 grados aproximadamente , con los pies colocados
correctamente sobre su plataforma de apoyo y las rodillas completamente extendidas. 
-Los pies han de estar separados a la anchura entre la cadera y los hombros,
planos sobre la plataforma de apoyo y sus puntas dirigidas ligeramente hacia fuera. 

Ejecucion:
-Agarrar los manillares, y extender  las rodillas para elevar la plataforma.
-Quitar el mecanismo de sujeción de la plataforma de los pies.
-Comenzar flexionando las caderas y las rodillas lenta y controladamente.
-Mantener las caderas y las nalgas presionando contra el asiento y la espalda.

Continuar el movimiento de descenso hasta que se produzca una de estas
cuatro situaciones:
l. Los muslos quedan paralelos con la plataforma de los pies (si se puede
conseguir).
2. Las nalgas pierden contacto con el asiento.
3. Las caderas se separan del almohadillado de la espalda.
4. Los talones se separan de la plataforma de los pies.

-Empujar hacia arriba y controladamente de los pies extendiendo las caderas y las rodillas. 
-Continuar empujando hacia arriba hasta que las rodillas estén estiradas por completo, pero sin bloquearlas forzadamente.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('a257ea16-4a23-4d88-a9a5-1ab7a7ba2624', 'ec97829f-c49d-41de-aefb-210fc4da3069', 'f0ec50f8-cd75-4d67-a66c-7b371f043aee', 4, 3, '12', 90, 8, NULL, true, 2)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('19315784-dd6a-4d68-a99d-be4dc74403b8', 'ec97829f-c49d-41de-aefb-210fc4da3069', '991f6823-5969-4f2d-afe0-e6b703206936', 5, 3, '6', 90, 8, 'Ejercicio progresivo de fuerza para el tren inferior', true, 2)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('304101b2-831d-4b96-a90a-29366520b4ee', 'ec97829f-c49d-41de-aefb-210fc4da3069', 'c530e026-700b-4a56-ab65-f41c588337e2', 6, 3, '12', 90, 8, 'Configuración:
- De pie, frente a la polea.
- Utilizar la soga agarrándola en pronación con los nudillos enfrentados.
Ejecución:
-Traccionar con los codos hacia atrás.
-Realizar un ajuste escapular.
-Volver a a la posición incial.', true, 3)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('370d281e-8c76-4127-af9b-0b1103d28756', 'ec97829f-c49d-41de-aefb-210fc4da3069', 'a36b7410-ba07-4def-ab5d-3069f5b2b2ff', 7, 3, '10', 90, 8, 'Ejercicio para aislar el gluteo medio', true, 3)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('76ca418f-12e8-4c8c-a5f6-756d9c288124', '015961ac-fe88-4e7b-ad62-b4545285db12', 'de50165c-084b-44d6-a57c-21b2d6d1f7ed', 1, 3, '10', 90, 7, 'Configuración:
Colocar los pies en la base de un GHD y mantener la columna erguida pero levemente inclinada hacia adelante. 
Ubicar los brazos por encima del pecho y piernas estiradas. 
Ejecución:
Iniciar el movimiento arqueando la espalda y mirando ligeramente hacia abajo.
Volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('1cc9d3f6-f452-4a19-a2c0-ebd7918853d5', 'c03e88d4-a2e4-4ae7-af49-69243dcaa582', '88152d73-de17-47a1-a635-f3438cea0c24', 1, 2, '8', 90, 5, 'Ejercicio de movilidad y activacion de la cintura escapular y los miembros superiores', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('7bd4b306-a090-4ff6-ae21-08c387fe5b2e', 'c03e88d4-a2e4-4ae7-af49-69243dcaa582', '3652ccf8-63a6-4b5c-a242-638b3f187011', 2, 2, '20', 90, 6, 'Configuración: 
Apoyar un antebrazo en contacto con el suelo y mantener ambas piernas estiradas, una por encima de la otra.
Ejecución:
El brazo que ese encuentra estirado en línea con el hombro, llevarlo por debajo del cuerpo.
Volver al punto de inicio.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('93ad575a-0485-442f-a609-e82369a8fd56', 'c03e88d4-a2e4-4ae7-af49-69243dcaa582', '64817423-63ce-45a1-a411-44d827c273b5', 3, 2, '5', 90, 6, 'Ejercicio de resistencia para los hombros', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('bb0d4fb0-977e-4aba-ad1d-252bdeb222c7', '29999d21-d9b4-4c31-a569-b9adc075515f', 'f339d55c-0dfd-4f32-a75b-b069f2bb5975', 1, 10, '8-6-6-4', 90, 9, 'Ejercicio de fuerza máxima para los musculos de tracción', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('40faea78-2b50-473f-ac6e-4af2ee790317', '29999d21-d9b4-4c31-a569-b9adc075515f', '476bfb69-21ef-4681-af65-ee8bf9f3990a', 2, 4, '4-6', 90, 8, 'Configuración:
-Colocar la barra por encima de los hombros.
-Mantener un agarre frontal. 

Ejecución:
-Caminar hacia adelante, a traves de estocadas. 
-Mantener el torso sobre las caderas en todo momento.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('ebefd6c1-6762-4a0e-a92e-262a349644bb', '29999d21-d9b4-4c31-a569-b9adc075515f', 'fbc74266-fca5-41a3-a7fd-75d6482e73d6', 3, 3, '2-6', 90, 8, 'Configuración:
Colgarse de la barra, con los brazos completamen estirados, sin apoyar los pies sobre el suelo.
Ubicar los brazos ligeramente al ancho superior de hombros y utilizando un agarre supino.
Ejecución:
Realizar con potencia un tirón de brazos, el pecho debe tocar la barra.
Los pies deben mantenerse al ancho de caderas, sin abrirse en exceso.
Volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('530785e3-8379-49f2-ad3a-5d379db87599', '29999d21-d9b4-4c31-a569-b9adc075515f', '84d87480-deea-4d89-ad9e-b2d0230154ea', 4, 3, '12', 90, 9, 'Ejercicio para los dorsales', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('93fa9047-5f9a-4546-a532-034bd03ac8b0', '29999d21-d9b4-4c31-a569-b9adc075515f', '65200d67-f176-45a0-aaca-f067d5257196', 5, 3, '12', 90, 10, 'Recostarse en un banco inclinado a 45° y dejar los brazos colgando a los costados para luego subir ambos hacia los hombros', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('ab60446c-ef20-4509-a169-a2984a4840e3', 'a82a4edf-10c4-4184-a7e0-b74f6b682a50', '7a38528b-9b84-4025-afe5-89570f647c73', 1, 2, '5', 90, 5, 'Configuración:
-Colocar las manos, pies y rodillas en contacto con el suelo
-Comenzar con los brazos extendidos.
-Ubicar las rodillas alineadas con la cadera y los pies alineados con las rodillas.
-No muever las caderas durante el movimiento. 

Ejecución:
-Colocar una mano contra la oreja.
-Deje caer ese codo debajo del tronco, apuntando al espacio debajo de la axila opuesta.
-Regresar a la posición inicial y continuar levantando el codo lo más alto posible.
-No mover las caderas durante todo el movimiento.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('bd4a7061-545f-4334-a448-90f0e9458801', 'a82a4edf-10c4-4184-a7e0-b74f6b682a50', 'cd9e0518-3ee7-4b79-a592-125796eaf724', 2, 2, '5', 90, 5, 'Ejercicio para la movilidad del tobillo y la cadera', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('310036fe-756d-4d12-a5a5-6e7795f4d20f', 'f2f8d71a-a197-4489-a813-f1d7e8d37060', 'b8e0e509-955b-402e-abd8-ae16eade90a5', 1, 4, '5-8-3-5', 90, 9, 'Configuración:
- Acostarse sobre banco plano
- puntos de apoyo en pies, glúteos y escapulas.
- Agarrar la barra al ancho de hombros.
Ejecución:
- Realizar una retracción escapular.
- Sacar la barra del soporte y bajarla direcciona hacia el pecho.
- Aguantar 1,2,3 segundo en el pecho. 
- Volver al punto de inicio.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('ff13eebe-8594-4b0e-a9f6-c864efc89a42', 'f2f8d71a-a197-4489-a813-f1d7e8d37060', 'db7e7fc2-7599-4133-a380-293324b5fd94', 2, 4, '10', 90, 7, '-Mantene el codo levemente flexionado durante todo el recorrido', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('4bc8e854-85f5-410d-a5f0-cf5efa0c7f46', 'f2f8d71a-a197-4489-a813-f1d7e8d37060', '357e1785-c4af-4271-a03c-d561ffd51c3e', 3, 3, '8-12', 90, 8, 'Con la barra colocada sobre nuestro pecho superior, tomar aire y apretar el abdomen. Empujar en linea vertical, evitando que la barra vaya hacia delante. Una vez la barra este arriba, debemos descenderla nuevamente hasta la posición inicial.', true, 2)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('3e2ec3ef-3854-4cdd-a200-cf39c6c60bab', 'f2f8d71a-a197-4489-a813-f1d7e8d37060', 'b3a04a0b-91b0-4366-a359-0131acd6c084', 4, 3, '6-8', 90, 9, NULL, true, 2)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('a47a78e9-74ff-4a2c-a3b1-b0ba10970cbb', 'f2f8d71a-a197-4489-a813-f1d7e8d37060', '0de62cb9-7f0d-406b-ac00-c6a1ef6f966c', 5, 3, '5', 90, 8, 'Configuración:
- De pie, al frente de una polea. Ubicar el agarre en la parte superior.
- Utilizar un agarre unilateral con toma supina y flexionar el codo a 90º.

Ejecucción:
-Realizar una extensión unilateral,  llevando la mano a la altura de la cadera.
- Evitar despegar el codo cerca del cuerpo o balancearse.
- Volver al punto de inicio.
- Realizar las repeticiones estipuladas y cambiar de brazo.', true, 3)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('c533dcb1-d2cd-4d7e-a22e-bfb2490defda', 'f2f8d71a-a197-4489-a813-f1d7e8d37060', '730a60f0-49ac-4384-acf7-9d4e2f4443c9', 6, 3, '5', 90, 8, 'Configuración:
-Ubicar una barra en un rack o jaula.
-Colocar la barra en la parte superior de los trapecios.
-Brazos por fuera de los hombros.
-Realizar un ajuste escapular. 
-Una pierna da un paso largo hacia adelante al ancho de la cadera.
-Pie trasero va encima de un soporte o banco plano. 

Ejecución:
-Descender hasta que la rodilla trasera toque el suelo.
-Descender con el torso recto. 
-Mantener el talón en contacto con el suelo durante todo el movimiento.
-Volver a subir hasta extender completamente la cadera.', true, 3)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('cb720550-b52d-4e1c-abdb-7fa800748b94', 'ee9b12cb-2438-4852-a02f-7fd2d7ed5360', 'cd9e0518-3ee7-4b79-a592-125796eaf724', 1, 2, '6', 90, 5, 'Ejercicio para la movilidad del tobillo y la cadera', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('78920d3d-29d5-4fce-a44d-03f19764b005', 'ee9b12cb-2438-4852-a02f-7fd2d7ed5360', '0342ef22-9092-4b15-adbf-6da9f445e82c', 2, 2, '4', 90, 5, 'Configuración: 
En posición de cuadrupedia, manos estiradas al ancho de hombros en contacto con el suelo.
Cabeza en línea con la columna.
Ejecución:
Realizar una rotación interna, de modo que un brazo estirado se ubique por debajo del hombro contario.
El mismo brazo debe contactar con la colchenta.
Luego realizar una rotación externa. 
Volver al punto de inicio.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('39e6fa19-554c-4449-a3d1-1886ab389140', 'ee9b12cb-2438-4852-a02f-7fd2d7ed5360', '67947c59-3dec-4e04-ad24-0de994173179', 3, 2, '15', 90, 6, 'Ejercicio de activación del gluteo medio', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('29841683-8254-4dcb-a010-dea0cd409df2', 'ee9b12cb-2438-4852-a02f-7fd2d7ed5360', 'b19721dc-8846-492f-a9b0-f42086dfd9e9', 4, 2, '30', 90, 6, 'Mantener las rodillas a 90 grados y la espalda completamente apoyada contra la pared', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('e3e6820e-d9a6-406c-adc8-2dfbee61c6e9', '70e23a83-9914-4ac5-a4a7-63ae1b0f4b22', 'c0aaba94-49f3-4fe6-a36d-4ee942058882', 1, 4, '6-8', 90, 9, 'Configuración:
-Ubicar un banco plano o cajón  cerca de nuestro cuerpo
-Colocar la barra en un rack o jaula de potencia justo por debajo de los hombros.
-Ubicar la barra por debajo del deltoides posterior. 
-Sujetar con ambas manos a cada lado.
-Pies al ancho de caderas.
-Posición inicial del torso, levemente inclinado hacia adelante. 

Ejecución: 
-Tomar la barra ubicada en el rack o jaula de potencia.
-Colocar las piernas al ancho de caderas, con los dedos de los pies apuntando ligeramente hacia afuera.
-Bajar la barra hasta llegar a sentarse en el cajón. 
-Volver a la posición inicial de manera controlada.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('59583258-8efc-4e77-a7cb-3b6c542108d4', '70e23a83-9914-4ac5-a4a7-63ae1b0f4b22', '608a25d1-0532-4acb-a633-5cc6ef1b0ae0', 2, 4, '15-30', 90, 9, NULL, false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('74b9fd0b-ce20-4549-a200-8243c3e8d115', '70e23a83-9914-4ac5-a4a7-63ae1b0f4b22', '7eeb358c-e230-4a46-abf2-a6526fc6dd2f', 3, 3, '12', 90, 8, 'Configuración: 
- Acostado sobre la camilla de isquiotibiales.
- Talones ubicados por debajo del rodillo. 

Ejecución: 
- Realizar una flexión de rodilla, luego volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('8d19bbfc-1ddb-46c2-aecc-0eddfcbb6db8', '70e23a83-9914-4ac5-a4a7-63ae1b0f4b22', 'b182cdf4-c36a-4a93-a855-b1bb1e93d1de', 4, 3, '6', 90, 8, 'Ejercicio de fuerza para los musculos de la espalda', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('8de2ca33-c151-4d43-a762-d94bcf65fd34', '70e23a83-9914-4ac5-a4a7-63ae1b0f4b22', 'b62de09b-26a9-4fe7-a1ef-30a61f725d58', 5, 4, '5', 90, 8, 'Configuración:
-Sostener una mancuerna en cada mano.
-Los brazos permanecen rectos a los lados.
-Una pierna da un paso largo hacia adelante al ancho de la cadera.
-El pie trasero va encima del soporte.

Ejecución:
-Descender hasta que la rodilla trasera toque el suelo o el pliegue de la cadera quede por debajo de la rodilla.
-Mantener el talón en contacto con el suelo durante todo el movimiento.
-Volver a subir hasta extender completamente la cadera.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('2ffc2092-bffd-4bb8-a6be-9cac63bfbdb7', '70e23a83-9914-4ac5-a4a7-63ae1b0f4b22', 'c7521ded-a63c-48fc-a019-f01872eb3f5c', 6, 3, '10', 90, 9, 'Configuracion:
-Sentarse en un banco y ubicar el brazo extendido sobre el aductor sosteniendo la mancuerna.
Ejecucion:
-Flexionar el codo elevando la mancuerna hacia la cadera y descender de manera controlada.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('1bd6e1b6-ac28-484f-a622-fdb65c9c35aa', '70e23a83-9914-4ac5-a4a7-63ae1b0f4b22', '75b64ec7-ba2d-4924-a6f0-37cbabe2fdaf', 7, 4, '8', 90, 8, 'Ejercicio de fuerza para el cuadriceps', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('34dbab49-63e9-491f-ad9d-b551c4a2f388', '7917e71d-c0d3-4ee0-a169-9436209b2a74', 'b19721dc-8846-492f-a9b0-f42086dfd9e9', 1, 2, '20-30', 90, 6, 'Mantener las rodillas a 90 grados y la espalda completamente apoyada contra la pared', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('7ef3fc77-ef16-439e-a1ad-83f6c2fe80f6', '7917e71d-c0d3-4ee0-a169-9436209b2a74', 'fc5cbe0e-68a0-441f-ad3f-6e422a33c560', 2, 2, '5', 90, 6, 'Configuración:
-Ubicar el cuerpo boca abajo con las piernas juntas y estiradas. 
-Ubicar los brazos estirados a la altura de los hombros, sobre un superficie elevada. Mientras mayor inclinación, menor dificultad de ejecucción. 

Instrucciones:
-Flexionar los codos en un angulo de 45º, con la intención de llevar el pecho a la superficie seleccionada. 
-Una vez completado el rango de moviemiento, extender los codos. 
-Mantener una línea recta a lo largo de toda la trayectoria de movimiento.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('fbe06def-22e2-4f0e-afdf-154cb00b8608', '5a885575-913d-40de-aee6-19bd97fee277', '0a2c2da5-3f3d-4e25-a800-e1fcce32a646', 1, 4, '4-6-2-4', 90, 9, 'Ejercicio para los pectorales y triceps', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('2d900958-e941-488a-aad2-a437b2188376', '5a885575-913d-40de-aee6-19bd97fee277', 'c5d56949-3a06-4168-a087-9ea2e8bceafb', 2, 3, '5-8', 90, 9, 'Configuración:
-Colocar la barra en un rack o jaula de potencia justo por debajo de los hombros.
-Ubicar la barra en la parte superior de los omoplatos. 
-Sujetar con ambas manos a cada lado.
-Pies al ancho de caderas.

Ejecución: 
-Alejarse del soporte del rack o jaula.
-Colocar las piernas al ancho de caderas, con los dedos de los pies apuntando ligeramente hacia afuera.
-Bajar la barra hasta llegar a la posición de cuclillas.
-Volver a la posición inicial de manera controlada.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('ee058a69-d1e2-4402-af47-31bfc3d8deaf', '5a885575-913d-40de-aee6-19bd97fee277', '7277039e-6d8d-4d6f-afcd-ed44b3020fca', 3, 3, '5-8', 90, 8, NULL, false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('78f5a5a3-c0ca-4072-a8c5-9da470efc425', '5a885575-913d-40de-aee6-19bd97fee277', '357e1785-c4af-4271-a03c-d561ffd51c3e', 4, 3, '8-12', 90, 8, 'Con la barra colocada sobre nuestro pecho superior, tomar aire y apretar el abdomen. Empujar en linea vertical, evitando que la barra vaya hacia delante. Una vez la barra este arriba, debemos descenderla nuevamente hasta la posición inicial.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('e8d1e3b1-60dd-4205-a768-9a605dc3902d', '5a885575-913d-40de-aee6-19bd97fee277', '81707c19-53dd-4f84-a9f2-dc88cdc057cb', 5, 3, '4-6', 90, 8, NULL, false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('878e974f-617f-43f8-a0ad-6482c393cc3d', '5a885575-913d-40de-aee6-19bd97fee277', '72c7a0d9-3341-4b2a-a987-3de8a62a09a2', 6, 3, '10-12', 90, 10, 'Ejercicio para aislar los triceps', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('5e302432-4fcb-47c0-ae64-f15baca96e50', 'c3dd1290-fa63-4a62-aae2-239025dc0bbf', '15892e3e-1567-433d-ad74-dc6cf9adc272', 1, 2, '20-30', 90, 8, 'Configuración:
Acostado en una colchoneta, con las piernas al ancho de caderas.
Tomar un disco con los brazos estirados entre ambas manos.

Ejecución:
Elevar el torso hacia adelante, manteniendo la espalda erguida. 
Volver al punto de inicio de manera controlada, apoyando la espalda baja primero.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('2f2d243b-aaea-4f52-a9e3-c3486252cb8d', 'c3dd1290-fa63-4a62-aae2-239025dc0bbf', '050c8756-5f7f-4cc9-a323-3aeae589c753', 2, 2, '20', 90, 8, NULL, true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('a58fdf1f-f2b4-466f-ac49-069fd614b2a9', 'f4df62f2-8313-46c1-a928-6d4633adddf6', '0c9d22aa-370c-41a4-a781-2b79c714cd62', 1, 3, '5', 90, 6, 'Configuración:
Piernas flexionadas a 90º, al ancho de caderas.
Brazos al costado del cuerpo o juntos. 

Ejecución:
Realizar pasos laterales ampliando el ancho de caderas, manteniendo la posición de sentadilla. 
Volver al punto de inicio.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('05c873fb-fedd-4d6e-a66e-befae2960717', 'f4df62f2-8313-46c1-a928-6d4633adddf6', '90076515-125a-4b30-a030-98748a900baa', 2, 3, '5', 90, 6, 'Configuración:
-Ubicar el cuerpo boca abajo con los brazos estirados.
-Colocar una sola mancuerna de peso ligero/moderado a su lado.

Ejecución:
-Alinear hombros, caderas,  rodillas y talones  en línea recta.
-Comenzar con una mancuerna en el lado derecho del cuerpo.
-Con la mano izquierda, agarrar la mancuerna.
-Colocar la mancuerna del lado izquierdo y volver a la posición de plancha.
-Ahora realizar el mismo movimiento en el lado opuesto.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('2a563a85-608a-4d31-a9f0-6e74e3705206', '6a2b34be-eb25-4021-a9dd-556279c00838', 'f2b732c6-623d-4def-ac84-9f6fe940d3a8', 1, 4, '6-8-4-6', 90, 9, 'Configuración:
- Acostarse boca arriba sobre banco plano.
- Puntos de apoyo en pies, glúteos y escapular.
- Agarrar barra mayor al ancho de hombros.

Ejecución:
- Realizar una retracción escapular .
- Sacar barra del soporte.
- Tomar aire y bajar barra direccionada al pecho.
- Codos a 45 grados en movimiento de bajada y subida.
- Levantar la barra hacia el punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('8a9812af-feba-4af7-a890-307fc581c606', '6a2b34be-eb25-4021-a9dd-556279c00838', '3beb9f1d-351f-4437-a83a-3d67637848fe', 2, 10, '8-10-6-8-4-6-3-5', 90, 10, 'Ejercicio de hipertrofia para la cadena posterior', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('1e36ec24-901f-4694-a404-00cba1471ff5', '6a2b34be-eb25-4021-a9dd-556279c00838', 'db7e7fc2-7599-4133-a380-293324b5fd94', 3, 3, '10', 90, 8, '-Mantene el codo levemente flexionado durante todo el recorrido', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('5d1689f5-45a0-455d-a7a7-282fb09042a2', '6a2b34be-eb25-4021-a9dd-556279c00838', '7d4702d4-35ae-47b8-a737-c6c00b78d5de', 4, 3, '6-8', 90, 8, 'Configuración:
-Mantener las mancuernas cerca del cuerpo.
-Comenzar con el apoyo de un solo pie, con las mancuernas en ambas manos.

Ejecución:
-Realizar una flexión de cadera, y por ende, ir flexionando la rodilla de base levemente. 
-La pierna contraria se mantiene recta, acompañando el movimiento de la cadera.
-Bajar las mancuernas pegadas al cuerpo.
-Mantener la columna neutra. 
-Regresar extendiendo la cadera.
-Completar las repeticiones estipuladas y cambiar de pierna.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('4789c569-71ce-4005-a2bd-7791b3a57fc8', '6a2b34be-eb25-4021-a9dd-556279c00838', 'd514bf7c-c4c5-4a26-a153-b20cd4ca017f', 5, 3, '10', 90, 8, 'Configuración: 
- De pie, posicionado de costado a la polea.
- Tobillera puesta en la pierna que va a ejecutar el movimiento.
- Pierna de apoyo por delante de la que va a realizar el movimiento.
- Brazos teniendo un apoyo sobre soporte de la polea

Ejecución: 
- Realizar una patada lateral hacia el costado contrario a la polea.
- Volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('225fef20-a4fd-4881-afa1-1d4c6b96357c', 'e2b6000b-8941-458b-ab2e-ffd1c8e9616e', 'c6a5debf-dc7b-4d33-a607-05658a33008b', 1, 3, '10-12', 90, 8, 'Configuración:
Boca abajo, con el apoyo de ambas rodillas flexionadas.
Comenzar con las manos estiradas sosteniendo la rueda abdominal.
La espalda lumbar se encuentra redondeada. 
Ejecución:
Rolar la rueda hacia adelante, de modo que nuestra espalda pueda seguir manteniendo la misma curva, hasta contactar el pecho con el suelo.
Volver a la posición de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('d054ee97-32c4-4239-a994-52d7f208b214', 'b2d847d2-4300-4b8d-a55d-d29caa26771f', '3652ccf8-63a6-4b5c-a242-638b3f187011', 1, 2, '20', 90, 6, 'Configuración: 
Apoyar un antebrazo en contacto con el suelo y mantener ambas piernas estiradas, una por encima de la otra.
Ejecución:
El brazo que ese encuentra estirado en línea con el hombro, llevarlo por debajo del cuerpo.
Volver al punto de inicio.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('006f211c-c7b7-44a3-ade6-4b669ffb1b4d', 'b2d847d2-4300-4b8d-a55d-d29caa26771f', '16ca8589-d145-475a-a3f6-b37e7cbb71fd', 2, 2, '10', 90, 6, 'Configuración:
-Pies al ancho de caderas.
-Puntas de los pies levemente hacia afuera.
-Brazos estirados hacia el frente.

Ejecución:
-Bajar hasta llegar a la posición de cuclillas.
-Volver a la posición inicial de manera controlada.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('473be9f0-e925-4b42-ad04-3b6db442e350', '0e039540-485c-47f6-a1bc-208b3077f0ec', 'a0da644a-198d-4b0f-a286-56efcd318e13', 1, 4, '8-10-6-8', 90, 9, 'Configuracion:
-Los pies a la ancho de los hombros, hacer peso muerto con la barra para iniciar el ejercicio.
-Mantenga ambas manos en un agarre prono (las palmas hacia el cuerpo) con las manos mayor al ancho de los hombros.
-Mantener la espalda baja plana.

Ejecución:
-Bisagra en la cadera, desplazando las caderas hacia atrás.
-Continuar hasta que el pecho quede en frente al suelo o paralelo.
-Tirar de los codos hacia atrás y juntos hasta que la barra llegue a la parte superior de los abdominales o boca del estomago.
-Volver a la posición inicial.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('ef3bfd0b-f82f-4bb3-a23f-0c1c7a958a68', '0e039540-485c-47f6-a1bc-208b3077f0ec', '476bfb69-21ef-4681-af65-ee8bf9f3990a', 2, 4, '4-6', 90, 8, 'Configuración:
-Colocar la barra por encima de los hombros.
-Mantener un agarre frontal. 

Ejecución:
-Caminar hacia adelante, a traves de estocadas. 
-Mantener el torso sobre las caderas en todo momento.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('9f41e523-0883-425a-a963-0a1d79e6d264', '0e039540-485c-47f6-a1bc-208b3077f0ec', '3b1647e1-5771-4b74-aaf3-5c72df77affd', 3, 3, '6-8', 90, 8, 'Ejecución:
Utilizar un banco plano para apoyar un brazo y una pierna del mismo lado.
Pierna contraria estirada, y brazo estirado con una mancuerna.

Configuración:
Llevar un brazo hacia atrás a la altura del pectoral.
Rotar levemente el torso.
Volver a la posición inicial.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('e4f84625-eb5e-490c-a376-286d160b6d89', '0e039540-485c-47f6-a1bc-208b3077f0ec', '58fb0ac9-c454-4217-a72b-67e3e942a2a1', 4, 3, '10-12', 90, 8, 'Configuración:
- Apoyar ambos talones sobre un disco.
- De pie, piernas juntas.
- Manos sosteniendo una pesa rusa. 

Ejecución: 
- Realizar una flexión de rodillas, llevando la cadera hacia atrás.
- Centrar el punto de apoyo en los talones de los pies.
- Llegar a los 90º y volver al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('5ffd2508-c9e3-48d2-acce-997620ba1607', '0e039540-485c-47f6-a1bc-208b3077f0ec', '65200d67-f176-45a0-aaca-f067d5257196', 5, 3, '10', 90, 8, 'Recostarse en un banco inclinado a 45° y dejar los brazos colgando a los costados para luego subir ambos hacia los hombros', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('03fd7850-cc17-4a01-aa01-d433ad614964', '0e039540-485c-47f6-a1bc-208b3077f0ec', '582fc07a-e7e0-4366-aa3b-93ff2f6b3a6e', 6, 3, '15', 90, 8, 'Configuración:
- De pie, al ancho de caderas.

Ejecución:
- Realizar un paso hacia adelante y flexionar una rodilla a 90 grados.
-Pierna de atrás en la misma posición. 
- Mantener la cantidad de segundos estipulados. 
-Alternar de pierna.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('6ecbe789-3a5a-4e03-a027-523f69ba5d94', 'e5b976aa-fab7-4ac2-adfb-bb7b187d69ae', '77d7856b-6957-4ac3-a46c-fbfdacdd51b9', 1, 2, '6', 90, 5, 'Ejercicio de movilidad para tren inferior', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('f9e2490f-74db-44d4-ab34-1559e4c7ebb1', 'e5b976aa-fab7-4ac2-adfb-bb7b187d69ae', '90076515-125a-4b30-a030-98748a900baa', 2, 2, '20', 90, 6, 'Configuración:
-Ubicar el cuerpo boca abajo con los brazos estirados.
-Colocar una sola mancuerna de peso ligero/moderado a su lado.

Ejecución:
-Alinear hombros, caderas,  rodillas y talones  en línea recta.
-Comenzar con una mancuerna en el lado derecho del cuerpo.
-Con la mano izquierda, agarrar la mancuerna.
-Colocar la mancuerna del lado izquierdo y volver a la posición de plancha.
-Ahora realizar el mismo movimiento en el lado opuesto.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('636d08c0-1392-4730-a610-65499d72eeee', '7dad1990-5fa4-4376-ad02-e45126b0a247', 'a68fe779-de36-4690-af14-366be05f62c7', 1, 10, '8-6-6-4', 90, 9, 'Configuración:
-Colocar la barra en un rack o jaula de potencia justo por debajo de los hombros.
-Apoyar la barra en los hombros, con los brazos cruzados. 
-Codos altos.
-Agarre desde la punta de los dedos.
-De pie, al ancho de caderas.

Ejecución:
-Alejarse del soporte del rack o jaula.
-Colocar las piernas al ancho de las caderas, con los dedos de los pies apuntando ligeramente hacia afuera.
-Bajar la barra hasta llegar a la posición de cuclillas.
-Volver a la posición inicial de manera controlada.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('c5e470a2-0910-4ab3-a783-800aa39f380d', '7dad1990-5fa4-4376-ad02-e45126b0a247', 'd1558a7b-c764-4e2e-ac0f-91d4d347f3f7', 2, 3, '8', 90, 8, 'En caso de ser muy facil la ejecución podes agregarle peso sosteniendo una mancuerna o disco', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('a3800739-71f8-4a06-a3b3-76d82d28e8bf', '7dad1990-5fa4-4376-ad02-e45126b0a247', 'a53f51bf-55b3-4629-a795-1dba2fb9986e', 3, 3, '10', 90, 10, 'Configuración:
- Sentarse sobre el sillón de cuádriceps.
- Pies posicionados por debajo del rodillo con puntas direccionadas hacia arriba.

Ejecución: 
- Realizar una extensión de rodilla y luego regresar al punto de inicio.', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('4e4ce6b3-6959-420d-a758-7f5c2e83ff64', '7dad1990-5fa4-4376-ad02-e45126b0a247', '4ce4faee-0b2b-43b7-acc8-95838b4c9e97', 4, 3, '12', 90, 9, 'En maquina para aducción, buscar juntar las piernas focalizando el trabajo en aductores', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('82601beb-f5be-4ab2-a026-f589d849fb62', 'ab8a92d9-de53-4512-a595-e98efcfa5cc4', 'bcbac147-2a78-4063-a6af-f2386f2f06b3', 1, 2, '5', 90, 6, 'Ejercicio de movilidad para el tren inferior', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('0809bc7f-918b-4a1d-a7e3-5ea2e9fbbe4e', 'ab8a92d9-de53-4512-a595-e98efcfa5cc4', '3473c3f2-f239-4d69-a62a-d8abb92ff936', 2, 2, '5', 90, 6, 'Configuración:
-Ubicar el cuerpo boca abajo en el suelo con los brazos extendidos.
-Piernas al ancho de cadera.
-Manos alineadas con hombros.

Ejecucción:
-Mantener la posición de plancha.
-Quitar un brazo y tocar el hombro contrario al de ejecucción.
-Volver a colocar el apoyo.
-Repetir con el brazo contrario el mismo movimiento.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('a0791683-97a9-49de-a325-ecf701760d1c', 'b8bcbf2d-912f-4427-ac6e-b7b002a4cce9', '2c2c63b9-5ebe-4128-a543-a82360a9ccbb', 1, 3, '10-12', 90, 7, NULL, true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('a963e27c-4aee-492f-a0ea-fd484bb922df', 'b8bcbf2d-912f-4427-ac6e-b7b002a4cce9', 'd6b0e0d9-5d7e-46f6-a369-c10370bcfd82', 2, 3, '4-6', 90, 8, 'Configuración:
-Ubicar el cuerpo boca abajo con la rodillas apoyadas en el suelo y las piernas juntas. 
-Ubicar los brazos estirados a la altura de los hombros, cerca del cuerpo.

Instrucciones:
-Flexionar los codos en un angulo de 45º, con la intención de llevar el pecho al suelo.
-Completar el rango total de movimiento, o llegar a los 90º, 
-Extender los codos. 
-Mantener una línea recta a lo largo de toda la trayectoria de movimiento.', true, 1)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('836b6bb5-c0f2-4883-ade9-684398cdba20', 'b8bcbf2d-912f-4427-ac6e-b7b002a4cce9', '90076515-125a-4b30-a030-98748a900baa', 3, 3, '8', 90, 7, 'Configuración:
-Ubicar el cuerpo boca abajo con los brazos estirados.
-Colocar una sola mancuerna de peso ligero/moderado a su lado.

Ejecución:
-Alinear hombros, caderas,  rodillas y talones  en línea recta.
-Comenzar con una mancuerna en el lado derecho del cuerpo.
-Con la mano izquierda, agarrar la mancuerna.
-Colocar la mancuerna del lado izquierdo y volver a la posición de plancha.
-Ahora realizar el mismo movimiento en el lado opuesto.', true, 2)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('c90298c5-3aa7-4212-ab5e-d57e14ce21cb', 'b8bcbf2d-912f-4427-ac6e-b7b002a4cce9', '8f58bf34-3e36-40d6-af71-8a72b35f2d70', 4, 3, '6-8', 90, 8, 'Configuración:
-Los brazos permanecen rectos a los lados.
-Una pierna da un paso largo hacia adelante al ancho de la cadera.
-El pie trasero va encima del soporte.

Ejecución:
-Descender hasta que la rodilla trasera toque el suelo o el pliegue de la cadera quede por debajo de la rodilla.
-Mantener el talón en contacto con el suelo durante todo el movimiento.
-Volver a subir hasta extender completamente la cadera.', true, 2)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('ea7256fb-c7c9-4e83-a80a-71308f1f2205', 'b8bcbf2d-912f-4427-ac6e-b7b002a4cce9', 'bfb24d47-2238-46ed-a6d7-84d0688e4d91', 5, 3, '10', 90, 8, 'Configuración: 
De pie, al ancho de caderas.
Ubicar una banda circular de tensión baja, en el soporte inferior de una columna.
Colocar las manos al ancho de hombros.
Ejecución:
Realizar una tracción llevando ambos codos hacia atrás y luego realizando un press por encima de la cabeza. 
Volver al punto de inicio.', true, 3)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('327e754c-cecc-441c-a8be-4a6fb2010899', 'b8bcbf2d-912f-4427-ac6e-b7b002a4cce9', 'da13c7ce-3660-4344-ada1-9e4fa2735c30', 6, 3, '10', 90, 8, NULL, true, 3)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();
INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie)
VALUES ('70f4aeb4-2186-4e42-ad03-cae869bd6f70', 'b8bcbf2d-912f-4427-ac6e-b7b002a4cce9', '208d5c64-957b-4fcf-ab4c-08c22ac26453', 7, 2, '45-1', 90, 7, NULL, false, NULL)
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id, ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden, series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones, descanso_segundos = EXCLUDED.descanso_segundos, rpe_objetivo = EXCLUDED.rpe_objetivo, notas = EXCLUDED.notas, es_superserie = EXCLUDED.es_superserie, grupo_superserie = EXCLUDED.grupo_superserie, updated_at = now();

COMMIT;
