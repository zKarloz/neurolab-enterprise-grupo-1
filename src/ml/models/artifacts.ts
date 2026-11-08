import * as tf from '@tensorflow/tfjs'
import { MAX_MODEL_JSON_BYTES, MAX_MODEL_WEIGHTS_BYTES, parseModelJson } from './manifest.ts'
import type { StoredModelJSON } from './manifest.ts'

/** Transferencia estructurada entre Worker/React; nunca contiene filas del CSV. */
export interface ModelArtifactBundle { modelJson: string; weightData: ArrayBuffer }

export { parseModelJson, MAX_MODEL_JSON_BYTES, MAX_MODEL_WEIGHTS_BYTES } from './manifest.ts'

/** Serializa los pesos entrenados mediante el IOHandler oficial de TensorFlow.js. */
export async function serializeDenseModel(model: tf.LayersModel): Promise<ModelArtifactBundle> {
  const bundles: ModelArtifactBundle[] = []
  await model.save(tf.io.withSaveHandler(async (artifacts) => {
    if (!artifacts.modelTopology || artifacts.modelTopology instanceof ArrayBuffer || !artifacts.weightSpecs || !(artifacts.weightData instanceof ArrayBuffer)) {
      throw new Error('TensorFlow.js no entregó topología y pesos compatibles.')
    }
    const modelJson = JSON.stringify({
      modelTopology: artifacts.modelTopology,
      format: artifacts.format,
      generatedBy: artifacts.generatedBy,
      convertedBy: artifacts.convertedBy,
      weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }],
    } satisfies StoredModelJSON)
    const size = new TextEncoder().encode(modelJson).byteLength
    if (size < 1 || size > MAX_MODEL_JSON_BYTES || artifacts.weightData.byteLength < 1 || artifacts.weightData.byteLength > MAX_MODEL_WEIGHTS_BYTES) {
      throw new Error('El modelo supera los límites permitidos para Storage.')
    }
    bundles.push({ modelJson, weightData: artifacts.weightData.slice(0) })
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON',
      modelTopologyBytes: size, weightDataBytes: artifacts.weightData.byteLength } }
  }), { includeOptimizer: false })
  const bundle = bundles[0]
  if (!bundle) throw new Error('TensorFlow.js no entregó el modelo serializado.')
  return bundle
}

/** Reconstrucción local para inferencia, sin CSV original y con limpieza explícita. */
export async function loadDensePredictor(bundle: ModelArtifactBundle): Promise<{
  predict: (features: number[]) => Promise<number>; dispose: () => void
}> {
  const json = parseModelJson(bundle.modelJson, bundle.weightData)
  await tf.ready()
  const model = await tf.loadLayersModel({
    load: async () => ({
      modelTopology: json.modelTopology, weightSpecs: json.weightsManifest[0].weights,
      weightData: bundle.weightData,
    }),
  })
  let disposed = false
  return {
    predict: async (features) => {
      if (disposed || !features.length || features.some((x) => !Number.isFinite(x))) throw new Error('Entrada inválida o modelo liberado.')
      const output = tf.tidy(() => {
        const input = tf.tensor2d(features, [1, features.length])
        const result = model.predict(input)
        if (Array.isArray(result)) throw new Error('El modelo produjo múltiples salidas.')
        return result
      })
      try {
        const value = Number((await output.data())[0])
        if (!Number.isFinite(value)) throw new Error('Predicción no finita.')
        return value
      } finally { output.dispose() }
    },
    dispose: () => { if (!disposed) { disposed = true; model.dispose() } },
  }
}
