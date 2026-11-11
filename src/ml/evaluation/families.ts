/** CNN-4D: las familias ejecutables actuales tienen tipos de problema disjuntos. */
import type { ProblemType } from '../preprocessing/types.ts'

export type TrainingProblemType = ProblemType | 'multiclass'
export type TrainingFamily = 'feedforward' | 'cnn'
export type FamilyFilter = 'all' | TrainingFamily

export function familyForProblem(problemType: TrainingProblemType): TrainingFamily {
  if (problemType === 'multiclass') return 'cnn'
  if (problemType === 'binary' || problemType === 'regression') return 'feedforward'
  throw new Error(`Tipo de problema no reconocido: ${String(problemType)}`)
}

export function problemLabel(problemType: TrainingProblemType): string {
  switch (problemType) {
    case 'binary': return 'Clasificación binaria'
    case 'regression': return 'Regresión'
    case 'multiclass': return 'Clasificación multiclase'
  }
}

export function familyLabel(family: TrainingFamily): string {
  return family === 'cnn' ? 'CNN' : 'Feedforward'
}

/** Compara solo la misma familia y tarea, nunca regresión contra clasificación. */
export function compatibleForComparison(a: TrainingProblemType, b: TrainingProblemType) {
  return a === b && familyForProblem(a) === familyForProblem(b)
}

/** En reportes históricos no asumimos que un tipo futuro sea Feedforward. */
export function familyForReportProblem(problemType: string): TrainingFamily | null {
  if (problemType === 'multiclass') return 'cnn'
  if (problemType === 'binary' || problemType === 'regression') return 'feedforward'
  return null
}

export function reportRunsByFamily<T extends { problem_type: string }>(runs: T[], family: FamilyFilter): T[] {
  return family === 'all' ? runs : runs.filter((run) => familyForReportProblem(run.problem_type) === family)
}
