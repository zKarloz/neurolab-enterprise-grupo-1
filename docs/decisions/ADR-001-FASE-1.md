# ADR-001 — Base de Fase 1

- **Estado:** En implementación; decisión arquitectónica ya aprobada en Fase 0.
- **Fecha:** 2026-11-07.
- **Contexto:** entrega inicial del repositorio y maquetado, sin adelantar Fase 2.
- **Elección:** React 19, Vite 8, TypeScript 7, Tailwind 4, React Router 7, Lucide React y Supabase JS, versiones exactas en `package.json`.
- **Autorización:** Supabase Auth valida identidad, RLS en `app_users` permite leer solo el perfil propio activo. UI no habilita rutas privadas antes de consultar perfil remoto.
- **Diseño:** claro por defecto y oscuro en escala de grises; componentes compartidos mínimos.
- **Persistencia local:** solo preferencia de tema; sin datos de proyectos.
- **Fuera de alcance:** CSV, TensorFlow.js, proyectos, estadísticas, modelo registry, administración avanzada y entrenamiento remoto.
- **Comprobado localmente:** 3 pruebas estructurales de Node aprobadas y 17 archivos TS/TSX analizados sin errores sintácticos (no equivale a un typecheck).
- **Pendiente verificable:** `npm install`, lockfile, compilación/typecheck, pruebas de Supabase y despliegue Vercel. El entorno de generación no tuvo acceso DNS al registro npm, por lo que estas verificaciones NO se declaran ejecutadas.
