/** La familia real viene de architectures.family; RNN comparte tareas supervisadas y GAN es generativa. */
import type { ProblemType } from '../preprocessing/types.ts'

export type TrainingProblemType = ProblemType | 'multiclass' | 'generative'
export type TrainingFamily = 'feedforward' | 'cnn' | 'rnn' | 'gan'
export type FamilyFilter = 'all' | TrainingFamily

export function familyForProblem(problemType: TrainingProblemType): Exclude<TrainingFamily, 'rnn'> {
  if (problemType === 'multiclass') return 'cnn'
  if (problemType === 'generative') return 'gan'
  if (problemType === 'binary' || problemType === 'regression') return 'feedforward'
  throw new Error(`Tipo de problema no reconocido: ${String(problemType)}`)
}

export function problemLabel(problemType: TrainingProblemType): string {
  switch (problemType) {
    case 'binary': return 'Clasificación binaria'
    case 'regression': return 'Regresión'
    case 'multiclass': return 'Clasificación multiclase'
    case 'generative': return 'Generación no condicional'
  }
}

export function familyLabel(family: TrainingFamily): string {
  return family === 'cnn' ? 'CNN' : family === 'rnn' ? 'RNN' : family === 'gan' ? 'GAN' : 'Feedforward'
}

/** Compara solo la misma familia y tarea, nunca regresión contra clasificación. */
export function compatibleForComparison(a: TrainingProblemType, b: TrainingProblemType) {
  return a === b && familyForProblem(a) === familyForProblem(b)
}

/** En reportes históricos no asumimos que un tipo futuro sea Feedforward. */
export function familyForReportProblem(problemType: string): TrainingFamily | null {
  if (problemType === 'generative') return 'gan'
  if (problemType === 'multiclass') return 'cnn'
  if (problemType === 'binary' || problemType === 'regression') return 'feedforward'
  return null
}

/** La fuente preferida es la FK a architectures; solo datos antiguos sin familia usan fallback. */
export function familyForReportRun(run: { problem_type: string; family?: string }): TrainingFamily | null {
  if (run.family === 'rnn' || run.family === 'cnn' || run.family === 'gan' || run.family === 'feedforward') return run.family
  return run.family === undefined ? familyForReportProblem(run.problem_type) : null
}

export function reportRunsByFamily<T extends { problem_type: string; family?: string }>(runs: T[], family: FamilyFilter): T[] {
  return family === 'all' ? runs : runs.filter((run) => familyForReportRun(run) === family)
}


/** Historial F7: la tarea no determina la familia (RNN admite todas las tareas).
 * Se rechazan comparaciones entre familias aunque compartan tipo de problema.
 */
export function compatibleHistoryRuns(
  first: { family: TrainingFamily; problem_type: TrainingProblemType; ganDimension?: number | null },
  second: { family: TrainingFamily; problem_type: TrainingProblemType; ganDimension?: number | null },
): boolean {
  if (first.family !== second.family || first.problem_type !== second.problem_type) return false
  if (first.family === 'gan') return first.problem_type === 'generative'
    && (first.ganDimension === 8 || first.ganDimension === 28)
    && first.ganDimension === second.ganDimension
  if (first.family === 'cnn') return first.problem_type === 'multiclass'
  if (first.family === 'feedforward') return first.problem_type === 'binary' || first.problem_type === 'regression'
  return first.problem_type === 'regression' || first.problem_type === 'binary' || first.problem_type === 'multiclass'
}
