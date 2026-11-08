# Fase 3 — Feedforward Dense (documentación consolidada)

**Estado:** en progreso. Incremento 1 (CSV y preprocesamiento) verificado visualmente por usuario Ingeniero; incremento 2 (entrenamiento real) implementado en código, **pendiente de `npm install`, typecheck, build, smoke test real y prueba en Vercel**. Fase 2 validada y cerrada.

**Base aprobada:** `docs/architecture/FASE_0_DISENO_APROBADO.md`. No existe backend Python, cola de servidor ni importación de CSV completos a Supabase. El Administrador global no hereda el rol Ingeniero.

## 1. Incremento 1 — CSV local y preparación reproducible

- Ruta `/proyectos/:projectId/datos`, accesible solo a miembros Ingeniero de un proyecto activo.
- CSV con PapaParse `5.7.0`, cabecera obligatoria y límites de 10 MiB y 50 000 filas; errores de lectura visibles.
- Problemas admitidos: binaria/regresión; objetivo y columnas numéricas/categóricas.
- Partición con semilla 42: 70/15/15 (aproximada); binaria estratificada cuando es viable.
- Transformadores ajustados **solo con train**, categoría desconocida reservada y manifest en memoria.
- Límite provisional de 128 características codificadas, 40 categorías por predictor y estimación mínima de tensor de 64 MiB; puede requerirse reducir estos límites según RAM real.
- No se suben filas de CSV a Supabase.
- Pruebas automáticas `npm run test:preprocessing` (9 verificaciones); el usuario ya comprobó la pantalla con cuenta Ingeniero.

## 2. Incremento 2 — Constructor y entrenamiento TensorFlow.js

- `@tensorflow/tfjs` **4.22.0** fijado exactamente, sin rangos, y modelos Feedforward secuenciales `Dense` únicamente.
- Constructor: 1–3 capas ocultas, 1–64 neuronas por capa, activaciones `relu`, `tanh`, `sigmoid`; salida 1 neurona sigmoide y `binaryCrossentropy` para binaria, lineal y `meanSquaredError` para regresión. Optimizador Adam.
- Límites iniciales: 1–50 épocas, batch entre 1 y 128 sin superar train, learning rate entre 0.00001 y 0.1, máximo 100 000 parámetros y semilla entera para inicializadores.
- **Backend verificado por entrenamiento real de prueba**, primero WebGL si está disponible y luego CPU. Dentro del Worker solo se intenta WebGL si existe `OffscreenCanvas`; la capacidad efectiva se comprueba ejecutando `fit()` con gradientes. Se omite WASM hasta demostrar soporte de las operaciones de entrenamiento necesarias. Registrar backend, contexto (Worker/hilo principal) y versión TF.js.
- Worker de módulo empaquetado por Vite con `new Worker(new URL(..., import.meta.url), { type: 'module' })`. Si falla **antes de iniciar** se usa hilo principal; si falla durante ejecución se muestra error, sin reiniciar automáticamente.
- Progreso por `onEpochEnd`: pérdidas reales de train/validation y exactitud o MAE cuando TensorFlow.js las comunica. Barra de progreso, número de época, estado y cancelación cooperativa. Una petición de cancelación no se muestra como confirmada hasta recibir evento terminal del motor.
- Liberación explícita de tensors, modelo, optimizador y Worker al finalizar/cancelar/abandonar pantalla; en el fallback del hilo principal la detención se ejecuta en el siguiente punto cooperativo.
- El conjunto **test no participa** en el entrenamiento. La evaluación, predicción e historial se incorporan en F4. No se muestran métricas sintéticas.
- El modelo se libera después de entrenar y **no se guarda** todavía. Los resultados solo se conservan en memoria de la pestaña. Una nueva sesión requiere repetir el CSV.

## 3. Aplicar sobre el repositorio existente

Descomprime el ZIP del **Incremento 2** en la raíz de `neurolab-enterprise-grupo-1`, después de tener el Incremento 1 aplicado. Conserva `.env.local`, `.env.test.local`, `package-lock.json`, `.git` y cualquier configuración propia.

Ejecuta desde Git Bash en VSCode:

```bash
npm install
npm run typecheck
npm run build
npm run test:preprocessing
npm run test:network
npm run test:training:runtime
npm run test:projects
npm run test:design
npm run dev
```

**El smoke test `test:training:runtime` efectúa dos épocas REALES de clasificación con TensorFlow.js CPU**, no una simulación. Puede tardar más que las pruebas estructurales. La instalación debe actualizar el lockfile con la versión exacta.

En navegador, inicia sesión como Ingeniero: **Proyectos → proyecto → Dataset local → CSV**. Prueba los archivos `tests/fixtures/feedforward_binaria_demo.csv` y `feedforward_regresion_demo.csv`, haz clic en «Validar y preparar» y configura las capas. Pulsa «Iniciar entrenamiento» y verifica que las pérdidas cambian con valores reales, la pestaña sigue respondiendo y la cancelación es confirmada. La GPU puede no estar disponible y CPU es un resultado correcto. Abandonar la ruta interrumpe el entrenamiento, no lo deja ejecutando en el servidor.

Después de superar pruebas y build:

```bash
git add .
git commit -m "feat(fase3): entrenamiento Feedforward Dense con TensorFlow.js"
git push origin main
```

**Git:** utiliza tu identidad configurada en VSCode (`git config user.email`). No usar el correo provisional `dev@neurolab.local`, no hacer `push --force` ni subir credenciales.

## 4. Riesgos pendientes y condición de cierre

- **Compatibilidad:** hay que validar la compilación Vite/React/TF.js en el entorno con npm y la ejecución real en Vercel, al menos en un navegador escritorio.
- **Memoria:** la copia de datos al Worker puede duplicar el uso transitorio de RAM; las características one-hot pueden aumentarlo más. Evitar CSV grandes hasta probar límites reales.
- **Cancelación:** la detención es cooperativa por época; WebGL puede tardar en ceder el hilo del Worker.
- **RLS:** no sustituir autorización con ocultar botones; las operaciones persistentes de F3 requerirán políticas y pruebas cruzadas.
- **Confiabilidad:** las métricas calculadas localmente no son prueba criptográfica de ejecución sin manipulación.
- **Persistencia pendiente del siguiente incremento de F3:** migraciones de `architectures`, `datasets` (metadatos solamente), `training_runs` y `training_metrics` iniciales con RLS estricta; confirmar escrituras antes de indicar que fueron guardadas.
- **F4:** gráficas con Recharts, evaluación final sobre test, inferencia e historial de métricas.
- **F5:** modelos privados versionados e inmutables en Storage.

No se declara cerrada F3 hasta completar migraciones/RLS, pruebas, entrenamiento real en el navegador y despliegue.
