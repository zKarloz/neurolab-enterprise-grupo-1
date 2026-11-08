# Fase 1 — Configuración segura y despliegue

## 1. Requisitos previos

- Node.js **22.12 o superior** (recomendado 22 LTS), npm y Git Bash.
- Un proyecto **nuevo** de Supabase, sin datos ni migraciones de implementaciones anteriores.
- Repositorio Git propio y cuenta de Vercel.

## 2. Crear y configurar Supabase

1. Crear proyecto nuevo.
2. En Authentication > Providers, habilitar únicamente **Email**. Deshabilitar OAuth y acceso anónimo.
3. En Authentication > General Settings, deshabilitar **Allow new users to sign up**. No existe `signUp` en el código del frontend.
4. Como no se configuró SMTP, el administrador creará usuarios desde **Authentication > Users**. Configurar confirmación de correo según el procedimiento administrativo (no enviar correos a destinatarios no autorizados).
5. Ejecutar `supabase/migrations/202611070001_init_app_users.sql` una sola vez en SQL Editor con identidad privilegiada.
6. Crear manualmente el primer usuario y verificar que existe su fila en `public.app_users`.
7. Para designar al primer administrador, desde **SQL Editor y solo como operador privilegiado**, ejecutar la consulta siguiente, **reemplazando el UUID** por el ID Auth verificado:

   ```sql
   -- Operación de bootstrap manual: NO colocar en migraciones automáticas.
   update public.app_users
      set is_platform_admin = true, updated_at = now()
    where id = 'REEMPLAZAR_POR_UUID_DE_AUTH';
   ```

8. Verificar visualmente el resultado desde SQL Editor. Ninguna cuenta puede ejecutar esta operación con la clave pública.
9. Ejecutar los casos de `supabase/tests/rls_checklist.md` antes de dar por terminada la Fase 1.

**Nota:** `is_platform_admin` solo define gestión global futura; no concede lectura técnica de proyectos ajenos ni permisos para aprobar/entrenar modelos.

## 3. Configurar frontend en VSCode (terminal Git Bash)

```bash
cp .env.example .env.local
# Editar .env.local con valores REALES de Settings > API en Supabase.
npm install
npm run typecheck
npm run build
npm run dev
```

La instalación debe generar `package-lock.json`; debe añadirse al repositorio una vez validado. No introducir `service_role` ni claves secretas en `VITE_*`.

Solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (clave pública anon/publishable) deben existir en Vercel. Su exposición al navegador es normal; **RLS** protege datos y privilegios.

## 4. Vercel

1. Subir el repositorio a GitHub mediante Git Bash (`git remote add origin ...`, `git push ...`).
2. Importar en Vercel como proyecto Vite.
3. Configurar las dos variables públicas en Project Settings > Environment Variables.
4. Compilar con `npm run build`; salida `dist`.
5. Verificar URL HTTPS pública, ruta directa `/acceder`, login autorizado, `/inicio` y `/cuenta`.
6. Probar refresco de `/cuenta`, logout y acceso anónimo a rutas privadas.
7. Probar que una cuenta `inactive` no accede aunque tenga sesión.

No registrar el despliegue como completado sin URL comprobada y pruebas reales contra Supabase.

## 5. Recuperación administrativa temporal

Sin SMTP propio, **no** se ofrece botón de recuperar contraseña. El administrador debe verificar la identidad por canal externo autorizado y restablecer la contraseña desde Dashboard, transmitiendo nuevas credenciales de forma segura. El usuario puede cambiar su contraseña desde `/cuenta` con una sesión válida.

## 6. Cuándo detenerse

Detenerse únicamente ante decisiones de impacto arquitectónico o seguridad. No incorporar proyectos, redes, datasets, entrenamiento ni métricas ficticias durante F1.
