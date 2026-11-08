# Fase 2 — Proyectos, integrantes y permisos

Estado: **implementación preparada, pendiente de ejecutar migración y pruebas reales contra Supabase**.

## Antes de ejecutar

- Confirmar que el repositorio desplegado en Vercel es la rama `main` actualizada.
- Conservar intactos `.env.local`, `package-lock.json` y la configuración de Vercel.
- **NO** volver a ejecutar `202611070001_init_app_users.sql` ni `01_first_platform_admin.sql`.

## 1. Migración de Supabase

Supabase Dashboard → SQL Editor → nueva consulta. Ejecutar **una vez** `supabase/migrations/202611070002_projects_members_audit.sql`.

Crea únicamente: `projects`, `project_members`, `audit_events`, helpers internos en esquema `private` y siete RPC autorizadas. Activa RLS, retira permisos directos de escritura y permite SELECT según autorización. **No crea usuarios ni afecta privilegios del primer Administrador.**

Los cambios de rol y eliminación de integrantes bloquean la fila del proyecto para evitar carreras. Ni el responsable ni el Admin pueden autoconcederse otra membresía. El propietario queda protegido contra retirada/cambio de rol en esta fase. La eliminación de proyectos es **archivo lógico** (no se borran datos).

## 2. Aplicación React

```bash
npm install
npm run typecheck
npm run build
npm run test:structure
npm run test:projects
npm run dev
```

La sección **Proyectos** permite:

1. Administrador global o Responsable de otro proyecto activo: crear proyecto; el creador queda explícitamente como Responsable.
2. Integrantes autorizados: leer proyectos y listado de miembros; buscar, filtrar y paginar.
3. Responsable o Administrador global: editar nombre y descripción, archivar, añadir por correo a un usuario existente, cambiar rol o retirar (excepto propio y propietario).
4. Lector / Ingeniero / Revisor: solo consultar metadatos del proyecto y sus miembros, sin mutaciones administrativas.
5. Un Administrador global que no sea miembro **solo ve metadatos administrativos**. Las futuras tablas técnicas (F3-F5) comprobarán el rol de proyecto, sin excepción automática por Admin.

**Recuperación:** actualiza desde Supabase al abrir la lista y cada proyecto. No existe base de datos local de proyectos ni elementos ficticios.

## 3. Pruebas reales

Consulta `supabase/tests/FASE_2_RLS.md` y ejecuta `npm run test:fase2:live` con dos usuarios reales previamente creados (contraseñas solo en `.env.test.local`, ignorado por Git). El script crea un proyecto de prueba y lo archiva, conservando auditoría. Las pruebas estructurales por sí solas **no validan RLS**.

## 4. Despliegue

Publica Git `main` en GitHub; Vercel desplegará la actualización. Verifica `/proyectos` y `/proyectos/<UUID>` tras el login. Comprueba persistencia cerrando sesión y regresando, y el aislamiento con la segunda cuenta.

## Criterio de aceptación

- Crear, editar, archivar y consultar proyectos **reales** desde Supabase.
- Asignar, cambiar y retirar integrantes conforme a cuatro roles de proyecto.
- Proyectos recuperables en nuevas sesiones y aislados entre usuarios.
- Admin global sin lectura automática de datos técnicos y sin autoconcederse membresías.
- Políticas RLS y RPC probadas con dos cuentas.
- Compilación y Vercel verificados con la nueva versión.

La Fase 2 se cierra solo cuando esas comprobaciones se documenten como satisfactorias.

## Alta de usuario y rol del proyecto (aclaración F2)

1. El administrador crea una cuenta de correo y contraseña desde Supabase Dashboard → Authentication → Users → Add user → Create new user; no existe registro público en NeuroLab. Confirmar correo únicamente tras comprobar su propiedad.
2. El trigger de F1 crea `app_users` activo y `is_platform_admin = false`. Comprobar el perfil si el usuario no puede ser agregado.
3. En la web: Proyectos → abrir proyecto → Integrantes → Agregar integrante → correo existente → rol → Agregar.
4. Una asignación en `project_members` **no** es un privilegio de Administrador global. Nunca asignar `is_platform_admin` desde el frontend.

## Ajustes de interfaz acordados durante Fase 2

- `SelectField.tsx` centraliza selectores con `ChevronDown` separado del borde derecho.
- Tema claro: lavanda y celeste pastel sobre base clara. Oscuro: base neutral con acentos morados/celestes apagados.
- Tarjeta «Punto de partida» gris neutral en tema oscuro.
- **Documentación:** al cerrar cada fase consolidar instrucciones, cambios, pruebas y decisiones en **un documento Markdown por fase**; no acumular guías Markdown fragmentadas. Las migraciones SQL y los archivos de pruebas siguen separados, pues son artefactos ejecutables.

## 5. Cierre funcional confirmado (7 noviembre 2026)

**Estado actualizado: CERRADA funcionalmente.** El equipo confirmó que la aplicación desplegada en Vercel permite iniciar sesión con un Lector sin concederle edición de nombre ni descripción del proyecto. Ejecutó además `npm run test:fase2:live` con dos cuentas y obtuvo:

```text
OK: aislamiento, permisos de lectura, RPC de membresías y revocación inmediatos.
Proyecto de prueba archivado.
```

Con ello se verifican las restricciones de RLS y RPC de la Fase 2 en Supabase real. Se mantiene la regla de que un Administrador global no hereda permisos técnicos dentro de todos los proyectos. No se requieren nuevas migraciones de Fase 2. Este archivo es el **documento consolidado de la fase**; las migraciones y scripts de prueba permanecen como artefactos ejecutables.
