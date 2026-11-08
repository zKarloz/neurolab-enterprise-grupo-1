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
