-- =====================================================================
-- 0007 — Inscripción de alumnos + remover Muermos del ENUM sucursal.
--
-- Reglas de negocio:
--   - Cada curso tiene su propio MONTO de inscripción (Junior/Senior/Master).
--   - Si el alumno paga el curso completo en una vez → no paga inscripción.
--   - Si no tiene todo, paga la inscripción primero para apartar el cupo
--     y luego completa con la mensualidad.
--   - El registro de pago debe distinguir si incluye o no inscripción.
--
-- Sucursal Muermos: la academia ya no opera ahí. Como acabamos de wipear
-- todos los datos operativos, podemos recrear el ENUM sin Muermos sin
-- romper foreign keys ni rows existentes.
-- =====================================================================

-- ============== 1. Inscripción en precios_alumnos =====================

ALTER TABLE precios_alumnos
  ADD COLUMN inscripcion_junior integer NOT NULL DEFAULT 0
    CHECK (inscripcion_junior >= 0),
  ADD COLUMN inscripcion_senior integer NOT NULL DEFAULT 0
    CHECK (inscripcion_senior >= 0),
  ADD COLUMN inscripcion_master integer NOT NULL DEFAULT 0
    CHECK (inscripcion_master >= 0);

-- ============== 2. paga_inscripcion en pagos_alumnos ==================
-- Default false: la mayoría de pagos serán de mensualidad sola. El form
-- de "Registrar pago" pone true cuando el director marca el checkbox.

ALTER TABLE pagos_alumnos
  ADD COLUMN paga_inscripcion boolean NOT NULL DEFAULT false;

-- ============== 3. Remover Muermos del ENUM sucursal ==================
-- Postgres NO permite quitar valores de un ENUM directamente. La técnica
-- es: crear el ENUM nuevo, alterar columnas para usar el nuevo, drop el
-- viejo, renombrar el nuevo al nombre original.
--
-- Aprovechamos el wipe reciente (cero datos en tablas operativas) para
-- hacer esto sin riesgo de violar el cast.

-- Crear el nuevo ENUM.
CREATE TYPE sucursal_v2 AS ENUM (
  'Puerto Montt', 'Osorno', 'Valdivia', 'Temuco'
);

-- Alterar TODAS las columnas que usen el tipo viejo. El orden importa:
-- primero columnas indexadas/con default; el USING reinterpreta.
ALTER TABLE instructores
  ALTER COLUMN sucursal_actual TYPE sucursal_v2
  USING sucursal_actual::text::sucursal_v2;

ALTER TABLE profes_guias
  ALTER COLUMN sucursal TYPE sucursal_v2
  USING sucursal::text::sucursal_v2;

ALTER TABLE alumnos
  ALTER COLUMN sucursal TYPE sucursal_v2
  USING sucursal::text::sucursal_v2;

ALTER TABLE historial_asignaciones
  ALTER COLUMN sucursal TYPE sucursal_v2
  USING sucursal::text::sucursal_v2;

ALTER TABLE asistencias_alumnos
  ALTER COLUMN sucursal TYPE sucursal_v2
  USING sucursal::text::sucursal_v2;

ALTER TABLE asistencias_profes_guias
  ALTER COLUMN sucursal TYPE sucursal_v2
  USING sucursal::text::sucursal_v2;

ALTER TABLE evaluaciones_alumnos
  ALTER COLUMN sucursal TYPE sucursal_v2
  USING sucursal::text::sucursal_v2;

ALTER TABLE pagos_alumnos
  ALTER COLUMN sucursal TYPE sucursal_v2
  USING sucursal::text::sucursal_v2;

ALTER TABLE pagos_realizados
  ALTER COLUMN sucursal TYPE sucursal_v2
  USING sucursal::text::sucursal_v2;

-- Drop el ENUM viejo y renombrar el nuevo.
DROP TYPE sucursal;
ALTER TYPE sucursal_v2 RENAME TO sucursal;
