/** GAN-1: contrato matemático de una GAN densa no condicional para imágenes en gris.
 * Describe dimensiones y parámetros; NO instancia ni entrena redes todavía.
 */
export type GanDimension = 8 | 28
export type GanLatentDimension = 16 | 32 | 64
export type GanHiddenUnits = 32 | 64 | 128

export interface GanConfig {
  latentSize: GanLatentDimension
  generatorUnits: GanHiddenUnits
  discriminatorUnits: GanHiddenUnits
}

export interface GanLayerDescription {
  id: string
  name: string
  shape: string
  parameters: number
  description: string
}

export interface GanNetworkDescription {
  layers: GanLayerDescription[]
  totalParameters: number
}

export interface GanArchitectureDescription {
  generator: GanNetworkDescription
  discriminator: GanNetworkDescription
  totalParameters: number
  imagePixels: number
  errors: string[]
}

export const DEFAULT_GAN_CONFIG: GanConfig = {
  latentSize: 32,
  generatorUnits: 64,
  discriminatorUnits: 64,
}

/** Dense(in,out) = in*out + out parámetros, incluidos los sesgos. */
export function denseParameters(inputs: number, outputs: number): number {
  if (![inputs, outputs].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new Error('Las dimensiones Dense deben ser enteros positivos.')
  }
  return (inputs + 1) * outputs
}

export function describeGan(config: GanConfig, dimension: GanDimension): GanArchitectureDescription {
  const errors: string[] = []
  if (![8, 28].includes(dimension)) errors.push('Solo se admiten imágenes de 8×8 o 28×28.')
  if (![16, 32, 64].includes(config.latentSize)) errors.push('El vector latente debe contener 16, 32 o 64 valores.')
  if (![32, 64, 128].includes(config.generatorUnits)) errors.push('Unidades del generador fuera de rango.')
  if (![32, 64, 128].includes(config.discriminatorUnits)) errors.push('Unidades del discriminador fuera de rango.')
  const empty = (): GanNetworkDescription => ({ layers: [], totalParameters: 0 })
  if (errors.length) return { generator: empty(), discriminator: empty(), totalParameters: 0, imagePixels: 0, errors }

  const pixels = dimension * dimension
  const g1 = config.generatorUnits
  const g2 = config.generatorUnits
  const d1 = config.discriminatorUnits
  const d2 = Math.max(16, Math.floor(d1 / 2))
  const generatorLayers: GanLayerDescription[] = [
    { id: 'noise', name: 'Ruido latente z', shape: `[${config.latentSize}]`, parameters: 0, description: 'Entrada aleatoria; distribución normal en GAN-2.' },
    { id: 'gen-dense-1', name: 'Dense G1 · LeakyReLU', shape: `[${g1}]`, parameters: denseParameters(config.latentSize, g1), description: 'Primera transformación del generador.' },
    { id: 'gen-dense-2', name: 'Dense G2 · LeakyReLU', shape: `[${g2}]`, parameters: denseParameters(g1, g2), description: 'Segunda transformación del generador.' },
    { id: 'gen-output', name: 'Dense salida · tanh', shape: `[${dimension}, ${dimension}, 1]`, parameters: denseParameters(g2, pixels), description: 'Imagen sintética en escala [-1, 1], que se mostrará tras entrenar.' },
  ]
  const discriminatorLayers: GanLayerDescription[] = [
    { id: 'image', name: 'Imagen real o generada', shape: `[${dimension}, ${dimension}, 1]`, parameters: 0, description: 'Tensor de píxeles normalizado a [-1, 1].' },
    { id: 'disc-flatten', name: 'Flatten', shape: `[${pixels}]`, parameters: 0, description: 'Convierte la imagen en un vector.' },
    { id: 'disc-dense-1', name: 'Dense D1 · LeakyReLU', shape: `[${d1}]`, parameters: denseParameters(pixels, d1), description: 'Extractor de señales de autenticidad.' },
    { id: 'disc-dense-2', name: 'Dense D2 · LeakyReLU', shape: `[${d2}]`, parameters: denseParameters(d1, d2), description: 'Segunda transformación del discriminador.' },
    { id: 'disc-output', name: 'Dense salida · sigmoid', shape: '[1]', parameters: denseParameters(d2, 1), description: 'Probabilidad estimada de imagen real.' },
  ]
  const generator = { layers: generatorLayers, totalParameters: generatorLayers.reduce((sum, layer) => sum + layer.parameters, 0) }
  const discriminator = { layers: discriminatorLayers, totalParameters: discriminatorLayers.reduce((sum, layer) => sum + layer.parameters, 0) }
  const totalParameters = generator.totalParameters + discriminator.totalParameters
  if (totalParameters > 500_000) errors.push('La configuración supera 500 000 parámetros y no se habilitará para entrenamiento local.')
  return { generator, discriminator, totalParameters, imagePixels: pixels, errors }
}
