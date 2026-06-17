-- =====================================================================
-- 0009 — Tabla app_users: roles director/admin gestionados desde la UI.
--
-- ANTES (migrations 0001-0008): los usernames con rol "director" o "admin"
-- estaban hardcoded en las funciones is_director() / is_admin(), y había
-- que sincronizarlos a mano con lib/types.ts (DIRECTORES / ADMINS) cada
-- vez que el cliente quería un usuario nuevo. Eso requería tocar código,
-- hacer commit y redesplegar — inviable para una entrega a otro equipo
-- de programadores que sólo deben operar la app.
--
-- AHORA: app_users es la fuente de verdad. Cualquier director puede
-- crear/borrar directores y admins desde /admin/usuarios. Las funciones
-- is_director() / is_admin() consultan esta tabla. Las constantes
-- DIRECTORES / ADMINS en lib/types.ts quedan deprecadas (mantenidas
-- únicamente como fallback de bootstrap si la tabla está vacía).
--
-- NOTA sobre integración con app.simplifies.net (app de barberos): cuando
-- un barbero salte a "modo educador" desde la app de barbero, el sistema
-- consultor podrá hacer SELECT directo a app_users.email para resolver
-- el rol — no necesita conocer constantes hardcoded.
-- =====================================================================

-- Tabla principal. Los emails se almacenan en lowercase para evitar
-- duplicados case-sensitive. El role es un ENUM declarado en 0001.
-- Sólo guardamos director/admin acá; los instructores viven en la
-- tabla `instructores` y se resuelven por exclusión.
CREATE TABLE app_users (
  email           TEXT PRIMARY KEY CHECK (email = lower(email)),
  username        TEXT NOT NULL UNIQUE,
  role            user_role NOT NULL CHECK (role IN ('director', 'admin')),
  nombre_completo TEXT NOT NULL,
  creado_por      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX app_users_role_idx ON app_users (role);

CREATE TRIGGER trg_app_users_touch
BEFORE UPDATE ON app_users
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Seed inicial: el director que ya creamos manualmente debe quedar acá
-- para no perder acceso al ejecutar esta migración. Si ya existía como
-- 'director.christan' en el JWT email, la nueva is_director() lo va a
-- encontrar inmediatamente.
INSERT INTO app_users (email, username, role, nombre_completo, creado_por)
VALUES
  ('director.christan@operoeducator.internal', 'director.christan', 'director', 'Christan Hernández (Director)', 'system'),
  ('director.maria@operoeducator.internal',    'director.maria',    'director', 'María (Director)',                 'system'),
  ('admin.finanzas@operoeducator.internal',    'admin.finanzas',    'admin',    'Admin Finanzas',                   'system')
ON CONFLICT (email) DO NOTHING;

-- =====================================================================
-- Helpers refactorizados: ahora leen de app_users.
--
-- Mantienen el contrato (función STABLE que devuelve BOOLEAN) usado por
-- todas las RLS policies (migration 0006) — no se tocan las policies.
--
-- Fallback: si la tabla está vacía por error operativo (DROP TABLE,
-- truncate accidental), se conservan los usernames legacy para que el
-- director siempre pueda recuperar acceso. Esto se puede eliminar
-- cuando la entrega a terceros sea estable.
-- =====================================================================

CREATE OR REPLACE FUNCTION is_director()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE email = lower(
      COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
        ''
      )
    )
      AND role = 'director'
  )
  OR current_username() IN ('director.christan', 'director.maria');
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE email = lower(
      COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
        ''
      )
    )
      AND role = 'admin'
  )
  OR current_username() IN ('admin.finanzas');
$$;

-- =====================================================================
-- RLS para app_users.
--
-- Lectura: cualquier director o admin autenticado puede ver la lista
-- (necesario para que /admin/usuarios pueda renderizar). Los instructores
-- no la leen — su UI nunca llega ahí.
--
-- Escritura (INSERT/UPDATE/DELETE): SÓLO director. La gestión de roles
-- es responsabilidad exclusiva del director. La API route hace el
-- cambio con service_role, pero la policy queda como red de seguridad.
-- =====================================================================

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_users_select_staff
  ON app_users FOR SELECT
  USING (is_director() OR is_admin());

CREATE POLICY app_users_write_director
  ON app_users FOR ALL
  USING (is_director())
  WITH CHECK (is_director());
