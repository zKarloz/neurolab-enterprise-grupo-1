# Fase 1 — Alta inicial de Supabase y primer Administrador

> **Estado:** procedimiento preparado, ejecución remota pendiente. No equivale a una cuenta o proyecto ya creados.
> **Seguridad aprobada:** el Administrador global no tiene acceso técnico automático a proyectos ajenos.

## 1. Crear proyecto NUEVO

1. Inicia sesión en https://supabase.com/dashboard y selecciona **New project**.
2. Asigna nombre `neurolab-enterprise` (o `neurolab-enterprise-dev` si prevés separar entornos), organización propia y plan **Free**.
3. Selecciona una región cercana a los usuarios del proyecto; revisa la región real disponible antes de guardar.
4. Genera una contraseña **larga y única de PostgreSQL** con gestor de contraseñas, guárdala fuera del repositorio y no la envíes por chat.
5. Crea el proyecto y comprueba que está disponible. No reutilices una instancia con datos anteriores.

## 2. Auth — solo correo y contraseña

1. En **Authentication > Sign In / Providers**, conserva Email habilitado y deshabilita otros proveedores no requeridos.
2. En **Authentication > Settings / General**, desactiva **Allow new users to sign up**.
3. Desactiva **Allow anonymous sign-ins**.
4. Mantén la verificación de correo para flujos que la requieran; para la cuenta inicial, usa el alta administrativa y **confirma el correo manualmente solo si has verificado su propiedad**. No dependas de SMTP sin configurar.
5. En **Authentication > URL Configuration**, fija `http://localhost:5173` como Site URL durante el desarrollo y registra URLs de redirección necesarias. Tras desplegar, sustituye o agrega el dominio HTTPS de Vercel.
6. Revisa en **Authentication > Users** que no existan cuentas inesperadas.

> Los nombres de menú pueden variar. Las referencias oficiales están en https://supabase.com/docs/guides/auth/general-configuration .

## 3. Ejecutar migración inicial

En **SQL Editor**, abre y ejecuta el contenido completo de:

`supabase/migrations/202611070001_init_app_users.sql`

La migración crea `public.app_users`, triggers desde `auth.users` y RLS **solo lectura del perfil propio activo**. No concede INSERT/UPDATE/DELETE al frontend. Aplica esta migración **una sola vez** en el nuevo proyecto, antes de crear usuarios.

Verificación manual en SQL Editor:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'app_users';

select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'app_users';
```

Resultado esperado: `rowsecurity = true` y una política SELECT limitada a `authenticated`.

## 4. Crear primera cuenta y nombrar Administrador

1. En **Authentication > Users**, elige **Add user > Create new user** si está disponible (evita **Send invitation**, que necesita correo saliente).
2. Introduce correo real del operador y una contraseña temporal robusta creada mediante gestor. La contraseña **no** debe entrar en Git, archivos SQL ni chat.
3. Confirma el correo de manera administrativa **solo tras verificar su propiedad** (opción `Auto Confirm User` si la pantalla la ofrece).
4. Copia el UUID del nuevo usuario en Authentication > Users.
5. En **Table Editor > public.app_users**, comprueba que el trigger creó su perfil con `status=active` e `is_platform_admin=false`.
6. En **SQL Editor**, abre `supabase/bootstrap/01_first_platform_admin.sql`, sustituye **el UUID de ceros** por el UUID real y ejecútalo manualmente. No guardes el UUID real en Git.
7. Verifica que su fila tiene `is_platform_admin=true`. El bootstrap falla intencionadamente si ya existe un administrador.
8. Inicia sesión en la app, entra a **Mi cuenta**, confirma “Administrador global” y cambia la contraseña temporal.

**No crear directamente filas en `auth.users` mediante SQL**: utilizar Dashboard o un mecanismo Admin autorizado.

## 5. Conectar React (VSCode + Git Bash)

En el directorio del repositorio:

```bash
cp .env.example .env.local
# Edita .env.local con el Project URL y la clave PUBLICABLE (sb_publishable_...).
npm install
npm run typecheck
npm run build
npm run dev
```

Obtén Project URL y publicable key desde el diálogo **Connect** o **Settings > API Keys** de Supabase.

El archivo `.env.local` debe contener solo:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
```

La clave `sb_publishable_` sustituye a la clave `anon` antigua y conserva el alcance público limitado por RLS. **Nunca** incluyas `sb_secret_`, `service_role` ni una contraseña de PostgreSQL en `VITE_*`.

## 6. Verificaciones antes de avanzar a Vercel

- Acceso a `/acceder` con credenciales válidas; redirección a `/inicio`.
- Pantalla `/cuenta` indica el perfil y el rol global correctos.
- Usuario con contraseña incorrecta no accede.
- Visitante anónimo y cuenta inactiva no ven recursos privados.
- Desde el cliente público, nadie puede escribir `status` ni `is_platform_admin`.
- Usuario A no puede leer perfil de B.
- Cierre de sesión y cambio de contraseña funcionan.

Guía de casos de RLS: `supabase/tests/rls_checklist.md`.

## 7. Despliegue Vercel — pendiente

1. Publica el repositorio Git en GitHub cuando el build y pruebas locales pasen.
2. Importa el repositorio en Vercel como proyecto Vite (salida: `dist`).
3. Configura **solo** las dos variables públicas anteriores en Vercel.
4. Añade la URL HTTPS de Vercel a las URLs autorizadas de Supabase Auth.
5. Verifica recarga en `/cuenta`, login, logout y denegación de acceso a inactivos desde producción.

Fase 1 **no se cierra** hasta tener URL desplegada y comprobar conexión Auth/PostgreSQL real.

## 8. Recuperación administrativa provisional

Hasta disponer de SMTP configurado, el administrador verifica la identidad del titular por un canal seguro y restablece la contraseña mediante la interfaz administrativa de Auth. No se habilita “Olvidé mi contraseña” que dependa de correos no configurados.

Referencias: https://supabase.com/docs/guides/getting-started/api-keys ; https://supabase.com/docs/guides/auth/users ; https://supabase.com/docs/guides/auth/managing-user-data .

# Fase 1 - validación y despliegue

**Estado:** en curso. La migración de `app_users` y el bootstrap del primer Administrador ya fueron ejecutados por el responsable del proyecto, y se verificó inicio de sesión desde la web. No volver a ejecutar los scripts de bootstrap.

**Objetivo inmediato:** confirmar acceso/aislamiento y desplegar la SPA en Vercel. No iniciar Fase 2 hasta obtener una URL de producción funcional.

## 1. Compilación y repositorio local (VSCode / Git Bash)

```bash
node -v                  # 22.12+ recomendado para este repositorio
npm install              # genera package-lock.json
npm run typecheck
npm run build
npm run test:structure
```

Si `npm install` genera un lockfile, **versionarlo**. Nunca subir `.env.local`, contraseñas, tokens de sesión, `node_modules` ni claves `sb_secret_`/`service_role`.

## 2. Comprobar configuración de Auth (Supabase Dashboard)

- Authentication > Providers / General: únicamente email + password.
- `Allow new users to sign up`: **desactivado**.
- `Allow anonymous sign-ins`: **desactivado**.
- Proveedores OAuth: deshabilitados.
- Sin SMTP propio, mantener recuperación administrativa; no habilitar en la UI un botón ficticio de recuperación por email.

### Pruebas mínimas de interfaz

- [ ] Anónimo que abre `/cuenta` termina en `/acceder` sin información privada.
- [ ] Credenciales incorrectas: error y sin acceso.
- [ ] Administrador: inicio de sesión válido; `/cuenta` indica Administrador global.
- [ ] Cerrar sesión y usar la navegación atrás: no se muestra la vista protegida.
- [ ] Cambiar contraseña desde `/cuenta`; salir y volver a entrar con la nueva contraseña.
- [ ] Refrescar `/inicio` y `/cuenta` directamente (rutas SPA).

## 3. Verificación real de RLS con la clave publicable

El verificador usa **las credenciales de las cuentas de prueba solo en la memoria del proceso**, nunca las escribe ni solicita claves administrativas. Ejecutar desde Git Bash (no copiar las contraseñas a archivos o al chat):

```bash
read -rp 'Correo del administrador: ' TEST_ADMIN_EMAIL
read -rsp 'Contraseña: ' TEST_ADMIN_PASSWORD; echo
export TEST_ADMIN_EMAIL TEST_ADMIN_PASSWORD
npm run test:rls:live
unset TEST_ADMIN_EMAIL TEST_ADMIN_PASSWORD
```

El script prueba que un anónimo no vea perfiles, que el Admin autenticado lea su perfil activo y que tampoco pueda listar perfiles ajenos. **Con una sola cuenta no prueba aislamiento cruzado.**

Para completar la prueba, crear desde Dashboard una segunda cuenta de prueba (sin privilegios globales), con correo confirmado y perfil activo. Después, antes del comando de verificación, definir también estas variables temporalmente:

```bash
read -rp 'Correo del usuario de prueba: ' TEST_OTHER_EMAIL
read -rsp 'Contraseña del usuario de prueba: ' TEST_OTHER_PASSWORD; echo
export TEST_OTHER_EMAIL TEST_OTHER_PASSWORD
npm run test:rls:live
unset TEST_OTHER_EMAIL TEST_OTHER_PASSWORD
```

### Comprobaciones de seguridad manuales

- [ ] Desde la segunda sesión intentar actualizar su `is_platform_admin` o `status`: **denegado** (revocados privilegios + sin políticas UPDATE).
- [ ] Desactivar temporalmente **solo la segunda cuenta** desde SQL Editor, recargar su navegador y comprobar que deja de ver páginas privadas aunque su sesión Auth siga vigente. **Nunca utilizar el primer Administrador para esta prueba**.
- [ ] Reactivar la segunda cuenta y confirmar acceso nuevamente.
- [ ] Confirmar que el Administrador global no puede leer el perfil ajeno solo por ser Admin (regla aprobada de separación de privilegios).

No usar `service_role` en las pruebas de cliente, porque omite RLS. Si falla un control, no desplegar todavía.

## 4. Subir a GitHub (repo privado)

Crear un repositorio **privado y vacío** llamado `neurolab-enterprise` en GitHub (sin README inicial). Desde Git Bash:

```bash
git status
git add package.json package-lock.json scripts/ docs/operations/FASE_1_VALIDACION_Y_DESPLIEGUE.md
git commit -m "test(fase1): verificar RLS y preparar despliegue Vercel"
git branch -M main
git remote -v  # si no existe origin, ejecutar la siguiente línea
git remote add origin https://github.com/TU-USUARIO/neurolab-enterprise.git
git push -u origin main
```

Si `origin` ya existe, no repetir `git remote add`. Si quedan otros cambios legítimos de tu equipo, revisarlos y versionarlos conscientemente, evitando secretos.

## 5. Despliegue en Vercel

1. Entrar a https://vercel.com/new e importar el repositorio privado GitHub.
2. Framework **Vite**, Root Directory **./** (si `package.json` está en la raíz), Build Command **`npm run build`**, Output Directory **`dist`**, Node **22.x** si permite seleccionarlo.
3. En Environment Variables (Production) configurar solo:

   | Nombre                          | Contenido                          |
   | ------------------------------- | ---------------------------------- |
   | `VITE_SUPABASE_URL`             | Project URL HTTPS de Supabase      |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave pública `sb_publishable_...` |

   Son valores públicos, pero no incluir claves `sb_secret_`, `service_role` o contraseñas de base de datos.

4. Desplegar. Si cambias variables después, **volver a desplegar**, pues Vite las incorpora en el build.
5. En Supabase > Authentication > URL Configuration, actualizar **Site URL** al dominio estable de producción y agregar la URL de producción como redirección autorizada si se requieren callbacks. El login actual email/password no usa OAuth ni callbacks de correo; esta URL sigue siendo parte de la configuración operativa.
6. Comprobar las rutas de SPA en el dominio con:

```bash
npm run test:deploy -- https://TU-SITIO.vercel.app
```

La respuesta 200 del servidor **no** prueba acceso autorizado; React protege la vista y la BD protege los datos. Completar pruebas reales de login, logout, cambio de contraseña y refresh directo en Vercel.

## 6. Criterio de cierre de Fase 1

- [ ] `npm run typecheck`, `npm run build`, `npm run test:structure` correctos.
- [ ] `package-lock.json` versionado; dependencias con versiones exactas.
- [ ] Registro público y anónimo desactivados.
- [ ] Pruebas RLS propias/ajenas/inactivo/edición privilegiada correctas.
- [ ] Login, logout, cambio de contraseña y rutas privadas correctos.
- [ ] GitHub remoto con commits (sin archivos de secretos).
- [ ] URL HTTPS real de Vercel operativa y conectada con Supabase.
- [ ] Smoke test HTTP y comprobación funcional de navegador en Vercel correctos.

**No cerrar Fase 1 por el mero hecho de haber iniciado sesión en local**; el despliegue público verificado forma parte del criterio aprobado.

## Referencias oficiales

- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/guides/auth/redirect-urls
- https://vite.dev/guide/static-deploy
- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/environment-variables

# Fase 1 — Punto de control: repositorio inicial y maquetado

**Fecha:** 7 de noviembre de 2026

**Estado:** EN CURSO. Primer incremento de Fase 1; no afirmar que la Fase 1 está desplegada o aceptada.

## Entregado

- Repositorio React/TS/Vite nuevo, paquetes fijados por versión exacta.
- Maquetado responsive: acceso, inicio protegido y cuenta. Tema claro y oscuro gris.
- Componentes reutilizables mínimos y mensajes de carga/error/permiso.
- Supabase Auth mediante email + contraseña, verificación remota de identidad y perfil.
- SQL mínimo de `app_users`, trigger de sincronización y RLS de solo lectura propia activa.
- Procedimiento de bootstrap del Admin fuera de migraciones y sin secretos en frontend.
- Guía de instalación, configuración Supabase, RLS y Vercel.
- Documento aprobado Fase 0 adjunto a `docs/architecture` como fuente de decisiones.

## Evidencia realizada en el entorno de creación

- `node --test tests/structure.test.mjs`: 3/3 pruebas aprobadas.
- Análisis sintáctico de 17 archivos TS/TSX con TypeScript instalado en el entorno: cero errores de sintaxis.
- Inspección de secretos y búsqueda de `signUp` en el código de aplicación: sin funcionalidad de registro público.

## Pendientes (no se han fingido)

- `npm install` y generación de `package-lock.json`, bloqueados por acceso DNS al registro npm en este entorno.
- `npm run typecheck` y `npm run build` reales, una vez instaladas las dependencias.
- Pruebas de UI real y RLS contra dos identidades existentes de Supabase.
- Configuración de Auth y alta de usuario/administrador en Supabase Dashboard.
- Repositorio remoto y despliegue a Vercel; comprobación pública de rutas y conexión.

**No se han creado proyectos de IA, modelos, redes, CSV, datos de demostración ni métricas simuladas.**

## Incremento siguiente — bootstrap Supabase preparado

- Nombre de variable de frontend actualizado a `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Procedimiento de alta de primer administrador protegido y repetible **solo tras editar UUID**, fuera de migraciones automáticas.
- Guía de alta inicial y checklist de pruebas.
- Proyecto remoto, migración ejecutada y usuario real **todavía pendientes** de conectar Supabase.

## Avance posterior informado por el usuario

- Migración SQL y bootstrap del primer Administrador ejecutados, según confirmación del usuario.
- Creada cuenta real; inicio de sesión y rol «Administrador global» visibles en la web.
- Se incorporó un verificador en vivo de lectura RLS y un smoke test de rutas Vercel; **no ejecutados contra el proyecto del usuario en este entorno**.
- Persiste pendiente: pruebas RLS cruzadas, cambio de contraseña, `npm run typecheck`, build local y URL de producción verificada.
- Guía actualizada: `FASE_1_VALIDACION_Y_DESPLIEGUE.md`.

## Hito de despliegue informado el 7 de noviembre de 2026

El usuario confirmó que el proyecto funciona en `https://neurolab-enterprise-grupo-1.vercel.app/` y que accede con su cuenta de Administrador. El entorno de generación no pudo inspeccionar automáticamente la URL ni ejecutar pruebas RLS cruzadas. Se continuó con Fase 2 a petición del usuario; las pruebas pendientes no deben figurar como ejecutadas.

## M01 · Dashboard operativo (mejora transversal)

La pantalla **Inicio** consulta proyectos y ejecuciones almacenadas en PostgreSQL, bajo la identidad de Supabase Auth y sus políticas RLS. No utiliza indicadores simulados ni concede privilegios nuevos.

- **Resumen de proyectos:** proyectos visibles activos y archivados; acceso a los más recientes y al listado general.
- **Entrenamientos activos y recientes:** estados persistidos de preparación/ejecución; últimas 32 ejecuciones visibles en tabla paginada, con familia real, épocas y enlace al historial. Los estados remotos no prueban que otro Web Worker continúe activo.
- **Indicadores de uso:** ejecuciones iniciadas y completadas durante los últimos 30 días (según las fechas registradas), proyectos activos y entrenamientos en curso según Supabase.
- **Alertas:** fallidas o interrumpidas en 7 días, trabajos en preparación/ejecución sin cambios durante 60 minutos, registros sin iniciar y proyectos archivados. Una alerta por inactividad no prueba que se haya detenido un navegador.
- **Estado de la consulta:** carga, reintento, fecha de actualización y error explícito. Nunca se interpreta una consulta fallida como éxito o como contador cero.

**Seguridad:** el administrador global sin membresía puede tener visibilidad de proyectos pero no de arquitecturas, datasets ni entrenamientos técnicos. Los agregados de ejecuciones se calculan exclusivamente desde filas autorizadas por RLS. No se modifica ninguna política, migración ni privilegio de acceso.

**Límites:** la lista reciente muestra como máximo 32 ejecuciones; los conteos se obtienen mediante consultas «count: exact» independientes de esa lista. La pantalla no constituye un monitor de disponibilidad global del servidor, telemetría del navegador ni control remoto de Workers.
