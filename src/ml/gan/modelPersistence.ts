/** GAN-4C: restaura SOLO el generador desde el bucket privado de modelos. */
import * as tf from '@tensorflow/tfjs'
import type { ModelArtifactBundle } from '../models/artifacts.ts'
import { parseModelJson } from '../models/manifest.ts'
import { validateGanGeneratedBatch, validateGanSampleCount, type GanGeneratedBatch, type GanSampleCount } from './generation.ts'
import { parseGanPreprocessingManifest, type GanPreprocessingManifest } from './modelManifest.ts'
export { parseGanPreprocessingManifest, isGanManifest } from './modelManifest.ts'
export type { GanPreprocessingManifest } from './modelManifest.ts'

/** Comprobar topología descargada, no solo los metadatos declarados en PostgreSQL. */
function validateGeneratorShape(model: tf.LayersModel, manifest: GanPreprocessingManifest): void {
  const dimension = manifest.dimension
  const inputShape = model.inputs[0]?.shape
  const outputShape = model.outputs[0]?.shape
  const layers = model.layers
  const expectedTypes = ['Dense', 'LeakyReLU', 'Dense', 'LeakyReLU', 'Dense', 'Reshape']
  const first = layers[0]?.getConfig()
  const second = layers[2]?.getConfig()
  const output = layers[4]?.getConfig()
  const units = first?.units
  if (model.inputs.length !== 1 || model.outputs.length !== 1 ||
    !inputShape || inputShape.length !== 2 || inputShape[1] !== manifest.latentSize ||
    !outputShape || outputShape.length !== 4 || outputShape[1] !== dimension ||
    outputShape[2] !== dimension || outputShape[3] !== 1 ||
    layers.length !== expectedTypes.length || layers.some((layer, index) => layer.getClassName() !== expectedTypes[index]) ||
    ![32, 64, 128].includes(units as number) || units !== second?.units ||
    output?.units !== dimension ** 2 || output?.activation !== 'tanh' ||
    model.countParams() !== (manifest.latentSize + 1) * (units as number) +
      ((units as number) + 1) * (units as number) + ((units as number) + 1) * dimension ** 2) {
    throw new Error('La topología del generador GAN no coincide con su manifiesto.')
  }
}

/** Generar con ruido nuevo en cada petición. Nunca transmite las muestras al servidor. */
export async function loadGanGenerator(bundle: ModelArtifactBundle, rawManifest: unknown): Promise<{
  manifest: GanPreprocessingManifest
  generate: (count: GanSampleCount) => Promise<GanGeneratedBatch>
  dispose: () => void
}> {
  const manifest = parseGanPreprocessingManifest(rawManifest)
  const json = parseModelJson(bundle.modelJson, bundle.weightData)
  await tf.ready()
  const model = await tf.loadLayersModel({
    load: async () => ({ modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights, weightData: bundle.weightData }),
  })
  try { validateGeneratorShape(model, manifest) }
  catch (cause) { model.dispose(); throw cause }
  let disposed = false
  return {
    manifest,
    generate: async (count) => {
      if (disposed) throw new Error('El generador GAN restaurado ya fue liberado.')
      validateGanSampleCount(count)
      // TensorFlow.js conserva solo la salida hasta terminar de leer los datos.
      const output = tf.tidy(() => model.predict(tf.randomNormal([count, manifest.latentSize])) as tf.Tensor)
      try {
        if (output.shape.join(',') !== `${count},${manifest.dimension},${manifest.dimension},1`) {
          throw new Error('El generador GAN produjo una forma inesperada.')
        }
        const data = await output.data()
        const pixels = new Uint8Array(data.length)
        for (let index = 0; index < data.length; index++) {
          if (!Number.isFinite(data[index])) throw new Error('La generación restaurada contiene valores no finitos.')
          pixels[index] = Math.round(Math.min(255, Math.max(0, (data[index] + 1) * 127.5)))
        }
        const batch: GanGeneratedBatch = { dimension: manifest.dimension, count, pixels }
        validateGanGeneratedBatch(batch)
        return batch
      } finally { output.dispose() }
    },
    dispose: () => { if (!disposed) { disposed = true; model.dispose() } },
  }
}
