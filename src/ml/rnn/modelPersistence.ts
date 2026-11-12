/** RNN-4C: carga TensorFlow.js desde Storage privado, con dimensiones verificadas. */
import * as tf from '@tensorflow/tfjs'
import type { ModelArtifactBundle } from '../models/artifacts.ts'
import { parseModelJson } from '../models/manifest.ts'
import { parseRnnPreprocessingManifest, normalizeRnnRestoredWindow, decodeRnnRestoredOutput } from './modelManifest.ts'
import type { RnnPreprocessingManifest, RnnRestoredPrediction } from './modelManifest.ts'

// API público compartido por el registro de modelos y la tarjeta de inferencia.
export {
  parseRnnPreprocessingManifest, isRnnManifest,
  parseRnnManualWindow, normalizeRnnRestoredWindow, decodeRnnRestoredOutput,
} from './modelManifest.ts'
export type { RnnPreprocessingManifest, RnnRestoredPrediction } from './modelManifest.ts'

/** Modelo TensorFlow.js restaurado y verificado en navegador, sin usar servicios de predicción remotos. */
export async function loadRnnPredictor(bundle: ModelArtifactBundle, rawManifest: unknown): Promise<{
  manifest: RnnPreprocessingManifest
  predict: (window: number[][]) => Promise<RnnRestoredPrediction>
  dispose: () => void
}> {
  const manifest = parseRnnPreprocessingManifest(rawManifest)
  const json = parseModelJson(bundle.modelJson, bundle.weightData)
  await tf.ready()
  const model = await tf.loadLayersModel({
    load: async () => ({ modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights, weightData: bundle.weightData }),
  })
  const inputShape = model.inputs[0]?.shape
  const outputShape = model.outputs[0]?.shape
  const recurrentKind = model.layers[0]?.getClassName()
  const expectedOutput = manifest.problemType === 'multiclass' ? manifest.classNames.length : 1
  // No confiar solo en el manifiesto: comprobar la topología realmente descargada.
  if (!inputShape || inputShape.length !== 3 || inputShape[1] !== manifest.steps ||
    inputShape[2] !== manifest.features.length || !outputShape || outputShape.length !== 2 ||
    outputShape[1] !== expectedOutput || !['SimpleRNN', 'LSTM'].includes(recurrentKind ?? '')) {
    model.dispose()
    throw new Error('Dimensiones o familia de los pesos RNN incompatibles con el manifiesto.')
  }
  let disposed = false
  return {
    manifest,
    async predict(window) {
      if (disposed) throw new Error('El modelo RNN restaurado ya fue liberado.')
      const normalized = normalizeRnnRestoredWindow(window, manifest)
      const input = tf.tensor3d(normalized, [1, manifest.steps, manifest.features.length])
      let output: tf.Tensor | null = null
      try {
        const result = model.predict(input)
        if (Array.isArray(result)) throw new Error('El modelo RNN devolvió múltiples salidas.')
        output = result as tf.Tensor
        return decodeRnnRestoredOutput(await output.data(), manifest)
      } finally { input.dispose(); output?.dispose() }
    },
    dispose() { if (!disposed) { disposed = true; model.dispose() } },
  }
}
