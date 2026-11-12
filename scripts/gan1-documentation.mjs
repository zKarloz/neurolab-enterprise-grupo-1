/** GAN-1: incorporar sección al Markdown de Fase 7 sin sobrescribir los cierres de CNN/RNN. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const heading = '## GAN-1 — Datos de imágenes y diseñador de generador/discriminador'
const content = `

<!-- GAN1_INICIO -->
${heading}

**Estado:** preparada para validación de integración en NeuroLab.

- Arquitectura **GAN densa no condicional** (generador + discriminador), diseñada
  para imágenes reales **8×8 o 28×28 en gris**. No hay entrenamiento en GAN-1.
- Generador: ruido latente (16/32/64) → dos Dense con LeakyReLU → Dense tanh
  con salida \`[alto, ancho, 1]\` de valores en [-1,1].
- Discriminador: imagen normalizada → Flatten → dos Dense con LeakyReLU →
  sigmoid de autenticidad. Los parámetros Dense incluyen sesgos.
- Datos: CSV local de 64/784 píxeles numéricos (0–255), con columna
  \`label\` opcional (se ignora), mínimo 100 imágenes, máximo 2 000 retenidas,
  archivo limitado a 200 MB; vista previa muestra imágenes **reales**.
- Para imágenes Digits 8×8 con valores hasta 16 se reescala a 0–255.
  GAN-2 normalizará desde el dataset validado a [-1,1] para la salida tanh.
- Permisos: lectura para miembros explícitos; solo el Ingeniero en proyecto
  activo importa datos y modifica el diseñador. El administrador global
  sin membresía no obtiene acceso técnico.
- Sin SQL, RPC, nuevas políticas RLS, almacenamiento remoto, pesos, inferencia
  ni imágenes artificiales en GAN-1. El dataset no sale del navegador.
- Entrenamiento adversarial real (Worker, optimizadores separados, pérdidas G/D
  y cancelación) se implementará en **GAN-2**. Muestras generadas y evaluación
  en **GAN-3**; persistencia y versiones en **GAN-4**; auditoría y cierre en **GAN-5**.

### Validación GAN-1

\`\`\`bash
node --experimental-strip-types --test tests/gan1.*.test.mjs
npm run typecheck
npm run build
npm run dev
\`\`\`

En un proyecto activo con cuenta Ingeniero: abrir **GAN** desde la tarjeta,
importar \`tests/fixtures/gan1_imagenes_demo.csv\` (120 filas de prueba sintéticas,
no un dataset real para medir calidad), comprobar 8×8, vista previa,
constructor con dos diagramas y actualización de parámetros. Rechazar CSV
inválido; comprobar vista de solo lectura con rol Revisor/Lector y ausencia
completa de generación o métricas ficticias. Comprobar Feedforward/CNN/RNN.
<!-- GAN1_FIN -->
`

const previous = readFileSync(path, 'utf8')
if (previous.includes(heading)) console.log('GAN-1 ya documentada: no se duplica la sección.')
else {
  writeFileSync(path, previous.trimEnd() + content + '\n')
  console.log('GAN-1 añadida a FASE_7_ARQUITECTURAS.md sin sobrescribir CNN/RNN.')
}
