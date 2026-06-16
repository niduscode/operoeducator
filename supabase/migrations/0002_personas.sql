-- =====================================================================
-- 0002 — Personas: instructores, profes guías, alumnos, historial.
-- =====================================================================

-- INSTRUCTORES ---------------------------------------------------------
-- user_id vincula con auth.users (la cuenta Firebase Auth equivalente).
-- ON DELETE SET NULL para que borrar la cuenta auth no destruya el perfil
-- operativo ni rompa pagos/asistencias históricas.
CREATE TABLE instructores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  username text UNIQUE NOT NULL CHECK (length(username) > 0),
  email text UNIQUE NOT NULL,
  nombre_completo text NOT NULL,
  telefono text,
  sucursal_actual sucursal NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  fecha_ingreso date NOT NULL DEFAULT current_date,
  creado_por text NOT NULL,
  auth_verificado boolean NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_instructores_sucursal_activo
  ON instructores (sucursal_actual, activo);

CREATE TRIGGER trg_instructores_touch_updated_at
  BEFORE UPDATE ON instructores
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- PROFES GUÍAS ---------------------------------------------------------
-- No tienen cuenta en auth — son solo registros operativos para pagos.
CREATE TABLE profes_guias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(nombre) > 0),
  telefono text,
  sucursal sucursal NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  fecha_ingreso date NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profes_guias_sucursal_activo
  ON profes_guias (sucursal, activo);

CREATE TRIGGER trg_profes_guias_touch_updated_at
  BEFORE UPDATE ON profes_guias
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ALUMNOS --------------------------------------------------------------
-- Asignación a UNO de los dos roles operativos. El CHECK garantiza que
-- nunca tenga AMBOS al mismo tiempo. Pueden ser ambos NULL (alumno
-- todavía sin asignar) — esto es intencional.
CREATE TABLE alumnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(nombre) > 0),
  telefono text,
  sucursal sucursal NOT NULL,
  curso curso NOT NULL,
  horario horario NOT NULL,
  fecha date NOT NULL DEFAULT current_date,
  profe_guia_id uuid REFERENCES profes_guias(id) ON DELETE SET NULL,
  instructor_id uuid REFERENCES instructores(id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_alumnos_guia_xor_instructor
    CHECK (NOT (profe_guia_id IS NOT NULL AND instructor_id IS NOT NULL))
);

CREATE INDEX idx_alumnos_sucursal_activo
  ON alumnos (sucursal, activo);
CREATE INDEX idx_alumnos_instructor_id ON alumnos (instructor_id);
CREATE INDEX idx_alumnos_profe_guia_id ON alumnos (profe_guia_id);

CREATE TRIGGER trg_alumnos_touch_updated_at
  BEFORE UPDATE ON alumnos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- HISTORIAL DE ASIGNACIONES --------------------------------------------
-- Bitácora cronológica de las sucursales por las que pasó cada instructor.
-- fecha_fin = NULL significa la asignación actual (única vigente por
-- instructor — invariante que la app mantiene, no enforced en BD).
CREATE TABLE historial_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES instructores(id) ON DELETE CASCADE,
  sucursal sucursal NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  razon_cambio text,
  cambiado_por text NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_historial_asignaciones_fechas
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX idx_historial_asignaciones_instructor_fecha
  ON historial_asignaciones (instructor_id, fecha_inicio DESC);

-- Índice parcial: acelera "asignación vigente del instructor X".
-- Solo indexa rows con fecha_fin NULL (siempre minoría).
CREATE INDEX idx_historial_asignaciones_vigentes
  ON historial_asignaciones (instructor_id) WHERE fecha_fin IS NULL;
