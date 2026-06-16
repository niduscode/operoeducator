# OperoEducator — Descripción funcional para QA

## ¿Qué es OperoEducator?

OperoEducator es un SaaS de gestión integral para Academia Hernández, una red de barberías profesionales en Chile con 5 sucursales: Muermos, Puerto Montt, Osorno, Valdivia y Temuco. Reemplaza Excel, WhatsApp y procesos manuales con una sola plataforma.

## Stack técnico

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Firebase (Auth + Firestore + Storage + Hosting)
- Docker para desarrollo local
- Deploy en Firebase Hosting (https://operoeducator.web.app)

## Roles del sistema

El sistema tiene 3 tipos de usuario, cada uno con vistas y permisos distintos:

### 1. Director (director.christan, director.maria)
Control total del sistema. Configura precios, gestiona personas (alumnos, instructores, profes guías), revisa pagos, define temario, calcula liquidaciones.

### 2. Admin (admin.finanzas)
Gestiona finanzas: registra pagos de alumnos, ve estado financiero, marca pagos a profesionales como realizados, ve ausencias del mes y su impacto en pagos.

### 3. Instructor (cualquier otra cuenta @operoeducator.internal)
Gestiona su aula virtual. Tiene asignada UNA sucursal fija. Toma asistencia y evaluaciones de sus alumnos los martes y miércoles (días de clase), asigna alumnos a sí mismo o a profes guías, ve su pago acumulado del mes.

## Modelo de negocio

### Cursos y duración
- **Junior**: 8 clases (~1 mes)
- **Senior**: 16 clases (~2 meses)
- **Master**: 8 clases (~1 mes)

Las clases son SIEMPRE los martes y miércoles. El director configura la duración exacta en /configuracion/precios-alumnos.

### Pago de alumnos
- Director define el precio mensual por curso (Junior/Senior/Master pagan distinto)
- Director o Admin registran cada pago con comprobante obligatorio (foto/captura)
- Medios de pago: Transferencia, Efectivo, Tarjeta de Débito, Tarjeta de Crédito, Otro
- Pagos parciales: si el alumno paga la mitad ahora y la otra mitad después, el sistema acumula los pagos hasta cubrir el precio total
- Estados visibles: Al día / Con deuda / Parcial con saldo pendiente

### Pago a instructores (modelo escalado por alumno asistido)
- Cada alumno tiene asignado UN profesional (instructor O profe guía, nunca ambos)
- Por el 1er alumno asistido en una clase: instructor gana monto X (configurable)
- Por cada alumno adicional: gana monto Y (configurable, menor que X)
- Solo cuentan asistencias con estado Presente o Tarde (Ausente no genera pago)
- Cálculo automático y en tiempo real: cada vez que el instructor marca asistencia, su pago del mes se actualiza

### Pago a profes guías (modelo por curso)
- Director define tarifa por curso (Junior, Senior, Master) — distinta a la del instructor
- Cobra por cada alumno suyo que asistió (Presente o Tarde)
- Cálculo automático mensual

## Funcionalidades principales

### Autenticación
- Login con username + contraseña (no email completo)
- Firebase Auth con dominio interno @operoeducator.internal
- 3 roles automáticos según el username
- Toggle "ver contraseña" en login

### Gestión de Alumnos (/alumnos)
- CRUD completo, solo Director
- Importación masiva desde Excel/CSV (5 columnas: nombre, teléfono, curso, turno, sucursal)
- Filtros por curso (Junior/Senior/Master), turno (Mañana/Tarde), sucursal
- Búsqueda y paginación
- Soft delete (los alumnos se desactivan, no se borran físicamente)
- Vista alternativa "Por Sucursal" con expansión y mini-historial
- Asignación de profe guía o instructor
- Exportación a Excel
- Columna "Estado pago mes actual" (Al día / Con deuda / Parcial)
- Historial de pagos por alumno con todos sus pagos cronológicos

### Gestión de Profes Guías (/profes-guias)
- CRUD completo, solo Director
- Importación masiva Excel/CSV (3 columnas: nombre, teléfono, sucursal)
- Estado Activo/Inactivo (soft delete)
- Búsqueda + paginación + exportación Excel

### Gestión de Instructores (/instructores)
- CRUD completo, solo Director (Admin solo lee)
- Flujo "Camino C": Director crea el perfil en la web → manual crea cuenta en Firebase Console
- Modal post-creación con instrucciones + botón "Marcar Auth como creado"
- Sucursal FIJA por instructor (no puede cambiarla él mismo)
- Reasignación de sucursal por Director con razón + historial cronológico
- Sección "Alumnos asignados" en el form de edición

### Aula Virtual (/aulas) — solo Instructor
- Sucursal fija (sin selector libre)
- Selector de turno (Mañana/Tarde) — auto-detecta según hora actual
- Pestañas: Junior / Senior / Master
- Sub-tabs: Asistencia Alumnos | Evaluación | Profes Guías
- Asistencia con 3 estados (Presente/Ausente/Tarde) + observación opcional
- Evaluación con nota 1-10 + observación + histórico
- "Marcar todos Presente" en un solo batch
- Botones de asistencia HABILITADOS solo los martes y miércoles (días de clase)
- Mensaje informativo si no es día de clase con la próxima fecha
- Tarjeta "Tema de hoy" con material PDF (si el director cargó uno para esa semana)
- Tarjeta "Próxima semana" mostrando el tema siguiente
- Botón "Ver material de la clase" (abre PDF en pestaña nueva)
- Ventana de edición limitada a HOY (no se pueden editar registros de días anteriores)

### Gestión de Temario (/temario) — solo Director
- 3 pestañas (Junior/Senior/Master)
- Editor de semanas: título, descripción, tema martes, tema miércoles
- Validación: fechaInicio del curso debe ser martes
- Cálculo automático de "semana actual" según fecha de hoy
- Subida de PDFs por día (martes y miércoles) a Firebase Storage
- Persistencia inmediata de los PDFs (no requiere botón guardar)

### Configuración de Pagos (/configuracion/pagos) — solo Director
- Sección Instructor: monto por primer alumno + monto por alumno adicional (modelo escalado)
- Sección Profes Guías: tarifa por curso (Junior/Senior/Master)

### Precios y Duraciones de Cursos (/configuracion/precios-alumnos) — solo Director
- Precio mensual por curso
- Duración en clases por curso (default: Junior 8, Senior 16, Master 8)
- Vista previa de semanas calculadas

### Pagos de Alumnos (/pagos-alumnos) — Director + Admin
- Selector mes/año + filtro por sucursal
- 4 tarjetas resumen: Total recaudado, Total esperado, Alumnos al día, Con deuda
- Pestañas: Al día | Con deuda
- Tabla con badge de estado (Parcial / Total / Completado por parciales) y monto pagado vs saldo
- Botón "Registrar pago" por fila + global
- Comprobante OBLIGATORIO en todos los medios de pago
- Validación inline anti-duplicado
- Exportación Excel

### Pagos del Mes a Profesionales (/pagos) — Director + Admin
- Selector mes/año
- 3 tarjetas resumen: Total instructores, Total profes guías, Total recaudado alumnos
- Tabla Instructores con desglose por DÍA (Fecha, Alumnos asistidos, Cálculo escalado, Total)
- Tabla Profes Guías con desglose por curso (Junior/Senior/Master)
- Botón "Marcar Pagado" por persona + badge ✅ cuando ya está liquidado
- Banner de alerta arriba si hay pagos pendientes pasados del día 5 del mes siguiente
- Exportación Excel

### Mi Pago del Mes (/mi-pago) — solo Instructor
- Total grande del mes actual
- Desglose por día: fecha, alumnos asistidos, cálculo del día, total
- Selector mes/año (default: actual)
- Actualización en tiempo real con cada asistencia registrada

### Panel Admin — Vista Alumnos del Día (/admin/alumnos)
- Lista de alumnos enfocada en estado de asistencia HOY
- Columnas: Nombre, Sucursal, Curso, Estado HOY (Presente/Ausente/Tarde/Sin marcar), Profesional a cargo
- Útil para que el admin vea qué profesional cobrará menos por ausencias

### Dashboards
- **Director**: 5 tarjetas de sucursales con conteos detallados, estado financiero del mes con datos reales, accesos rápidos a todas las pantallas
- **Admin**: Estado financiero global, alumnos con deuda con botón rápido a registrar pago, días trabajados por liquidar, ausencias del mes con profesional afectado
- **Instructor**: Sucursal asignada (fija), conteos de alumnos/profes, "Tema de hoy" + "Próxima semana", botón "Ir al Aula Virtual" + "Mi Pago del Mes", tarjetas clickeables que permiten asignar alumnos a sí mismo o a profes guías

### Banner de Certificaciones
En todos los dashboards y /aulas, aparece banner cuando hay alumnos:
- Certificándose HOY
- Recién certificados (≤ 3 días)
- Próximos a terminar (≤ 7 días)

Para Director y Admin incluye botón "Ir a Pagos del Mes" para iniciar liquidaciones.

## Detalles técnicos importantes para QA

### Seguridad
- Reglas Firestore versionadas en firestore.rules
- Reglas Storage versionadas en storage.rules
- Roles derivados del username del email (split @)
- Soft delete preserva referencias históricas
- Snapshot de tarifas y profesional asignado en cada asistencia (evita cambios retroactivos)

### Persistencia offline
- Firestore con persistentLocalCache + persistentMultipleTabManager
- Funciona sin internet (sincroniza al reconectar)

### UX
- Toast system con stack, cierre manual, tipos (success/error/info/warning)
- ConfirmDialog custom reutilizable (no usa confirm() nativo)
- BackButton sticky grande en todas las subpantallas
- Tablas con búsqueda y paginación (SearchableTable)
- Selectores con buscador (SearchableSelect) para listas largas

### Datos legacy
- Asistencias sin instructorIdSnapshot/profeGuiaIdSnapshot caen al ID actual del alumno con console.warn
- Asistencias sin tarifaAplicada usan configPagos actual
- Alumnos sin "activo" se tratan como activos
- PagoAlumno sin tipoPago se asume "Total"
- Alumnos sin instructorId/profeGuiaId no aparecen en cálculos de pago

## Casos de prueba sugeridos

1. **Flujo completo Director**: configurar precios → cargar temario → importar alumnos → crear instructores → registrar pagos de alumnos → marcar pagos a profesionales
2. **Flujo Admin**: ver estado financiero → registrar pago de alumno con deuda → verificar ausencias del mes → marcar pago a profesional
3. **Flujo Instructor**: entrar a aula virtual martes/miércoles → marcar asistencia → evaluar → asignarse alumnos → ver pago del mes actualizándose en tiempo real
4. **Pagos parciales**: registrar pago de la mitad → verificar badge "Parcial" → registrar resto → verificar paso a "Completado"
5. **Días de clase**: intentar marcar asistencia en lunes/jueves → debe estar deshabilitado
6. **Sucursal fija instructor**: verificar que NO puede cambiar de sucursal
7. **Reasignación con historial**: director cambia sucursal de instructor → verificar timeline
8. **Importación masiva**: subir Excel con 5 alumnos válidos + 1 con error → verificar que importa 5 y muestra el error
9. **Banner certificaciones**: crear alumno con fechaIngreso = hoy - duración → verificar banner
10. **Soft delete**: desactivar alumno → verificar que NO aparece en listados activos pero sí con toggle "Mostrar inactivos"