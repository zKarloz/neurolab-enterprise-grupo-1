/** Tipos serializables del preprocesamiento local; no incluyen el CSV original en persistencia. */
export type ProblemType = 'binary' | 'regression'
export type Scaling = 'standard' | 'minmax'

export interface RawTable {
  columns: string[]
  rows: string[][]
}

export interface PreparationOptions {
  targetColumn: string
  problemType: ProblemType
  seed?: number
  scaling?: Scaling
}

export interface NumericTransformer {
  kind: 'numeric'
  column: string
  mean: number
  standardDeviation: number
  minimum: number
  maximum: number
}

export interface CategoricalTransformer {
  kind: 'categorical'
  column: string
  categories: string[]
  // La última posición corresponde a valores desconocidos durante validación/inferencia.
  unseenIndex: number
}

export type FeatureTransformer = NumericTransformer | CategoricalTransformer

export interface PreparationManifest {
  schemaVersion: 1
  sourceColumns: string[]
  targetColumn: string
  problemType: ProblemType
  scaling: Scaling
  seed: number
  featureNames: string[]
  transformers: FeatureTransformer[]
  targetLabels: [string, string] | null
  splitSizes: { train: number; validation: number; test: number }
}

export interface PreparedSplit {
  rowIndices: number[]
  x: number[][]
  y: number[]
}

export interface PreparedDataset {
  manifest: PreparationManifest
  train: PreparedSplit
  validation: PreparedSplit
  test: PreparedSplit
}
