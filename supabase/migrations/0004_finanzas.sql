-- =====================================================================
-- 0004 — Finanzas: config de pagos, precios, pagos de alumnos, pagos
-- realizados a personal.
--
-- (tipo_pago_realizado ya está creado en 0001; aquí solo se referencia.)
-- =====================================================================

-- CONFIG PAGOS — SINGLETON --------------------------------------------
-- Solo existe un row con id='default'. Las tarifas se desnormalizan en
-- columnas individuales (no JSON) para que sean queryables y validables
-- con CHECK por monto.
CREATE TABLE config_pagos (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  -- Modelo NUEVO escalado (por DÍA, no por curso):
  monto_instructor_primer_alumno integer NOT NULL DEFAULT 0
    CHECK (monto_instructor_primer_alumno >= 0),
  monto_instructor_alumno_adicional integer NOT NULL DEFAULT 0
    CHECK (monto_instructor_alumno_adicional >= 0),
  -- Modelo LEGACY tarifa por curso (instructor) — fallback histórico.
  tarifa_instructor_junior integer NOT NULL DEFAULT 0
    CHECK (tarifa_instructor_junior >= 0),
  tarifa_instructor_senior integer NOT NULL DEFAULT 0
    CHECK (tarifa_instructor_senior >= 0),
  tarifa_instructor_master integer NOT NULL DEFAULT 0
    CHECK (tarifa_instructor_master >= 0),
  -- Profes guías: SIGUEN con tarifa por curso (no migran al modelo escalado).
  tarifa_profe_guia_junior integer NOT NULL DEFAULT 0
    CHECK (tarifa_profe_guia_junior >= 0),
  tarifa_profe_guia_senior integer NOT NULL DEFAULT 0
    CHECK (tarifa_profe_guia_senior >= 0),
  tarifa_profe_guia_master integer NOT NULL DEFAULT 0
    CHECK (tarifa_profe_guia_master >= 0),
  actualizado_por text NOT NULL DEFAULT 'system',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER config_pagos_touch_updated_at
  BEFORE UPDATE ON config_pagos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO config_pagos (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- PRECIOS ALUMNOS — SINGLETON -----------------------------------------
CREATE TABLE precios_alumnos (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  precio_junior integer NOT NULL DEFAULT 0 CHECK (precio_junior >= 0),
  precio_senior integer NOT NULL DEFAULT 0 CHECK (precio_senior >= 0),
  precio_master integer NOT NULL DEFAULT 0 CHECK (precio_master >= 0),
  duracion_junior_clases integer NOT NULL DEFAULT 8
    CHECK (duracion_junior_clases > 0),
  duracion_senior_clases integer NOT NULL DEFAULT 16
    CHECK (duracion_senior_clases > 0),
  duracion_master_clases integer NOT NULL DEFAULT 8
    CHECK (duracion_master_clases > 0),
  actualizado_por text NOT NULL DEFAULT 'system',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER precios_alumnos_touch_updated_at
  BEFORE UPDATE ON precios_alumnos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO precios_alumnos (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- PAGOS ALUMNOS --------------------------------------------------------
-- Permite pagos parciales: varias filas por (alumno, año, mes).
-- alumno_nombre, curso, sucursal son DENORMALIZADOS para evitar joins
-- en listados y para preservar el dato original si el alumno cambia.
-- ON DELETE RESTRICT en alumno_id: no permitimos borrar un alumno con
-- historial de pagos. La app usa soft-delete (activo=false) en su lugar.
CREATE TABLE pagos_alumnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES alumnos(id) ON DELETE RESTRICT,
  alumno_nombre text NOT NULL,
  curso curso NOT NULL,
  sucursal sucursal NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio integer NOT NULL CHECK (anio BETWEEN 2020 AND 2100),
  monto integer NOT NULL CHECK (monto > 0),
  fecha_pago date NOT NULL,
  medio_pago medio_pago_alumno NOT NULL,
  tipo_pago tipo_pago_alumno NOT NULL DEFAULT 'Total',
  comprobante_url text,
  comprobante_nombre text,
  observacion text,
  registrado_por text NOT NULL,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pagos_alumnos_alumno_anio_mes_idx
  ON pagos_alumnos (alumno_id, anio, mes);
CREATE INDEX pagos_alumnos_anio_mes_sucursal_idx
  ON pagos_alumnos (anio, mes, sucursal);
CREATE INDEX pagos_alumnos_fecha_pago_idx ON pagos_alumnos (fecha_pago);

CREATE TRIGGER pagos_alumnos_touch_updated_at
  BEFORE UPDATE ON pagos_alumnos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- PAGOS REALIZADOS -----------------------------------------------------
-- Persona_id es POLIMÓRFICO (puede apuntar a instructores.id o a
-- profes_guias.id según `tipo`). Por eso NO tiene FK directa. La app
-- garantiza que el UUID exista en la tabla correcta antes de insertar.
-- UNIQUE (tipo, persona_id, mes, anio) evita marcar dos veces el mismo
-- pago del mismo mes.
CREATE TABLE pagos_realizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_pago_realizado NOT NULL,
  persona_id uuid NOT NULL,
  persona_nombre text NOT NULL,
  sucursal sucursal NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio integer NOT NULL CHECK (anio BETWEEN 2020 AND 2100),
  monto integer NOT NULL CHECK (monto >= 0),
  fecha_pago date NOT NULL,
  pagado_por text NOT NULL,
  pagado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, persona_id, mes, anio)
);

CREATE INDEX pagos_realizados_anio_mes_sucursal_idx
  ON pagos_realizados (anio, mes, sucursal);
CREATE INDEX pagos_realizados_tipo_persona_idx
  ON pagos_realizados (tipo, persona_id);

CREATE TRIGGER pagos_realizados_touch_updated_at
  BEFORE UPDATE ON pagos_realizados
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
