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
