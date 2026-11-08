# NeuroLab Enterprise — Fase 1: validación y despliegue

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

   | Nombre | Contenido |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL HTTPS de Supabase |
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
