-- =====================================================================
-- 0008 — Pago escalado al instructor POR CURSO.
--
-- Modelo viejo: 1 par (montoInstructorPrimerAlumno, montoInstructorAlumno
-- Adicional) común para todos los cursos.
--
-- Modelo nuevo: 3 pares — uno por curso (Junior, Senior, Master) — porque
-- enseñar Senior vale más que Junior y Master cobra distinto. El cálculo
-- del día sigue siendo:
--    pago_dia(curso) = primer(curso) + (alumnos_del_curso - 1) × adic(curso)
--
-- Si un instructor atiende alumnos de varios cursos el mismo día, se
-- suma el cálculo por curso (no se promedia ni se redondea).
--
-- Estrategia:
--   1. Agregar 6 columnas nuevas (3 cursos × {primer, adicional}).
--   2. Copiar los valores viejos a Junior por defecto (preserva el cálculo
--      actual mientras el director no haya tocado los nuevos campos).
--   3. Drop las columnas viejas — ya no se usan en ningún cálculo.
-- =====================================================================

ALTER TABLE config_pagos
  ADD COLUMN monto_instructor_primer_alumno_junior integer NOT NULL DEFAULT 0
    CHECK (monto_instructor_primer_alumno_junior >= 0),
  ADD COLUMN monto_instructor_alumno_adicional_junior integer NOT NULL DEFAULT 0
    CHECK (monto_instructor_alumno_adicional_junior >= 0),
  ADD COLUMN monto_instructor_primer_alumno_senior integer NOT NULL DEFAULT 0
    CHECK (monto_instructor_primer_alumno_senior >= 0),
  ADD COLUMN monto_instructor_alumno_adicional_senior integer NOT NULL DEFAULT 0
    CHECK (monto_instructor_alumno_adicional_senior >= 0),
  ADD COLUMN monto_instructor_primer_alumno_master integer NOT NULL DEFAULT 0
    CHECK (monto_instructor_primer_alumno_master >= 0),
  ADD COLUMN monto_instructor_alumno_adicional_master integer NOT NULL DEFAULT 0
    CHECK (monto_instructor_alumno_adicional_master >= 0);

-- Migrar los valores existentes (si el director ya había configurado el
-- modelo común, copiarlos a Junior como default; los demás cursos arrancan
-- en cero — el director debe entrarlos a mano).
UPDATE config_pagos
SET monto_instructor_primer_alumno_junior = monto_instructor_primer_alumno,
    monto_instructor_alumno_adicional_junior = monto_instructor_alumno_adicional
WHERE id = 'default';

-- Borrar las columnas viejas.
ALTER TABLE config_pagos
  DROP COLUMN monto_instructor_primer_alumno,
  DROP COLUMN monto_instructor_alumno_adicional;
