import type { io } from '@tensorflow/tfjs'

/** Formato esperado de TensorFlow.js Layers. Solo manifest relativo a weights.bin. */
export interface StoredModelJSON {
  modelTopology: object
  format?: string
  generatedBy?: string
  convertedBy?: string | null
  weightsManifest: Array<{ paths: string[]; weights: io.WeightsManifestEntry[] }>
}

export const MAX_MODEL_JSON_BYTES = 1024 * 1024
export const MAX_MODEL_WEIGHTS_BYTES = 10 * 1024 * 1024

/** Comprobación pura, independiente del backend TensorFlow.js y apta para tests rápidos. */
export function parseModelJson(text: string, weightData: ArrayBuffer): StoredModelJSON {
  const bytes = new TextEncoder().encode(text).byteLength
  if (bytes < 1 || bytes > MAX_MODEL_JSON_BYTES || !weightData.byteLength || weightData.byteLength > MAX_MODEL_WEIGHTS_BYTES) {
    throw new Error('El artefacto excede los límites o está vacío.')
  }
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('model.json no es un objeto válido.')
  const json = parsed as Partial<StoredModelJSON>
  const entry = json.weightsManifest?.[0]
  if (!json.modelTopology || typeof json.modelTopology !== 'object' || Array.isArray(json.modelTopology) ||
      !Array.isArray(json.weightsManifest) || json.weightsManifest.length !== 1 ||
      !entry || !Array.isArray(entry.paths) || entry.paths.length !== 1 || entry.paths[0] !== 'weights.bin' ||
      !Array.isArray(entry.weights) || entry.weights.length === 0 ||
      entry.weights.some((weight) => typeof weight?.name !== 'string' || !Array.isArray(weight.shape) ||
        !weight.shape.every((dimension) => Number.isSafeInteger(dimension) && dimension >= 0) ||
        !['float32', 'int32', 'bool', 'string', 'complex64'].includes(weight.dtype))) {
    throw new Error('El manifiesto de pesos no es compatible con NeuroLab.')
  }
  return json as StoredModelJSON
}
