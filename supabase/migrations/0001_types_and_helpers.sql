-- =====================================================================
-- 0001 — Extensiones, ENUM types, funciones helper (sin tablas).
--
-- Este archivo establece el vocabulario común usado por todas las
-- migraciones posteriores: tipos enumerados (sucursales, cursos,
-- estados) + helpers para auth/RLS + helper de "día de clase".
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUM TYPES -----------------------------------------------------------

CREATE TYPE sucursal AS ENUM (
  'Muermos', 'Puerto Montt', 'Osorno', 'Valdivia', 'Temuco'
);

CREATE TYPE curso AS ENUM ('Junior', 'Senior', 'Master');

CREATE TYPE horario AS ENUM ('Mañana', 'Tarde');

CREATE TYPE estado_asistencia AS ENUM ('Presente', 'Tarde', 'Ausente');

CREATE TYPE medio_pago_alumno AS ENUM (
  'Transferencia', 'Efectivo', 'Tarjeta de Débito', 'Tarjeta de Crédito', 'Otro'
);

CREATE TYPE tipo_pago_alumno AS ENUM (
  'Total',
  'Parcial - Primera cuota',
  'Parcial - Segunda cuota',
  'Parcial - Otro'
);

CREATE TYPE tipo_pago_realizado AS ENUM ('instructor', 'profeGuia');

CREATE TYPE user_role AS ENUM ('director', 'admin', 'instructor');

-- HELPERS GENÉRICOS ----------------------------------------------------

-- Trigger: setea NEW.updated_at = now() antes de UPDATE.
-- Se conecta por cada tabla con su propia columna updated_at.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Devuelve la parte antes del '@' del email del JWT.
-- Usado para derivar el rol y para los "creadoPor" / "registradoPor".
-- STABLE porque el JWT es constante dentro de una transacción.
CREATE OR REPLACE FUNCTION current_username()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT split_part(
    COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
      ''
    ),
    '@',
    1
  );
$$;

-- Lista de directores hardcoded. MANTENER EN SINCRONÍA con
-- lib/types.ts (DIRECTORES). Si agregas un director nuevo, edítalo
-- en LOS DOS lugares (app + esta función).
CREATE OR REPLACE FUNCTION is_director()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT current_username() IN ('director.christan', 'director.maria');
$$;

-- Lista de admins. Misma regla de sincronización con lib/types.ts (ADMINS).
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT current_username() IN ('admin.finanzas');
$$;

-- Cualquier autenticado que no es director ni admin se trata como instructor.
-- Si en el futuro quieres ser estricto (validar que exista en la tabla
-- instructores con activo=true), reemplaza por una consulta a esa tabla.
CREATE OR REPLACE FUNCTION is_instructor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT is_director()
     AND NOT is_admin();
$$;

-- Único día de clase: martes y miércoles (ISO: lun=1, mar=2, mié=3, ...).
-- IMMUTABLE permite usarlo en CHECK constraints (Postgres lo requiere).
CREATE OR REPLACE FUNCTION is_dia_de_clase(fecha date)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXTRACT(ISODOW FROM fecha) IN (2, 3);
$$;

-- Helper específico: solo martes. Usado por temarios.fecha_inicio
-- porque la "semana 1" del curso siempre arranca un martes.
CREATE OR REPLACE FUNCTION es_martes(fecha date)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXTRACT(ISODOW FROM fecha) = 2;
$$;
