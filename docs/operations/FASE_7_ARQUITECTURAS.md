# NeuroLab Enterprise — Ampliación de arquitecturas (CNN, RNN y GAN)

## Incremento CNN-1 · Datos y visualización arquitectónica

**Estado:** preparado para validación local y en Vercel. No supone entrenamiento, evaluación ni persistencia de CNN.

### Alcance entregado

- Ruta protegida de proyecto: `/proyectos/:projectId/cnn`.
- Navegación mediante pestañas reutilizables: Datos, Arquitectura, Entrenar, Evaluar y Predecir.
- Datos: fuente pública IDX gzip de **MNIST original** (espejo CVDF), 60 000 ejemplos de entrenamiento y 10 000 de prueba. El navegador solo lee un **prefijo de hasta 240 registros reales** del set de entrenamiento. La distribución es **de la muestra**, no una distribución global ficticia. No se suben datos a Supabase.
- Arquitectura: entre 1 y 3 bloques Conv2D, filtros 8/16/32/64, kernel 3×3 o 5×5, padding same/valid, MaxPool 2×2 opcional y Dense 32/64/128. Shapes y parámetros calculados dinámicamente, con validaciones de compatibilidad y límite de 2 millones de parámetros para futuros entrenamientos.
- El diagrama representa flujo de tensores, no neuronas individuales; un panel muestra datos técnicos de la capa seleccionada.
- Restricción visual de acceso: sólo miembros del proyecto entran en CNN; sólo el Ingeniero en proyecto activo edita la configuración local. Esto no sustituye RLS ni habilita operaciones de escritura.
- Pestañas de Entrenar/Evaluar/Predecir señaladas expresamente como futuras, sin cifras inventadas.

### Fuente pública

- https://github.com/cvdfoundation/mnist (archivos IDX originales y documentación).
- https://www.tensorflow.org/datasets/catalog/mnist (estructura `28×28×1` y particiones oficiales).

### Limitaciones conocidas y validación

- El navegador debe admitir `DecompressionStream('gzip')` y permitir las solicitudes CORS al almacenamiento público de Google. Si hay problemas de red, la UI muestra error y permite recargar.
- La descarga inicial depende de conectividad a Google Cloud, no del servidor de NeuroLab. Para CNN-2 se evaluará crear una copia controlada/versionada del dataset completo y separar definitivamente las particiones.
- No hay nueva tabla, migración, Edge Function o dependencia NPM en CNN-1.
- Las pruebas de arquitectura y decodificación IDX se ejecutan con `node --experimental-strip-types --test tests/cnn1.*.test.mjs`; el build integral y la carga remota real se validan en la estación de desarrollo.

### Incrementos siguientes

- **CNN-2:** entrenamiento TensorFlow.js, callbacks reales, control de memoria, cancelación y backend.
- **CNN-3:** evaluación, matriz de confusión, subida de imagen y predicción reproducible.
- **CNN-4:** persistencia en Supabase, registro e historial unificados y filtro por familias.
- **CNN-5:** pruebas por rol, documentación y cierre.

### Criterios de aceptación CNN-1

- [ ] `npm run typecheck` y `npm run build` terminan correctamente.
- [ ] Un integrante accede desde la tarjeta CNN del proyecto.
- [ ] Admin global sin membresía no obtiene acceso técnico al módulo.
- [ ] Datos carga imágenes auténticas de MNIST y muestra un histograma de la muestra.
- [ ] El editor visual recalcula shapes y parámetros tras cambios, sin mostrar entrenamiento ficticio.
- [ ] Esquema y pestañas son accesibles en escritorio/móvil y con ambos temas.
- [ ] Vercel construye el commit incluyendo **todos** los archivos nuevos.

## Incremento CNN-2 · Entrenamiento MNIST real en navegador

**Estado:** implementación preparada para validación funcional, compilación y despliegue. No se considera completada hasta probar con un Ingeniero en un proyecto activo.

### Funcionalidades

- Pestaña **Entrenar** conectada a un modelo TensorFlow.js construido desde la configuración visual CNN-1. Los parámetros y dimensiones se contrastan con el diagrama antes de entrenar.
- Subconjuntos limitados de MNIST original: 500, 1 000 o 2 000 imágenes del entrenamiento oficial, descargadas mediante IDX/gzip desde CVDF. La división local es **estratificada 80 % entrenamiento / 20 % validación**, reproducible con semilla 42 y sin intersección de índices. El conjunto oficial de prueba de 10 000 imágenes queda reservado para CNN-3.
- Normalización de píxeles [0,1]; etiquetas multiclase one-hot; optimizador Adam, pérdida categorical crossentropy, exactitud y exactitud de validación reales.
- Hiperparámetros seguros: 2/5/10 épocas, batch 16/32/64 y learning rate 0.001/0.0005. Predeterminados: 1 000 ejemplos, 2 épocas, batch 32 y learning rate 0.001.
- Worker Vite dedicado (backend CPU y no bloqueante). Solo si el Worker falla *antes de iniciar*, se permite fallback al hilo principal, usando el backend disponible. Los callbacks ceden al event loop y admiten cancelación. Si el Worker se interrumpe durante la sesión, no se duplica el entrenamiento.
- Progreso por lotes; curvas por época de loss/accuracy, entrenamiento/validación; backend usado y tiempo transcurrido. No se utilizan cifras ni resultados simulados.
- La configuración se bloquea mientras dura una sesión; al salir del módulo se cancela y libera el Worker. El modelo y tensores de TensorFlow.js se liberan al terminar, cancelar o fallar. Las métricas permanecen en memoria de React hasta salir del módulo.
- Solo el rol **Ingeniero** miembro de un proyecto **activo** puede iniciar el entrenamiento; la UI no escribe en Supabase. Mantiene las verificaciones de lectura y membresía de CNN-1.

### Limitaciones declaradas

- **No hay persistencia**, registro/historial ni predicción con el modelo entrenado en CNN-2. CNN-3 añadirá evaluación de test y predicción; CNN-4, guardado e historial unificado.
- Worker CPU puede tardar más que un backend gráfico. El navegador necesita `DecompressionStream('gzip')`, acceso CORS al host MNIST y memoria suficiente para los tensores.
- Cada ejecución vuelve a obtener la muestra; la vista previa de CNN-1 no se usa como entrenamiento. La muestra está limitada para proteger equipos modestos.
- La descarga y entrenamiento no deben interpretarse como rendimiento sobre el test oficial. Los resultados de validación corresponden al 20 % de la muestra limitada.
- No se necesitan migraciones SQL ni dependencias nuevas: `@tensorflow/tfjs`, `recharts` y Lucide ya forman parte del proyecto.

### Criterios de aceptación CNN-2

- [ ] `node --experimental-strip-types --test tests/cnn2.training-data.test.mjs` correcto.
- [ ] `npm run typecheck && npm run build` sin errores.
- [ ] Ingeniero: ejecutar 500 muestras, 2 épocas, verificar curvas reales y backend mostrado.
- [ ] Cancelar durante descarga y entrenando; comprobar estado cancelado, sin error y sin bloqueos.
- [ ] Cambiar de pestaña mientras entrena: la sesión continúa y el progreso se mantiene al regresar.
- [ ] Roles Responsable/Revisor/Lector no pueden iniciar; Administrador sin membresía no entra.
- [ ] Probar temas claro/oscuro, pantalla móvil y ausencia de métricas inventadas.
- [ ] Confirmar el nuevo despliegue en Vercel después de incluir todos los archivos con `--git-check`.

<!-- CNN2A_LOCAL_CSV_BEGIN -->
### CNN-2A — Importación local de CSV e imágenes de tamaño variable

**Motivo:** el enlace remoto a Google Storage bloqueaba la lectura de MNIST por CORS. Además, CNN-2 suponía que todo dataset era MNIST 28×28. Se elimina esa dependencia de las pantallas Datos/Entrenar.

- **Entrada:** archivo CSV local con columna `label` al principio o final y `pixel_0`…`pixel_63` (8×8), o `pixel0`…`pixel783` (28×28). MNIST CSV también se acepta sin encabezados si cada fila comienza con su etiqueta. El CSV debe contener imágenes en gris, mínimo 100 filas, entre 2 y 10 clases; lectura limitada a 2 000 registros (máximo 200 MB de archivo) para proteger el navegador.
- **Preprocesamiento:** se detecta 8×8 con escala 0–16 y se convierte a 0–255; en otros casos se utiliza escala 0–255. El entrenamiento normaliza a 0–1. Se valida el número de píxeles por fila, clases y rangos.
- **Arquitectura:** entrada y clases inferidas del CSV. El diagrama y el motor TensorFlow.js comparten shapes y validación; no se permite entrenar capas incompatibles con la resolución.
- **Entrenamiento:** muestras locales 100–2 000, validación estratificada reproducible, métricas reales y cancelación. Worker con alternativa en hilo principal. Los archivos no se envían a Supabase y el modelo permanece temporal hasta CNN-4.
- **Fuera de alcance:** fotografías sueltas JPG/PNG, datasets RGB y carpetas/ZIP; se incorporarán en otra versión. El CSV completo no persiste ni se copia a Vercel.

**Validación:** pruebas automatizadas del importador, carga del archivo `digits-8x8.csv` (1 797 filas) y muestra MNIST 28×28 sintética. La compilación integral y el entrenamiento real en el navegador quedan para la validación del desarrollador.
<!-- CNN2A_LOCAL_CSV_END -->

<!-- CNN3_EVALUACION_PREDICCION_BEGIN -->
### CNN-3 — Evaluación multiclase y predicción de imágenes locales

**Alcance:** imágenes monocromas 8×8 (Digits) y 28×28 (MNIST) representadas en CSV local, entre 2 y 10 clases. La arquitectura visual y el entrenamiento siguen siendo CNN-1/CNN-2A. No se modifica Supabase, RLS ni Vercel.

- **Tres particiones reproducibles:** aproximadamente 70 % entrenamiento, 15 % validación y 15 % test por clase (semilla 42). Los índices de test no entran en `model.fit` ni en `validationData`. En clases con solo dos imágenes se garantiza muestra de train y test; si no existe subconjunto de validación suficiente, la operación se rechaza.
- **Evaluación local:** al terminar el entrenamiento se calculan predicciones softmax sobre test. Se muestran loss (entropía cruzada), accuracy, precisión/recall/F1 macro, tabla por clase, matriz de confusión (filas reales, columnas predichas) y ejemplos de errores/aciertos. No son valores simulados. Esta evaluación se hace sobre datos reservados **del mismo CSV**, no es una certificación de generalización externa.
- **Inferencia en memoria:** después de entrenar, el modelo continúa disponible en el Worker (o en el fallback principal). Se pueden consultar ejemplos de test o subir PNG/JPG/WebP de hasta 5 MiB. La imagen se centra y redimensiona a la forma del CSV, se convierte a grises y opcionalmente se invierte (por defecto para dígito oscuro sobre fondo claro). Las probabilidades se calculan en el navegador; la imagen no se sube a Supabase.
- **Vida útil:** el modelo se libera al abandonar el módulo, cargar otro CSV, modificar la arquitectura, reentrenar o cancelar. El historial y almacenamiento de versiones se implementarán en CNN-4.
- **Restricciones:** clasificador monocromo para dígitos o imágenes 8×8/28×28; imágenes RGB, carpetas ZIP, modelos binarios de alta resolución y datasets independientes quedan para fases posteriores. Las predicciones sobre fotos fuera de la distribución entrenada pueden ser poco fiables.
- **Control de permisos:** solo Ingeniero de proyecto activo puede iniciar el entrenamiento; los módulos no eluden la membresía de proyecto. No se ejecutan escrituras en base de datos.

**Validaciones locales:** pruebas de partición sin fuga, métricas multiclase, formato de archivos, Worker conservado al completar, rechazo de fallos parciales e instalación segura LF/CRLF. La ejecución completa del modelo y el `npm run build` deberán verificarse en el equipo del desarrollador.
<!-- CNN3_EVALUACION_PREDICCION_END -->

<!-- CNN4A_SUPABASE_BEGIN -->
## CNN-4A — Contratos de Supabase para CNN multiclase (10 de noviembre de 2026)

**Estado (actualización del 10/11):** desarrollador confirmó migración 012 aplicada, 7 tablas técnicas con RLS activo y EXECUTE para `authenticated` / denegación para `anon` en las tres nuevas RPC. Faltan pruebas cruzadas de autorización con identidades reales y regresión Feedforward. La implementación React llega con CNN-4B.

### Decisiones

- Migración nueva: `supabase/migrations/202611100012_cnn_multiclass.sql`, ejecutar **una sola vez y en orden**, tras `202611090011_private_user_avatars.sql`. No repetir migraciones antiguas ni bootstrap de administrador.
- `architectures.family` acepta `feedforward` y `cnn`. `datasets`, `training_runs` y `run_evaluations` admiten `multiclass` además de `binary`/`regression`. `datasets.byte_size` admite hasta **200 000 000 bytes** de archivo fuente para que coincida con CNN-2A; la RPC antigua `create_training_run` conserva explícitamente su límite de 10 MiB para Feedforward.
- Nuevas RPC `create_cnn_training_run`, `record_cnn_training_epoch` y `record_cnn_test_evaluation`. No reemplazan `create_training_run`, `record_training_epoch`, `record_test_evaluation`, `set_training_runtime`, `finish_training_run`, ni la reserva/publicación del registro de modelos de Fase 5.
- Las nuevas RPC son `SECURITY DEFINER` con `search_path=''`, permisos EXECUTE solo a `authenticated`, verificación de rol Ingeniero y proyecto activo mediante `private.can_train_in_project`, comprobación de autoría de la ejecución y secuencia de épocas. Las tablas siguen siendo solo SELECT a través de RLS para los miembros autorizados; el Administrador global sin membresía no hereda privilegios técnicos.
- La matriz de confusión almacenada es agregada, de NxN con **filas reales y columnas predichas**; suma `sampleCount` y su diagonal concuerda con `accuracy`. Nunca se almacenan ejemplos de test, píxeles, vectores de probabilidad individuales ni el CSV.
- Se reutilizan `set_training_runtime` y `finish_training_run`. Flujo previsto: crear ejecución → confirmar backend → registrar épocas en secuencia → registrar evaluación de test → confirmar estado final `completed` → publicar un modelo privado opcionalmente con las RPC de Fase 5.

### Contrato de entrada esperado por CNN-4B

- `p_dataset_name`: nombre terminado en `.csv`, 1–180 caracteres; `p_row_count`: **cantidad de filas efectivamente cargadas** (100–2 000), NO el total desconocido de un archivo truncado; `p_byte_size`: tamaño del **archivo completo** (1–200 000 000 bytes); `p_file_hash`: SHA-256 del **archivo completo**. No etiquetar el hash de una muestra como hash del archivo. CNN-4B deberá diseñar una lectura/hash de archivo compatible con memoria limitada antes de activar escrituras.
- `p_schema_json`: objeto con `kind: 'cnn_image_csv_v1'`, `width`, `height`, `channels: 1`, `classNames`, `sampleCount` (filas cargadas), `truncated` y `originalScale` (16 o 255). Solo imágenes 8x8 o 28x28 en gris y entre 2 y 10 clases.
- `p_preprocessing_json`: objeto con `family: 'cnn'`, `kind: 'cnn_image_csv_v1'`, `width`, `height`, `channels: 1`, `classNames`, `normalization: 'divide_by_255'`, `seed: 42`, `sampleCount` (filas usadas por el entrenamiento) y `split: { strategy: 'stratified_70_15_15_v1', trainCount, validationCount, testCount }`. Los conteos suman `sampleCount`. No persistir índices de filas ni imágenes.
- `p_architecture_config`: `{ family: 'cnn', blocks, denseUnits, input: { width, height, channels: 1, classes }, outputActivation: 'softmax' }`. Cada bloque acepta únicamente `id`, `filters`, `kernel`, `padding`, `pool`. Se validan shapes y límite de 2 millones de parámetros en la RPC, además de la validación de TF.js en el cliente.
- `p_hyperparameters_json`: `{ optimizer: 'adam', epochs, batchSize, learningRate, samples, seed: 42 }` con los valores admitidos en CNN-3: épocas 2/5/10, batch 16/32/64, learning rate 0.001/0.0005, muestras 100–2 000.
- Evaluación para `record_cnn_test_evaluation`: `{ problemType: 'multiclass', classNames, sampleCount, loss, accuracy, macroPrecision, macroRecall, macroF1, matrix }`. Enviar **solo** este resumen de `CnnEvaluation`, sin la propiedad `examples`, y antes de `finish_training_run(completed)`. Para el historial, las métricas por clase pueden reconstruirse desde la matriz agregada.

**Límite de confianza:** el servidor comprueba la estructura, permisos, límites, secuencia y consistencia de los agregados, pero un navegador manipulado podría enviar resultados falsos. La semilla y el hash permiten intentar reproducir con el CSV original, no certifican criptográficamente la ejecución.

### Validación y despliegue previstos

Desde la raíz del proyecto en Git Bash:

```bash
node --test tests/cnn4a.database-contract.test.mjs
node --experimental-strip-types --test tests/cnn3.evaluation.test.mjs tests/cnn3.session.test.mjs
npm run typecheck
npm run build
```

Antes de aplicar a **producción**, validar la migración en una instancia Supabase aislada con la misma cadena de migraciones y ejecutar `supabase/tests/FASE_7_CNN4A_DIAGNOSTICO.sql` desde SQL Editor. Confirmar RLS y pruebas positivas/negativas con identidades reales separadas: Ingeniero de proyecto activo, Ingeniero ajeno, Responsable, Revisor, Lector y Admin global sin membresía. Las pruebas estructurales no sustituyen la ejecución SQL ni las pruebas en vivo.

**Criterio para cerrar CNN-4A:** migración 012 aplicada sin errores en el entorno objetivo, diagnóstico de restricciones/grants/RLS correcto y comprobación de que Feedforward sigue entrenando, registrando épocas, evaluando y publicando versiones. El código React no comienza a persistir CNN hasta CNN-4B. Si no se dispone de instancia aislada, mantener la migración como preparada, no aplicada.

**Entregas posteriores:** CNN-4B integra la persistencia real durante la sesión (incluido hash del archivo completo y gestión de fallo de red); CNN-4C serializa y restaura pesos CNN mediante Storage privado; CNN-4D añade familia y evaluación multiclase al historial y reportes; CNN-5 cierra aceptación y documentación por roles. RNN y GAN requieren contratos y validaciones posteriores, no están habilitadas por la migración 012.
<!-- CNN4A_SUPABASE_END -->

<!-- CNN4B_PERSISTENCE_BEGIN -->
## CNN-4B — Persistencia real de ejecución CNN (10 noviembre 2026)

**Estado:** implementación local preparada para pruebas. **No se declara validada en Vercel ni con cuentas Supabase reales hasta completar las pruebas indicadas.** Requiere migración 012 aplicada y permisos RPC verificados; no se añade SQL nuevo, Storage ni dependencias.

- Antes de entrenar se lee el **SHA-256 del CSV completo** mediante streaming, mientras se retiene solo un prefijo de hasta 2 000 ejemplos. La huella identifica el archivo original, no el subconjunto. La operación se puede cancelar. El CSV, las etiquetas y los píxeles nunca se envían a Supabase.
- `create_cnn_training_run` guarda la arquitectura, metadatos agregados, partición reproducible 70/15/15 y configuración Adam; genera `training_runs.id`. Sin confirmación de creación, **no comienza** TensorFlow.js.
- `set_training_runtime` confirma backend/contexto/versión TF.js antes de registrar las épocas. `record_cnn_training_epoch` guarda secuencialmente cuatro métricas por época; el contador **épocas confirmadas** solo avanza tras la respuesta positiva.
- `record_cnn_test_evaluation` guarda **únicamente** la matriz de confusión y métricas macro agregadas. El `examples` que muestra la UI permanece en memoria. `finish_training_run` se ejecuta **después de la evaluación confirmada**, para completar/cancelar/fallar. Si una RPC falla, no se envían las siguientes y se solicita cancelación local: se informa **guardado parcial**, nunca éxito ficticio.
- Al cambiar de proyecto o abandonar la ruta, se intenta `interrupted` si el run aún no tiene estado terminal, pero la pestaña cerrada puede impedir esa llamada. No se reintenta automáticamente una creación o una época después de un error de red para evitar duplicados.
- Los pesos siguen en memoria hasta CNN-4C. CNN-4D integrará la vista multiclase en Historial y Reportes. Hasta ese incremento, el historial Feedforward filtra `binary`/`regression`, para no interpretar métricas CNN como regresión. El ID de ejecución CNN aparece en la pestaña Entrenar.

### Instalación y pruebas en Git Bash

1. Aplicar el parche **sobre el proyecto que ya tiene CNN-4A**, sin volver a ejecutar la migración 012. No sobrescribir `.env.local`, `.env.test.local` o `package-lock.json`.
2. Ejecutar `node --experimental-strip-types --test tests/cnn4b.persistence.test.mjs`, las pruebas CNN-3 y CNN-4A, `npm run typecheck` y `npm run build`.
3. Como **Ingeniero de un proyecto activo**, subir el CSV `digits-8x8.csv`, seleccionar 100–500 ejemplos, 2 épocas, iniciar. Comprobar `runId`, backend, dos épocas confirmadas, matriz de test agregada y estado `completed` confirmado. Recargar: los metadatos deben aparecer en Supabase bajo RLS; aún **no** hay recuperación de pesos ni detalle CNN en el historial Feedforward.
4. Ejecutar `supabase/tests/FASE_7_CNN4B_VERIFICACION.sql` desde SQL Editor tras un entrenamiento real; revisar 4 métricas por época y ausencia de `examples`/`pixels`. Probar cancelar antes de entrenar (durante SHA-256), cancelar ya entrenando, salir de la ruta, perder conexión y volver a entrar. Nunca debe mostrarse **estado confirmado** con una RPC fallida.
5. Probar Responsable, Revisor, Lector y Admin global sin membresía: sin autorización para iniciar. Un Ingeniero ajeno tampoco puede crear/leer ejecuciones de otro proyecto. Estas pruebas deben incluir consulta a base de datos con dos identidades reales; `authenticated = true` en GRANT no implica acceso efectivo sin pasar `private.can_train_in_project`.
6. Verificar funcionamiento Feedforward Dense (entrenar y guardar una ejecución), temas claro/oscuro, pestañas y móvil. Solo después confirmar los archivos de esta entrega mediante Git y desplegar Vercel.

**Criterio de cierre:** compilación correcta, tests locales y de permisos reales, entrenamiento CNN real con confirmaciones, evaluación registrada, cancelación y manejo de fallos correctos, regresión Feedforward inexistente. No declarar CNN-4B finalizada antes de ello.
<!-- CNN4B_PERSISTENCE_END -->

<!-- CNN4C_VERSIONES_PRIVADAS_BEGIN -->
## CNN-4C — Versiones CNN privadas e inferencia tras recargar (incremento preparado)

**Estado:** código y pruebas preparados sobre CNN-4B + migraciones 012/013; pendiente de `typecheck`, `build`, pruebas runtime y verificación con dos cuentas y Supabase real. No declarar fase cerrada solo porque el parche esté instalado.

### Alcance técnico

- Al terminar CNN-4B, solo un Ingeniero de proyecto activo y con **run, épocas, evaluación y estado final confirmados** puede seleccionar «Guardar versión inmutable». El resto de roles solo consultan según RLS.
- Se serializan topología y pesos Conv2D mediante el IOHandler TensorFlow.js ya utilizado para Fase 5; la misma serialización funciona con Worker o fallback de hilo principal. La respuesta Worker transfiere `weights.bin` por `ArrayBuffer`, no imágenes ni CSV.
- Se reutilizan las RPC F5 `reserve_model_upload` y `publish_model_version`, el bucket **privado** `model-artifacts`, hashes SHA-256, rutas únicas y `upsert: false`. No hay migración nueva. Una subida incompleta puede dejar objetos privados huérfanos y una reserva sin publicar; no se borran automáticamente.
- El manifiesto CNN se toma de `training_runs.preprocessing_json` **ya confirmado** por la RPC existente: familia, forma 8×8/28×28, etiquetas, normalización `/255` y conteos de train/validación/test. No persiste ejemplos ni predicciones individuales.
- La pantalla `Modelos privados` distingue CNN de Feedforward según el manifiesto. Al descargar, comprueba hashes y coherencia entre la topología real y las dimensiones declaradas antes de habilitar inferencia. CNN acepta PNG/JPG/WebP local (máximo 5 MiB), muestra softmax por clase y libera el predictor al salir. Los modelos Feedforward conservan su formulario y lógica previos.
- La comprobación SHA-256 valida integridad del artefacto contra el hash registrado **por el cliente**, no demuestra autenticidad criptográfica del entrenamiento. Admin global sin membresía no obtiene acceso técnico; se mantiene RLS/Storage F5.

### Instalación y pruebas (VSCode, Git Bash)

1. Extraer `NeuroLab_CNN4C_Patch.tar.gz` sobre el repositorio que ya tiene CNN-4B y corrección 013. Conservar `.env.local`, `.env.test.local`, `.git`, `package-lock.json` y archivos de trabajo ajenos.
2. Ejecutar:

```bash
node --experimental-strip-types --test tests/cnn4c.contract.test.mjs
node --experimental-strip-types --test tests/cnn4c.runtime.test.mjs
npm run typecheck
npm run build
```

3. Entrar como Ingeniero en un proyecto activo, importar el mismo `digits-8x8.csv`, entrenar CNN con 2 épocas y esperar `Estado final confirmado` y evaluación guardada. Seleccionar nombre de modelo y pulsar **Guardar versión inmutable**; no navegar hasta la confirmación.
4. Abrir `Proyectos → Proyecto → Modelos`: localizar la familia CNN, cargar la versión y predecir sobre PNG/JPG/WebP. Cerrar sesión, volver a entrar y repetir la carga **sin CSV**. Comprobar que Feedforward sigue cargando y prediciendo como antes.
5. En Supabase SQL Editor ejecutar `supabase/tests/FASE_7_CNN4C_VERIFICACION.sql` (solo lectura); comprobar fila de `model_versions`, objetos `model.json` y `weights.bin`, hashes presentes y bucket privado.
6. Con una cuenta Lector miembro, comprobar que puede cargar y predecir pero no publicar. Retirar la membresía y comprobar que pierde acceso. Verificar que un Admin global sin membresía sigue sin acceso técnico.
7. Validar tema claro/oscuro, móvil, recarga, fuga de memoria tras salir, error por fichero inválido, Worker y fallback cuando sea viable; publicar en GitHub/Vercel **solo después** de la validación.

**No ejecutar nuevas migraciones** para CNN-4C. La integración de filtro de familias e historial unificado corresponde a CNN-4D; las pruebas exhaustivas y el cierre, a CNN-5.
<!-- CNN4C_VERSIONES_PRIVADAS_END -->


<!-- CNN4D_HISTORIAL_UNIFICADO_BEGIN -->
## CNN-4D — Historial, modelos y reportes por familia (validación comunicada por el desarrollador)

**Requisito previo:** CNN-4C funcional con migraciones 011, 012 y 013 aplicadas. CNN-4D **no requiere migraciones nuevas**; preserva RLS y las RPC anteriores.

- **Historial** (`/proyectos/:projectId/historial`): incluye `multiclass` junto a binaria/regresión, filtro en PostgreSQL *antes de paginar* por las familias actuales, métricas de las épocas persistidas y evaluación CNN sobre test. La matriz, precisión, recall y F1 por clase se reconstruyen desde `run_evaluations.metrics_json.matrix`; no se muestran ni solicitan imágenes o ejemplos individuales.
- **Comparación**: dos ejecuciones completadas del mismo tipo (CNN con CNN, Feedforward binaria con binaria, regresión con regresión). Para CNN solo se comparan las métricas de test cuando también coincide el orden de etiquetas de clase. No se muestran valores ficticios ni se afirma que las particiones de datos sean equivalentes.
- **Modelos privados**: selector por familia que filtra las versiones ya leídas con RLS, manteniendo la recuperación de pesos y predicción de CNN/Feedforward. Es una vista del conjunto limitado de versiones consultadas, no un conteo total de Storage.
- **Reportes**: filtros de familia en tabla y exportaciones CSV y PDF formales, agregando columna `familia` y `precision_macro`/`recall_macro`/`f1_macro` en CSV. Los totales del proyecto permanecen **globales**, el detalle se limita a las últimas 200 ejecuciones consultadas y los filtros no se aplican sobre todo el histórico cuando hay más de 200 filas.
- **Regla de tipado actual**: únicamente CNN produce `problem_type = multiclass`, y únicamente Feedforward produce `binary` o `regression`. Esta correspondencia no debe generalizarse si RNN/GAN adoptan esos tipos; en ese momento hay que migrar el filtrado para consultar explícitamente `architectures.family`.
- Se reutilizan `SelectField`, `Pagination`, `Surface`, `Notice`, los tokens CSS, y los componentes de gráficas. No hay lectura de datos personales ajenos, CSV originales, píxeles individuales ni nuevas concesiones de escritura.

### Pruebas de entrega

1. Ejecutar `node --experimental-strip-types --test tests/cnn4d.history.test.mjs tests/cnn4d.contract.test.mjs` y las pruebas CNN-4C y F4; después `npm run typecheck` y `npm run build` en VSCode.
2. Con un proyecto con Feedforward y CNN guardadas, entrar a Historial y alternar **Todas / Feedforward / CNN**. Confirmar paginación y conteos por familia, curvas históricas y evaluación agregada multiclase.
3. Comparar dos CNN completadas con el mismo conjunto de etiquetas; la UI debe mostrar métricas reales y líneas de validación. No permitir una comparación CNN vs Feedforward.
4. En Modelos, filtrar cada familia y recuperar al menos una versión de cada una; comprobar que la inferencia continúa disponible.
5. En Reportes, comprobar CSV/PDF por familia sin alterar totales globales; confirmar `macroF1` en la exportación CNN. Verificar proyectos archivados, roles y tema claro/oscuro.
6. Ejecutar pruebas RLS con miembros y Admin global sin membresía. Las verificaciones de código y build **no** acreditan automáticamente estas pruebas remotas.

**Estado comunicado (10/11/2026):** el desarrollador confirmó pruebas funcionales satisfactorias. La verificación independiente de RLS por cinco identidades y la aceptación final en producción se centralizan en CNN-5.
<!-- CNN4D_HISTORIAL_UNIFICADO_END -->

<!-- CNN5_CIERRE_INICIO -->
## CNN-5 — Verificación transversal, seguridad y cierre de la familia CNN (10 de noviembre de 2026)

**Estado:** entrega de pruebas y documentación **PREPARADA PARA VALIDACIÓN**. No se declara CNN cerrada ni auditada únicamente por ejecutar los tests locales. CNN-4B fue verificada en Supabase por el desarrollador: run completado 2/2, cuatro métricas por época, evaluación agregada multiclase. CNN-4C/4D fueron confirmadas funcionales por el desarrollador.

### Alcance y decisiones

- Esta entrega **no agrega código de interfaz, dependencias, tablas, migraciones, funciones SQL ni privilegios**. Se conserva el procesamiento TensorFlow.js en el navegador (Worker/fallback), el esquema Supabase con migraciones 012/013 y el bucket privado `model-artifacts` de la Fase 5.
- Añade pruebas deterministas de persistencia (orden, confirmación, cancelación y fallos de red), privacidad del resumen multiclase, separación CNN/Feedforward, recuperación de versiones y contratos de seguridad. Los tests puros no sustituyen una ejecución ML real ni una prueba de RLS.
- Añade `scripts/test-cnn5-live.mjs`, prueba **exclusivamente de lectura** con cinco JWT reales y clave publicable. Valida membresía exacta, datos CNN confirmados, aislamiento del Administrador global sin membresía, lectura por Responsable/Ingeniero/Revisor/Lector, descarga del `model.json` privado y su SHA-256. No crea datos ni invoca RPC de escritura.
- Añade `supabase/tests/FASE_7_CNN5_AUDITORIA_READONLY.sql` para comprobar RLS habilitada, ACL de RPC, bucket privado, integridad resumida de ejecuciones/épocas/evaluaciones y cantidad de versiones. SQL Editor ejecuta con privilegios administrativos: **no permite certificar RLS por usuario**.
- Se conserva expresamente el riesgo de que `multiclass` equivale hoy a CNN y binaria/regresión a Feedforward. **Antes de RNN/GAN deberá migrarse el filtrado a `architectures.family`**, sin suponer que los nuevos tipos serán disjuntos.
- No se incluyen CSV, imágenes, píxeles, modelos demostrativos falsos ni credenciales. Los resultados dependientes de red deben verificarse contra recursos reales ya existentes.

### 1. Pruebas de consola en VSCode (Git Bash)

```bash
node --experimental-strip-types --test \
  tests/cnn5.lifecycle.test.mjs \
  tests/cnn5.integration-contract.test.mjs \
  tests/cnn5.release-contract.test.mjs

# Regresión CNN-3 / CNN-4 y Feedforward Fase 4/Fase 5.
node --experimental-strip-types --test \
  tests/cnn3.evaluation.test.mjs tests/cnn3.session.test.mjs \
  tests/cnn4a.database-contract.test.mjs tests/cnn4b.json-precedence.test.mjs \
  tests/cnn4b.persistence.test.mjs tests/cnn4c.contract.test.mjs \
  tests/cnn4c.session.test.mjs tests/cnn4d.history.test.mjs \
  tests/cnn4d.contract.test.mjs tests/evaluation.test.mjs \
  tests/history.test.mjs tests/fase5.manifest.test.mjs

# Requiere dependencias instaladas y WebGPU no es necesario.
node --experimental-strip-types --test tests/cnn4c.runtime.test.mjs
npm run typecheck
npm run build
```

Cuando una prueba falla o se omite, registrar su motivo; no presentar tests estructurales como prueba de funcionamiento real en Vercel. Las advertencias de tamaño de chunks de Vite son advertencias, no errores si el proceso devuelve exit 0.

### 2. Diagnóstico de esquema en Supabase

1. Ejecutar **solo en SQL Editor** `supabase/tests/FASE_7_CNN5_AUDITORIA_READONLY.sql`. Revisar cada resultado, no repetir 011, 012 o 013 ni ejecutar el bootstrap.
2. Comprobar las ocho tablas con RLS `true`; tres RPC como `security_definer = true`, `anon_execute = false`, `authenticated_execute = true`, configuración `search_path` restringida; `model-artifacts` privado (`public=false`).
3. Para runs `completed`, `completado_consistente=true`. El número de matrices coincide con las evaluaciones y `con_contenido_prohibido=0`. Las versiones CNN publicadas deben disponer de ambos hashes.
4. Si hay filas inconsistentes, identificar sus UUID y la causa desde consultas privadas de mantenimiento; no corregir datos de producción directamente ni borrar huérfanos sin plan de recuperación.

### 3. Prueba RLS real con cinco cuentas (sin modificaciones de datos)

Reutilizar las variables de prueba F6 en `.env.test.local` (ignorado por Git): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, cinco pares `TEST_F6_{ADMIN,RESPONSIBLE,ENGINEER,REVIEWER,READER}_{EMAIL,PASSWORD}` y `TEST_CNN5_PROJECT_ID` (UUID de proyecto con CNN y versión publicada; alternativa: `TEST_F6_PROJECT_ID`). Opcional `TEST_CNN5_VERSION_ID` para elegir una versión concreta entre las últimas 150. **No enviar ni publicar contraseñas, UUID personales, tokens ni `.env.test.local`.**

```bash
node --env-file=.env.test.local scripts/test-cnn5-live.mjs
```

**Precondiciones:** cinco identidades activas, distintas; Responsable/Ingeniero/Revisor/Lector miembros del *mismo* proyecto; Admin global sin membresía; al menos una versión CNN ya publicada y con ejecución completada. Si alguna no se cumple, el script informa error y **no acredita autorización**.

La prueba verificará que miembros pueden leer tablas y `model.json`, Admin sin membresía no; contrastará SHA-256 del manifiesto y métricas por época, y detectará un JSON de evaluación con datos individuales. **No prueba las autorizaciones para escrituras**: se mantienen los tests en vivo previos de Fases 3/5/6 y las verificaciones manuales sobre roles en pantalla. No ejecutar pruebas RLS con `service_role`.

### 4. Aceptación funcional en navegador (local y Vercel)

- [ ] **Ingeniero + proyecto activo:** importar un CSV real Digits 8×8, configurar red válida, entrenar 2 épocas, comprobar progreso/curvas reales y evaluación de test. Confirmar run completo y las 4 métricas por época; no se exige un umbral artificial de exactitud.
- [ ] **Predicción en sesión:** usar un ejemplo de test y un PNG/JPG/WebP propio válido; rechazar archivo inválido. Los datos no salen del navegador como filas/píxeles.
- [ ] **Cancelación / error:** cancelar durante entrenamiento; no anunciar `completed`. Cambiar de pestaña durante entrenamiento conserva la sesión; salir de la ruta libera recursos. Desconexión deliberada en entorno de pruebas no muestra RPC final falsamente confirmada.
- [ ] **Guardar/restaurar:** publicar una nueva versión CNN desde Ingeniería; comprobar modelo privado, hashes y restauración tras cerrar sesión sin reimportar CSV. Repetir una predicción con el mismo archivo y tolerancias razonables, sin exigir igualdad exacta entre backends.
- [ ] **Feedforward sin regresiones:** entrenar una clasificación binaria o regresión; revisar historial, comparar modelos compatibles y recuperar un modelo anterior de F5 para inferencia.
- [ ] **Historial y reportes:** filtrar Todas/Feedforward/CNN, mostrar curvas, matriz, precisión/recall/F1 macro, comparación entre CNN de clases compatibles; exportar CSV/PDF sin muestras ni píxeles. Respetar límites de 200 runs para reportes y 150 versiones de modelos.
- [ ] **Roles:** Responsable, Revisor, Lector pueden consultar recursos permitidos; solo Ingeniero de proyecto activo entrena/publica; Admin global sin membresía no accede a datos técnicos; usuario ajeno e inactivo quedan excluidos. Probar revocación en un **proyecto de ensayo**, no retirar integrantes de producción para probar.
- [ ] **Presentación:** tema claro predeterminado y oscuro en escala de grises; móvil y escritorio; teclado, estados accesibles y componentes UI compartidos.
- [ ] **Publicación:** commit revisado, Vercel con despliegue más reciente **verde** para ese mismo commit, carga directa/refresco de rutas y pruebas de navegador en HTTPS. Un check antiguo rojo no sustituye consultar el despliegue actual.

### 5. Operación, riesgos y condición de cierre

- No aplicar migraciones nuevas para CNN-5. Repetir 011/012/013 puede producir efectos indeseados.
- El CSV permanece local (hasta 2 000 registros procesados; límite de archivo CNN 200 MB, sujeto a memoria del dispositivo). El almacenamiento de hasta 10 MiB y hasta 50 000 filas para Feedforward mantiene su contrato propio.
- Los SHA-256 verifican consistencia respecto a hashes reportados por cliente, no prueban que el entrenamiento haya ocurrido sin manipulación.
- La CNN es experimental en navegador; rendimiento limitado según backend, memoria y dispositivo. Mantener restricciones 8×8/28×28 monocromático y 2–10 clases. Evaluación sobre test interno del CSV, no sobre distribución externa.
- El cierre condicionado de Fase 6 sigue independiente: Docker/WSL, restauración integral Auth/Storage y aceptación de retención pendientes. **No anunciar restauración completa ni Docker resuelto** por cerrar CNN.
- Al cerrar CNN, actualizar esta misma sección con fecha, commit Git, ID de despliegue Vercel, resumen de pruebas automatizadas, resultados SQL/RLS y comprobación funcional por rol (sin información sensible).

**Criterio formal de cierre CNN:** todas las pruebas locales obligatorias, diagnóstico SQL, prueba RLS de cinco cuentas, validaciones funcionales/manuales y Vercel para el commit publicado deben pasar. Una prueba omitida o no ejecutada mantiene la familia CNN en **VALIDACIÓN PENDIENTE**. RNN y GAN serán incrementos posteriores, no alcanzados por este cierre.
<!-- CNN5_CIERRE_FIN -->

<!-- RNN1_INICIO -->
## RNN-1 — Datos y arquitectura secuencial

**Estado:** preparado para validación local y Vercel, no constituye entrenamiento.

- Ruta privada `/proyectos/:projectId/rnn` con control de membresía: el Admin global no es un integrante implícito.
- Solo Ingeniero de proyecto activo importa CSV y modifica el diseñador; los demás miembros consultan.
- Archivo CSV local con cabeceras: hasta 10 MiB / 50 000 filas, PapaParse compartido.
- Selección de serie, tiempo numérico, objetivo y 1–16 variables numéricas; problemas regresión, binaria y multiclase (3–10).
- Ventanas de 4/8/16/32 pasos; ninguna ventana mezcla series; máximo 20 000 ventanas.
- Para la ventana t..t+L-1, el objetivo se toma de t+L. Se ordena por tiempo y se rechazan duplicados y no finitos.
- Tres ventanas reales de ejemplo; no se cargan ni persisten CSV, métricas o pesos en Supabase.
- Diseñador SimpleRNN/LSTM, 1–2 capas con 8/16/32/64 unidades, Dense opcional y salida según problema.
- Shapes/parámetros teóricos calculados en el cliente. Entrenar/Evaluar/Predecir son vistas futuras sin métricas ficticias.

### Prueba y límites

- Muestra local: `tests/fixtures/rnn1_temporal_demo.csv` (serie, paso, variables, objetivo).
- Ejecutar `node --experimental-strip-types --test tests/rnn1.*.test.mjs`, `npm run typecheck`, `npm run build`.
- En la muestra, 4 pasos forman 12 ventanas; 8 pasos, 4 ventanas. Probar permisos, temas y móvil.
- No se requiere migración SQL, nuevas dependencias ni funciones RPC en RNN-1.
- RNN-2 debe evitar fuga por ventanas solapadas mediante partición cronológica con separación temporal o por serie,
  ajustar escaladores solo con train y entrenar con TF.js real y cancelación.
- Antes de RNN-4, filtrar historial y modelos por `architectures.family`, nunca inferir familia a partir del tipo de problema.
- No afirmar cierre hasta aprobar validación en VSCode y la versión publicada en Vercel.
<!-- RNN1_FIN -->

<!-- RNN2_TRAINING_BEGIN -->
## RNN-2 — Entrenamiento real de secuencias

**Estado:** implementación preparada para validación en VSCode y navegador. No equivale a un despliegue realizado.

- Se entrena con TensorFlow.js `SimpleRNN` o `LSTM`, 1–2 capas recurrentes y Dense opcional del diseñador RNN-1; el motor verifica el conteo de parámetros respecto del diagrama.
- CSV local de RNN-1: máximo 2 000 ventanas posibles para entrenamiento. Cada serie requiere longitud suficiente. La división asigna objetivos de modo cronológico, ~70/15/15 y **purga `steps` ventanas** entre train, validación y test para que no se compartan observaciones originales. Si la serie es demasiado corta no se entrena.
- Transformaciones de predictores y objetivo de regresión calculadas **solo con train**. Para regresión se muestran MSE y MAE sobre el objetivo estandarizado; clasificación usa entropía cruzada y accuracy. Métricas auténticas de `model.fit()` por época, barras de progreso y backend/contexto reportados por el motor.
- Worker Vite CPU, con fallback al hilo principal **solo si el Worker falla antes del primer evento**. Cancelación cooperativa confirmada por el motor; sin reintentos de trabajos parciales. Liberación de tensores y modelo al finalizar, cancelar o abandonar la pantalla.
- Solo el **Ingeniero** miembro de proyecto activo puede iniciar entrenamiento. Cambiar de pestaña dentro de RNN no desmonta la sesión. No se envían datos ni modelos a Supabase; sin migraciones SQL ni dependencias nuevas.
- Hiperparámetros: épocas 2/5/10, batch 8/16/32, learning rate 0.001/0.0005. El test está reservado para RNN-3 (no participa en fit ni validación); predicción, evaluación final y persistencia todavía no disponibles.
- Datos: `tests/fixtures/rnn2_temporal_demo.csv` contiene **señales sintéticas de prueba** de 2 series y 128 filas, con 4 pasos → 72 train, 14 validación, 18 test y 16 ventanas purgadas. No es una medida de generalización. El archivo `rnn1_temporal_demo.csv` de 20 filas solo sirve para visualización y es demasiado corto para el entrenamiento purgado de RNN-2.

**Verificación (VSCode + Git Bash)**:

```bash
node --experimental-strip-types --test tests/rnn1.*.test.mjs tests/rnn2.training-data.test.mjs tests/rnn2.contract.test.mjs
node --experimental-strip-types --test tests/rnn2.runtime.test.mjs
npm run typecheck
npm run build
npm run dev
```

Pruebas de navegador con Ingeniero: entrenar SimpleRNN y LSTM 2 épocas usando el CSV RNN-2; comprobar cuatro métricas reales y cancelación. Probar al menos una cuenta no Ingeniero, cambiar pestaña, tema claro/oscuro, pantalla móvil y pérdida de sesión. Documentar backend/tiempos sin inventar valores.
<!-- RNN2_TRAINING_END -->

<!-- RNN3_EVALUACION_INFERENCIA_BEGIN -->
## RNN-3 — Evaluación de test y predicción temporal local

**Estado:** implementación preparada, pendiente de validación de runtime, TypeScript, build y pruebas de navegador por el equipo.

- Mantiene SimpleRNN/LSTM y partición temporal causal de RNN-2. Solo **después** de completar `model.fit()` se calculan predicciones sobre el test reservado; las ventanas de test no participan en el entrenamiento ni en la validación y no ajustan transformadores.
- Regresión: MSE, RMSE, MAE y R² calculados en la **escala original** del objetivo mediante los estadísticos ajustados solo en train. R² se muestra como no definido cuando el objetivo test es constante.
- Clasificación binaria/multiclase: accuracy, precisión/recall/F1 macro, matriz de confusión (filas reales, columnas predichas) y hasta 8 ejemplos de test. Las clases proceden de train; no se inventan valores ni se ocultan clases con cero casos.
- El modelo entrenado permanece en memoria del Web Worker (o fallback principal) para inferir a partir de la **última ventana cronológica real** de una serie del CSV local. Solo se utilizan las columnas predictoras; no se utiliza el objetivo al construir esta ventana. Se devuelve la salida desnormalizada o clase y probabilidades.
- La predicción estima la observación posterior a la ventana; no se extrapola ni inventa una marca temporal exacta. No se permite cargar CSV externos con otro esquema todavía.
- Se liberan modelos y tensores cuando se abandona el módulo, cambia proyecto o identidad, cambia arquitectura/CSV o comienza un nuevo entrenamiento. La cancelación no deja modelo para inferencia. Las métricas y predicciones son temporales y **no se guardan en Supabase**.
- El motor conserva un solo entrenamiento por sesión; el Worker no se reinicia tras fallos ocurridos después del inicio. No se introducen nuevas tablas, SQL, librerías ni dependencias.

**Pruebas (Git Bash):**

```bash
node --experimental-strip-types --test tests/rnn1.*.test.mjs tests/rnn2.training-data.test.mjs tests/rnn2.contract.test.mjs tests/rnn3.evaluation.test.mjs tests/rnn3.inference.test.mjs tests/rnn3.contract.test.mjs
node --experimental-strip-types --test tests/rnn2.runtime.test.mjs tests/rnn3.runtime.test.mjs
npm run typecheck
npm run build
npm run dev
```

**Validación funcional:** usar `tests/fixtures/rnn2_temporal_demo.csv` (4 pasos) y entrenar 2 épocas; abrir Evaluar, verificar 18 observaciones de test y métricas finitas. Abrir Predecir, seleccionar `sensor_A` y `sensor_B`, verificar inferencia de ambas; repetir con SimpleRNN y LSTM. Cambiar de pestaña durante el entrenamiento, comprobar cancelación y liberación al cambiar CSV. Validar acceso de Ingeniero frente a los demás roles, temas claro/oscuro y móvil.

**Limitación:** la calidad predictiva depende del dataset, el horizonte y el entrenamiento; la pérdida de validación observada puede ser muy superior a la pérdida de train. RNN-4 agregará persistencia, modelos versionados e historial, con RLS/RPC específicos.
<!-- RNN3_EVALUACION_INFERENCIA_END -->

## RNN-4A — Preparación de persistencia y tabla paginada

- La evaluación sigue calculándose sobre el test completo; ahora la tabla muestra todos los ejemplos, ocho por página, reutilizando `Pagination`. Se mantienen únicamente en memoria local y no se guardan por fila.
- Migración `202611100014_rnn_temporal.sql`: añade familia `rnn` a `architectures` y RPC `create_rnn_training_run`, `record_rnn_training_epoch`, `record_rnn_test_evaluation`. Continúa el RLS del proyecto, solo se permite rol Ingeniero activo para escribir.
- Los metadatos del CSV se limitan a nombres de columnas, conteos, huella SHA-256 y normalizadores agregados obtenidos exclusivamente de entrenamiento. No se persisten series, ventanas ni objetivos individuales.
- Las operaciones RNN no se conectan aún en la UI durante RNN-4A: no se crean ejecuciones remotas hasta instalar RNN-4B. No hay que repetir migraciones previas.
- **Advertencia de diseño:** RNN admite regresión, binaria y multiclase; por tanto, el historial, reportes y versiones de modelos deberán identificar su familia desde `architectures.family` o `preprocessing_manifest.family`, nunca deducirla solo de `problem_type`. Se corregirá antes de habilitar la escritura de RNN en RNN-4B.
- Pruebas: `node --experimental-strip-types --test tests/rnn4a.*.test.mjs`. Validar `npm run typecheck`, `npm run build`, tabla 18 resultados (8+8+2) y diagnóstico de Supabase de solo lectura.

## RNN-4B — Persistencia de entrenamiento y evaluación

- **Alcance:** conserva SimpleRNN/LSTM y evaluación en TensorFlow.js local. Antes de iniciar un entrenamiento, calcula SHA-256 del CSV completo, prepara un resumen causal basado en train y crea una ejecución RNN mediante `create_rnn_training_run`. El servidor confirma runId; solo entonces arranca el Worker.
- **Escrituras ordenadas:** `set_training_runtime` → por época `record_rnn_training_epoch` → una única `record_rnn_test_evaluation` → `finish_training_run` (completada, fallida, cancelada o interrumpida). Se muestran por separado el progreso **local** y las confirmaciones **remotas**; no se presenta éxito de persistencia sin respuesta positiva.
- **Privacidad:** se transmiten nombres/contajes de columnas y series, opciones, huella SHA-256, parámetros de normalización aprendidos únicamente en train, métricas por época y test agregado. CSV, ventanas, identificadores de serie, tiempo individual, real/predicho, tensores y pesos siguen **en el navegador**.
- **Seguridad:** RPC de RNN-4A (migración 014) y funciones compartidas F3 con RLS/permiso de Ingeniero en proyecto activo. RNN-4B **no incorpora migraciones nuevas**. Un fallo remoto no se transforma en éxito local; la cola intenta cerrar la ejecución como fallida y avisa si no pudo confirmarlo. El cálculo local no prueba de forma independiente la veracidad del entrenamiento.
- **Compatibilidad:** Feedforward/CNN no deben clasificar RNN basándose solo en `problem_type`. El historial Feedforward/CNN excluye temporalmente ejecuciones RNN mediante `architectures.family`; el reporte utiliza la familia real de la arquitectura. La incorporación de métricas RNN al historial dedicado queda para RNN-4D. RNN-4C incorporará publicación de modelos versionados.
- **Verificación:** `node --experimental-strip-types --test tests/rnn4b.queue.test.mjs tests/rnn4b.contract.test.mjs`; en equipo con dependencias `tests/rnn4b.runtime.test.mjs`, `npm run typecheck`, `npm run build`. Entrenar con `tests/fixtures/rnn2_temporal_demo.csv`, cuatro pasos, dos épocas: 72/14/18, ejecución completada, ocho métricas (4 por época), una evaluación agregada de 18 ventanas. Ejecutar `supabase/tests/FASE_7_RNN4B_VERIFICACION.sql` en SQL Editor (solo lectura).
- **Limitación operativa:** cerrar pestaña o cambiar de cuenta durante una escritura RPC no garantiza completar el cierre en servidor. Si queda `created`/`running`, usar el diagnóstico para identificarlo y no interpretarlo como completado.

## RNN-4C — Versiones privadas y predicción restaurada

- **Publicación:** tras confirmar las épocas, test agregado y cierre remoto `completed`, el Ingeniero serializa SimpleRNN/LSTM localmente (Worker o fallback) y utiliza `saveModelVersion` de Fase 5. Reserva una versión inmutable, sube `model.json` y `weights.bin` al bucket privado y verifica hashes SHA-256. No se requieren nuevas migraciones; reutiliza RPC F5 y el manifiesto RNN de 014/015.
- **Restauración:** el registro de modelos filtra Feedforward, CNN y RNN. Descarga con JWT/RLS, comprueba hashes, valida manifiesto/dimensiones y carga los pesos en TensorFlow.js del navegador.
- **Inferencia sin CSV:** se introducen manualmente `steps` filas, de más antigua a más reciente, con columnas en el orden `features` guardado. Se aplican medias/escalas calculadas solo en train y se revierte la escala del objetivo regresivo; en clasificación se muestran clase y probabilidades. Observaciones y predicciones no se envían a Supabase.
- **Seguridad:** publica solamente el Ingeniero de proyecto activo desde su ejecución completada; miembros autorizados pueden descargar y predecir. El Administrador global sin membresía no recibe acceso técnico automáticamente. Hashes declarados por el cliente confirman integridad de descarga, no autenticidad criptográfica del entrenamiento.
- **Vida útil:** el modelo se libera al salir de la vista o cambiar de versión. Un fallo de subida/publicación no se presenta como éxito. Una reserva remota puede quedar sin publicar si una subida falla; no se sobrescriben versiones anteriores.
- **Pruebas:** `node --experimental-strip-types --test tests/rnn4c.manifest.test.mjs tests/rnn4c.contract.test.mjs`; en Node con TF.js instalado `node --experimental-strip-types --test tests/rnn4c.runtime.test.mjs`; `npm run typecheck && npm run build`. Publicar una RNN y, tras recargar/volver a iniciar sesión, predecir sin CSV. Verificar `supabase/tests/FASE_7_RNN4C_VERIFICACION.sql` después de publicar.
- **Pendiente:** RNN-4D integrará historial/comparación y RNN-5 validará seguridad/despliegue de cierre.

## RNN-4D — Historial, comparaciones y reportes unificados

- **Historial por familia real:** consulta RLS de `training_runs` y `architectures!inner(family)` con filtro `all/feedforward/cnn/rnn` aplicado en PostgreSQL antes de paginar (8 ejecuciones por página). RNN de regresión/binaria/multiclase no se etiqueta ni mezcla con Feedforward/CNN por compartir `problem_type`.
- **Detalle histórico RNN:** las curvas reconstruyen las métricas reales de `training_metrics` (loss + MAE/accuracy de train/validation); la tarjeta RNN lee el resumen agregado `run_evaluations.metrics_json` guardado en RNN-4B y presenta MAE/RMSE/MSE/R² o accuracy/macro-métricas/matriz. Nunca recupera ventanas, series ni predicciones individuales. La tabla paginada de 8+8+2 continúa solo en la sesión RNN local.
- **Comparación:** únicamente entre la misma familia y tipo de problema, con ejecuciones completadas. Para CNN/RNN de clasificación también coinciden las clases y su orden; si no, no se muestran métricas engañosas. La comparación descriptiva no verifica igualdad de dataset, objetivo, horizonte, partición, semillas ni condiciones de entrenamiento; el usuario debe comprobarlas antes de interpretar resultados.
- **Reportes CSV/PDF:** filtros compartidos de Feedforward/CNN/RNN, familia obtenida desde la FK real, métricas multiclase RNN y binarias con F1 macro, regresión RNN con RMSE/MAE/R². El CSV contiene exclusivamente agregados y metadatos, no muestras. Totales globales sin filtrar. Límite vigente: 200 ejecuciones recientes por instantánea; un filtro no implica exhaustividad histórica.
- **Compatibilidad y seguridad:** no se alteran las RPC, RLS, bucket privado ni manifiestos/modelos ya publicados en 011–015; no hay nuevas migraciones. Continúan accesos de miembros mediante RLS y se conserva Feedforward/CNN.
- **Pruebas:** `node --experimental-strip-types --test tests/rnn4d.history.test.mjs tests/rnn4d.contract.test.mjs`; `npm run typecheck && npm run build`; `supabase/tests/FASE_7_RNN4D_VERIFICACION.sql` (solo lectura). Probar filtros en Historial y Reportes, comparación entre dos RNN compatibles, Exportar CSV/PDF, versiones privadas RNN y regresión Feedforward/CNN.
- **Pendiente:** RNN-5 validará roles/RLS reales, regresiones, despliegue Vercel y cierre formal RNN, independiente de pendientes operativos de Fase 6.

<!-- RNN5_CIERRE_INICIO -->
## RNN-5 — Seguridad, regresión y cierre de la familia recurrente

**Estado:** PREPARADA PARA VALIDACIÓN. El cierre formal requiere resultados reales de RLS,
Storage, ejecución y Vercel; las pruebas de código no sustituyen la aceptación.
RNN-4B: el desarrollador verificó una ejecución completada 2/2, 8 métricas, 1 evaluación y
18 ventanas de test reservadas/evaluadas. RNN-4C: versión privada con manifiesto temporal,
hashes/rutas y ejecución completada. RNN-4D: historial y reportes integrados.

### Alcance de RNN-5

- Sin cambios en React, TensorFlow.js, políticas RLS, bucket, tablas, RPC, dependencias o migraciones 011–015.
- Pruebas de cola de persistencia: orden de runtime/épocas/evaluación/finalización, errores,
  cancelación y confirmaciones reales; métricas no finitas rechazadas.
- Pruebas de privacidad: el test completo de 18 ventanas sigue en la tabla paginada **local**;
  el historial y CSV/PDF almacenan solamente métricas agregadas; no se recuperan ni se exportan
  las 18 filas originales desde Supabase.
- Auditoría SQL de **solo lectura**, una fila de resultados:
  `supabase/tests/FASE_7_RNN5_AUDITORIA_READONLY.sql`. Verifica ocho tablas con RLS,
  tres RPC seguras, bucket privado, ejecuciones completas, versiones con hashes/rutas y
  resúmenes sin datos individuales. SQL Editor NO prueba el aislamiento por usuario.
- Auditoría auténtica con **cinco JWT de prueba**, solo lectura:
  `scripts/test-rnn5-live.mjs`. Valida Responsable, Ingeniero, Revisor, Lector y
  Administrador global **sin membresía técnica**; lectura RLS de las siete entidades,
  acceso privado a model.json/weights.bin y SHA-256 de ambos artefactos. No prueba
  autorización de escritura ni reemplaza las verificaciones manuales de rol.

### Comandos de validación

```bash
node --experimental-strip-types --test tests/rnn5.*.test.mjs
node --experimental-strip-types --test tests/rnn2.runtime.test.mjs tests/rnn4c.runtime.test.mjs
npm run typecheck
npm run build
# Archivo .env.test.local local, fuera de Git; cinco usuarios de pruebas.
node --env-file=.env.test.local scripts/test-rnn5-live.mjs
```

Configuración mínima del ensayo real: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, las cinco cuentas de `TEST_F6_*`, y
`TEST_RNN5_PROJECT_ID` (alternativa `TEST_F6_PROJECT_ID`). Opcional
`TEST_RNN5_VERSION_ID` para seleccionar la versión RNN publicada explícitamente.
Nunca compartir contraseñas ni tokens. Ejecutar solo sobre un proyecto donde estén las
cuatro membresías y el Admin global esté fuera; el script se detiene si no se cumplen.

### Validaciones funcionales y cierre pendiente

- [ ] Ingeniero: SimpleRNN y LSTM entrenan realmente, muestran métricas y test; cancelación
      y pérdida de conexión no anuncian finalización remota falsa.
- [ ] Predicción en sesión; test paginado (8 + 8 + 2 para el CSV demo); cambiar dataset o
      arquitectura invalida el modelo antiguo.
- [ ] Versión privada publicada; recuperar tras recargar sin CSV, con ventanas manuales,
      normalización guardada y control de dimensiones; comprobar hashes y rutas.
- [ ] Historial/compare/reportes: filtrar Feedforward/CNN/RNN, no mezclar familias/tareas,
      revisar reportes CSV/PDF solo agregados, totales globales y límites de paginación.
- [ ] Responsable, Ingeniero, Revisor, Lector, Admin global sin membresía: controles de
      lectura/acceso y autorización de acciones conforme a los roles; revocación solo en
      proyecto de prueba, nunca modificar miembros productivos para auditar.
- [ ] Tema claro por defecto/oscuro en grises, móvil, teclado y estados de carga.
- [ ] Commit controlado: incluir scripts/tests/SQL/documentación; excluir archivos *.tar.gz,
      .env.test.local, payloads y parches temporales; Vercel READY para el mismo commit.
- [ ] Registrar fecha, commit y despliegue, resultados de pruebas, SQL, RLS/Storage real y
      aceptación en HTTPS, sin datos sensibles.

**Criterio de cierre RNN:** solo marcar CERRADA tras aprobar el runtime TF.js, typecheck/build,
SQL, las cinco identidades RLS/Storage y las pruebas de navegador en la versión desplegada.
La verificación de SHA-256 acredita integridad respecto a los hashes declarados por el
cliente, no autenticidad del entrenamiento. Rendimiento y generalización son experimentales.
Las tareas operativas pendientes de Fase 6 (Docker/restore Auth/Storage) siguen separadas.
GAN comienza tras el cierre de RNN, sin atribuirle funcionalidades aún no implementadas.
<!-- RNN5_CIERRE_FIN -->

