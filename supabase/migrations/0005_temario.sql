-- =====================================================================
-- 0005 — Temario: curso → semanas con tema + PDF por día.
--
-- Modelo: una fila en `temarios` por curso (Junior/Senior/Master) con
-- la fecha_inicio (siempre martes). Las semanas viven en
-- semanas_temario, una fila por (curso, semana_numero).
-- =====================================================================

CREATE TABLE temarios (
  curso curso PRIMARY KEY,
  -- "Semana 1" arranca el primer martes definido por esta fecha.
  -- es_martes() (helper de 0001) enforced para evitar fecha inválida.
  fecha_inicio date NOT NULL CHECK (es_martes(fecha_inicio)),
  actualizado_por text NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER touch_temarios_updated_at
  BEFORE UPDATE ON temarios
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE semanas_temario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso curso NOT NULL REFERENCES temarios(curso) ON DELETE CASCADE,
  semana_numero integer NOT NULL CHECK (semana_numero > 0),
  titulo text NOT NULL CHECK (length(titulo) > 0),
  descripcion text,
  tema_martes text,
  tema_miercoles text,
  -- Storage de Supabase: bucket `temarios`. URL pública firmada al subir.
  pdf_martes_url text,
  pdf_martes_nombre text,
  pdf_miercoles_url text,
  pdf_miercoles_nombre text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curso, semana_numero)
);

CREATE INDEX idx_semanas_temario_curso_semana
  ON semanas_temario (curso, semana_numero);

CREATE TRIGGER touch_semanas_temario_updated_at
  BEFORE UPDATE ON semanas_temario
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
