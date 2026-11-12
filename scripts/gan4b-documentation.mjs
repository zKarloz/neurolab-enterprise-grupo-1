/** Agregar GAN-4B al documento consolidado sin reescribir CNN ni RNN. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const heading = '## GAN-4B — Persistencia de entrenamiento adversarial y resumen descriptivo'
const section = `

<!-- GAN4B_INICIO -->
${heading}

**Estado:** código preparado. La persistencia real solo se valida tras una ejecución autenticada de Supabase y confirmación SQL del run GAN.

- Se reusan las RPC creadas por migración 016: \`create_gan_training_run\`, \`record_gan_training_epoch\` y \`record_gan_generation_summary\`, además de \`set_training_runtime\` y \`finish_training_run\`. **No hay migración 017 en GAN-4B**.
- El CSV se analiza localmente. Antes de iniciar TF.js se calcula SHA-256 del **archivo completo**, se valida el manifiesto y se registra un run. Se envían nombre, tamaño, hash, número de imágenes, dimensión, arquitectura e hiperparámetros; **nunca bytes de CSV, píxeles, imágenes o pesos**.
- Una cola serializa confirmación de backend, cuatro métricas reales por época (generator_loss, discriminator_loss, d_real, d_fake) y cierre remoto (completed, failed, cancelled o interrupted). Cada época se confirma antes de la siguiente escritura. No se muestran confirmaciones falsas cuando falla una RPC, ni se reintentan escrituras no idempotentes.
- Solo después del estado remoto completed, el primer lote de 4/8/16 imágenes generadas puede guardar un **resumen descriptivo** (brillo, distancia media, mínimo y máximo), no las imágenes. La RPC 016 admite un único resumen por run. Fallas en el resumen no revierten una ejecución ya completada.
- Se conserva la generación local y PNG; la interfaz muestra el UUID, épocas confirmadas y estado de sincronización. Cambiar archivo, arquitectura, opciones, proyecto o usuario cancela la sesión local y aplica un cierre interrupted de mejor esfuerzo si corresponde.
- Los resultados guardados proceden del navegador: PostgreSQL aplica validaciones de forma y permisos, pero no demuestra por sí solo la autenticidad matemática del entrenamiento.

### Comprobación GAN-4B

\`\`\`bash
node --experimental-strip-types --test tests/gan4b.*.test.mjs
npm run typecheck
npm run build
\`\`\`

Entrenar un dataset local válido con 2 épocas, batch 16 y 0.0002. Verificar: run UUID, 2/2 épocas confirmadas, 8 filas de métricas, estado completed. Generar 8 imágenes y confirmar un único resumen de 8 muestras. La consulta \`supabase/tests/FASE_7_GAN4B_VERIFICACION.sql\` retorna una sola tabla; \`entrenamiento_consistente = true\`, \`resumenes_generacion = 1\`, \`resumen_solo_agregados = true\`. La consulta es solo lectura. No volver a ejecutar la migración 016.

**Próximo:** GAN-4C guardará el generador y lo restaurará desde modelos privados.
<!-- GAN4B_FIN -->
`
const previous = readFileSync(path, 'utf8')
if (previous.includes(heading)) console.log('GAN-4B ya documentada: no se duplica la sección.')
else {
  writeFileSync(path, previous.trimEnd() + section + '\n')
  console.log('GAN-4B añadida al documento consolidado sin sobrescribir las fases anteriores.')
}
