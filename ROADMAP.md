<div align="center">

# 🎓 OperoEducator — Roadmap Técnico

**Sistema de gestión integral para Academia Hernández**
*Red de barberías · Chile*

![Status](https://img.shields.io/badge/status-v2.0%20producción%20interna-success)
![Stack](https://img.shields.io/badge/stack-Next.js%2016%20%2B%20Firebase-blue)
![Lang](https://img.shields.io/badge/lang-TypeScript%20%2B%20Tailwind-3178C6)
![License](https://img.shields.io/badge/license-privado-lightgrey)

</div>

---

## 📋 Índice

1. [Resumen Ejecutivo](#-resumen-ejecutivo)
2. [Funcionalidades Implementadas](#-funcionalidades-implementadas)
3. [Roadmap — Mejoras Recomendadas](#-roadmap--mejoras-recomendadas)
4. [Decisiones de Arquitectura](#-decisiones-de-arquitectura)
5. [Puntos de Atención Técnicos](#️-puntos-de-atención-técnicos)
6. [Contactos y Handover](#-contactos-y-handover)

---

## 🎯 Resumen Ejecutivo

### ¿Qué es OperoEducator?

OperoEducator es un **SaaS interno** desarrollado para la **Academia Hernández**, red de barberías con presencia en cinco sucursales del sur de Chile (Muermos, Puerto Montt, Osorno, Valdivia y Temuco). El sistema centraliza la operación académica y financiera de la academia: alumnos, instructores, profes guías, asistencias diarias, evaluaciones, temario semanal, pagos a personal y cobranza de mensualidades.

### Stack Tecnológico

| Capa            | Tecnología                                  |
| --------------- | ------------------------------------------- |
| **Framework**   | Next.js 16 (App Router) + React 19          |
| **Lenguaje**    | TypeScript (strict)                         |
| **Estilos**     | Tailwind CSS 4                              |
| **Backend**     | Firebase (Firestore + Auth + Storage)       |
| **Build**       | Turbopack                                   |
| **Hosting**     | Simplifais (Brasil) — *deploy pendiente*    |
| **CI/Tooling**  | ESLint 9, npm                               |

### Estado Actual

> **v2.0 lista en producción interna.**
> La web está funcionalmente completa y operando con datos reales de la academia. Todos los flujos críticos (login, asistencia, temario, pagos) están testeados manualmente y en uso diario.

### Filosofía del Producto

OperoEducator nació para reemplazar planillas Excel y mensajes de WhatsApp por un único panel donde el director ve todo, los instructores marcan asistencia desde el celular en menos de 30 segundos, y los pagos se calculan solos. La premisa: **simplicidad operativa primero, sofisticación técnica después**. Cada decisión arquitectónica privilegia que el flujo diario funcione hoy, dejando documentadas las extensiones para cuando el negocio lo amerite.

> 🚀 Construido en pocos días con **Claude Code** y **Claude.ai** como copilotos por **Gregory Delgado Hernández**, Director y Master Educator de Academia Hernández.

---

## ✅ Funcionalidades Implementadas

<table>
<tr>
<td width="50%" valign="top">

### 🔐 Autenticación
- 3 roles: **director**, **admin**, **instructor**
- Login con username (email interno auto-generado)
- Guards reactivos por rol en todas las rutas
- Roles derivados de `lib/types.ts`

### 👥 Gestión de Personas
- **Alumnos**: CRUD + importación masiva Excel/CSV
- **Instructores**: alta + reasignación de sucursal con historial auditable
- **Profes guías**: CRUD con límite recomendado de 5 alumnos por profe
- Asignación alumno ↔ profe guía con validación de sucursal

### 📚 Aulas Virtuales (Instructor)
- Asistencia diaria por curso y turno
- Estado: Presente / Tarde / Ausente
- Evaluación 1–10 con observaciones
- Asistencia de profes guías
- Tema y PDF del día visible (martes/miércoles)
- Lock de edición para días pasados

</td>
<td width="50%" valign="top">

### 📖 Temario por Curso
- 3 cursos: Junior · Senior · Master
- Editor de semanas con tema martes/miércoles
- Subida de PDFs por día (máx. 5 MB)
- Cálculo automático de "semana actual" desde fechaInicio

### 💰 Pagos
- **Alumnos**: registro mensual con comprobante (JPG/PNG/WEBP/PDF)
- **Instructores**: cálculo automático por alumnos asistidos × tarifa
- **Profes guías**: misma lógica con tarifa diferenciada
- Vista "Mi Pago" para instructor (auto-actualizada)
- Configuración de tarifas y precios singleton

### 🏦 Conciliación Bancaria
- Estado de morosidad mensual reactivo
- Tabla "Al día" vs "Con deuda"
- Total recaudado vs total esperado
- % de cobranza por sucursal
- Acceso directo "Registrar pago" desde alerta de mora

</td>
</tr>
</table>

---

## 🗺️ Roadmap — Mejoras Recomendadas

> **Leyenda de prioridad**
> 🔴 **Alta** — bloquea escalabilidad o seguridad real · 🟡 **Media** — mejora UX/operación notable · 🟢 **Baja** — nice-to-have, después de estabilizar
>
> **Esfuerzo**
> **S** ≤ 1 día · **M** 2–5 días · **L** 1–2 semanas · **XL** > 2 semanas

---

### 🛡️ Seguridad Avanzada

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🔴 | Migrar roles a Custom Claims | M | Cloud Functions · plan Blaze |
| 🔴 | Validación de pagos duplicados en transacción | S | — |
| 🔴 | App Check con reCAPTCHA v3 | S | Firebase Console |
| 🟡 | Cloud Functions para crear cuentas Auth automáticamente | M | Cloud Functions · plan Blaze |
| 🟡 | Rate-limit en login + reCAPTCHA Enterprise | M | reCAPTCHA Enterprise |
| 🟡 | 2FA opcional para directores | M | Identity Platform |
| 🟢 | Tests con `firebase emulators:exec` | M | firebase-tools |

#### 🔴 Migrar roles a Custom Claims de Firebase Auth

**Problema:** Hoy `determineRole(email)` decide el rol en el cliente leyendo arrays hardcodeados (`DIRECTORES`, `ADMINS`) en `lib/types.ts`. Cualquier usuario con DevTools puede simular ser director si las reglas de Firestore no validan en serio.

**Solución:** Cloud Function `setUserRole` que asigna `customClaims: { role: "director" }` y reglas Firestore que leen `request.auth.token.role`.

```typescript
// functions/src/setUserRole.ts
export const setUserRole = functions.https.onCall(async (data, context) => {
  if (context.auth?.token.role !== "director") throw new HttpsError("permission-denied", "Solo director");
  await admin.auth().setCustomUserClaims(data.uid, { role: data.role });
  return { ok: true };
});
```

```javascript
// firestore.rules
match /alumnos/{id} {
  allow write: if request.auth.token.role in ["director", "admin"];
}
```

---

#### 🔴 Validación de pagos duplicados en transacción

**Problema:** `existePagoMes` en `lib/firestore.ts` valida unicidad por código antes de crear. Dos clientes que registren el mismo pago a la vez generan duplicados (race condition).

**Solución:** Mover el chequeo a una transacción Firestore que use un doc determinístico como lock:

```typescript
const lockId = `${alumnoId}_${año}_${mes}`;
await runTransaction(db, async (tx) => {
  const lockRef = doc(db, "pagosAlumnos", lockId);
  const snap = await tx.get(lockRef);
  if (snap.exists()) throw new Error("Ya existe un pago para ese alumno en ese mes.");
  tx.set(lockRef, { ...data, createdAt: serverTimestamp() });
});
```

---

#### 🔴 App Check con reCAPTCHA v3

**Problema:** Cualquiera con la API key pública puede atacar Firestore desde fuera de la app.

**Solución:** Habilitar Firebase App Check con reCAPTCHA v3 (10 min de configuración) y exigir tokens válidos en las reglas.

```typescript
// lib/firebase.ts
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!),
  isTokenAutoRefreshEnabled: true,
});
```

---

### ✨ Funcionalidades Nuevas

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🔴 | "Olvidé mi contraseña" | S | — |
| 🔴 | Toggle "ver contraseña" en login | S | — |
| 🟡 | Cambio de contraseña self-service | S | — |
| 🟡 | Generación de recibo PDF al registrar pago | M | jsPDF / pdf-lib |
| 🟡 | Notificaciones a morosos por WhatsApp/email | M | Cloud Functions opcional |
| 🟡 | Reportes con gráficos (Recharts) | L | Recharts |
| 🟡 | Calendario heatmap mensual de asistencias | M | Recharts / D3 |
| 🟡 | Comparativa mes-a-mes en dashboard | M | — |
| 🟡 | Importación masiva de instructores y profes guías | M | — |
| 🟢 | Sistema de roles granular (instructor jefe) | L | depende de Custom Claims |

#### 🔴 "Olvidé mi contraseña"

**Problema:** Si un instructor olvida la contraseña, el director debe resetearla manualmente desde Firebase Console.

**Solución:** Botón en la pantalla de login que dispara `sendPasswordResetEmail`.

```typescript
import { sendPasswordResetEmail } from "firebase/auth";
await sendPasswordResetEmail(auth, usernameToEmail(username));
```

---

#### 🟡 Generación de recibo PDF al registrar pago

**Problema:** El alumno paga y queda solo el comprobante bancario. No hay un recibo emitido por la academia.

**Solución:** Al registrar un pago exitoso, generar un PDF con `jsPDF`, subirlo a Storage y guardar la URL en `pagoAlumno.reciboUrl`.

```typescript
import jsPDF from "jspdf";
const pdf = new jsPDF();
pdf.text(`Academia Hernández — Recibo ${pago.alumnoNombre}`, 20, 30);
pdf.text(`Mes: ${nombreMes(pago.mes)} ${pago.año}`, 20, 50);
pdf.text(`Monto: ${formatCLP(pago.monto)}`, 20, 70);
const blob = pdf.output("blob");
```

---

#### 🟡 Notificaciones por WhatsApp/email a morosos

**Problema:** Hoy alguien tiene que mandar mensaje uno por uno a los alumnos con deuda.

**Solución corta (sin backend):** Botón "Recordar por WhatsApp" en cada fila con deuda que abre `https://wa.me/{telefono}?text=...` con mensaje pre-armado.

**Solución completa:** Cloud Function programada (`onSchedule`) los días 1, 5 y 10 que envía mensajes vía Twilio o SendGrid.

```typescript
const url = `https://wa.me/${alumno.telefono}?text=${encodeURIComponent(
  `Hola ${alumno.nombre}, tu mensualidad de ${nombreMes(mes)} (${formatCLP(precio)}) está pendiente. ¡Saludos!`
)}`;
```

---

### 💳 Pagos Avanzados

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🟡 | Recordatorios automáticos días 1/5/10 | M | Cloud Scheduler · plan Blaze |
| 🟡 | Vista histórica anual por alumno | S | — |
| 🟢 | Plan de pagos parciales (cuotas) | L | rediseño de modelo `PagoAlumno` |
| 🟢 | Conciliación bancaria automática | XL | parser de cartola bancaria |
| 🟢 | Integración Webpay/Khipu/Flow/MercadoPago | XL | cuenta de comercio + Cloud Functions |

#### 🟢 Integración con pasarelas chilenas

Si la academia decide ofrecer pago online, Khipu o Flow son las opciones más simples para Chile (Webpay requiere comercio formal). El flujo típico:

```
Alumno → /pagar/{alumnoId}/{mes} → Cloud Function crea orden →
Redirect a Khipu → Webhook confirma pago → registra en pagosAlumnos
```

> **Nota:** evitar tocar el modelo `PagoAlumno` actual; agregar campos opcionales `pasarela`, `pasarelaId`, `pasarelaEstado` para mantener compatibilidad.

---

### ⚡ Performance

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🟡 | Cache de `useEstadoMorosidad` en context provider | S | — |
| 🟡 | Virtualización de tablas largas | M | `react-virtuoso` o `@tanstack/react-virtual` |
| 🟢 | Suspense + streaming Server Components | L | Next 16 RSC |
| 🟢 | Migrar `import("./storage")` dinámico a estático | S | — |

#### 🟡 Cache de morosidad en context provider

**Problema:** Cada página que usa `useEstadoMorosidad` monta 3 `onSnapshot` (alumnos + pagos + precios). Navegar entre Dashboard → Alumnos → Pagos triplica las suscripciones.

**Solución:** Mover los suscriptores a un `<MorosidadProvider mes={...} año={...}>` montado en el layout autenticado.

```tsx
// app/(auth)/layout.tsx
<MorosidadProvider mes={mes} año={año}>
  {children}
</MorosidadProvider>
```

---

### ♿ Accesibilidad (WCAG AA)

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🟡 | Asociar labels con `id`/`htmlFor` en `Input`/`Select` | S | — |
| 🟡 | `role="dialog"` + focus trap + restore en `Modal` | S | `focus-trap-react` |
| 🟡 | `aria-live="polite"` en toasts | S | — |
| 🟡 | Aumentar contraste de `text-slate-400` | S | — |
| 🟡 | Elevar `text-[9px]/[10px]` a 11–12 px mínimo | S | — |
| 🟢 | Respetar `prefers-reduced-motion` | S | — |

```tsx
// components/ui/Input.tsx (sketch)
const id = useId();
return (
  <div>
    <label htmlFor={id}>{label}</label>
    <input id={id} {...rest} />
  </div>
);
```

---

### 📱 PWA y Mobile

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🟡 | Manifest + service worker | M | `next-pwa` o `@serwist/next` |
| 🟡 | Splash screen con logo | S | — |
| 🟢 | Modo offline con sync al reconectar | L | Firestore offline persistence |
| 🟢 | Push notifications (director · instructor · alumno) | L | FCM + Cloud Functions |

> **Caso de uso fuerte:** instructor en sucursal con WiFi inestable marca asistencia, los datos quedan en cola y se sincronizan cuando recupera conexión.

---

### 🎨 Branding y SEO

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🔴 | Metadata real en `layout.tsx` (hoy dice "Create Next App") | S | — |
| 🟡 | `<html lang="es-CL">` (hoy dice `en`) | XS | — |
| 🟡 | Open Graph + Twitter cards | S | — |
| 🟡 | Theme-color personalizado (`#f97316`) | XS | — |
| 🟡 | Favicon y manifest custom | S | — |
| 🟢 | Convertir en PWA instalable | M | manifest + SW |

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  title: { default: "OperoEducator", template: "%s · OperoEducator" },
  description: "Sistema interno de gestión — Academia Hernández",
  themeColor: "#f97316",
  openGraph: { /* ... */ },
};
```

---

### 🧪 Calidad de Código

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🟡 | Sentry o Logflare en producción | S | cuenta Sentry |
| 🟡 | tsconfig strict + `noUncheckedIndexedAccess` | S | — |
| 🟡 | Husky + commitlint + Prettier | S | — |
| 🟡 | Documentar índices Firestore en `firestore.indexes.json` | S | firebase-tools |
| 🟢 | Tests con Jest + React Testing Library | L | — |
| 🟢 | Cypress/Playwright para flujos críticos | L | — |
| 🟢 | Storybook para componentes UI | M | Storybook 8 |

**Flujos críticos sugeridos para E2E:**
1. Login director → ver dashboard → registrar pago de alumno → verificar morosidad.
2. Login instructor → marcar asistencia de 5 alumnos → verificar `mi-pago`.
3. Reasignar instructor de sucursal → verificar historial.

---

### 🗄️ Datos y Consistencia

| Prio | Mejora | Esfuerzo | Dependencias |
|:----:|--------|:--------:|--------------|
| 🔴 | Snapshotear tarifa del día en cada `AsistenciaAlumno` | M | migración de datos existentes |
| 🟡 | Audit log: tabla `auditLog` con quién/qué/cuándo | M | — |
| 🟡 | Backups programados (Cloud Scheduler + export a Storage) | S | plan Blaze |
| 🟢 | `historialAsignacionesProfeGuia` cuando un alumno cambia de profe | M | — |

#### 🔴 Snapshotear tarifa del día

**Problema:** Hoy `calcularPagoInstructor` aplica la tarifa **actual** a las asistencias del mes. Si el director sube la tarifa el día 20, todo el mes se recalcula retroactivamente.

**Solución:** Agregar `tarifaAplicada` al doc `AsistenciaAlumno` al momento de registrarla. El cálculo de pago suma `asistencia.tarifaAplicada` directamente.

```typescript
interface AsistenciaAlumno {
  // ...campos actuales
  tarifaAplicada?: number; // CLP, opcional para retrocompatibilidad
}
```

> 📌 La migración de registros viejos puede dejar el campo en `null` — el cálculo cae al fallback de la tarifa actual, manteniendo el comportamiento previo.

---

## 🏗️ Decisiones de Arquitectura

### ¿Por qué Next.js 16 + Firebase?

**Razones:**
- **Tiempo a producción** mínimo: con Firebase Auth + Firestore + Storage no se construyó backend custom. Para un solo cliente con 5 sucursales y < 1000 alumnos, las cuotas free/Spark cubren todo.
- **App Router de Next 16** permite componentes server-rendered con suspense fino y mejor TTFB cuando se quiera optimizar.
- **TypeScript end-to-end** con tipos compartidos cliente/servidor (todos los modelos viven en `lib/types.ts`).
- Stack ampliamente documentado, fácil de retomar por cualquier dev senior.

### ¿Por qué "Camino C" híbrido para crear instructores?

Cuando un director crea un instructor:
1. La app crea el doc en Firestore (perfil + primer historial atómico).
2. Muestra al director el email generado y un link a Firebase Console.
3. El director crea **manualmente** la cuenta en Firebase Auth con ese email.
4. Marca el flag `authVerificado: true` para que desaparezca el badge ⚠️.

**Razón:** crear cuentas Auth desde el cliente requiere Cloud Functions (plan Blaze, costo). Para 1–2 instructores nuevos al mes, el paso manual es aceptable y mantiene el sistema en plan Spark gratuito. La mejora 2.0 es automatizarlo cuando crezca el volumen.

### ¿Por qué hosting Simplifais (Brasil) en lugar de Firebase Hosting / Vercel?

- **Costo y soporte regional** (Sudamérica, español).
- **Independencia del vendor**: el frontend Next.js puede correr en cualquier hosting que soporte Node.js.
- **Latencia aceptable** para usuarios chilenos en línea con la práctica de muchos SaaS regionales.
- Firebase Hosting sigue siendo la opción "Plan B" si Simplifais presenta inestabilidades.

### ¿Por qué single-tenant?

Hoy hay **una sola academia**. Modelar multi-tenant desde el día uno habría agregado paths anidados (`/tenants/{id}/alumnos`), complejidad en reglas y queries, sin beneficio real. La capa de Firestore es lo suficientemente simple como para envolverla en una migración futura cuando aparezca un segundo cliente.

### ¿Por qué roles hardcodeados en `lib/types.ts`?

Decisión consciente. Los DIRECTORES y ADMINS son personas físicas conocidas (2 directores y 1 admin de finanzas). Agregar una colección `usuarios` con rol mutable habría sumado un read extra por sesión y un panel de gestión que nadie iba a usar. Cuando aparezca el cuarto admin, **migrar a Custom Claims** (mejora 🔴 prioritaria del roadmap).

```typescript
// lib/types.ts (estado actual)
export const DIRECTORES: string[] = ["director.christan", "director.maria"];
export const ADMINS: string[] = ["admin.finanzas"];
```

---

## ⚠️ Puntos de Atención Técnicos

> Cosas que el próximo dev **debe saber sí o sí** antes de tocar producción.

### 🔁 Sincronizar `lib/types.ts` con `firestore.rules`

Si se cambian `DIRECTORES` o `ADMINS` en `lib/types.ts`, hay que actualizar **también** las reglas de Firestore en Firebase Console. El cliente y el servidor leen listas diferentes; si divergen, un usuario podría aparecer como director en el front pero recibir `permission-denied` al escribir.

**Acción recomendada:** mover ambos a Custom Claims (mejora 🔴).

### 💸 Tarifa por curso aplica retroactivamente

`calcularPagoInstructor` y `calcularPagoProfeGuia` usan la tarifa **actual** de `configPagos` para todos los días del mes. Si el director sube la tarifa Junior de 1.500 a 2.000 CLP el día 20 del mes, los pagos del 1 al 19 también se recalculan a 2.000.

**Mitigación temporal:** comunicar al director que cualquier cambio de tarifa idealmente se hace al inicio del mes.
**Solución definitiva:** snapshot de tarifa por asistencia (mejora 🔴 listada arriba).

### 📜 Reglas de Firestore viven en Firebase Console

Hoy `firestore.rules` y `storage.rules` **no están en el repo**. Cualquier cambio que se hace desde la consola web no queda versionado. Si alguien rompe las reglas, no hay rollback fácil.

**Acción recomendada:**
```bash
firebase init firestore   # genera firestore.rules + firestore.indexes.json
firebase deploy --only firestore:rules
```

### 🗓️ El temario asume martes/miércoles

`calcularSemanaActual` asume que `fechaInicio` es siempre un **martes** y que las clases son martes y miércoles. No hay validación en el form, así que un director podría ingresar un lunes y desfasar todo el cálculo.

### 📦 Importación masiva sin profe guía

`BulkImport` siempre crea alumnos con `profeGuiaId: ""`. El director debe asignarlos uno a uno después. Pensar si vale agregar una columna `profe_guia` mapeable por nombre.

### 🧹 Eliminación sin cascada

`deleteAlumno`, `deleteProfeGuia` y `deactivateInstructor` **no limpian** asistencias, evaluaciones ni pagos relacionados. Quedan registros huérfanos que afectan reportes históricos.

**Recomendación:** migrar a soft-delete (`activo`/`deletedAt`) y filtrar en queries.

---

## 📞 Contactos y Handover

### 👤 Responsable Actual

> **Gregory Delgado Hernández**
> Director · Master Educator · Academia Hernández
> 📧 `g43g04ygegory28@gmail.com`
>
> *Mantiene la app, decide producto y es el único contacto con permisos de director en producción.*

### 🔗 Recursos del Proyecto

| Recurso              | URL / Ubicación                                                        |
| -------------------- | ---------------------------------------------------------------------- |
| **Repositorio**      | `local: ~/Documents/proyectos/academia-hernandez` *(pendiente push)*   |
| **Cuenta Firebase**  | Proyecto privado · acceso via Gregory                                  |
| **Hosting**          | Simplifais (Brasil) · *deploy pendiente al cierre de v2.0*             |
| **Dominio**          | *Por definir al momento del deploy*                                    |
| **Variables de entorno** | `.env.local` con `NEXT_PUBLIC_FIREBASE_*` (no commiteadas)         |

### 🤝 Equipo de Continuidad

> **Simplifais** (próximo equipo de desarrollo)
> Recibe este roadmap como base de extensión.
> Prioridad sugerida para los primeros sprints:
>
> 1. 🔴 Versionar reglas Firestore + Custom Claims
> 2. 🔴 Snapshot de tarifa por asistencia
> 3. 🔴 Metadata + branding profesional
> 4. 🟡 Recibo PDF + notificaciones a morosos
> 5. 🟡 Tests E2E de flujos críticos

### 📚 Documentación Complementaria

- `AGENTS.md` — reglas para asistentes IA (Next.js 16 deprecaciones)
- `README.md` — boilerplate de create-next-app *(actualizar)*
- `node_modules/next/dist/docs/` — guías oficiales de Next 16

---

<div align="center">

**OperoEducator** · *Hecho con cariño para la Academia Hernández* 🪒

*Última actualización: Abril 2026 · Versión del roadmap: 1.0*

</div>
