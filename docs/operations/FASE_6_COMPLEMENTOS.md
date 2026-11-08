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
