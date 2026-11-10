# NeuroLab Enterprise — Fase 6: Complementos

> **Estado:** EN DESARROLLO — Incremento 1: administración global de usuarios.  
> **Fecha de inicio:** 8 de noviembre de 2026.  
> **Base:** Fases 0–5 validadas; F5 cerrada con pruebas y despliegue confirmados por el equipo.  
> **Documentación:** un solo Markdown para F6. SQL, Edge Functions y pruebas son artefactos técnicos separados.

## 1. Alcance de este incremento

Se implementa `M10 — Administración y seguridad`, en su primera parte:

- Pantalla **Administración → Usuarios**, solo para Administrador global activo.
- Listado paginado de usuarios de la plataforma.
- Creación de cuentas de correo/contraseña (sin registro público, sin invitaciones automáticas).
- Contraseña inicial aleatoria generada en servidor, mostrada una sola vez al Administrador; cambio posterior desde **Mi cuenta**.
- Activación y desactivación de usuarios. RLS sigue negando acceso a perfiles inactivos.
- Restablecimiento **administrativo** de contraseña sin SMTP.
- Auditoría de alta, activación/desactivación y restablecimiento, sin registrar contraseñas.
- Un Administrador global **no** se asigna privilegios globales desde esta pantalla y **no** obtiene acceso técnico automático a proyectos.
- Los cuatro roles de proyecto siguen gestionándose en `Proyectos → Integrantes`.

**Fuera de este incremento:** revisión de modelos (M08), reportes (M09), límites globales, auditoría UI completa y promoción de otros Administradores globales. Su implementación requerirá la misma separación de privilegios aprobada en Fase 0.

## 2. Arquitectura y seguridad

- **Una Supabase Edge Function** `admin-users` con verificación JWT de plataforma **habilitada**. No introduce un servidor Python ni entrenamiento remoto.
- El frontend usa exclusivamente las variables públicas actuales (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) y `supabase.functions.invoke`.
- La Edge Function recibe JWT de usuario, verifica la identidad con Supabase Auth y comprueba **en PostgreSQL** `app_users.status = active AND is_platform_admin = true` antes de procesar la acción.
- La clave privilegiada `SUPABASE_SERVICE_ROLE_KEY` existe únicamente en el entorno de la función Supabase, **nunca en Vercel ni en variables VITE_**.
- La función no permite desactivar la cuenta propia ni administrar otra cuenta con `is_platform_admin = true`.
- La migración 006 añade auditoría global con `project_id = NULL`, restringe la lectura de auditoría técnica de proyectos ajenos al Admin global y bloquea la desactivación del último Responsable activo de un proyecto incluso a nivel de trigger.
- El origen permitido por defecto es `https://neurolab-enterprise-grupo-1.vercel.app` y los dos orígenes locales de Vite. Para otros dominios, configurar `NEUROLAB_ALLOWED_ORIGINS` como lista separada por comas en los secretos de la Edge Function. CORS **no** sustituye autenticación y autorización.
- El alta con `email_confirm: true` solo se permite tras marcar la confirmación de que el administrador verificó titularidad del correo por otro canal. La UI no simula un sistema de correo configurado.

**Notas de seguridad:** el restablecimiento de contraseña no implica necesariamente que todos los JWT ya emitidos queden revocados inmediatamente; en un incidente de cuenta comprometida el operador debe gestionar la revocación de sesiones desde Supabase Auth. La desactivación sí bloquea el acceso a recursos protegidos por RLS al consultar el estado actual en PostgreSQL.

**Límite de confianza:** las llamadas de Auth Admin y los registros de auditoría están separados por servicios. Si Auth completa una operación pero falla la auditoría, la función lo declara como operación parcial y el operador debe revisar el Dashboard antes de repetir. No prometemos transacciones distribuidas.

## 3. Instalación incremental

1. Aplicar los archivos de este incremento en la raíz del proyecto Git. Mantener `.env.local`, `.env.test.local`, `package-lock.json` y la identidad Git.
2. Ejecutar antes de publicar:

```bash
npm run test:fase6
npm run typecheck
npm run build
```

3. Supabase → SQL Editor: ejecutar **una única vez**, en el orden correcto, `supabase/migrations/202611080006_global_account_audit.sql`. No volver a ejecutar 001–005.
4. Desplegar **solo** `admin-users` en Supabase, con la CLI enlazada al proyecto correcto:

```bash
supabase login
supabase link --project-ref TU-PROJECT-REF
supabase functions deploy admin-users
```

Si no tienes el comando global instalado, la [CLI oficial de Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started) admite `npx supabase <comando>`; puedes utilizarlo en los tres pasos sin añadir dependencias en tiempo de ejecución a React.

La CLI de Supabase v3 solicita confirmación antes de modificar un proyecto remoto; confirma solo cuando la referencia del proyecto sea correcta. No uses `--no-verify-jwt`. La función conserva `verify_jwt=true` mediante `supabase/config.toml`. Los proyectos alojados en Supabase proporcionan `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` a la función; comprobar su disponibilidad **desde Supabase, nunca copiarlos al frontend**. Si se usa un dominio adicional, configurar el secreto `NEUROLAB_ALLOWED_ORIGINS` en el Dashboard de Supabase o con CLI.

5. Con la función ya desplegada, ejecutar las pruebas en vivo:

```bash
npm run test:fase6:live
```

Utilizan **dos cuentas de prueba ya existentes** en `.env.test.local`; no crean usuarios ni alteran contraseñas. Se comprueba listado permitido, lector denegado, imposibilidad de desactivación/reset propios.
6. Publicar el commit cuando `typecheck`, build, pruebas y despliegue de la función estén correctos.

## 4. Pruebas manuales en Vercel

1. Entrar como Admin: aparece **Administración → Usuarios**, listando cuentas reales.
2. Entrar como Lector: no aparece el menú y `/administracion/usuarios` no muestra datos. Un intento de invocar la función devuelve error 403.
3. Crear una cuenta **de prueba** con correo cuya titularidad se verificó. Mostrar una única vez la contraseña temporal; entregarla por canal seguro. El usuario inicia sesión, cambia su contraseña y luego accede con la nueva.
4. Desactivar esa cuenta y verificar que deja de acceder a recursos privados. React y PostgreSQL deben bloquearla aunque quede un JWT sin caducar.
5. Activarla de nuevo y verificar login. Restablecer contraseña administrativamente y comprobar que la anterior ya no funciona.
6. Probar la prohibición de autodesactivación y de modificación de otra cuenta con privilegio global.
7. Comprobar que el Admin no puede desactivar al último Responsable activo de un proyecto.
8. Verificar en `audit_events` eventos `admin_user_created`, `admin_user_deactivated`, `admin_user_activated` y `admin_password_reset`, sin tokens ni contraseñas en `metadata_json`.
9. Comprobar en Vercel que no haya ninguna clave `service_role` ni `sb_secret_*` en las variables de entorno del frontend.

## 5. Condición de salida

Este incremento no se considera validado hasta comprobar las funciones en el Supabase real y el build íntegro de Vercel. La Fase 6 completa seguirá abierta hasta desarrollar o priorizar el resto de M08/M09/M10 y los complementos académicos.

## 6. Referencias técnicas

- [Seguridad de Supabase Edge Functions](https://supabase.com/docs/guides/functions/auth) y [cabeceras Auth](https://supabase.com/docs/guides/functions/auth-headers).
- [Variables secretas de Edge Functions](https://supabase.com/docs/guides/functions/secrets).
- [API Auth Admin](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

## Incremento 2 — M08: revisión y aprobación de modelos

**Estado:** implementado, pendiente de validación real en Supabase y Vercel.

Las versiones de Fase 5 siguen siendo inmutables. La migración `202611090009_model_reviews.sql` crea `model_review_events` (append-only), lectura con RLS por proyecto y el RPC `decide_model_review`, que valida el rol activo `reviewer`, la separación del autor del entrenamiento/publicación, el proyecto activo y las transiciones permitidas.

**Flujo:** `Borrador → Revisado → Aprobado / Rechazado`; solo una versión `Aprobada` puede pasar a `Retirada`. Rechazado y Retirado son terminales. Los cambios son eventos, no modificaciones de la fila `model_versions` ni de los objetos privados. Las decisiones se auditan junto con la inserción en la misma transacción SQL.

**Permisos:** los miembros activos (Responsable, Ingeniero, Revisor y Lector) pueden consultar estados, pero solo el Revisor del mismo proyecto puede decidir. Ser Administrador global no autoriza a decidir sin membresía y rol de Revisor. Nadie revisa una versión propia.

**Pruebas de aceptación pendientes:** confirmar aprobación por Revisor no autor, denegación a Ingeniero/Lector/Admin global sin membresía, bloqueo de autor, transiciones inválidas, retiro de aprobado, persistencia al cerrar sesión y ausencia de cambios en pesos/hash. Probar también proyecto archivado. Las pruebas estructurales no reemplazan estas pruebas en vivo.


### Incremento UX — Navegación, menú de cuenta y estados de carga

- `Spinner` reutilizable, con texto accesible y reducción de movimiento; incorporado inicialmente en validación de sesión y lista de usuarios.
- Breadcrumb vinculado a las secciones **Espacio de trabajo** y **Administración global**, con módulo actual.
- Sidebar móvil con apertura/cierre mediante `transform` y opacidad; sin librerías de animación ni temporizadores.
- Menú único de usuario en el encabezado: **Cuenta**, **Tema** (Claro/Oscuro/Sistema) y **Cerrar sesión**. El modo Claro permanece predeterminado, y Sistema sigue la preferencia del SO en tiempo real.
- La autenticación, RLS, Edge Functions, SQL, revisión y almacenamiento de modelos no se modifican.
- Validación pendiente en el equipo: TypeScript, compilación Vite, pruebas de módulos y funcionamiento con teclado y dispositivos móviles.

## Incremento 3 — M09 reportes y M10 auditoría visual

**Alcance:** módulo de reportes por proyecto con ficha, recuentos de arquitectura, metadatos de datasets, historial de ejecución, métricas de test almacenadas, exportación CSV acotada e impresión / guardado PDF del navegador; dos vistas de auditoría filtrable y paginada (proyecto y global).

**Autorización:** el reporte exige membresía técnica vigente en `project_members`. El administrador global NO recibe acceso técnico por defecto. La auditoría de proyecto corresponde a `responsible` y la global al Admin para hechos administrativos autorizados por la política `Auditoria por rol y alcance` de 006. Todas las lecturas conservan RLS. La migración 010 solo añade RPC para registrar una *solicitud* autorizada de exportación; no crea políticas más amplias de SELECT.

**Privacidad y límites:** no se exportan filas originales de CSV, contraseñas, pesos ni tokens. Las vistas consultan hasta 200 ejecuciones recientes y exportan hasta 200 eventos de auditoría filtrados. Los totales de arquitecturas, datasets, entrenamientos y versiones del reporte provienen de `COUNT` exacto. Cuando se superan 200 filas, la exportación no es exhaustiva y así se advierte expresamente. El CSV neutraliza fórmulas de hojas de cálculo. El PDF se obtiene con el diálogo estándar de impresión («Guardar como PDF»). Las métricas fueron calculadas en el cliente; no constituyen certificación del entrenamiento.

**Migración:** `202611090010_reports_audit_exports.sql` (una vez, después de 009). Extiende la lista de acciones del CHECK y crea `record_report_export(uuid,text)` con `SECURITY DEFINER`, `search_path = ''`, autorización desde DB y sin permisos de escritura directos. Los eventos indican solicitud, no descarga completada.

**Verificación:** probar como Ingeniero/Lector un reporte autorizado, como Responsable la auditoría de su proyecto, como Admin auditoría global y denegación del reporte técnico ajeno; exportaciones CSV y PDF; filtros y paginación; cierre de sesión/revocación de membresía; pantalla móvil y ambos temas. Ejecutar antes de publicar `node --experimental-strip-types --test tests/fase6.reporting-audit.test.mjs`, `npm run typecheck`, `npm run build`, y la prueba en vivo (sin escritura) contra Supabase.

**Estado:** incremento pendiente de aceptación funcional en Supabase/Vercel y de revisión de permisos con cuentas diferenciadas. No cerrar Fase 6 por anticipado.


### Mejora M09: Exportación PDF formal

El PDF de Reportes ahora utiliza una plantilla independiente de la pantalla interactiva: documento A4 con encabezado institucional, identificación y descripción del proyecto, resumen de totales, arquitecturas, datasets e historial de hasta 200 ejecuciones recientes con métricas de prueba. No incluye cards, iconos, sidebar, botones, CSV originales ni pesos. La exportación sigue verificándose y auditándose mediante record_report_export. La descarga se realiza desde el diálogo de impresión del navegador (Guardar como PDF). No se añade dependencia, SQL ni Edge Function.

<!-- F6-BACK-UI-20261109 -->
### Mejora de navegación — retroceso contextual y menú de usuario

- **Retroceso**: componente compartido `BackButton`, integrado una sola vez en el layout `AppShell`. En escritorio permanece fijo debajo del topbar (`top: 136px`) en el margen izquierdo del contenido. En móviles se muestra en el topbar fijo para no bloquear los campos o la navegación lateral.
- **Rutas cubiertas**: detalle de proyecto → proyectos; preparador CSV, historial, modelos y reportes → detalle del proyecto. Se utilizan destinos explícitos, sin navegación basada en el historial del navegador.
- **Transiciones**: el menú de cuenta cierra con 150 ms de opacidad y desplazamiento vertical sin escalado; respeta la preferencia de reducción de movimiento.
- **Impresión**: el retroceso queda oculto en la versión formal PDF (`print:hidden`).
- **Verificación**: `node --experimental-strip-types --test tests/fase6.back-ui.test.mjs`, `npm run typecheck`, `npm run build` y validación visual en `npm run preview`.
- **Alcance**: no cambia roles, Supabase, historial ni versiones de modelos. El módulo de auditoría de proyecto conserva su navegación anterior hasta revisar su versión actual.

<!-- F6-UI3-20261109 -->
### Mejoras visuales 3 — navegación contraíble y encabezados limpios

- Se retiraron los rótulos internos de fase/módulo situados sobre los títulos en Inicio, Proyectos, Detalle, CSV, Historial, Modelos, Reportes, Usuarios, Auditoría y Mi cuenta. Se conservan los títulos y las etiquetas funcionales de formularios, acciones y métricas.
- Inicio ya no muestra la píldora «Fase 2 · Proyectos». Se corrigieron mensajes de bienvenida obsoletos; las funciones existentes no cambian.
- `Mi cuenta` deja de figurar en el sidebar, pero conserva su ruta protegida `/cuenta` y el acceso exclusivo mediante la opción «Cuenta» del menú de usuario. Su breadcrumb muestra **Configuración personal › Mi cuenta**.
- El sidebar de escritorio alterna entre 264 px (expandido) y 76 px (solo iconos), con botón inferior para contraer/expandir, etiquetas accesibles y títulos de ayuda. La preferencia se guarda localmente en `neurolab:sidebar-collapsed`; en móvil siempre se presenta expandido dentro del panel lateral.
- El menú del usuario mantiene una apertura con opacidad y ligero desplazamiento (160 ms). Al cerrar, **solo desvanece** durante 110 ms; las animaciones respetan `prefers-reduced-motion`.
- El botón de retroceso contextual sigue fijo bajo el topbar. Se reservó un margen interior de 96 px a la izquierda del contenido para evitar que la flecha solape títulos, y sus posiciones responden a ambos anchos del sidebar. En móviles sigue integrado en el topbar.
- Sin migraciones SQL, nuevas dependencias, cambios de RLS, Edge Functions ni modificaciones a los archivos/versión del modelo.
- Validación requerida antes de publicar: pruebas UX3, `npm run typecheck`, `npm run build`, `npm run preview` y comprobación en móviles/escritorio (incluido el cambio de ancho persistente, los roles globales y la impresión del PDF formal).

**Estado:** implementación preparada, pendiente de aceptación en Vercel.

<!-- F6-UI4-20261109 -->
### Mejora de navegación 4 — simplificación móvil y auditoría

- El topbar de pantallas menores que `lg` no muestra flecha de retroceso; la navegación se realiza con los controles nativos del sistema o la interfaz del navegador.
- En el sidebar móvil se eliminó la `X` duplicada del encabezado. Se conserva el control inferior **Cerrar menú**, el cierre tocando el fondo y la tecla Escape.
- La auditoría de proyecto (`/proyectos/:projectId/auditoria`) utiliza el mismo `BackButton` flotante, fijo y compartido del resto de módulos en escritorio. Vuelve al detalle del proyecto; no aparece en la auditoría administrativa global.
- La migración, los roles, los eventos de auditoría y las exportaciones no cambian. Sin SQL ni nuevas dependencias.
- Verificación: `node --experimental-strip-types --test tests/fase6.ux4-navigation.test.mjs`, `npm run typecheck`, `npm run build`, comprobación móvil/escritorio y despliegue Vercel.

**Estado:** pendiente de aceptación visual en Vercel.

<!-- FASE6-OPERACION-SEGURIDAD-20261109 -->
## Incremento de cierre operativo — Seguridad, integridad y recuperación

**Estado:** herramientas y procedimientos preparados; pendiente de comprobación en producción y ensayo de restauración. Los módulos de cuentas, revisión, reportes, auditoría y las mejoras de navegación fueron validados funcionalmente en Vercel por el equipo. Esta aceptación no equivale a haber completado una auditoría de seguridad ni un respaldo recuperable.

### 1. Alcance y límites

- `scripts/check-fase6-repository.mjs`: preflight local contra secretos aparentemente versionados y la configuración JWT. Es una inspección estática, no un escáner exhaustivo de credenciales.
- `scripts/test-fase6-hardening-live.mjs`: pruebas **solo lectura** con Admin y Lector de `.env.test.local`; verifica identidad, roles, función administrativa, auditoría global, intento anónimo y, cuando existan muestras, aislamiento de proyectos y privacidad de Storage. Los casos sin muestra se marcan **OMITIDA**, nunca se declaran aprobados.
- `supabase/tests/FASE_6_SEGURIDAD_READONLY.sql`: consultas de diagnóstico para revisar RLS, bucket privado, políticas, funciones privilegiadas, coincidencia de archivos y permisos SQL. No cambia el esquema ni los datos.
- Los módulos siguen limitados a entrenamiento TF.js local, CSV local, PostgreSQL con RLS y almacenamiento privado de modelos; no se incorpora un backend remoto de entrenamiento ni credenciales privilegiadas al navegador.

### 2. Secuencia de verificación (Git Bash)

```bash
node scripts/check-fase6-repository.mjs
node --test tests/fase6.ops.test.mjs tests/fase6.ops-live-mock.test.mjs
npm run typecheck
npm run build
node --env-file=.env.test.local scripts/test-fase6-hardening-live.mjs
```

La prueba en vivo requiere cuentas **activas y distintas** Admin/Lector y el despliegue previo de `admin-users`; no crea cuentas, no registra exportaciones y no hace escrituras. Ejecutar el SQL de diagnóstico desde Supabase SQL Editor. Revisar manualmente cualquier resultado **ERROR**, **OMITIDA** o `FALTA`. No desactivar RLS ni conceder permisos a `anon` por comodidad.

### 3. Política inicial de retención (propuesta pendiente de aprobación)

| Activo | Política propuesta | Condición |
|---|---|---|
| CSV original | Solo memoria del navegador; no se almacena en Supabase | Límite de importación vigente: 10 MiB o 50 000 filas |
| Ejecuciones y métricas | Conservar mientras exista el proyecto | Sin borrado automático |
| Versiones de modelo aprobadas y eventos de revisión | Conservar sin sobrescritura | Retiro es evento, no eliminación física |
| Auditoría | Conservar inicialmente durante la vida del proyecto | Sin job de purga automático |
| Cargas incompletas de Storage | Revisar periódicamente y proponer limpieza manual | No eliminar objetos sin reconciliar reservas y versiones |
| Respaldos operativos externos | Mantener copias cifradas con acceso restringido | Frecuencia y tiempo de retención por definir según plan/capacidad |

**No hay automatización de limpieza ni de backup en este incremento.** Las cifras de retención y el calendario deben aprobarse antes de aplicar borrados.

### 4. Respaldo y restauración (procedimiento operativo)

1. **Registrar inventario.** Anotar proyecto Supabase, commit de Git, migración más reciente aplicada, cantidad de versiones y objetos del bucket `model-artifacts`. No anotar claves ni tokens en la documentación.
2. **Respaldar PostgreSQL.** Revisar `Database → Backups` en Supabase Dashboard. La disponibilidad y retención dependen del plan. En Free, crear exportaciones lógicas con la CLI oficial y guardarlas **cifradas fuera del repositorio**. Evitar pegar la URL con credenciales en el historial de la terminal. Los respaldos de PostgreSQL contienen metadatos de Storage, no los bytes de `model.json` y `weights.bin`.
3. **Respaldar artefactos de Storage por separado.** Exportar de forma privada todos los objetos referenciados por versiones confirmadas desde `model-artifacts` mediante una cuenta operativa autorizada y herramientas oficiales (Dashboard/CLI/S3, según volumen). Guardar junto con un inventario de rutas y hashes SHA-256. No crear buckets públicos ni URLs firmadas sin justificación y vencimiento corto.
4. **Prueba de restauración aislada.** Crear un proyecto de prueba separado. Restaurar DB y objetos compatibles; revisar triggers, RLS, permisos, Auth y la Edge Function. No restaurar encima de producción para ensayar. Verificar que un modelo recuperado coincide con los hashes y predice sin CSV, y que un Lector externo no puede descargarlo.
5. **Validar y documentar.** Registrar fecha, responsable, resultado y RPO/RTO observados (si se midieron). No afirmar recuperación exitosa hasta realizarla. Para incidentes reales, congelar cambios, inventariar el alcance y restaurar según el mecanismo disponible, considerando pérdida de datos desde el punto de respaldo.

Documentación oficial: https://supabase.com/docs/guides/platform/backups y https://supabase.com/docs/guides/storage/management/download-objects .

### 5. Seguimiento operativo y criterios de salida

- **Diario durante operación activa:** Vercel (último despliegue exitoso), Supabase Auth/Edge Function logs y errores de carga, cuotas de base de datos/Storage y fallos de entrenamiento.
- **Semanal:** ejecutar el preflight del repositorio y revisar eventos de auditoría, modelos incompletos y alertas de Supabase. Validar límites de CSV y artefactos mediante pruebas existentes.
- **Mensual o antes del cierre:** repetir controles RLS de dos cuentas con permisos distintos y una restauración aislada cuando la infraestructura lo permita.
- **Para cerrar F6:** builds y pruebas pasan, lecturas indebidas denegadas en vivo, evidencia de salud/capacidad, política de retención aprobada, respaldo verificable con prueba de restauración, y checklist por rol documentado. Una prueba omitida **no** satisface su criterio de aceptación.

**Limitaciones conocidas:** esta versión no incluye monitor continuo, alertas automáticas, job de limpieza, backup ejecutado ni prueba de restauración real. Esas tareas requieren configuración operativa y aprobación explícita del responsable de la infraestructura.


## Fase 6 — Mejoras 5: identidad visual del usuario (2026-11-09)

- Topbar: botón circular con avatar, sin nombre visible. El desplegable muestra «Sesión iniciada», nombre y correo, seguido de Cuenta, Tema y Cerrar sesión.
- Mi cuenta: se elimina el bloque de estado redundante, se conserva la edición del nombre y el modal de contraseña y se incorpora un modal para subir/quitar la fotografía.
- Sin fotografía se muestran las dos primeras letras del nombre, en mayúsculas, sobre un fondo pastel estable derivado del ID del usuario (sin aleatoriedad por render).
- Migración `202611090011_private_user_avatars.sql`: columna `public.app_users.avatar_path`, permiso SELECT de esa columna (necesario debido a los GRANT por columna de F1), RPC `set_my_avatar` con verificación de cuenta activa y pertenencia, bucket privado `user-avatars` y políticas Storage limitadas al propietario. Ningún cambio en `model-artifacts`.
- Se aceptan JPG, PNG y WebP, máximo 2 MiB; las fotos se descargan con JWT como blob local y se revoca su URL al desmontar la vista. SVG y archivos vacíos son rechazados.
- La carga usa nombres nuevos con `upsert: false`; después actualiza el puntero mediante RPC. Al sustituir o quitar foto se intenta eliminar el objeto anterior. Si la eliminación falla, puede requerirse limpieza operativa de archivos huérfanos privados.
- Validación pendiente: ejecutar `node --experimental-strip-types --test tests/fase6.avatars.test.mjs`, `npm run typecheck`, `npm run build`, migración 011 y pruebas funcionales con usuarios de diferentes roles en entorno real.
- Prueba operativa F6: si `TEST_F2_READER_EMAIL` o `TEST_F2_READER_PASSWORD` quedaron anticuados después de reemplazar una cuenta de prueba, corregirlos localmente antes de repetir `scripts/test-fase6-hardening-live.mjs`.

## Matriz de permisos por rol — Fase 6

La columna **Permisos → Ver** en «Proyectos → Integrantes» muestra las capacidades documentadas de cada rol. Esta vista es **explicativa**, no autoriza operaciones: PostgreSQL/RLS, RPC y la Edge Function siguen siendo la fuente de verdad. Las opciones condicionadas explican requisitos como proyecto activo, membresía específica y prohibición de autoaprobar versiones.

La clasificación distingue al **Administrador global** de los roles por proyecto. Admin puede gestionar usuarios y metadatos/membresías de proyectos, pero necesita una membresía técnica explícita para leer modelos privados, entrenar, aprobar o exportar reportes. El Responsable gestiona el proyecto y la auditoría del mismo, pero no recibe automáticamente permiso de entrenamiento ni aprobación; el Ingeniero entrena/publica; el Revisor decide sobre versiones ajenas; y el Lector consulta los recursos autorizados. **La configuración dinámica de límites de recursos descrita como aspiración en el Documento Maestro todavía no está implementada en la interfaz de administración.**

Verificación: `node --env-file=.env.test.local scripts/test-fase6-role-matrix-live.mjs`, usando cinco cuentas distintas y un proyecto activo de prueba que incluya los cuatro roles de proyecto. El script valida identidades y membresías, consulta las políticas RLS y comprueba rutas de autorización por RPC con entradas que garantizan rechazo **antes de escribir**, además de la Edge Function administrativa. Cuando no existan registros de ejemplo, informa **OMITIDA**; no da por superado un permiso que no ha podido comprobar. El script no crea, elimina ni modifica proyectos, usuarios, entrenamientos, modelos o revisiones. Las acciones positivas que requieren escritura quedan para validación manual en un proyecto de prueba controlado.

Para no mezclar un fallo de credenciales con un fallo de permisos, las identidades se verifican primero. No se guardan contraseñas ni tokens en los resultados, y las claves de administración no se cargan en el navegador. Este incremento no requiere migraciones SQL nuevas.
