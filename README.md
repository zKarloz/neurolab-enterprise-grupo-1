# NeuroLab Enterprise

**Fase 2 — Proyectos de IA** · Continuación de la base React/Supabase de Fase 1 conforme al diseño aprobado.

> **Estado reportado (7 de noviembre de 2026):** el usuario confirmó acceso real del Administrador y despliegue en https://neurolab-enterprise-grupo-1.vercel.app/. El despliegue no pudo inspeccionarse automáticamente desde este entorno. **Fase 2: código y migración preparados, NO aplicados todavía a tu Supabase.**

## Funcionalidad incluida

- React + TypeScript estricto + Vite + Tailwind CSS + Lucide.
- Pantalla de login con email y contraseña, sin registro público, ni OAuth, ni recuperación por correo ficticia.
- Sesión validada con Supabase Auth; además se exige perfil activo en `public.app_users` protegido con RLS.
- Rutas `/acceder` (pública), `/inicio`, `/cuenta`, `/proyectos` y `/proyectos/:projectId` (privadas).
- Cierre de sesión; cambio de contraseña mediante Supabase Auth.
- Maquetado profesional responsive, menú móvil, componentes de interfaz y temas claro (predeterminado) / oscuro en escala de grises.
- Pantallas de carga, configuración faltante, acceso bloqueado y error de conexión.
- **Fase 2**: proyectos, integrantes y roles con RLS y auditoría. **Fase 3**: preparación CSV, TensorFlow.js Dense y métricas persistidas. **Fase 4**: evaluación de prueba, historial, comparación y predicción local en sesión.

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

La clave `VITE_SUPABASE_PUBLISHABLE_KEY` es pública (`sb_publishable_...`). **Nunca usar `sb_secret_`, `service_role` o credenciales administrativas en frontend.** El archivo `.env.local` está ignorado por Git.

Para la configuración de Auth y bootstrap ver la [Guía inicial](docs/operations/FASE_1_CONFIGURACION.md). Con el Administrador ya creado, continuar con [Fase 2: proyectos](docs/operations/FASE_2_PROYECTOS.md). **No volver a ejecutar el bootstrap ni la migración F1.**

## Árbol de carpetas por fases

```text
src/
  app/                Rutas y preferencia de tema
  components/ui/      Botón, campo, aviso, tarjeta y estados compartidos
  components/layout/  Layout protegido responsive
  features/auth/      Login, sesión y contraseña propia
  features/home/      Inicio sin datos ficticios
  features/projects/  CRUD de proyectos e integrantes
  services/           Operaciones Supabase centralizadas
  lib/                Cliente público de Supabase
  styles/             Tema claro/oscuro
  types/              Contratos de autenticación
supabase/
  migrations/         F1 app_users + F2 proyectos/miembros/auditoría
  tests/              Matriz de pruebas RLS y cuentas cruzadas
```

## Decisiones y límites

- Los cinco roles acordados se implementarán en las fases correspondientes. **Administrador global no implica acceso técnico automático a otros proyectos.**
- La tabla `app_users` incluye `is_platform_admin` protegido, `status=active|inactive` y FK a `auth.users`.
- La UI solo reconoce como autenticado a quien supera la comprobación de identidad y el perfil activo. RLS es la frontera de seguridad, no los componentes React.
- La creación de cuentas se realiza exclusivamente de manera administrativa desde Supabase Dashboard.
- TensorFlow.js, PapaParse y Recharts se usan en F3/F4; las versiones exactas están fijadas en `package.json`.
- Para reproducibilidad, los números de versión de dependencias son exactos, sin `^` ni `~`. El lockfile se generará mediante `npm install` en un entorno con acceso al registro; no se ha inventado.

## Comprobaciones disponibles

```bash
npm run test:structure  # Puede ejecutarse sin instalar dependencias
npm run typecheck       # Requiere npm install
npm run build           # Requiere npm install
```

## Próximos pasos para cerrar la Fase 2

1. Ejecutar **únicamente** `supabase/migrations/202611070002_projects_members_audit.sql` una vez desde Supabase SQL Editor.
2. En Git Bash: `npm install`, `npm run typecheck`, `npm run build`, `npm run test:structure`, `npm run test:projects`.
3. Crear una cuenta de prueba adicional desde Supabase Dashboard y ejecutar las pruebas con dos identidades según `supabase/tests/FASE_2_RLS.md`.
4. Hacer commit y push a `main` para actualizar Vercel; probar el flujo real en `/proyectos`.
5. Documentar evidencia y confirmar cierre de Fase 2 antes de iniciar Feedforward (F3).

**Sin claves administrativas ni archivos CSV originales en el frontend.**

## Incremento 1 de Fase 3 — Preparación local de CSV

La preparación de datos se abre únicamente desde el detalle de un proyecto **activo** para el usuario con rol **Ingeniero/analista de IA**. Consulta `docs/operations/FASE_3_FEEDFORWARD.md` para instrucciones, límites y pruebas.

```bash
npm install
npm run test:preprocessing
npm run typecheck
npm run build
```

No hay migración adicional para este incremento ni se sube el CSV. El entrenamiento real y la persistencia de metadatos/ejecuciones llegarán en los próximos incrementos de la misma Fase 3.

## Fase 3 · Incremento 2 — Entrenamiento Dense

Con un proyecto activo y rol **Ingeniero**, abre Proyectos → Detalle → Dataset local, prepara un CSV y utiliza el constructor Feedforward Dense al final de la pantalla. TF.js se entrena en el navegador; no hay API Python ni datos simulados. Ejecuta `npm install`, `npm run typecheck`, `npm run build`, `npm run test:network` y `npm run test:training:runtime` antes del despliegue. La documentación se mantiene en `docs/operations/FASE_3_FEEDFORWARD.md`.

### Fase 3 — Persistencia de Feedforward (incremento 3)

La migración `supabase/migrations/202611080003_feedforward_persistence.sql` agrega datos de arquitecturas, metadatos de CSV y ejecuciones con RLS. Aplicarla **una sola vez** antes de desplegar este frontend. Las filas originales de CSV no se suben. Comprobar `npm run test:persistence` y, con `.env.test.local` y dos cuentas, `npm run test:fase3:live`. Documentación completa dentro del **único archivo** `docs/operations/FASE_3_FEEDFORWARD.md`.


## Fase 4 — Evaluación e historial (incremento inicial)

La Fase 3 quedó cerrada tras la validación del equipo. La Fase 4 añade evaluación final sobre test e historial accesible a integrantes desde `Proyectos → Historial`. Antes de desplegar, aplicar la nueva migración `supabase/migrations/202611080004_test_evaluation.sql`, ejecutar `npm run test:evaluation`, `npm run typecheck`, `npm run build` y probar ambos CSV. No se almacenan filas ni modelos hasta las fases correspondientes. Guía única: `docs/operations/FASE_4_EVALUACION_HISTORIAL.md`.


## Fase 4 · Incremento 2 — Predicción y comparación

Tras entrenar como **Ingeniero**, el formulario «Predicción local» utiliza los pesos aún en memoria y el preprocesamiento de train. En «Historial» se pueden seleccionar dos ejecuciones completadas del mismo tipo para comparar sus curvas y métricas de test confirmadas por Supabase. **No ejecutar SQL nuevo.**

```bash
npm run test:fase4:prediction
npm run test:evaluation
npm run typecheck
npm run build
npm run test:training:runtime
```

La guía y las evidencias se mantienen en un único archivo: `docs/operations/FASE_4_EVALUACION_HISTORIAL.md`. La carga de modelos tras cerrar la pestaña se implementará en Fase 5.

## Fase 5 — Modelos privados (incremento 1)

Ejecutar `npm run test:fase5`, `npm run test:fase5:runtime`, `npm run typecheck` y `npm run build`; después aplicar la migración `202611080005_private_models.sql` en Supabase y probar `npm run test:fase5:live`. Manual y criterios en **`docs/operations/FASE_5_MODELOS.md`**. No incluir `.env.local` ni `.env.test.local` en Git.
