/** GAN-3: añadir la sección al Markdown de Fase 7 sin sobrescribir las previas. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const heading = '## GAN-3 — Generación local y evaluación descriptiva de muestras'
const section = `

<!-- GAN3_INICIO -->
${heading}

**Estado:** implementación preparada; validar el test CPU de generación y el build en VSCode antes de cerrar GAN-3.

- Tras completar el entrenamiento adversarial de GAN-2, **se conserva únicamente el generador entrenado G** en la sesión local del Worker (o fallback principal); el discriminador y ambos optimizadores se liberan. La cancelación y los errores descartan todos los modelos.
- El generador recibe **ruido normal nuevo** por solicitud y crea 4, 8 o 16 imágenes sintéticas en gris de 8×8 o 28×28. La salida de tanh se transforma de [-1,1] a bytes [0,255]. No se sustituye por muestras reales ni predicciones prefabricadas.
- Vista en cuadrícula y descarga **PNG local** de muestras individuales, usando el componente reutilizado de lienzo gris para ejemplos reales y generados.
- Diagnósticos descriptivos basados en píxeles: brillo medio, rango de intensidad y diferencia absoluta media entre pares. **No** son FID, Inception Score, clasificación ni prueba de realismo. Es necesaria evaluación humana y datasets adecuados para valorar la calidad.
- El Worker transfiere únicamente los bytes de salida y correlaciona peticiones mediante requestId. Si el Worker falla tras entrenar, **no se reinicia el entrenamiento automáticamente** ni se inventan los pesos.
- Cambiar CSV, arquitectura, opciones, proyecto o usuario, o desmontar la pantalla, libera G e invalida muestras y respuestas pendientes. Cambiar de pestaña conserva la sesión mientras el módulo permanezca montado.
- En GAN-3 **no hay persistencia ni RPC**: ningún dato del CSV, modelo, imagen generada o métrica viaja a Supabase. GAN-4 abordará persistencia de ejecuciones, versiones y consulta histórica.

### Validación GAN-3

\`\`\`bash
node --experimental-strip-types --test tests/gan1.*.test.mjs tests/gan2.contract.test.mjs tests/gan2.training-data.test.mjs tests/gan3.generation.test.mjs tests/gan3.contract.test.mjs
node --experimental-strip-types --test tests/gan2.runtime.test.mjs tests/gan3.runtime.test.mjs
npm run typecheck
npm run build
npm run dev
\`\`\`

Como Ingeniero: cargar el CSV de 120 imágenes 8×8, entrenar dos épocas, abrir **Generar**, producir 4 y después 8 imágenes y descargar un PNG. Comprobar que dos generaciones son distintas, que el componente muestra los diagnósticos sin confundirlos con calidad, y que cambiar arquitectura/CSV deshabilita la generación hasta reentrenar. Comprobar cancelación en cinco épocas y que no permite generar. Feedforward, CNN y RNN deben permanecer funcionales.
<!-- GAN3_FIN -->
`
const previous = readFileSync(path, 'utf8')
if (previous.includes(heading)) console.log('GAN-3 ya documentada: no se duplica la sección.')
else {
  writeFileSync(path, previous.trimEnd() + section + '\n')
  console.log('GAN-3 añadida a FASE_7_ARQUITECTURAS.md sin sobrescribir las secciones previas.')
}
