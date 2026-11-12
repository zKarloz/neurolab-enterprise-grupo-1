/** GAN-2: añadir al documento unificado sin sobrescribir CNN, RNN o GAN-1. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const heading = '## GAN-2 — Entrenamiento adversarial real con TensorFlow.js'
const section = `

<!-- GAN2_INICIO -->
${heading}

**Estado:** preparada para validación local; no considerar cerrada hasta validar runtime TensorFlow.js y build en VSCode.

- GAN densa no condicional de **dos redes**: generador G con ruido normal, dos capas Dense
  y activaciones LeakyReLU, salida tanh \\([-1,1]\\); discriminador D con Flatten,
  dos Dense LeakyReLU y sigmoid.
- **Entrenamiento adversarial alternado**: actualizar D con imágenes reales/falsas
  (etiquetas 1/0), actualizar G después con pérdida no saturante. Optimizadores
  Adam independientes (beta1 0,5) y actualización de variables separadas.
- CSV gris 8×8 / 28×28 limitado a 2 000 muestras en memoria. Las imágenes
  del importador ya están en [0,255] y se normalizan a [-1,1] por minibatch.
  No se usan etiquetas \`label\` del CSV, ni test/accuracy supervisados.
- Métricas reales por época: pérdida binaria de D, pérdida de G, medias de
  D(real) y D(falso). Las pérdidas GAN **no equivalen** a calidad visual ni a
  métricas de clasificación; el CSV de demostración es sintético.
- Worker dedicado (CPU) con fallback al hilo principal **solo si el Worker falla
  antes de iniciar entrenamiento**. Progreso por minibatch y cancelación
  cooperativa confirmada; estado y tensores se liberan al finalizar.
- Solo miembros Ingeniero en proyecto activo pueden importar, configurar y
  entrenar. Al cambiar CSV, arquitectura, proyecto o usuario se cancela/descarta
  cualquier entrenamiento previo. El resto conserva lectura.
- GAN-2 **no conserva pesos para generar imágenes** después de entrenar; GAN-3
  añadirá inferencia visual y evaluación. GAN-4 incorporará persistencia en
  Supabase y versiones de modelos. No se crean migraciones, RPC ni datos remotos.

### Validación GAN-2

\`\`\`bash
node --experimental-strip-types --test tests/gan1.*.test.mjs tests/gan2.training-data.test.mjs tests/gan2.contract.test.mjs
node --experimental-strip-types --test tests/gan2.runtime.test.mjs
npm run typecheck
npm run build
npm run dev
\`\`\`

Como Ingeniero, importar \`tests/fixtures/gan1_imagenes_demo.csv\` (120 imágenes),
seleccionar G/D predeterminados y entrenar con 2 épocas, batch 16,
learning rate 0.0002. Verificar pérdidas G/D finitas, progreso 100%, backend
cpu / worker, y reentrenar con 5 épocas para comprobar cancelación cooperativa.
Comprobar que cambiar arquitectura o CSV invalida las métricas antiguas; en
Revisor/Lector se muestran las pestañas sin habilitar entrenamiento.
<!-- GAN2_FIN -->
`

const previous = readFileSync(path, 'utf8')
if (previous.includes(heading)) console.log('GAN-2 ya documentada: no se duplica la sección.')
else {
  writeFileSync(path, previous.trimEnd() + section + '\n')
  console.log('GAN-2 añadida a FASE_7_ARQUITECTURAS.md sin sobrescribir CNN/RNN/GAN-1.')
}
