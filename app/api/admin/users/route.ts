// API route SERVER-SIDE para gestionar directores y administradores.
//
// La fuente de verdad de los roles director/admin es la tabla `app_users`
// (migración 0009). Esta ruta es lo que la UI /admin/usuarios usa para
// crear, listar (vía PostgREST/RLS desde el cliente), cambiar de rol o
// borrar usuarios staff.
//
// Crear un nuevo director/admin requiere:
//   1) Validar que el caller es director.
//   2) Crear la cuenta en Supabase Auth (auth.users) usando service_role.
//   3) Insertar el row en app_users con el rol elegido.
//   4) Si paso 3 falla, revertir paso 2 para no dejar auth huérfano.
//
// Borrar:
//   1) Validar caller director.
//   2) Borrar row de app_users.
//   3) Borrar cuenta auth.users correspondiente (best effort).
//   4) NO permitir borrarse a sí mismo (regla de seguridad para no
//      quedarse afuera del sistema).
//
// Cambiar rol (PATCH):
//   1) Validar caller director.
//   2) Update simple en app_users (la cuenta auth no se toca).
//   3) NO permitir cambiarse el rol a sí mismo (idem regla anterior).

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase-server";
import { determineRole, type StaffRole } from "@/lib/types";

interface CreateBody {
  username: string;
  password: string;
  nombreCompleto: string;
  role: StaffRole;
}

interface PatchBody {
  email: string;
  role: StaffRole;
}

const INTERNAL_DOMAIN = "@operoeducator.internal";

// Resuelve si el caller es director. Consulta app_users vía service_role
// (porque queremos saltarnos RLS para evitar dependencia circular si el
// caller justo recién fue agregado y todavía no aparece en su propio JWT
// claim). Fallback a determineRole() para mantener el bootstrap.
async function requireDirector() {
  const sb = await getSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !user.email) {
    return { ok: false as const, status: 401, msg: "No autenticado." };
  }
  const email = user.email.toLowerCase();

  const admin = getSupabaseServiceClient();
  const { data: row } = await admin
    .from("app_users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  const role: StaffRole | "instructor" =
    (row?.role as StaffRole | undefined) ?? determineRole(email);

  if (role !== "director") {
    return { ok: false as const, status: 403, msg: "Solo el director puede gestionar usuarios." };
  }
  return { ok: true as const, user, email };
}

// GET: lista usuarios staff. Lo dejamos disponible aunque la UI también
// puede leer via supabase-js client (RLS permite a directores/admins
// hacer SELECT). Sirve si en el futuro quisiéramos cachear server-side.
export async function GET() {
  const auth = await requireDirector();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const admin = getSupabaseServiceClient();
  const { data, error } = await admin
    .from("app_users")
    .select("*")
    .order("role", { ascending: true })
    .order("username", { ascending: true });
  if (error) {
    return NextResponse.json({ error: `No se pudo leer la lista (${error.message}).` }, { status: 500 });
  }
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireDirector();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }

  if (!body.username || !body.password || !body.nombreCompleto || !body.role) {
    return NextResponse.json({ error: "Faltan campos requeridos: username, password, nombreCompleto, role." }, { status: 400 });
  }
  if (body.role !== "director" && body.role !== "admin") {
    return NextResponse.json({ error: "El rol debe ser 'director' o 'admin'." }, { status: 400 });
  }
  if (body.password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }
  if (!/^[a-z0-9.]+$/.test(body.username)) {
    return NextResponse.json({ error: "El username solo puede tener letras minúsculas, números y puntos." }, { status: 400 });
  }

  const email = `${body.username}${INTERNAL_DOMAIN}`.toLowerCase();
  const admin = getSupabaseServiceClient();

  // Pre-check duplicados en app_users + en instructores (un mismo
  // username no puede ser staff y a la vez instructor).
  const dupApp = await admin.from("app_users").select("email").eq("email", email).maybeSingle();
  if (dupApp.data) {
    return NextResponse.json({ error: "Ya existe un usuario staff con ese username." }, { status: 409 });
  }
  const dupInst = await admin.from("instructores").select("id").eq("email", email).maybeSingle();
  if (dupInst.data) {
    return NextResponse.json({ error: "Ese username ya está usado por un instructor." }, { status: 409 });
  }

  // 1) Crear cuenta auth.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: { role: body.role, nombre_completo: body.nombreCompleto },
  });
  if (authErr || !created?.user) {
    return NextResponse.json({ error: `No se pudo crear la cuenta de acceso (${authErr?.message ?? "error desconocido"}).` }, { status: 500 });
  }

  // 2) Insertar en app_users. Si falla, revertir auth.
  const { error: insertErr } = await admin.from("app_users").insert({
    email,
    username: body.username,
    role: body.role,
    nombre_completo: body.nombreCompleto,
    creado_por: auth.email.split("@")[0],
  });
  if (insertErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch((e) => {
      console.error("[admin/users] rollback auth failed:", e);
    });
    return NextResponse.json({ error: `Cuenta auth creada pero falló registrar el rol — se revirtió (${insertErr.message}).` }, { status: 500 });
  }

  return NextResponse.json({ email, role: body.role });
}

// PATCH: cambia el rol de un usuario existente entre director y admin.
// Body: { email: string, role: StaffRole }
export async function PATCH(request: NextRequest) {
  const auth = await requireDirector();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }

  if (!body.email || !body.role) {
    return NextResponse.json({ error: "Faltan campos: email, role." }, { status: 400 });
  }
  if (body.role !== "director" && body.role !== "admin") {
    return NextResponse.json({ error: "El rol debe ser 'director' o 'admin'." }, { status: 400 });
  }
  const targetEmail = body.email.toLowerCase();
  if (targetEmail === auth.email) {
    return NextResponse.json({ error: "No puedes cambiar tu propio rol." }, { status: 400 });
  }

  const admin = getSupabaseServiceClient();
  const { error } = await admin.from("app_users").update({ role: body.role }).eq("email", targetEmail);
  if (error) {
    return NextResponse.json({ error: `No se pudo actualizar el rol (${error.message}).` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE: borra un usuario staff. Usar /api/admin/users?email=<email>
export async function DELETE(request: NextRequest) {
  const auth = await requireDirector();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const targetEmail = request.nextUrl.searchParams.get("email")?.toLowerCase();
  if (!targetEmail) return NextResponse.json({ error: "Falta ?email=<email>." }, { status: 400 });
  if (targetEmail === auth.email) {
    return NextResponse.json({ error: "No puedes borrarte a ti mismo." }, { status: 400 });
  }

  const admin = getSupabaseServiceClient();

  // Borrar app_users (la fuente de verdad del rol).
  const { error: delErr } = await admin.from("app_users").delete().eq("email", targetEmail);
  if (delErr) {
    return NextResponse.json({ error: `No se pudo borrar el usuario (${delErr.message}).` }, { status: 500 });
  }

  // Borrar la cuenta auth correspondiente (best effort — buscamos por email).
  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = authUsers?.users.find((u) => u.email?.toLowerCase() === targetEmail);
  if (found) {
    await admin.auth.admin.deleteUser(found.id).catch((e) => {
      console.error("[admin/users] DELETE: no se pudo borrar auth.users", e);
    });
  }

  return NextResponse.json({ ok: true });
}
