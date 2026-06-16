<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas de seguridad versionadas

Las reglas de **Firestore** y **Storage** viven en el repositorio:

- `firestore.rules` — fuente de verdad para reglas de Firestore.
- `storage.rules` — fuente de verdad para reglas de Storage.
- `firebase.json` — apunta los archivos anteriores a Firebase CLI.

> Mantener la lista de roles (`DIRECTORES`, `ADMINS`) en `lib/types.ts` sincronizada con los arrays equivalentes dentro de `firestore.rules` y `storage.rules`. Si agregas un director/admin nuevo, edítalo en los TRES archivos.

## Desplegar las reglas

```bash
# Una sola vez por máquina
npm install -g firebase-tools
firebase login

# Desde la raíz del proyecto
npm run deploy:rules
# (equivale a: firebase deploy --only firestore:rules,storage)
```

Si Firebase CLI te pregunta el proyecto, ya está fijado en `.firebaserc` como `operoeducator`.

# Deploy a Firebase Hosting (link público)

La app se sirve públicamente desde **https://operoeducator.web.app** (también disponible como `https://operoeducator.firebaseapp.com`). El hosting usa la integración nativa de Firebase con Next.js (`frameworksBackend`), que internamente despliega un Cloud Function en `us-central1` para SSR + activos estáticos detrás del CDN de Firebase Hosting.

## Primer deploy (solo una vez por máquina)

```bash
npm install -g firebase-tools          # si aún no lo tienes
firebase login                          # autenticar con la cuenta dueña del proyecto
firebase use operoeducator              # fija el proyecto (ya está en .firebaserc, pero refuerza)
npm run deploy                          # build + deploy de hosting
```

La primera vez Firebase puede pedir habilitar la integración de web frameworks (`Detected a Next.js codebase... Configure as a single-page app? No`). Acepta cuando pregunte y deja que use la región `us-central1`.

## Deploys posteriores

```bash
npm run deploy        # solo hosting (lo más común tras un cambio de código)
npm run deploy:all    # hosting + reglas de Firestore/Storage
npm run deploy:rules  # solo reglas
```

> **Importante**: cada cambio de código necesita un nuevo `npm run deploy` para que se refleje en `https://operoeducator.web.app`. El link público no se actualiza automáticamente cuando cambias archivos en local — eso es solo `npm run dev`.

## Notas sobre Next.js + Firebase

- **No** uses `output: 'export'` en `next.config.ts`: rompería el SSR que necesita la app (rutas autenticadas, Firestore en server, etc.). Firebase Hosting con `frameworksBackend` corre `next build` por ti.
- Variables `NEXT_PUBLIC_*` se inyectan en el build. Si cambias `.env.local`, hay que volver a hacer `npm run deploy` para que el bundle nuevo tome los valores.
- El plan **Blaze** ya está activo (necesario porque `frameworksBackend` levanta Cloud Functions).
- Si añades dominio propio, hazlo desde la consola de Firebase Hosting; no hace falta tocar `firebase.json`.

# Datos legacy (v1 → v2)

La v2 introduce snapshots y soft-delete. Los registros antiguos siguen funcionando, pero con fallbacks que el código loguea con `console.warn`:

- **Asistencias sin `tarifaInstructorAplicada` / `tarifaProfeGuiaAplicada`**: se cae a `configPagos` actual al calcular pagos. Significa que una asistencia antigua se cobra a la tarifa vigente al consultar el pago — exactamente el bug que la v2 evita en adelante. Para datos previos a v2, ese comportamiento es el mismo que tenían en v1.
- **Asistencias sin `profeGuiaIdSnapshot`**: se cae al `profeGuiaId` actual del alumno. Si un alumno cambió de profe guía después de la asistencia legacy, ese pago se le acreditará al profe nuevo (mismo comportamiento que v1).
- **Alumnos / Profes guías sin `activo`**: tratados como `activo: true`.

Para migrar los registros antiguos, ver `lib/migrate-legacy-attendance.ts` (NO ejecutado automáticamente; se invoca manualmente desde la consola del navegador con un usuario director, o se adapta a un script Node con credenciales de Admin).
