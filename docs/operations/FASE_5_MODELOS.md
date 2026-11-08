# NeuroLab Enterprise — Fase 5: modelos y versiones inmutables

> **Estado:** **CERRADA** — pruebas de Supabase y Vercel confirmadas por el equipo el 8 de noviembre de 2026.
> **Base:** diseño aprobado de Fase 0, Fase 3 (entrenamiento real) y Fase 4 (evaluación y predicción).  
> **Principio:** ninguna fila de CSV original se carga a Supabase. No se introduce entrenamiento remoto.

## 1. Alcance de este incremento

- Nueva pantalla `Proyectos → Proyecto → Modelos`, visible a integrantes con membresía válida.
- Tras un entrenamiento completado y **confirmado** en Supabase, el Ingeniero puede **guardar una versión** del modelo entrenado, con sus pesos reales y el manifiesto de preparación.
- La serialización de TensorFlow.js utiliza `model.save` y un IOHandler. El Worker devuelve `model.json` y `weights.bin` mediante mensajes del navegador. En ausencia de Worker compatible, funciona la misma exportación desde el hilo principal.
- Publicación en dos etapas: reservar identificador y rutas privadas, subir ambos archivos con `upsert: false` y confirmar la versión mediante una RPC atómica. El registro de versión es inmutable.
- Lectura de versiones confirmadas desde un bucket **privado** con RLS y descarga autenticada; el cliente verifica SHA-256 de los archivos descargados antes de reconstruir el modelo.
- Un modelo restaurado predice sin CSV utilizando la misma `preprocessing_manifest` que quedó vinculada a la ejecución original.
- Los modelos se agrupan por nombre dentro de un proyecto. Una nueva publicación con el mismo nombre genera un número de versión nuevo; un intento fallido puede dejar saltos de numeración.

## 2. Migración 005 y reglas de seguridad

En **Supabase → SQL Editor**, ejecutar una única vez `supabase/migrations/202611080005_private_models.sql`, **después** de 004.

Tablas incorporadas:

- `models`: nombre e identidad lógica del modelo por proyecto.
- `model_uploads`: reservas técnicas con expiración (2 horas), invisibles para clientes. Una reserva **no es** una versión publicada.
- `model_versions`: versiones finales, **solo INSERT mediante RPC protegida** y SELECT con membresía. La aplicación no recibe UPDATE ni DELETE.

Bucket: `model-artifacts`, **private**, límite de 10 MiB por archivo, contenido JSON o binario; estructura:

```text
<project_uuid>/<model_uuid>/<version_uuid>/model.json
<project_uuid>/<model_uuid>/<version_uuid>/weights.bin
```

Las políticas en `storage.objects` autorizan `INSERT` únicamente en rutas reservadas por el Ingeniero autor de un entrenamiento completado. Solo se permite `SELECT` de archivos pertenecientes a versiones finales y a integrantes vigentes del proyecto. No se conceden políticas de UPDATE o DELETE en el bucket.

Las RPC `reserve_model_upload` y `publish_model_version` revisan `auth.uid()`, estado del usuario, membresía como Ingeniero, proyecto activo, autoría y estado completo de la ejecución. La segunda RPC exige que ambos archivos existan antes del INSERT final. El administrador global **no** hereda acceso técnico sin pertenencia.

### Limitaciones y garantía de confianza

- Una reserva con subida fallida puede dejar objetos privados **huérfanos**. Dado que los roles normales no tienen DELETE, su eventual limpieza debe documentarse como procedimiento administrativo separado y privilegiado. No se promete una transacción distribuida entre Storage y PostgreSQL.
- El SHA-256 se calcula por el navegador: protege contra alteraciones accidentales al descargar, **no demuestra la autenticidad del entrenamiento frente a un cliente malicioso**.
- Ningún mecanismo de la aplicación puede impedir que el propietario de Supabase o una credencial extraordinaria de servidor modifique archivos directamente. La inmutabilidad se garantiza **por permisos de aplicación**.
- Los artefactos pertenecen a la misma versión lógica de TensorFlow.js. La interoperabilidad entre futuras versiones mayores debe probarse, no suponerse.
- No está implementado todavía el ciclo de aprobación/retiro de versiones; corresponde a Fase 6.

## 3. Procedimiento para aplicar y validar

1. Extraer la actualización sobre el repositorio actual, conservando `.env.local`, `.env.test.local` y `package-lock.json`.
2. Antes de modificar Supabase, ejecutar en Git Bash:

```bash
npm install
npm run test:fase5
npm run test:fase5:runtime
npm run typecheck
npm run build
```

3. Si todo pasa, ejecutar **solo** la migración `202611080005_private_models.sql` en SQL Editor.
4. Validar permisos con las dos cuentas de prueba ya existentes:

```bash
npm run test:fase5:live
```

5. Iniciar sesión como **Ingeniero** de un proyecto activo. Importar un CSV, entrenar y esperar que indique «Estado final confirmado» y evaluación confirmada.
6. Escribir el nombre del modelo y pulsar **Guardar versión inmutable**. Verificar el mensaje de confirmación (si falla, no considerar publicada la versión).
7. En `Proyectos → Proyecto → Modelos`, cargar esa versión y repetir una predicción con los mismos valores de entrada. Comparar con la salida original (se admiten pequeñas diferencias numéricas entre backends).
8. **Cerrar sesión, recargar la página e iniciar de nuevo**. Cargar la versión y predecir **sin reimportar el CSV**.
9. Guardar otra versión con el mismo nombre y confirmar la numeración consecutiva de reservas exitosas.
10. Probar con una cuenta Lector asignada: puede ver y cargar versiones autorizadas, **no** publicar, actualizar ni eliminar. Quitar su membresía y verificar que deja de verlas o descargarlas.
11. Publicar únicamente después de que las pruebas y el build terminen sin errores:

```bash
git add .
git commit -m "feat(fase5): registro privado y versiones inmutables"
git push origin main
```

**No** se requieren nuevas variables de entorno de Vercel ni claves administrativas en frontend.

## 4. Pruebas y criterios de aceptación

**Automatizadas:** prueba pura del formato model.json, inspección estructural de las restricciones de Storage y contratos Worker, prueba runtime TF.js de serializar → cargar → predecir, pruebas RLS con dos cuentas usando clave publicable, `typecheck` y build Vite.

**Funcionales:** se confirma la versión en Supabase antes del éxito visual; no se sube CSV; se puede descargar un modelo únicamente con membresía; la predicción funciona después de cerrar sesión y volver a entrar; las versiones son inmutables y no se sobrescriben; los recursos del modelo se liberan al salir de la pantalla.

**Validación confirmada:** el equipo informó de la ejecución correcta de estos puntos en su Supabase y despliegue real de Vercel; por tanto, la Fase 5 se declara cerrada.

## 5. Referencia

- Documento Maestro aprobado, M08 «Registro de modelos» y requisitos de seguridad (con adaptaciones Fase 0).
- [Supabase Storage privado y RLS](https://supabase.com/docs/guides/storage/security/access-control).
- [TensorFlow.js: guardar y cargar modelos](https://www.tensorflow.org/js/guide/save_load).

---

## 6. Cierre definitivo — 8 de noviembre de 2026

**Estado: CERRADA.** El usuario confirmó pruebas locales, publicación en GitHub y despliegue operativo de Vercel con guardado de un modelo, recuperación desde Supabase Storage privado e inferencia tras volver a iniciar sesión. No es una verificación independiente de acceso al proyecto privado: se registra la evidencia reportada por el equipo.

Se mantiene pendiente para Fase 6 el flujo de revisión/aprobación administrativa. Las versiones de Fase 5 ya publicadas permanecen inmutables para los roles normales de la aplicación.
