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
