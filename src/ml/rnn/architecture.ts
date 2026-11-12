/** RNN-1: descripción matemática pura; no crea un modelo ni entrenamientos. */
export type RecurrentKind = 'simpleRNN' | 'lstm'
export type RecurrentUnits = 8 | 16 | 32 | 64
export type RnnProblemType = 'regression' | 'binary' | 'multiclass'

export interface RnnConfig {
  kind: RecurrentKind
  units: RecurrentUnits
  layers: 1 | 2
  denseUnits: 0 | 16 | 32
}

export interface RnnShape {
  steps: number
  features: number
  classes: number
  problemType: RnnProblemType
}

export interface RnnLayer {
  id: string
  label: string
  shape: string
  parameters: number
  details: string
}

export interface RnnDiagram {
  layers: RnnLayer[]
  parameterCount: number
  errors: string[]
}

export const DEFAULT_RNN_CONFIG: RnnConfig = {
  kind: 'lstm', units: 16, layers: 1, denseUnits: 16,
}

/** TF.js SimpleRNN: (inputs + units + bias) * units; LSTM: cuatro puertas. */
export function recurrentParameters(kind: RecurrentKind, inputs: number, units: number): number {
  return (kind === 'lstm' ? 4 : 1) * (inputs + units + 1) * units
}

export function describeRnn(config: RnnConfig, input: RnnShape): RnnDiagram {
  const errors: string[] = []
  const layers: RnnLayer[] = []
  const validShape = [input.steps, input.features, input.classes].every((value) => Number.isInteger(value) && value > 0)
  if (!validShape || input.steps > 32 || input.features > 16) errors.push('Entrada inválida: máximo 32 pasos y 16 variables, con dimensiones positivas.')
  if (!['simpleRNN', 'lstm'].includes(config.kind) || ![8, 16, 32, 64].includes(config.units) || ![1, 2].includes(config.layers) || ![0, 16, 32].includes(config.denseUnits)) {
    errors.push('Configuración recurrente fuera de los límites admitidos.')
  }
  if (!['binary', 'multiclass', 'regression'].includes(input.problemType)) errors.push('Tipo de problema no admitido.')
  if (input.problemType === 'regression' && input.classes !== 1) errors.push('La regresión requiere una sola salida.')
  if (input.problemType === 'binary' && input.classes !== 2) errors.push('La clasificación binaria requiere exactamente dos clases.')
  if (input.problemType === 'multiclass' && (input.classes < 3 || input.classes > 10)) errors.push('La multiclase admite entre 3 y 10 clases.')
  if (errors.length) return { layers, parameterCount: 0, errors }

  layers.push({ id: 'input', label: 'Entrada temporal', shape: `${input.steps} × ${input.features}`, parameters: 0, details: 'Tensor [batch, pasos, variables]' })
  let previousUnits = input.features
  let total = 0
  for (let i = 0; i < config.layers; i += 1) {
    const count = recurrentParameters(config.kind, previousUnits, config.units)
    total += count
    const returnSequences = i + 1 < config.layers
    layers.push({
      id: `recurrent-${i + 1}`,
      label: `${config.kind === 'lstm' ? 'LSTM' : 'SimpleRNN'} ${i + 1}`,
      shape: returnSequences ? `${input.steps} × ${config.units}` : String(config.units),
      parameters: count,
      details: returnSequences ? 'Secuencia completa para la capa siguiente' : 'Último estado oculto',
    })
    previousUnits = config.units
  }
  if (config.denseUnits > 0) {
    const count = (previousUnits + 1) * config.denseUnits
    total += count
    layers.push({ id: 'dense', label: 'Dense · ReLU', shape: String(config.denseUnits), parameters: count, details: 'Proyección de características' })
    previousUnits = config.denseUnits
  }
  const outputs = input.problemType === 'multiclass' ? input.classes : 1
  const outputParameters = (previousUnits + 1) * outputs
  total += outputParameters
  const activation = input.problemType === 'regression' ? 'lineal' : input.problemType === 'binary' ? 'sigmoid' : 'softmax'
  layers.push({ id: 'output', label: `Salida · ${activation}`, shape: String(outputs), parameters: outputParameters, details: `Predicción del siguiente paso · ${input.problemType}` })
  if (total > 100_000) errors.push('Más de 100 000 parámetros: reduce unidades o capas para entrenar en el navegador.')
  return { layers, parameterCount: total, errors }
}
