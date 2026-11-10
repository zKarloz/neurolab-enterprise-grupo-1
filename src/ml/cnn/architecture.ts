/**
 * NeuroLab CNN-1: cálculo puro de shapes y parámetros; no crea tensores ni entrena.
 * Las formas siguen las convenciones channelsLast de TensorFlow.js.
 */
export type Padding = 'same' | 'valid'
export type Filters = 8 | 16 | 32 | 64
export type Kernel = 3 | 5
export type DenseUnits = 32 | 64 | 128
export type CnnLayerKind = 'input' | 'conv2d' | 'pool' | 'flatten' | 'dense' | 'output'

export interface CnnBlockConfig {
  id: string
  filters: Filters
  kernel: Kernel
  padding: Padding
  pool: boolean
}

export interface CnnConfig {
  blocks: CnnBlockConfig[]
  denseUnits: DenseUnits
}

export interface CnnLayerDescription {
  id: string
  kind: CnnLayerKind
  name: string
  shape: string
  details: string
  parameters: number
}

export interface CnnDiagram {
  layers: CnnLayerDescription[]
  parameterCount: number
  errors: string[]
}

export const MNIST_INPUT = { width: 28, height: 28, channels: 1, classes: 10 } as const

export function defaultCnnConfig(): CnnConfig {
  return {
    blocks: [
      { id: 'block-1', filters: 16, kernel: 3, padding: 'same', pool: true },
      { id: 'block-2', filters: 32, kernel: 3, padding: 'same', pool: true },
    ],
    denseUnits: 64,
  }
}

/** Mantiene el ID del bloque al cambiar la cantidad de bloques (hasta tres). */
export function resizeCnnBlocks(config: CnnConfig, count: number): CnnConfig {
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error('Se permiten entre 1 y 3 bloques CNN.')
  const blocks = [...config.blocks]
  while (blocks.length < count) {
    const index = blocks.length + 1
    blocks.push({ id: `block-${index}`, filters: index === 1 ? 16 : index === 2 ? 32 : 64, kernel: 3, padding: 'same', pool: true })
  }
  return { ...config, blocks: blocks.slice(0, count) }
}

const isFilters = (value: number) => [8, 16, 32, 64].includes(value)
const isDenseUnits = (value: number) => [32, 64, 128].includes(value)

/**
 * Calcula tamaños y parámetros. Valida antes de ofrecer una configuración a CNN-2.
 * TensorFlow.js Conv2D: same => ceil(dim/stride), valid => dim-kernel+1 (stride=1).
 * MaxPooling2D 2x2 con stride=2 y padding=valid => floor(dim/2).
 */
export function describeCnn(config: CnnConfig, input: { width: number; height: number; channels: number; classes: number } = MNIST_INPUT): CnnDiagram {
  const errors: string[] = []
  const layers: CnnLayerDescription[] = []
  let parameters = 0
  let width = input.width
  let height = input.height
  let channels = input.channels
  const classes = input.classes
  const shape = () => `${height} × ${width} × ${channels}`

  if (![width, height, channels, classes].every((v) => Number.isInteger(v) && v > 0)) {
    return { layers: [], parameterCount: 0, errors: ['Las dimensiones de entrada y las clases deben ser enteros positivos.'] }
  }
  if (!Array.isArray(config.blocks) || config.blocks.length < 1 || config.blocks.length > 3) {
    return { layers: [], parameterCount: 0, errors: ['Configura de 1 a 3 bloques convolucionales.'] }
  }
  if (!isDenseUnits(config.denseUnits)) errors.push('La capa densa debe tener 32, 64 o 128 neuronas.')
  layers.push({ id: 'input', kind: 'input', name: 'Entrada', shape: shape(), details: 'Imagen normalizada', parameters: 0 })
  for (const [index, block] of config.blocks.entries()) {
    if (!isFilters(block.filters) || ![3, 5].includes(block.kernel) || !['same', 'valid'].includes(block.padding) || typeof block.pool !== 'boolean') {
      errors.push(`Bloque ${index + 1}: configuración no admitida.`)
      break
    }
    const nextWidth = block.padding === 'same' ? width : width - block.kernel + 1
    const nextHeight = block.padding === 'same' ? height : height - block.kernel + 1
    if (nextWidth < 1 || nextHeight < 1) {
      errors.push(`Bloque ${index + 1}: el kernel supera las dimensiones disponibles.`)
      break
    }
    const convParameters = (block.kernel * block.kernel * channels + 1) * block.filters
    parameters += convParameters
    channels = block.filters
    width = nextWidth
    height = nextHeight
    layers.push({ id: `${block.id}-conv`, kind: 'conv2d', name: `Conv2D ${index + 1}`, shape: shape(), details: `${block.filters} filtros · ${block.kernel}×${block.kernel} · ${block.padding}`, parameters: convParameters })
    if (block.pool) {
      width = Math.floor(width / 2)
      height = Math.floor(height / 2)
      if (width < 1 || height < 1) {
        errors.push(`Bloque ${index + 1}: MaxPool 2×2 no cabe en el mapa de características.`)
        break
      }
      layers.push({ id: `${block.id}-pool`, kind: 'pool', name: `MaxPool ${index + 1}`, shape: shape(), details: '2×2 · stride 2', parameters: 0 })
    }
  }
  if (errors.length) return { layers, parameterCount: parameters, errors }
  const flattened = width * height * channels
  layers.push({ id: 'flatten', kind: 'flatten', name: 'Flatten', shape: String(flattened), details: 'Conversión a vector', parameters: 0 })
  if (isDenseUnits(config.denseUnits)) {
    const denseParameters = (flattened + 1) * config.denseUnits
    parameters += denseParameters
    layers.push({ id: 'dense', kind: 'dense', name: 'Dense', shape: `${config.denseUnits}`, details: 'ReLU', parameters: denseParameters })
    const outputParameters = (config.denseUnits + 1) * classes
    parameters += outputParameters
    layers.push({ id: 'output', kind: 'output', name: 'Salida', shape: `${classes} clases`, details: 'Softmax', parameters: outputParameters })
  }
  if (parameters > 2_000_000) errors.push('Esta arquitectura supera los 2 millones de parámetros; reduce filtros o utiliza pooling para el navegador.')
  return { layers, parameterCount: parameters, errors }
}
