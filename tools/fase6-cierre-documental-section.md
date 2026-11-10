<!-- FASE6-CIERRE-DOCUMENTAL-20261109 -->

## Acta de validación y cierre documental de Fase 6 — Seguridad, operación y despliegue

**Estado del documento:** validación funcional y de seguridad registrada; **cierre operativo CONDICIONADO**. No equivale a restauración integral comprobada ni a una auditoría de seguridad exhaustiva. **Fecha de consolidación:** 2026-11-09 (America/Lima). Evidencia: resultados de terminal y aceptación funcional proporcionados por el desarrollador; las pruebas externas no fueron reproducidas por quien redacta esta acta.

### A. Referencia del alcance y condición de salida

- **Documento Maestro NeuroLab Enterprise, v1.0, octubre de 2026, §14:** Fase 6 «Endurecimiento y despliegue»: pruebas de seguridad, monitoreo, respaldos y documentación, con **checklist de producción aprobado** como condición de salida.
- **Documento Maestro §15:** pruebas unitarias, integración, contrato, extremo a extremo, seguridad y recuperación, con distintos niveles de evidencia.
- **Documento Maestro §18:** un MVP demostrable parte de la familia Feedforward; CNN, RNN y GAN se incorporan y validan progresivamente. **No declarar CNN/RNN/GAN implementadas en esta fase**.
- **Alcance real del repositorio:** frontend React/TypeScript/Vite, entrenamiento local TensorFlow.js, Supabase Auth, PostgreSQL/RLS, Edge Functions y Storage privado. No afirmar que existe un backend de entrenamiento Python/TensorFlow/Keras o una cola remota de workers si no se ha implementado y verificado.

### B. Registro de evidencias comprobadas

| ID | Control o entrega | Evidencia comunicada por el desarrollador | Resultado / límite |
|---|---|---|---|
| F6-E01 | Administración de usuarios y separación de roles | Módulos funcionales validados en Vercel; prueba de cuentas y Edge Function | **Validado funcionalmente** en flujos ensayados; no es auditoría de todos los endpoints |
| F6-E02 | Autorización por cinco identidades (Admin global, Responsable, Ingeniero, Revisor, Lector) | `node --env-file=.env.test.local scripts/test-fase6-role-matrix-live.mjs` | **87 OK, 1 OMITIDA, 0 errores**; la omisión corresponde a escrituras positivas que el script no ejecuta |
| F6-E03 | Aislamiento Admin global sin membresía | Nuevo proyecto de prueba sin Admin integrante, con registros de architectures, datasets, training_runs, model_versions y model_review_events | **Acceso técnico bloqueado** para Admin sin membresía en los casos verificados; metadatos e integrantes visibles como corresponde |
| F6-E04 | Revisión, reportes y auditoría | Flujo de revisión y aprobación ejercitado; auditoría global y de proyecto comprobadas en la matriz | **Validado en los flujos probados**, sin extender la conclusión a operaciones no ensayadas |
| F6-E05 | Preflight de repositorio y build local | `node scripts/check-fase6-repository.mjs`, `npm run typecheck`, `npm run build` | **4/4 preflight**, TypeScript y Vite compilados en la ejecución reportada |
| F6-E06 | Respaldo lógico + Storage privado | `node scripts/fase6-verify-snapshot.mjs --verify` sobre el snapshot `2026-11-10T03-37-13-448Z_...` | **22 archivos, 7 versiones** cotejados; **2 posibles objetos huérfanos** por investigar, sin eliminación |
| F6-E07 | Recuperación de un modelo e inferencia sin CSV | `node --experimental-strip-types scripts/fase6-restore-drill.mjs --runtime` | **SHA-256 correcto; inferencia TensorFlow.js comprobada** en una carpeta aislada |
| F6-E08 | Publicación web | El desarrollador confirmó que Vercel volvió a estar **en verde** tras la corrección de los componentes de avatar | **Despliegue funcional confirmado por el desarrollador**; registrar ID/commit exactos al formalizar acta |

**Interpretación:** los resultados positivos validan el comportamiento observado, no sustituyen pruebas de recuperación integral, de todas las escrituras autorizadas ni monitoreo automatizado. No incluir secretos, tokens, credenciales, información personal ni contenido de los respaldos en el repositorio o en esta acta.

### C. Riesgos y excepciones operativas pendientes

| ID | Estado | Descripción y consecuencia | Mitigación / criterio para resolver |
|---|---|---|---|
| F6-P01 | **ABIERTO — alto** | Las exportaciones `roles.sql`, `schema.sql` y `data.sql` no constituyen una restauración completa de `auth.users`/credenciales, ni de los servicios administrados de Supabase | Procedimiento validado de restauración de identidades originales/UUID y pruebas de login en entorno aislado, o aceptación formal y documentada del riesgo de recreación manual |
| F6-P02 | **ABIERTO — alto** | No se ha completado una restauración integral de PostgreSQL, Auth, buckets, políticas y Edge Functions | Ensayo aislado reproducible; comprobar registros, identidad/RLS, artefactos privados e inferencia. No afirmar «restauración integral aprobada» antes de hacerlo |
| F6-P03 | **ABIERTO — medio** | Docker Desktop devolvió `containerd ... meta.db: read-only file system`; el ensayo local se interrumpió antes de restaurar el esquema | Diagnosticar espacio/almacenamiento de Docker/WSL sin borrar imágenes, volúmenes ni el respaldo. Reintentar en un entorno local sano o un destino nuevo, nunca en producción |
| F6-P04 | **ABIERTO — medio** | Copias externas y retención periódica no se han automatizado ni aprobado; el RPO real depende del último snapshot recuperable | Aprobar la política propuesta más abajo, definir responsable, ejecutar calendario y verificar restauración periódica |
| F6-P05 | **ABIERTO — medio** | Monitoreo operativo, alertas, RPO/RTO medidos y checklist de incidentes no tienen evidencia suficiente de ejecución | Definir alertas y umbrales, registrar revisión periódica y medir tiempos en una restauración aislada |
| F6-P06 | **EN REVISIÓN — bajo** | Dos posibles objetos huérfanos en Storage según inventario | Investigar con referencias de modelos y registros; **no eliminar automáticamente** |
| F6-P07 | **PENDIENTE DE PRUEBA — medio** | La matriz no ejecuta operaciones positivas con escritura | Conservar evidencia de pruebas funcionales de Responsable/Ingeniero/Revisor y sus eventos de auditoría sobre proyecto de prueba |

Los riesgos anteriores no se consideran mitigados solo por haber creado scripts, realizado un respaldo o restablecido el despliegue.

### D. Política de retención propuesta, pendiente de aprobación

Esta es una **propuesta**, no una política vigente ni una automatización instalada.

| Activo | Propuesta | Control requerido |
|---|---|---|
| Respaldos verificados | 7 copias diarias + 4 semanales + 3 mensuales (según capacidad y clasificación de datos) | Retener solo snapshots íntegros, con checksum y custodia; nunca borrar la última copia recuperable |
| Destinos de los respaldos | Al menos dos ubicaciones independientes, una fuera del equipo principal | Almacenamiento cifrado, control de acceso, prueba de lectura y revocación de acceso |
| Ensayos de recuperación | Como mínimo trimestrales y tras cambios críticos de esquema/Auth/Storage | Registrar fechas, errores, duraciones, versiones y resultados reproducibles |
| Evidencia de roles / revisiones | Conservación durante la vida del proyecto, sujeta a requisitos legales de privacidad | Sin purga automática antes de política legal/técnica aprobada |
| Artefactos de modelos confirmados | Preservar hashes y rutas de versiones; retirada lógica no implica borrado físico | Prohibido alterar artefactos publicados; reconciliar huérfanos con criterio documentado |
| Datos sensibles en logs y respaldo | No copiar secretos a Git; cifrar, restringir y minimizar | Responsable de custodia y revisión de acceso |

**Decisiones por firmar:** custodio del respaldo: `PENDIENTE`; calendario y automatización: `PENDIENTE`; retención aceptada: `PENDIENTE`; tolerancia a pérdida de datos (RPO objetivo): `PENDIENTE`; tiempo máximo de recuperación (RTO objetivo): `PENDIENTE`. No publicar números de RPO/RTO como cumplidos sin medición.

### E. Checklist de producción y acta de decisión

| Criterio de aceptación | Estado documental |
|---|---|
| Autenticación, privilegios y bloqueo de roles indebidos probados | **CON EVIDENCIA** — F6-E01 a E04 |
| Build local y despliegue de Vercel funcional | **CON EVIDENCIA** — F6-E05 y E08 |
| Respaldo lógico y Storage privado con integridad verificada | **CON EVIDENCIA** — F6-E06 |
| Inferencia de un modelo recuperado sin CSV | **CON EVIDENCIA** — F6-E07 |
| Restauración integral aislada de PostgreSQL/Auth/Storage | **PENDIENTE** — F6-P01 a P03 |
| Monitoreo operativo y alertas probadas | **PENDIENTE** — F6-P05 |
| Política de retención, custodia y RPO/RTO aprobados | **PENDIENTE** — F6-P04 |
| Checklist final de producción aprobado | **PENDIENTE DE CONFORMIDAD** |

**Decisión recomendada:** aceptar los incrementos funcionales y la seguridad comprobada de Fase 6 y mantener **pendiente el cierre operativo formal**. No bloquear el trabajo futuro de CNN/RNN/GAN por el fallo del Docker local, pero no marcar la condición de salida del §14 como satisfecha hasta ejecutar los controles pendientes o aprobar sus excepciones explícitamente.

**Conformidad:** responsable técnico: `PENDIENTE`; fecha de aprobación: `PENDIENTE`; commit final publicado: `PENDIENTE`; referencia del despliegue verde: `PENDIENTE`; excepciones aceptadas (ID + justificación + responsable + fecha de revisión): `PENDIENTE`.

### F. Próxima revisión operativa

1. Conservar el snapshot verificado **fuera del repositorio y cifrado**; no borrar los dos candidatos a huérfanos.
2. Revisar Docker Desktop/WSL de forma no destructiva y repetir ensayo aislado cuando el motor pueda escribir; no ejecutar scripts de restauración contra producción.
3. Diseñar y probar recuperación compatible de identidades Auth y UUID, políticas de acceso, Edge Functions y objetos privados de Storage.
4. Aprobar retención, custodia, RPO/RTO y monitoreo; registrar el primer ciclo y el resultado del ensayo.
5. Adjuntar en esta misma sección la evidencia posterior y solicitar conformidad de producción; luego iniciar CNN → RNN → GAN como fases progresivas.

<!-- /FASE6-CIERRE-DOCUMENTAL-20261109 -->
