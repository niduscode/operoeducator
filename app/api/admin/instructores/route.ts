// API route SERVER-SIDE para crear / borrar cuentas de instructor.
//
// Crear instructor requiere:
//   1) Validar que quien hace el request es director (autenticado).
//   2) Crear la cuenta en Supabase Auth (auth.users) usando service_role —
//      cosa que el cliente browser NO puede hacer porque la admin API
//      requiere service_role secreta.
//   3) Crear el perfil operativo en la tabla `instructores` con user_id
//      apuntando a la cuenta auth recién creada.
//   4) Devolver { id, userId } al cliente.
//
// Si algo del paso 2 o 3 falla, intentamos revertir lo creado para no
// dejar estado huérfano (best effort — no transaccional cross-system).

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase-server";
import { determineRole } from "@/lib/types";

interface CreateBody {
  username: string;
  password: string;
  nombreCompleto: string;
  telefono?: string;
  sucursalActual: string;
  fechaIngreso?: string;
}

const INTERNAL_DOMAIN = "@operoeducator.internal";

async function requireDirector() {
  const sb = await getSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return { ok: false as const, status: 401, msg: "No autenticado." };
  }
  const role = determineRole(user.email ?? "");
  if (role !== "director") {
    return { ok: false as const, status: 403, msg: "Solo el director puede gestionar instructores." };
  }
  return { ok: true as const, user };
}

export async function POST(request: NextRequest) {
  const auth = await requireDirector();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }

  if (!body.username || !body.password || !body.nombreCompleto || !body.sucursalActual) {
    return NextResponse.json({ error: "Faltan campos requeridos: username, password, nombreCompleto, sucursalActual." }, { status: 400 });
  }
  if (body.password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }
  // Username debe ser ASCII alfanumérico + puntos (mismo formato que
  // director.christan, admin.finanzas, etc.).
  if (!/^[a-z0-9.]+$/.test(body.username)) {
    return NextResponse.json({ error: "El username solo puede tener letras minúsculas, números y puntos." }, { status: 400 });
  }

  const email = `${body.username}${INTERNAL_DOMAIN}`;
  const admin = getSupabaseServiceClient();

  // 1) Pre-check: ¿ya existe un instructor con ese email?
  const dup = await admin.from("instructores").select("id").eq("email", email).maybeSingle();
  if (dup.data) {
    return NextResponse.json({ error: "Ya existe un instructor con ese username." }, { status: 409 });
  }

  // 2) Crear cuenta auth.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: { role: "instructor", nombre_completo: body.nombreCompleto },
  });
  if (authErr || !created?.user) {
    return NextResponse.json({ error: `No se pudo crear la cuenta de acceso (${authErr?.message ?? "error desconocido"}).` }, { status: 500 });
  }
  const userId = created.user.id;

  // 3) Crear perfil. Si falla, revertir creación de auth.
  const { data: perfil, error: perfilErr } = await admin
    .from("instructores")
    .insert({
      user_id: userId,
      username: body.username,
      email,
      nombre_completo: body.nombreCompleto,
      telefono: body.telefono ?? null,
      sucursal_actual: body.sucursalActual,
      activo: true,
      fecha_ingreso: body.fechaIngreso ?? new Date().toISOString().split("T")[0],
      creado_por: auth.user.email?.split("@")[0] ?? "director",
      auth_verificado: true, // ya creamos la cuenta auth, no hay paso manual.
    })
    .select("id")
    .single();

  if (perfilErr || !perfil) {
    // Revertir auth.
    await admin.auth.admin.deleteUser(userId).catch((e) => {
      console.error("[admin/instructores] rollback auth failed:", e);
    });
    return NextResponse.json({ error: `Cuenta auth creada pero falló el perfil — se revirtió la cuenta (${perfilErr?.message ?? "error desconocido"}).` }, { status: 500 });
  }

  // 4) Primer entry del historial de asignaciones.
  await admin.from("historial_asignaciones").insert({
    instructor_id: perfil.id,
    sucursal: body.sucursalActual,
    fecha_inicio: body.fechaIngreso ?? new Date().toISOString().split("T")[0],
    fecha_fin: null,
    razon_cambio: "Asignación inicial",
    cambiado_por: auth.user.email?.split("@")[0] ?? "director",
  });

  return NextResponse.json({ id: perfil.id, userId, email });
}

// DELETE: borra el perfil + la cuenta auth correspondiente. Solo director.
// Usar /api/admin/instructores?id=<uuid>
export async function DELETE(request: NextRequest) {
  const auth = await requireDirector();
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta ?id=<uuid>." }, { status: 400 });

  const admin = getSupabaseServiceClient();
  const { data: inst } = await admin
    .from("instructores")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (!inst) return NextResponse.json({ error: "Instructor no existe." }, { status: 404 });

  const { error: delPerfilErr } = await admin.from("instructores").delete().eq("id", id);
  if (delPerfilErr) {
    return NextResponse.json({ error: `No se pudo borrar el perfil (${delPerfilErr.message}).` }, { status: 500 });
  }
  if (inst.user_id) {
    await admin.auth.admin.deleteUser(inst.user_id).catch((e) => {
      console.error("[admin/instructores] DELETE: no se pudo borrar auth.users", e);
    });
  }
  return NextResponse.json({ ok: true });
}
