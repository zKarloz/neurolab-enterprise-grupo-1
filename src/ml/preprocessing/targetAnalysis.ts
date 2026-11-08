import type { ProblemType, RawTable } from './types.ts'

export interface ObjectiveAnalysis {
  distinctValues: number
  allNumeric: boolean
  recommended: ProblemType | null
  reason: string
}

/** Inspección descriptiva: aconseja el tipo sin convertir objetivos numéricos en clases por obligación. */
export function analyzeObjective(table: RawTable, targetColumn: string): ObjectiveAnalysis {
  const index = table.columns.indexOf(targetColumn)
  if (index < 0) throw new Error('La columna objetivo no existe.')
  const distinct = new Set<string>()
  let allNumeric = true
  for (const row of table.rows) {
    const value = (row[index] ?? '').trim()
    if (!value) return { distinctValues: distinct.size, allNumeric: false, recommended: null, reason: 'Hay valores objetivo vacíos.' }
    distinct.add(value)
    if (!Number.isFinite(Number(value))) allNumeric = false
  }
  if (distinct.size === 2) {
    return {
      distinctValues: 2,
      allNumeric,
      recommended: 'binary',
      reason: 'La variable objetivo tiene exactamente dos valores. Para predecir clases se recomienda clasificación binaria.',
    }
  }
  if (allNumeric && distinct.size > 2) {
    return {
      distinctValues: distinct.size,
      allNumeric: true,
      recommended: 'regression',
      reason: 'La variable objetivo tiene más de dos valores numéricos. Se recomienda regresión.',
    }
  }
  return {
    distinctValues: distinct.size,
    allNumeric,
    recommended: null,
    reason: 'El objetivo no corresponde directamente a regresión numérica o clasificación binaria; revisa sus valores.',
  }
}
