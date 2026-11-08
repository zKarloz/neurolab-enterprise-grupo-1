import type {
  CategoricalTransformer, FeatureTransformer, NumericTransformer,
  PreparationManifest, PreparationOptions, PreparedDataset, PreparedSplit, RawTable,
} from './types.ts'

const MAX_FEATURES = 128
const MAX_CATEGORIES_PER_COLUMN = 40
const MAX_TENSOR_BYTES_ESTIMATE = 64 * 1024 * 1024

/** PRNG determinista, independiente de Math.random y del orden de llegada del Worker. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(items: number[], random: () => number): number[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function splitCount(n: number): [number, number, number] {
  // Se garantiza al menos una observación por partición cuando hay >= 3 filas.
  if (n < 3) throw new Error('Cada grupo necesita al menos 3 filas para crear train, validación y prueba.')
  const validation = Math.max(1, Math.round(n * 0.15))
  const test = Math.max(1, Math.round(n * 0.15))
  const train = n - validation - test
  if (train < 1) throw new Error('La partición deja el entrenamiento sin observaciones.')
  return [train, validation, test]
}

function partition(table: RawTable, objective: number, binary: boolean, random: () => number) {
  const n = table.rows.length
  const groups = new Map<string, number[]>()
  if (binary) {
    table.rows.forEach((row, index) => {
      const label = row[objective].trim()
      if (!label) throw new Error(`La variable objetivo está vacía en la fila ${index + 2}.`)
      groups.set(label, [...(groups.get(label) ?? []), index])
    })
    if (groups.size !== 2) throw new Error('La clasificación binaria requiere exactamente dos clases distintas.')
    if ([...groups.values()].some((indices) => indices.length < 3)) {
      throw new Error('Cada clase necesita al menos 3 filas para una partición estratificada.')
    }
  } else {
    groups.set('all', Array.from({ length: n }, (_, index) => index))
  }
  const train: number[] = []
  const validation: number[] = []
  const test: number[] = []
  for (const indices of groups.values()) {
    const [trainCount, validationCount] = splitCount(indices.length)
    const shuffled = shuffle(indices, random)
    train.push(...shuffled.slice(0, trainCount))
    validation.push(...shuffled.slice(trainCount, trainCount + validationCount))
    test.push(...shuffled.slice(trainCount + validationCount))
  }
  return { train: shuffle(train, random), validation: shuffle(validation, random), test: shuffle(test, random) }
}

function numericValue(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

/** Ajusta estadísticas y vocabularios EXCLUSIVAMENTE sobre índices de entrenamiento. */
function fitTransformers(table: RawTable, features: number[], train: number[]): FeatureTransformer[] {
  return features.map((columnIndex) => {
    const column = table.columns[columnIndex]
    const observed = train.map((index) => table.rows[index][columnIndex].trim()).filter(Boolean)
    if (!observed.length) throw new Error(`La variable «${column}» no tiene valores de entrenamiento.`)
    const numeric = observed.map(numericValue)
    if (numeric.every((value) => value !== null)) {
      const values = numeric as number[]
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      const transformer: NumericTransformer = {
        kind: 'numeric', column, mean,
        standardDeviation: Math.sqrt(variance) || 1,
        minimum: values.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY),
        maximum: values.reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY),
      }
      return transformer
    }
    const categories = [...new Set(observed)].sort((a, b) => a.localeCompare(b))
    if (categories.length > MAX_CATEGORIES_PER_COLUMN) {
      throw new Error(`«${column}» supera el límite provisional de ${MAX_CATEGORIES_PER_COLUMN} categorías.`)
    }
    const transformer: CategoricalTransformer = { kind: 'categorical', column, categories, unseenIndex: categories.length }
    return transformer
  })
}

/** Reutilizable posteriormente en inferencia: jamás reajusta estadísticas fuera de train. */
export function transformRow(row: string[], columns: string[], manifest: PreparationManifest): number[] {
  const output: number[] = []
  for (const transformer of manifest.transformers) {
    const index = columns.indexOf(transformer.column)
    if (index < 0) throw new Error(`Falta la columna «${transformer.column}».`)
    const raw = row[index]?.trim() ?? ''
    if (transformer.kind === 'numeric') {
      const value = raw ? numericValue(raw) : transformer.mean
      if (value === null) throw new Error(`«${transformer.column}» contiene un valor no numérico.`)
      const normalized = manifest.scaling === 'standard'
        ? (value - transformer.mean) / transformer.standardDeviation
        : (value - transformer.minimum) / (transformer.maximum - transformer.minimum || 1)
      if (!Number.isFinite(normalized)) throw new Error('La transformación produjo un valor no finito.')
      output.push(normalized)
    } else {
      const position = transformer.categories.indexOf(raw)
      const active = position >= 0 ? position : transformer.unseenIndex
      for (let j = 0; j <= transformer.unseenIndex; j++) output.push(j === active ? 1 : 0)
    }
  }
  return output
}

/** División 70/15/15 con semilla y preprocesamiento apto para Dense tabular. */
export function prepareDataset(table: RawTable, options: PreparationOptions): PreparedDataset {
  if (!table.columns.length || table.columns.length < 2 || !table.rows.length) {
    throw new Error('El CSV necesita una variable objetivo y al menos una variable predictora.')
  }
  if (new Set(table.columns).size !== table.columns.length || table.columns.some((value) => !value.trim())) {
    throw new Error('Los encabezados deben ser únicos y no estar vacíos.')
  }
  if (table.rows.some((row) => row.length !== table.columns.length)) throw new Error('El CSV tiene filas inconsistentes.')
  const objective = table.columns.indexOf(options.targetColumn)
  if (objective < 0) throw new Error('Selecciona una columna objetivo existente.')
  const seed = options.seed ?? 42
  if (!Number.isSafeInteger(seed)) throw new Error('La semilla debe ser un entero válido.')
  const scaling = options.scaling ?? 'standard'
  if (scaling !== 'standard' && scaling !== 'minmax') throw new Error('Escalado desconocido.')
  const target = table.rows.map((row, index) => {
    const value = row[objective].trim()
    if (!value) throw new Error(`Objetivo vacío en la fila ${index + 2}.`)
    if (options.problemType === 'regression' && numericValue(value) === null) {
      throw new Error(`Objetivo no numérico en la fila ${index + 2}.`)
    }
    return value
  })
  const splits = partition(table, objective, options.problemType === 'binary', seededRandom(seed))
  const featureIndices = table.columns.map((_, index) => index).filter((index) => index !== objective)
  const transformers = fitTransformers(table, featureIndices, splits.train)
  const featureNames = transformers.flatMap((transformer) => transformer.kind === 'numeric'
    ? [transformer.column]
    : [...transformer.categories.map((value) => `${transformer.column}=${value}`), `${transformer.column}=<desconocido>`])
  if (featureNames.length > MAX_FEATURES) {
    throw new Error(`La preparación supera ${MAX_FEATURES} características transformadas.`)
  }
  if (table.rows.length * featureNames.length * 4 > MAX_TENSOR_BYTES_ESTIMATE) {
    throw new Error('La estimación mínima de memoria del tensor supera 64 MiB.')
  }
  const binaryLabels = options.problemType === 'binary'
    ? ([...new Set(splits.train.map((index) => target[index]))].sort() as string[])
    : null
  if (binaryLabels && binaryLabels.length !== 2) throw new Error('El entrenamiento debe contener ambas clases.')
  const manifest: PreparationManifest = {
    schemaVersion: 1,
    sourceColumns: [...table.columns], targetColumn: options.targetColumn,
    problemType: options.problemType, scaling, seed, featureNames, transformers,
    targetLabels: binaryLabels ? [binaryLabels[0], binaryLabels[1]] : null,
    splitSizes: { train: splits.train.length, validation: splits.validation.length, test: splits.test.length },
  }
  function build(indices: number[]): PreparedSplit {
    return {
      rowIndices: [...indices],
      x: indices.map((index) => transformRow(table.rows[index], table.columns, manifest)),
      y: indices.map((index) => {
        if (binaryLabels) {
          const position = binaryLabels.indexOf(target[index])
          if (position < 0) throw new Error('Existe una clase objetivo desconocida.')
          return position
        }
        return Number(target[index])
      }),
    }
  }
  return { manifest, train: build(splits.train), validation: build(splits.validation), test: build(splits.test) }
}
