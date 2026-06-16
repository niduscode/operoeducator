-- =====================================================================
-- 0003 — Tablas operativas: asistencias + evaluaciones.
--
-- Día de clase enforced por is_dia_de_clase(fecha) — reutilizamos el
-- helper de 0001 para que cualquier cambio de regla (ej: agregar jueves)
-- ocurra en UN solo lugar.
-- =====================================================================

-- ASISTENCIAS ALUMNOS --------------------------------------------------
-- Una fila por (alumno, fecha). UNIQUE garantiza no-duplicación.
--
-- DECISIÓN DE DISEÑO: los *_id_snapshot NO tienen FOREIGN KEY a
-- profes_guias/instructores. Son snapshots históricos pensados para
-- sobrevivir borrados duros. Si pusiera FK con ON DELETE SET NULL
-- perdería el snapshot al borrar el profe → perdería la verdad histórica
-- de pagos. El precio de no tener FK es que la app debe enviar UUIDs
-- válidos (no hay validación a nivel BD); a cambio se preserva la
-- inmutabilidad del registro de pago.
CREATE TABLE asistencias_alumnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  fecha date NOT NULL CHECK (is_dia_de_clase(fecha)),
  estado estado_asistencia NOT NULL,
  observacion text,
  registrada_por text NOT NULL,
  sucursal sucursal NOT NULL,
  curso curso NOT NULL,
  turno horario NOT NULL,
  -- Snapshots inmutables al momento de registrar:
  tarifa_instructor_aplicada integer
    CHECK (tarifa_instructor_aplicada IS NULL OR tarifa_instructor_aplicada >= 0),
  tarifa_profe_guia_aplicada integer
    CHECK (tarifa_profe_guia_aplicada IS NULL OR tarifa_profe_guia_aplicada >= 0),
  profe_guia_id_snapshot uuid,  -- snapshot histórico — NO es FK a propósito
  instructor_id_snapshot uuid,  -- snapshot histórico — NO es FK a propósito
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asistencias_alumnos_alumno_fecha_unique UNIQUE (alumno_id, fecha)
);

CREATE INDEX idx_asistencias_alumnos_sucursal_fecha
  ON asistencias_alumnos (sucursal, fecha);
CREATE INDEX idx_asistencias_alumnos_fecha ON asistencias_alumnos (fecha);
CREATE INDEX idx_asistencias_alumnos_alumno_id ON asistencias_alumnos (alumno_id);
CREATE INDEX idx_asistencias_alumnos_profe_guia_snapshot
  ON asistencias_alumnos (profe_guia_id_snapshot);
CREATE INDEX idx_asistencias_alumnos_instructor_snapshot
  ON asistencias_alumnos (instructor_id_snapshot);

-- ASISTENCIAS PROFES GUÍAS ---------------------------------------------
CREATE TABLE asistencias_profes_guias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profe_guia_id uuid NOT NULL REFERENCES profes_guias(id) ON DELETE CASCADE,
  fecha date NOT NULL CHECK (is_dia_de_clase(fecha)),
  estado estado_asistencia NOT NULL,
  observacion text,
  registrada_por text NOT NULL,
  sucursal sucursal NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asistencias_profes_guias_profe_fecha_unique UNIQUE (profe_guia_id, fecha)
);

CREATE INDEX idx_asistencias_profes_guias_sucursal_fecha
  ON asistencias_profes_guias (sucursal, fecha);
CREATE INDEX idx_asistencias_profes_guias_fecha
  ON asistencias_profes_guias (fecha);

-- EVALUACIONES ---------------------------------------------------------
-- Una por (alumno, fecha). Notas en escala chilena 1.0–10.0
-- (decimales permitidos: 7.5, 6.3, etc).
CREATE TABLE evaluaciones_alumnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  fecha date NOT NULL CHECK (is_dia_de_clase(fecha)),
  nota numeric(3, 1) NOT NULL CHECK (nota >= 1 AND nota <= 10),
  observacion text,
  evaluado_por text NOT NULL,
  sucursal sucursal NOT NULL,
  curso curso NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evaluaciones_alumnos_alumno_fecha_unique UNIQUE (alumno_id, fecha)
);

CREATE INDEX idx_evaluaciones_alumnos_sucursal_curso_fecha
  ON evaluaciones_alumnos (sucursal, curso, fecha);
CREATE INDEX idx_evaluaciones_alumnos_alumno_id
  ON evaluaciones_alumnos (alumno_id);
CREATE INDEX idx_evaluaciones_alumnos_fecha ON evaluaciones_alumnos (fecha);
