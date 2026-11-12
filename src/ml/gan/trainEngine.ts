/** GAN-3: entrenamiento adversarial REAL y conservación local del generador.
 * Se actualiza D con reales/falsos y G por separado. Tras completar la sesión,
 * se libera D, pero G puede producir nuevas imágenes sin usar Supabase.
 */
import * as tf from '@tensorflow/tfjs'
import { serializeDenseModel, type ModelArtifactBundle } from '../models/artifacts.ts'
import { describeGan, type GanConfig, type GanDimension } from './architecture.ts'
import type { GanImageDataset } from './imageDataset.ts'
import { makeGanRealBatch, shuffledGanIndices, validateGanTrainingData } from './trainingData.ts'
import { validateGanEpochMetrics, validateGanTrainOptions, type GanTrainOptions, type GanTrainingEvent } from './trainingTypes.ts'
import { validateGanSampleCount, type GanGeneratedBatch, type GanSampleCount } from './generation.ts'

const EPSILON = 1e-7

/** Crea redes Dense/LeakyReLU con la misma forma y cantidad de pesos del diseñador GAN-1. */
export function buildGanModels(config: GanConfig, dimension: GanDimension): { generator: tf.Sequential; discriminator: tf.Sequential } {
  const description = describeGan(config, dimension)
  if (description.errors.length) throw new Error(description.errors.join(' '))
  const generator = tf.sequential()
  const discriminator = tf.sequential()
  try {
    generator.add(tf.layers.dense({ units: config.generatorUnits, inputShape: [config.latentSize] }))
    generator.add(tf.layers.leakyReLU({ alpha: 0.2 }))
    generator.add(tf.layers.dense({ units: config.generatorUnits }))
    generator.add(tf.layers.leakyReLU({ alpha: 0.2 }))
    generator.add(tf.layers.dense({ units: dimension ** 2, activation: 'tanh' }))
    generator.add(tf.layers.reshape({ targetShape: [dimension, dimension, 1] }))

    discriminator.add(tf.layers.flatten({ inputShape: [dimension, dimension, 1] }))
    discriminator.add(tf.layers.dense({ units: config.discriminatorUnits }))
    discriminator.add(tf.layers.leakyReLU({ alpha: 0.2 }))
    discriminator.add(tf.layers.dense({ units: Math.max(16, Math.floor(config.discriminatorUnits / 2)) }))
    discriminator.add(tf.layers.leakyReLU({ alpha: 0.2 }))
    discriminator.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
    if (generator.countParams() !== description.generator.totalParameters ||
      discriminator.countParams() !== description.discriminator.totalParameters) {
      throw new Error('El número de pesos TF.js no coincide con el diseñador GAN-1.')
    }
    return { generator, discriminator }
  } catch (cause) { generator.dispose(); discriminator.dispose(); throw cause }
}

/** Pérdida binaria del discriminador: real=1 y falso=0, en términos de probabilidades. */
function discriminatorLoss(model: tf.Sequential, real: tf.Tensor4D, fake: tf.Tensor4D): tf.Scalar {
  const pReal = model.predict(real) as tf.Tensor
  const pFake = model.predict(fake) as tf.Tensor
  return tf.neg(tf.add(
    tf.mean(tf.log(tf.clipByValue(pReal, EPSILON, 1 - EPSILON))),
    tf.mean(tf.log(tf.clipByValue(tf.sub(1, pFake), EPSILON, 1 - EPSILON))),
  )) as tf.Scalar
}

/** Pérdida no saturante del generador: intenta que D(G(z)) se acerque a 1. */
function generatorLoss(generator: tf.Sequential, discriminator: tf.Sequential, batchSize: number, latentSize: number): tf.Scalar {
  const noise = tf.randomNormal([batchSize, latentSize])
  const fake = generator.predict(noise) as tf.Tensor4D
  const probabilities = discriminator.predict(fake) as tf.Tensor
  return tf.neg(tf.mean(tf.log(tf.clipByValue(probabilities, EPSILON, 1 - EPSILON)))) as tf.Scalar
}

/** Interfaz cerrada: solo permite generar; libera los pesos cuando termina la sesión. */
export interface TrainedGanGenerator {
  generate: (count: GanSampleCount) => Promise<GanGeneratedBatch>
  exportModel: () => Promise<ModelArtifactBundle>
  dispose: () => void
}

/** Usa el generador ENTRENADO y nuevo ruido normal en cada petición. */
export function retainGanGenerator(generator: tf.Sequential, dimension: GanDimension, latentSize: number): TrainedGanGenerator {
  if (![8, 28].includes(dimension) || ![16, 32, 64].includes(latentSize)) throw new Error('Forma GAN inválida para generar.')
  if (generator.outputs[0]?.shape.slice(1).join(',') !== `${dimension},${dimension},1`) {
    throw new Error('El generador no produce la resolución esperada.')
  }
  let disposed = false
  return {
    // Solo los pesos de G: D y sus optimizadores ya se liberaron.
    exportModel: async () => {
      if (disposed) throw new Error('El generador GAN fue liberado.')
      return serializeDenseModel(generator)
    },
    generate: async (count) => {
      if (disposed) throw new Error('El generador ya fue liberado. Vuelve a entrenar.')
      validateGanSampleCount(count)
      // tf.tidy descarta el ruido y temporales, pero conserva la salida hasta leerla.
      const output = tf.tidy(() => generator.predict(tf.randomNormal([count, latentSize])) as tf.Tensor4D)
      try {
        if (output.shape.join(',') !== `${count},${dimension},${dimension},1`) {
          throw new Error('Forma de salida GAN incompatible.')
        }
        const data = await output.data()
        const pixels = new Uint8Array(data.length)
        for (let index = 0; index < data.length; index++) {
          if (!Number.isFinite(data[index])) throw new Error('La generación contiene píxeles no finitos.')
          // Tanh [-1,1] -> intensidad [0,255]. Saturar errores de redondeo.
          pixels[index] = Math.round(Math.max(0, Math.min(255, (data[index] + 1) * 127.5)))
        }
        return { dimension, count, pixels }
      } finally { output.dispose() }
    },
    dispose: () => { if (!disposed) { disposed = true; generator.dispose() } },
  }
}

/** Ninguna métrica es ficticia: los valores salen de las actualizaciones TF.js de cada minibatch. */
export async function trainGanModel(
  dataset: GanImageDataset, config: GanConfig, options: GanTrainOptions,
  emit: (event: GanTrainingEvent) => void, cancelled: () => boolean,
  signal: AbortSignal, context: 'worker' | 'main',
  onTrained?: (runtime: TrainedGanGenerator) => void,
): Promise<void> {
  let generator: tf.Sequential | null = null
  let discriminator: tf.Sequential | null = null
  let generatorOptimizer: tf.Optimizer | null = null
  let discriminatorOptimizer: tf.Optimizer | null = null
  const startedAt = Date.now()
  let epochsCompleted = 0
  try {
    validateGanTrainOptions(options)
    validateGanTrainingData(dataset, config)
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
    await tf.setBackend('cpu') // Compatible con Worker: no depende de WebGL.
    await tf.ready()
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
    const backend = tf.getBackend()
    const built = buildGanModels(config, dataset.dimension)
    generator = built.generator
    discriminator = built.discriminator
    generatorOptimizer = tf.train.adam(options.learningRate, 0.5, 0.999)
    discriminatorOptimizer = tf.train.adam(options.learningRate, 0.5, 0.999)
    // read() es la API pública: devuelve la misma tf.Variable que utiliza cada capa.
    const generatorVariables = generator.trainableWeights.map((variable) => variable.read() as tf.Variable)
    const discriminatorVariables = discriminator.trainableWeights.map((variable) => variable.read() as tf.Variable)
    emit({ type: 'status', message: 'Entrenando generador y discriminador localmente…', backend,
      context, tfjsVersion: tf.version.tfjs, images: dataset.count })

    for (let epoch = 1; epoch <= options.epochs; epoch++) {
      const shuffled = shuffledGanIndices(dataset.count)
      const batches = Math.ceil(dataset.count / options.batchSize)
      let generatorTotal = 0
      let discriminatorTotal = 0
      let realTotal = 0
      let fakeTotal = 0
      let processed = 0
      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
        const positions = shuffled.slice(batchIndex * options.batchSize, (batchIndex + 1) * options.batchSize)
        const batchSize = positions.length
        const pixels = makeGanRealBatch(dataset, positions)
        const real = tf.tensor4d(pixels, [batchSize, dataset.dimension, dataset.dimension, 1])
        let fake: tf.Tensor4D | null = null
        try {
          // Imagen sintética temporal para D: G no se actualiza en este paso.
          fake = tf.tidy(() => generator!.predict(tf.randomNormal([batchSize, config.latentSize])) as tf.Tensor4D)
          const dCost = discriminatorOptimizer.minimize(
            () => tf.tidy(() => discriminatorLoss(discriminator!, real, fake!)), true, discriminatorVariables,
          )
          if (!dCost) throw new Error('No se obtuvo pérdida del discriminador.')
          try {
            const loss = (await dCost.data())[0]
            if (!Number.isFinite(loss)) throw new Error('Pérdida D no finita.')
            discriminatorTotal += loss * batchSize
          } finally { dCost.dispose() }
          if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
          // Actualizar SOLO G: los pesos de D actúan como función diferenciable fija.
          const gCost = generatorOptimizer.minimize(
            () => tf.tidy(() => generatorLoss(generator!, discriminator!, batchSize, config.latentSize)),
            true, generatorVariables,
          )
          if (!gCost) throw new Error('No se obtuvo pérdida del generador.')
          try {
            const loss = (await gCost.data())[0]
            if (!Number.isFinite(loss)) throw new Error('Pérdida G no finita.')
            generatorTotal += loss * batchSize
          } finally { gCost.dispose() }
          // Métricas diagnósticas: medias D(real) y D(fake), no accuracy ni calidad visual.
          const scores = tf.tidy(() => {
            const realScore = tf.mean(discriminator!.predict(real) as tf.Tensor)
            const fakeScore = tf.mean(discriminator!.predict(fake!) as tf.Tensor)
            return tf.stack([realScore, fakeScore])
          })
          try {
            const values = await scores.data()
            if (![values[0], values[1]].every(Number.isFinite)) throw new Error('Scores GAN no finitos.')
            realTotal += values[0] * batchSize
            fakeTotal += values[1] * batchSize
          } finally { scores.dispose() }
          processed += batchSize
        } finally { fake?.dispose(); real.dispose() }
        emit({ type: 'batch', epoch, batch: batchIndex + 1, batches, epochs: options.epochs })
        // Permite cancelar desde otro mensaje Worker/React entre minibatches.
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
      if (processed !== dataset.count) throw new Error('El recorrido del dataset GAN quedó incompleto.')
      const metrics = validateGanEpochMetrics({
        epoch,
        generatorLoss: generatorTotal / processed,
        discriminatorLoss: discriminatorTotal / processed,
        realScore: realTotal / processed,
        fakeScore: fakeTotal / processed,
      })
      epochsCompleted = epoch
      emit({ type: 'epoch', metrics })
    }
    if (onTrained) {
      // Entregar G antes del evento completed: evita carreras al pulsar Generar.
      const runtime = retainGanGenerator(generator, dataset.dimension, config.latentSize)
      onTrained(runtime)
      generator = null // La sesión es ahora propietaria de G; D/optimizadores se liberan.
    }
    emit({ type: 'completed', backend, epochsCompleted, durationMs: Date.now() - startedAt })
  } catch (cause) {
    if (cancelled() || signal.aborted) emit({ type: 'cancelled' })
    else emit({ type: 'error', message: cause instanceof Error ? cause.message : 'Entrenamiento GAN falló.' })
  } finally {
    generator?.dispose(); discriminator?.dispose()
    generatorOptimizer?.dispose(); discriminatorOptimizer?.dispose()
  }
}
