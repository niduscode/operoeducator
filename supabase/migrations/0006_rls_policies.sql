-- =====================================================================
-- 0006 — RLS policies. Traduce las reglas de firestore.rules.
--
-- Matriz de permisos:
--   recurso              | director | admin | instructor
--   ---------------------|----------|-------|------------
--   instructores         | CRUD     | R     | R
--   profes_guias         | CRUD     | R     | R
--   alumnos              | CRUD     | R     | RU (asignación a sí mismo o profe guía)
--   historial_asign.     | CRUD     | R     | R
--   asistencias_alumnos  | CRUD     | CRUD  | CRUD
--   asistencias_profes   | CRUD     | CRUD  | CRUD
--   evaluaciones         | CRUD     | CRUD  | CRUD
--   config_pagos         | CRUD     | R     | R
--   precios_alumnos      | CRUD     | R     | R
--   pagos_alumnos        | CRUD     | CRUD  | R
--   pagos_realizados     | CRUD     | CRUD  | R
--   temarios / semanas   | CRUD     | R     | R
--
-- (R = SELECT a todo authenticated; las policies UPDATE/DELETE específicas
-- restringen el resto.)
-- =====================================================================

-- ENABLE RLS en TODAS las tablas ---------------------------------------
ALTER TABLE instructores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profes_guias             ENABLE ROW LEVEL SECURITY;
ALTER TABLE alumnos                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_asignaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias_alumnos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias_profes_guias ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluaciones_alumnos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_pagos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE precios_alumnos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_alumnos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_realizados         ENABLE ROW LEVEL SECURITY;
ALTER TABLE temarios                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE semanas_temario          ENABLE ROW LEVEL SECURITY;

-- INSTRUCTORES ---------------------------------------------------------
CREATE POLICY "instructores_select" ON instructores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "instructores_insert" ON instructores
  FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "instructores_update" ON instructores
  FOR UPDATE TO authenticated USING (is_director()) WITH CHECK (is_director());
CREATE POLICY "instructores_delete" ON instructores
  FOR DELETE TO authenticated USING (is_director());

-- PROFES GUÍAS ---------------------------------------------------------
CREATE POLICY "profes_guias_select" ON profes_guias
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profes_guias_insert" ON profes_guias
  FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "profes_guias_update" ON profes_guias
  FOR UPDATE TO authenticated USING (is_director()) WITH CHECK (is_director());
CREATE POLICY "profes_guias_delete" ON profes_guias
  FOR DELETE TO authenticated USING (is_director());

-- ALUMNOS --------------------------------------------------------------
-- Director: full CRUD.
-- Instructor: puede UPDATE (asignarse alumnos o asignárselos a profe guía).
-- Crear / borrar alumnos: solo director.
CREATE POLICY "alumnos_select" ON alumnos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "alumnos_insert" ON alumnos
  FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "alumnos_update" ON alumnos
  FOR UPDATE TO authenticated
  USING (is_director() OR is_instructor())
  WITH CHECK (is_director() OR is_instructor());
CREATE POLICY "alumnos_delete" ON alumnos
  FOR DELETE TO authenticated USING (is_director());

-- HISTORIAL ASIGNACIONES -----------------------------------------------
CREATE POLICY "historial_asignaciones_select" ON historial_asignaciones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "historial_asignaciones_insert" ON historial_asignaciones
  FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "historial_asignaciones_update" ON historial_asignaciones
  FOR UPDATE TO authenticated USING (is_director()) WITH CHECK (is_director());
CREATE POLICY "historial_asignaciones_delete" ON historial_asignaciones
  FOR DELETE TO authenticated USING (is_director());

-- ASISTENCIAS ALUMNOS --------------------------------------------------
-- Director, admin e instructor pueden crear/editar/borrar.
CREATE POLICY "asistencias_alumnos_select" ON asistencias_alumnos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "asistencias_alumnos_insert" ON asistencias_alumnos
  FOR INSERT TO authenticated
  WITH CHECK (is_director() OR is_admin() OR is_instructor());
CREATE POLICY "asistencias_alumnos_update" ON asistencias_alumnos
  FOR UPDATE TO authenticated
  USING (is_director() OR is_admin() OR is_instructor())
  WITH CHECK (is_director() OR is_admin() OR is_instructor());
CREATE POLICY "asistencias_alumnos_delete" ON asistencias_alumnos
  FOR DELETE TO authenticated
  USING (is_director() OR is_admin() OR is_instructor());

-- ASISTENCIAS PROFES GUÍAS ---------------------------------------------
CREATE POLICY "asistencias_profes_guias_select" ON asistencias_profes_guias
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "asistencias_profes_guias_insert" ON asistencias_profes_guias
  FOR INSERT TO authenticated
  WITH CHECK (is_director() OR is_admin() OR is_instructor());
CREATE POLICY "asistencias_profes_guias_update" ON asistencias_profes_guias
  FOR UPDATE TO authenticated
  USING (is_director() OR is_admin() OR is_instructor())
  WITH CHECK (is_director() OR is_admin() OR is_instructor());
CREATE POLICY "asistencias_profes_guias_delete" ON asistencias_profes_guias
  FOR DELETE TO authenticated
  USING (is_director() OR is_admin() OR is_instructor());

-- EVALUACIONES ---------------------------------------------------------
CREATE POLICY "evaluaciones_alumnos_select" ON evaluaciones_alumnos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "evaluaciones_alumnos_insert" ON evaluaciones_alumnos
  FOR INSERT TO authenticated
  WITH CHECK (is_director() OR is_admin() OR is_instructor());
CREATE POLICY "evaluaciones_alumnos_update" ON evaluaciones_alumnos
  FOR UPDATE TO authenticated
  USING (is_director() OR is_admin() OR is_instructor())
  WITH CHECK (is_director() OR is_admin() OR is_instructor());
CREATE POLICY "evaluaciones_alumnos_delete" ON evaluaciones_alumnos
  FOR DELETE TO authenticated
  USING (is_director() OR is_admin() OR is_instructor());

-- CONFIG PAGOS ---------------------------------------------------------
CREATE POLICY "config_pagos_select" ON config_pagos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_pagos_insert" ON config_pagos
  FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "config_pagos_update" ON config_pagos
  FOR UPDATE TO authenticated USING (is_director()) WITH CHECK (is_director());
CREATE POLICY "config_pagos_delete" ON config_pagos
  FOR DELETE TO authenticated USING (is_director());

-- PRECIOS ALUMNOS ------------------------------------------------------
CREATE POLICY "precios_alumnos_select" ON precios_alumnos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "precios_alumnos_insert" ON precios_alumnos
  FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "precios_alumnos_update" ON precios_alumnos
  FOR UPDATE TO authenticated USING (is_director()) WITH CHECK (is_director());
CREATE POLICY "precios_alumnos_delete" ON precios_alumnos
  FOR DELETE TO authenticated USING (is_director());

-- PAGOS ALUMNOS --------------------------------------------------------
CREATE POLICY "pagos_alumnos_select" ON pagos_alumnos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pagos_alumnos_insert" ON pagos_alumnos
  FOR INSERT TO authenticated WITH CHECK (is_director() OR is_admin());
CREATE POLICY "pagos_alumnos_update" ON pagos_alumnos
  FOR UPDATE TO authenticated
  USING (is_director() OR is_admin())
  WITH CHECK (is_director() OR is_admin());
CREATE POLICY "pagos_alumnos_delete" ON pagos_alumnos
  FOR DELETE TO authenticated USING (is_director() OR is_admin());

-- PAGOS REALIZADOS -----------------------------------------------------
CREATE POLICY "pagos_realizados_select" ON pagos_realizados
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pagos_realizados_insert" ON pagos_realizados
  FOR INSERT TO authenticated WITH CHECK (is_director() OR is_admin());
CREATE POLICY "pagos_realizados_update" ON pagos_realizados
  FOR UPDATE TO authenticated
  USING (is_director() OR is_admin())
  WITH CHECK (is_director() OR is_admin());
CREATE POLICY "pagos_realizados_delete" ON pagos_realizados
  FOR DELETE TO authenticated USING (is_director() OR is_admin());

-- TEMARIO --------------------------------------------------------------
CREATE POLICY "temarios_select" ON temarios
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "temarios_insert" ON temarios
  FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "temarios_update" ON temarios
  FOR UPDATE TO authenticated USING (is_director()) WITH CHECK (is_director());
CREATE POLICY "temarios_delete" ON temarios
  FOR DELETE TO authenticated USING (is_director());

CREATE POLICY "semanas_temario_select" ON semanas_temario
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "semanas_temario_insert" ON semanas_temario
  FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "semanas_temario_update" ON semanas_temario
  FOR UPDATE TO authenticated USING (is_director()) WITH CHECK (is_director());
CREATE POLICY "semanas_temario_delete" ON semanas_temario
  FOR DELETE TO authenticated USING (is_director());
