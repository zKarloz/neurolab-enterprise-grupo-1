# NeuroLab Enterprise

**Fase 1 — Repositorio inicial y maquetado** · Proyecto nuevo conforme al diseño de Fase 0 aprobado el 7 de noviembre de 2026.

> **Estado real:** scaffold y diseño implementados. La instalación, el build, las pruebas de conexión y el despliegue aún deben verificarse con tu proyecto de Supabase y tu entorno npm. **No** se declara cerrada la Fase 1.

## Funcionalidad incluida

- React + TypeScript estricto + Vite + Tailwind CSS + Lucide.
- Pantalla de login con email y contraseña, sin registro público, ni OAuth, ni recuperación por correo ficticia.
- Sesión validada con Supabase Auth; además se exige perfil activo en `public.app_users` protegido con RLS.
- Rutas `/acceder` (pública), `/inicio` (privada) y `/cuenta` (privada).
- Cierre de sesión; cambio de contraseña mediante Supabase Auth.
- Maquetado profesional responsive, menú móvil, componentes de interfaz y temas claro (predeterminado) / oscuro en escala de grises.
- Pantallas de carga, configuración faltante, acceso bloqueado y error de conexión.
- **No hay proyectos ficticios, datos de entrenamiento ni resultados simulados.**

## Inicio rápido (VSCode + Git Bash)

```bash
cp .env.example .env.local
# Edita .env.local para establecer URL y clave pública de Supabase.
npm install
npm run typecheck
npm run build
npm run dev
```

Abrir la dirección que informe Vite. **Node.js requerido:** 22.12 o superior (Vite 8 también admite 20.19+).

La clave `VITE_SUPABASE_ANON_KEY` es pública (anon/publishable). **Nunca usar `service_role` o credenciales administrativas en frontend.** El archivo `.env.local` está ignorado por Git.

Para el paso a paso de Auth, SQL, RLS, primer administrador y Vercel ver [Guía de Fase 1](docs/operations/FASE_1_CONFIGURACION.md).

## Árbol de carpetas inicial

```text
src/
  app/                Rutas y preferencia de tema
  components/ui/      Botón, campo, aviso, tarjeta y estados compartidos
  components/layout/  Layout protegido responsive
  features/auth/      Login, sesión y contraseña propia
  features/home/      Inicio sin datos ficticios
  lib/                Cliente público de Supabase
  styles/             Tema claro/oscuro
  types/              Contratos de autenticación
supabase/
  migrations/         Esquema mínimo de app_users
  tests/              Checklist RLS por ejecutar
```

## Decisiones y límites

- Los cinco roles acordados se implementarán en las fases correspondientes. **Administrador global no implica acceso técnico automático a otros proyectos.**
- La tabla `app_users` incluye `is_platform_admin` protegido, `status=active|inactive` y FK a `auth.users`.
- La UI solo reconoce como autenticado a quien supera la comprobación de identidad y el perfil activo. RLS es la frontera de seguridad, no los componentes React.
- La creación de cuentas se realiza exclusivamente de manera administrativa desde Supabase Dashboard.
- No se instalaron todavía TensorFlow.js, PapaParse ni Recharts: corresponden a F3/F4.
- Para reproducibilidad, los números de versión de dependencias son exactos, sin `^` ni `~`. El lockfile se generará mediante `npm install` en un entorno con acceso al registro; no se ha inventado.

## Comprobaciones disponibles

```bash
npm run test:structure  # Puede ejecutarse sin instalar dependencias
npm run typecheck       # Requiere npm install
npm run build           # Requiere npm install
```

## Próximos pasos antes de cerrar la Fase 1

1. Instalar dependencias, generar y versionar `package-lock.json`; corregir incompatibilidades detectadas por compilación.
2. Configurar Supabase nuevo, desactivar signUp e instalar migración RLS inicial.
3. Probar sesiones válidas, inválidas, cuentas inactivas y accesos negados.
4. Desplegar a Vercel y verificar conexión real con URL de producción.
5. Organizar commit de validación y documentar evidencia de pruebas.
