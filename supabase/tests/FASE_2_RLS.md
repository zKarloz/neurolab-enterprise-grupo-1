# Pruebas de seguridad RLS — Fase 2

Las pruebas **solo se consideran aprobadas cuando se ejecutan contra Supabase real**.

## Prueba automatizada con dos identidades

1. En Supabase Dashboard > Authentication > Users crea una cuenta de prueba normal adicional, sin privilegio global ni rol de Responsable; confirma su email por procedimiento administrativo.
2. Crea `.env.test.local` a partir del siguiente ejemplo (archivo ignorado por Git):

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
TEST_F2_ADMIN_EMAIL=admin@ejemplo.local
TEST_F2_ADMIN_PASSWORD=contraseña_local
TEST_F2_READER_EMAIL=lector@ejemplo.local
TEST_F2_READER_PASSWORD=contraseña_local
```

3. Ejecuta `npm run test:fase2:live`. Utiliza la clave **pública**, jamás la secreta ni `service_role`.
4. El script crea un proyecto de prueba, demuestra que el lector no lo ve, rechaza escrituras cruzadas, incorpora al lector, comprueba permisos y revocación, y **archiva** el proyecto al terminar. No borra filas históricas. Evita repetir el script si no necesitas otra ejecución.
5. El script comprueba operaciones concretas. Completa la matriz manual y registra fecha, cuenta (sin contraseña) y resultado.

## Matriz adicional (validación manual)

| Escenario | Resultado esperado |
|---|---|
| Usuario sin sesión hace `GET /rest/v1/projects` con clave pública | Sin filas o acceso rechazado. |
| Administrador global lista metadatos de proyectos ajenos | Permitido; no recibe permisos técnicos automáticos. |
| Lector intenta `update_project`, `archive_project`, `add_project_member` | Denegado. |
| Un Responsable edita/archiva su proyecto | Permitido. |
| Responsable intenta modificar su propia membresía | Denegado. |
| Cambio de rol del propietario | Denegado; transferencia de propietario fuera del alcance de F2. |
| Se intenta quitar al último Responsable activo | Denegado. |
| Usuario con `app_users.status = inactive` conserva sesión y consulta proyectos | Sin filas o acceso rechazado. React bloquea área privada tras refrescar. |
| Se intenta INSERT/UPDATE/DELETE directo a tablas | Rechazado por GRANT y ausencia de políticas. |
| Se añade un integrante con correo inexistente o inactivo | Denegado con error controlado. |
| Se archiva un proyecto y luego se intenta modificar | Rechazado; permanece consultable. |
| Se comprueba la creación/actualización de `audit_events` | Registro correspondiente presente y sin permiso de escritura directa. |

**Advertencia:** no cambies un usuario real a `inactive` sin comprobar antes que otro Administrador permanece activo. No utilices credenciales productivas de terceros para probar.
