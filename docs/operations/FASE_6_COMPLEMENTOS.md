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
