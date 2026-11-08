# Pruebas RLS de `app_users` — Fase 1

Estas verificaciones requieren un proyecto Supabase real y al menos dos cuentas creadas en **Authentication > Users**. No se afirma que estén ejecutadas.

1. Iniciar sesión como A (activo): `select` propio permitido.
2. Desde la sesión de A, intentar `select` sobre el UUID de B: cero filas.
3. Desde A, intentar actualizar `is_platform_admin = true`: denegado por privilegios de columna y ausencia de política UPDATE.
4. Desde A, intentar actualizar `status`: denegado.
5. Como A, intentar listar perfiles: únicamente el perfil propio activo.
6. Desactivar A desde SQL Editor (rol confiable), conservar su JWT: siguiente lectura del perfil devuelve cero filas; UI bloqueada.
7. Como usuario anónimo: lectura de `app_users` denegada.
8. Habilitar A nuevamente desde SQL Editor y verificar reingreso.
9. Verificar que el Admin global tampoco pueda consultar perfiles ajenos desde F1; la administración autorizada se implementa en F6.

Se recomienda ejecutar las pruebas desde un cliente con **clave pública** y JWT de cada usuario; no utilizar `service_role`, ya que omitirá RLS y daría falsos positivos.
