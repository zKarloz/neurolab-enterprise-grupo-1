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
