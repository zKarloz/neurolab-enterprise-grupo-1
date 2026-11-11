/**
 * Contrato verificable de CNN-4C: la versión solo almacena configuración de
 * preprocesamiento y etiquetas, nunca imágenes ni ejemplos individuales.
 * El mismo manifiesto se vincula a la ejecución confirmada en CNN-4B.
 */
import * as tf from '@tensorflow/tfjs'
import type { ModelArtifactBundle } from '../models/artifacts.ts'
import { parseModelJson } from '../models/manifest.ts'
import type { CnnInputShape } from './architecture.ts'

export interface CnnPreprocessingManifest {
  family: 'cnn'
  kind: 'cnn_image_csv_v1'
  width: 8 | 28
  height: 8 | 28
  channels: 1
  classNames: string[]
  normalization: 'divide_by_255'
  seed: number
  sampleCount: number
  split: { strategy: 'stratified_70_15_15_v1'; trainCount: number; validationCount: number; testCount: number }
}

/**
 * Valida datos recibidos de Storage/PostgreSQL antes de crear tensores.
 * Rechaza manifiestos incompletos, de otra familia y formatos futuros aún no admitidos.
 */
export function parseCnnPreprocessingManifest(value: unknown): CnnPreprocessingManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Manifiesto CNN ausente.')
  const manifest = value as Record<string, unknown>
  const classNames = manifest.classNames
  const split = manifest.split as Record<string, unknown> | null
  const width = manifest.width
  const height = manifest.height
  if (manifest.family !== 'cnn' || manifest.kind !== 'cnn_image_csv_v1' ||
      !([8, 28].includes(width as number)) || width !== height || manifest.channels !== 1 ||
      manifest.normalization !== 'divide_by_255' || !Array.isArray(classNames) ||
      classNames.length < 2 || classNames.length > 10 ||
      classNames.some((label) => typeof label !== 'string' || !label.length || label.length > 80) ||
      new Set(classNames).size !== classNames.length ||
      !Number.isInteger(manifest.seed) || !Number.isInteger(manifest.sampleCount) ||
      (manifest.sampleCount as number) < 100 || (manifest.sampleCount as number) > 2000 ||
      !split || typeof split !== 'object' || split.strategy !== 'stratified_70_15_15_v1' ||
      ![split.trainCount, split.validationCount, split.testCount].every((n) => Number.isInteger(n) && (n as number) > 0) ||
      (split.trainCount as number) + (split.validationCount as number) + (split.testCount as number) !== manifest.sampleCount) {
    throw new Error('Manifiesto de preprocesamiento CNN incompatible o incompleto.')
  }
  return value as CnnPreprocessingManifest
}

export function isCnnManifest(value: unknown): value is CnnPreprocessingManifest {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    (value as { family?: unknown }).family === 'cnn'
}

/** Modelo restaurado exclusivamente en el navegador, sin CSV ni servidor ML. */
export async function loadCnnPredictor(bundle: ModelArtifactBundle, rawManifest: unknown): Promise<{
  input: CnnInputShape
  classNames: string[]
  predict: (pixels: Uint8Array) => Promise<number[]>
  dispose: () => void
}> {
  const manifest = parseCnnPreprocessingManifest(rawManifest)
  const json = parseModelJson(bundle.modelJson, bundle.weightData)
  await tf.ready()
  const model = await tf.loadLayersModel({
    load: async () => ({
      modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights,
      weightData: bundle.weightData,
    }),
  })
  const input = { width: manifest.width, height: manifest.height, channels: 1, classes: manifest.classNames.length }
  const inShape = model.inputs[0]?.shape
  const outShape = model.outputs[0]?.shape
  // No confiar en el manifiesto declarado si el artefacto tiene otra topología.
  if (!inShape || inShape.length !== 4 || inShape[1] !== input.height ||
      inShape[2] !== input.width || inShape[3] !== input.channels ||
      !outShape || outShape.length !== 2 || outShape[1] !== input.classes) {
    model.dispose()
    throw new Error('Las dimensiones de los pesos CNN no coinciden con el manifiesto registrado.')
  }
  let disposed = false
  return {
    input,
    classNames: [...manifest.classNames],
    predict: async (pixels) => {
      const count = input.width * input.height
      if (disposed || !(pixels instanceof Uint8Array) || pixels.length !== count) {
        throw new Error('La CNN ya fue liberada o la imagen no tiene dimensiones válidas.')
      }
      const data = Float32Array.from(pixels, (pixel) => pixel / 255)
      const tensor = tf.tensor4d(data, [1, input.height, input.width, 1])
      let output: tf.Tensor | null = null
      try {
        const result = model.predict(tensor)
        if (Array.isArray(result)) throw new Error('El modelo CNN devolvió múltiples salidas.')
        output = result as tf.Tensor
        const values = Array.from(await output.data()) as number[]
        if (values.length !== input.classes || values.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) {
          throw new Error('Las probabilidades CNN restauradas no son válidas.')
        }
        return values
      } finally { tensor.dispose(); output?.dispose() }
    },
    dispose: () => { if (!disposed) { disposed = true; model.dispose() } },
  }
}
